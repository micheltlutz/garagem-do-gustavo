// Gera src/game/levels.json.  Uso: npm run levels
//
// Sorteia garagens 8x8 com cercas na borda (com semente fixa, então o
// resultado é sempre o mesmo). Em cada faixa ocupada fica pelo menos uma
// saída aberta, senão o veículo nunca sairia. A dificuldade é quantos
// veículos precisam ser empurrados para o lado ("arrastos") e, depois,
// quantas rodadas de saída a garagem leva para esvaziar.

import { writeFileSync } from 'node:fs';
import {
  SIZE,
  TARGET,
  parseBoard,
  parseGates,
  serializeBoard,
  serializeGates,
  type Gates,
  type Vehicle,
} from '../src/game/board.ts';
import { analyze } from '../src/game/solver.ts';

const SEED = 20261031;
const MAX_ATTEMPTS = 3_000_000;
const OUT = new URL('../src/game/levels.json', import.meta.url);

const rows = (...r: string[]) => r.join('');

// Fases 1 a 3, feitas à mão para ensinar a mecânica.
// Cercas: "cima direita baixo esquerda" ('o' = aberta, 'x' = cerca).
const HAND_MADE = [
  // 1: tudo aberto, é só tirar
  {
    board: rows('........', '.B......', '.B......', '...AA...', '........', '......C.', '......C.', '........'),
    gates: 'oooooooo oooooooo oooooooo oooooooo',
  },
  // 2: cada carro só tem uma saída; o vermelho espera os outros saírem
  {
    board: rows('........', '........', '.B....C.', '.B.AA.C.', '........', '........', '........', '........'),
    gates: 'oxoooooo oooooooo ooooooxo oooxoooo',
  },
  // 3: agora com um caminhão, e o vermelho sai pela esquerda
  {
    board: rows('........', '........', '.B....C.', '.B.AA.C.', '......C.', '........', '........', '........'),
    gates: 'ooooooxo oooxoooo oxoooooo oooooooo',
  },
];

interface World {
  /** Quantas fases geradas para cada número de arrastos necessários. */
  plan: Record<number, number>;
  vehicles: [number, number];
  /** Chance de uma faixa ocupada ficar com as duas saídas abertas. */
  bothOpen: number;
  /** Chance de cada ponta de uma faixa vazia ganhar uma cerca de enfeite. */
  decor: number;
  /** Mínimo de rodadas de saída (evita fases triviais). */
  minRounds: number;
}

// Com saída pelos dois lados, quase nenhuma garagem passa de 4 rodadas;
// a dificuldade cresce também pela quantidade de veículos.
const WORLDS: World[] = [
  { plan: { 0: 9 }, vehicles: [4, 7], bothOpen: 0.5, decor: 0.2, minRounds: 2 }, // + as 3 feitas à mão = 12
  { plan: { 0: 6, 1: 6 }, vehicles: [8, 12], bothOpen: 0.25, decor: 0.35, minRounds: 2 },
  { plan: { 1: 4, 2: 4, 3: 4 }, vehicles: [13, 16], bothOpen: 0, decor: 0.5, minRounds: 2 },
];
const CANDIDATES_PER_SLOT = 6;

interface Candidate {
  board: string;
  gates: string;
  slides: number;
  rounds: number;
  vehicles: number;
}

// mulberry32: gerador pseudoaleatório pequeno e reproduzível.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRS';

function randomBoard(count: number): Vehicle[] | null {
  const cells = new Array<string>(SIZE * SIZE).fill('.');
  let placed = 0;
  for (let tries = 0; placed < count && tries < 500; tries++) {
    // O primeiro é o carrinho vermelho (sempre carro, nunca caminhão).
    const len = placed === 0 ? 2 : rng() < 0.25 ? 3 : 2;
    const horizontal = rng() < 0.5;
    const row = horizontal ? randInt(0, SIZE - 1) : randInt(0, SIZE - len);
    const col = horizontal ? randInt(0, SIZE - len) : randInt(0, SIZE - 1);
    const idx: number[] = [];
    for (let k = 0; k < len; k++) idx.push(horizontal ? row * SIZE + col + k : (row + k) * SIZE + col);
    if (idx.some((i) => cells[i] !== '.')) continue;
    for (const i of idx) cells[i] = LETTERS[placed];
    placed++;
  }
  return placed === count ? parseBoard(cells.join('')) : null;
}

/**
 * Cercas: em cada faixa ocupada, no máximo uma ponta fechada (às vezes nenhuma);
 * faixas vazias ganham cercas "de enfeite" ao acaso.
 */
function randomGates(vehicles: Vehicle[], bothOpen: number, decor: number): Gates {
  const gates = parseGates();
  for (let lane = 0; lane < SIZE; lane++) {
    for (const [dir, a, b] of [
      ['h', 'left', 'right'],
      ['v', 'top', 'bottom'],
    ] as const) {
      const used = vehicles.some((v) => v.dir === dir && (dir === 'h' ? v.row : v.col) === lane);
      if (used) {
        if (rng() >= bothOpen) gates[rng() < 0.5 ? a : b][lane] = false;
      } else {
        gates[a][lane] = rng() >= decor;
        gates[b][lane] = rng() >= decor;
      }
    }
  }
  return gates;
}

/** Renomeia os veículos na ordem de leitura (B, C, D...) para strings mais limpas. */
function relabel(vehicles: Vehicle[]): string {
  const others = vehicles
    .filter((v) => !v.target)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((v, i) => ({ ...v, id: LETTERS[i + 1] }));
  return serializeBoard([...vehicles.filter((v) => v.target), ...others]);
}

function describe(board: string, gates: string): Candidate {
  const vehicles = parseBoard(board);
  if (!vehicles.some((v) => v.id === TARGET)) throw new Error(`Fase sem o carro vermelho: ${board}`);
  const a = analyze(vehicles, parseGates(gates));
  if (!a) throw new Error(`Fase sem solução: ${board} ${gates}`);
  return { board, gates, ...a, vehicles: vehicles.length };
}

const used = new Set<string>();
const handMade = HAND_MADE.map((h) => describe(h.board, h.gates));
for (const c of handMade) used.add(`${c.board} ${c.gates}`);

// slots[mundo][rodadas] = candidatos encontrados
const slots = WORLDS.map((w) => new Map(Object.keys(w.plan).map((k) => [Number(k), [] as Candidate[]])));
const slotFull = (w: number, d: number) => (slots[w].get(d)?.length ?? 0) >= WORLDS[w].plan[d] * CANDIDATES_PER_SLOT;
const worldFull = (w: number) => [...slots[w].keys()].every((d) => slotFull(w, d));

let attempts = 0;
while (attempts < MAX_ATTEMPTS && !WORLDS.every((_, w) => worldFull(w))) {
  attempts++;
  const pending = WORLDS.map((_, w) => w).filter((w) => !worldFull(w));
  const w = pending[attempts % pending.length];
  const world = WORLDS[w];
  const vehicles = randomBoard(randInt(world.vehicles[0], world.vehicles[1]));
  if (!vehicles) continue;
  const gates = randomGates(vehicles, world.bothOpen, world.decor);
  if (!analyze(vehicles, gates, 20_000)) continue;
  // A análise guardada é a da fase já renomeada, igual à que o jogo e os testes fazem
  // (a ordem dos veículos pode mudar qual empurrão a busca escolhe).
  const c = describe(relabel(vehicles), serializeGates(gates));
  if (c.rounds < world.minRounds || !slots[w].has(c.slides) || slotFull(w, c.slides)) continue;
  const key = `${c.board} ${c.gates}`;
  if (used.has(key)) continue;
  used.add(key);
  slots[w].get(c.slides)!.push(c);
}

const levels: Candidate[] = [...handMade];
WORLDS.forEach((world, w) => {
  const chosen: Candidate[] = [];
  for (const [d, count] of Object.entries(world.plan)) {
    const found = slots[w].get(Number(d))!;
    if (found.length < count) {
      throw new Error(`Mundo ${w + 1}: só achei ${found.length} fases com ${d} arrastos (precisa de ${count})`);
    }
    chosen.push(...shuffle(found).slice(0, count));
  }
  chosen.sort((a, b) => a.slides - b.slides || a.rounds - b.rounds || a.vehicles - b.vehicles);
  levels.push(...chosen);
});

const json =
  '[\n' +
  levels
    .map((l) => `  { "board": "${l.board}", "gates": "${l.gates}", "slides": ${l.slides}, "rounds": ${l.rounds} }`)
    .join(',\n') +
  '\n]\n';
writeFileSync(OUT, json);

console.log(`${levels.length} fases geradas em ${attempts} tentativas`);
levels.forEach((l, i) => {
  if (i % 12 === 0) console.log(`\nMundo ${i / 12 + 1}`);
  const fences = l.gates.split('').filter((ch) => ch === 'x').length;
  console.log(
    `  ${String(i + 1).padStart(2)}: ${l.slides} arrastos, ${l.rounds} rodadas, ${l.vehicles} veículos, ${fences} cercas`,
  );
});
