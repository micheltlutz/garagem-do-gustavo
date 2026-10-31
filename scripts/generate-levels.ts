// Gera src/game/levels.json.  Uso: npm run levels
//
// Sorteia garagens 8x8 (com semente fixa, então o resultado é sempre o mesmo)
// e guarda só as que dá para esvaziar tirando um veículo de cada vez.
// A dificuldade é o número de "rodadas" de saída: na rodada 1 saem os que já
// estão livres, na 2 os que ficaram livres depois disso, e assim por diante.

import { writeFileSync } from 'node:fs';
import { SIZE, TARGET, parseBoard, serializeBoard, type Vehicle } from '../src/game/board.ts';
import { clearRounds } from '../src/game/solver.ts';

const SEED = 20261031;
const MAX_ATTEMPTS = 2_000_000;
const OUT = new URL('../src/game/levels.json', import.meta.url);

const rows = (...r: string[]) => r.join('');

// Fases 1 a 3, feitas à mão para ensinar a mecânica.
const HAND_MADE = [
  // 1: todos livres, é só tirar
  rows('........', '.B......', '.B......', '...AA...', '........', '......C.', '......C.', '........'),
  // 2: o vermelho está preso entre dois carros
  rows('........', '........', '.B....C.', '.B.AA.C.', '........', '........', '........', '........'),
  // 3: agora com um caminhão
  rows('........', '........', '.B....C.', '.B.AA.C.', '......C.', '........', '........', '........'),
];

interface World {
  /** Quantas fases geradas para cada número de rodadas. */
  plan: Record<number, number>;
  vehicles: [number, number];
}

// Com saída pelos dois lados, quase nenhuma garagem passa de 4 rodadas;
// a dificuldade cresce também pela quantidade de veículos.
const WORLDS: World[] = [
  { plan: { 1: 3, 2: 6 }, vehicles: [4, 7] }, // + as 3 feitas à mão = 12
  { plan: { 2: 6, 3: 6 }, vehicles: [8, 12] },
  { plan: { 3: 6, 4: 6 }, vehicles: [13, 16] },
];
const CANDIDATES_PER_SLOT = 6;

interface Candidate {
  board: string;
  depth: number;
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

/** Renomeia os veículos na ordem de leitura (B, C, D...) para strings mais limpas. */
function relabel(vehicles: Vehicle[]): string {
  const others = vehicles
    .filter((v) => !v.target)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((v, i) => ({ ...v, id: LETTERS[i + 1] }));
  return serializeBoard([...vehicles.filter((v) => v.target), ...others]);
}

function describe(board: string): Candidate {
  const vehicles = parseBoard(board);
  if (!vehicles.some((v) => v.id === TARGET)) throw new Error(`Fase sem o carro vermelho: ${board}`);
  const depth = clearRounds(vehicles);
  if (depth === null) throw new Error(`Fase que trava: ${board}`);
  return { board, depth, vehicles: vehicles.length };
}

const used = new Set<string>();
const handMade = HAND_MADE.map(describe);
for (const c of handMade) used.add(c.board);

// slots[mundo][rodadas] = candidatos encontrados
const slots = WORLDS.map((w) => new Map(Object.keys(w.plan).map((d) => [Number(d), [] as Candidate[]])));
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
  const depth = clearRounds(vehicles);
  if (depth === null || !slots[w].has(depth) || slotFull(w, depth)) continue;
  const board = relabel(vehicles);
  if (used.has(board)) continue;
  used.add(board);
  slots[w].get(depth)!.push({ board, depth, vehicles: vehicles.length });
}

const levels: Candidate[] = [...handMade];
WORLDS.forEach((world, w) => {
  const chosen: Candidate[] = [];
  for (const [d, count] of Object.entries(world.plan)) {
    const found = slots[w].get(Number(d))!;
    if (found.length < count) {
      throw new Error(`Mundo ${w + 1}: só achei ${found.length} fases de ${d} rodadas (precisa de ${count})`);
    }
    chosen.push(...shuffle(found).slice(0, count));
  }
  chosen.sort((a, b) => a.depth - b.depth || a.vehicles - b.vehicles);
  levels.push(...chosen);
});

const json =
  '[\n' + levels.map((l) => `  { "board": "${l.board}", "depth": ${l.depth} }`).join(',\n') + '\n]\n';
writeFileSync(OUT, json);

console.log(`${levels.length} fases geradas em ${attempts} tentativas`);
levels.forEach((l, i) => {
  if (i % 12 === 0) console.log(`\nMundo ${i / 12 + 1}`);
  console.log(`  ${String(i + 1).padStart(2)}: ${l.depth} rodadas, ${l.vehicles} veículos`);
});
