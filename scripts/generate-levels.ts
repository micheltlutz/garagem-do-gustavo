// Gera src/game/levels.json.  Uso: npm run levels
//
// Sorteia tabuleiros (com semente fixa, então o resultado é sempre o mesmo),
// resolve cada um, limpa veículos que não fazem diferença, elimina repetidos
// e monta 3 mundos com dificuldade crescente.

import { writeFileSync } from 'node:fs';
import {
  EXIT_ROW,
  SIZE,
  TARGET,
  hasBlockingLaneCar,
  parseBoard,
  serializeBoard,
  type Vehicle,
} from '../src/game/board.ts';
import { puzzleKey, solve } from '../src/game/solver.ts';

const SEED = 20261031;
const MAX_ATTEMPTS = 3_000_000;
const OUT = new URL('../src/game/levels.json', import.meta.url);

// Fases 1 a 3, feitas à mão para ensinar a mecânica.
const HAND_MADE = [
  // 1: um carro bloqueando
  '......' + '......' + 'AA..B.' + '....B.' + '......' + '......',
  // 2: um caminhão bloqueando
  '...B..' + '...B..' + 'AA.B..' + '......' + '......' + '......',
  // 3: dois carros bloqueando
  '......' + '....C.' + 'AA.BC.' + '...B..' + '......' + '......',
];

interface World {
  /** Quantas fases geradas para cada número de jogadas. */
  plan: Record<number, number>;
  vehicles: [number, number];
}

const WORLDS: World[] = [
  { plan: { 1: 3, 2: 6 }, vehicles: [3, 5] }, // + as 3 feitas à mão = 12
  { plan: { 3: 6, 4: 6 }, vehicles: [5, 8] },
  { plan: { 5: 4, 6: 4, 7: 4 }, vehicles: [8, 11] },
];
const CANDIDATES_PER_SLOT = 6;

interface Candidate {
  board: string;
  minMoves: number;
  vehicles: number;
  carsMoved: number;
  key: string;
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

function randomBoard(count: number): Vehicle[] | null {
  const cells = new Array<string>(SIZE * SIZE).fill('.');
  const targetCol = randInt(0, 2);
  cells[EXIT_ROW * SIZE + targetCol] = TARGET;
  cells[EXIT_ROW * SIZE + targetCol + 1] = TARGET;
  const letters = 'BCDEFGHIJKLMNOPQ';
  let placed = 1;
  for (let tries = 0; placed < count && tries < 200; tries++) {
    const len = rng() < 0.25 ? 3 : 2;
    const horizontal = rng() < 0.5;
    const row = horizontal ? randInt(0, SIZE - 1) : randInt(0, SIZE - len);
    const col = horizontal ? randInt(0, SIZE - len) : randInt(0, SIZE - 1);
    // Carro deitado à direita do vermelho, na linha da saída: fase impossível.
    if (horizontal && row === EXIT_ROW && col > targetCol) continue;
    const idx: number[] = [];
    for (let k = 0; k < len; k++) idx.push(horizontal ? row * SIZE + col + k : (row + k) * SIZE + col);
    if (idx.some((i) => cells[i] !== '.')) continue;
    for (const i of idx) cells[i] = letters[placed - 1];
    placed++;
  }
  return placed === count ? parseBoard(cells.join('')) : null;
}

/** Renomeia os veículos na ordem de leitura (B, C, D...) para strings mais limpas. */
function relabel(vehicles: Vehicle[]): string {
  const letters = 'BCDEFGHIJKLMNOPQ';
  const others = vehicles
    .filter((v) => !v.target)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((v, i) => ({ ...v, id: letters[i] }));
  return serializeBoard([...vehicles.filter((v) => v.target), ...others]);
}

/** Tira veículos que não mudam a dificuldade, sem ficar abaixo do mínimo do mundo. */
function prune(vehicles: Vehicle[], minMoves: number, minCount: number): Vehicle[] {
  let current = vehicles;
  let changed = true;
  while (changed && current.length > minCount) {
    changed = false;
    const removable = shuffle(current.map((v, i) => (v.target ? -1 : i)).filter((i) => i >= 0));
    for (const i of removable) {
      const smaller = current.filter((_, k) => k !== i);
      if (solve(smaller)?.minMoves === minMoves) {
        current = smaller;
        changed = true;
        break;
      }
    }
  }
  return current;
}

function describe(board: string): Candidate {
  const vehicles = parseBoard(board);
  const s = solve(vehicles);
  if (!s) throw new Error(`Fase sem solução: ${board}`);
  return {
    board,
    minMoves: s.minMoves,
    vehicles: vehicles.length,
    carsMoved: new Set(s.moves.map((m) => m.index)).size,
    key: puzzleKey(vehicles),
  };
}

const usedKeys = new Set<string>();
const handMade = HAND_MADE.map(describe);
for (const c of handMade) usedKeys.add(c.key);

// slots[mundo][jogadas] = candidatos encontrados
const slots = WORLDS.map((w) => new Map(Object.keys(w.plan).map((m) => [Number(m), [] as Candidate[]])));
const slotFull = (w: number, m: number) => (slots[w].get(m)?.length ?? 0) >= WORLDS[w].plan[m] * CANDIDATES_PER_SLOT;
const worldFull = (w: number) => [...slots[w].keys()].every((m) => slotFull(w, m));

let attempts = 0;
while (attempts < MAX_ATTEMPTS && !WORLDS.every((_, w) => worldFull(w))) {
  attempts++;
  const pending = WORLDS.map((_, w) => w).filter((w) => !worldFull(w));
  const w = pending[attempts % pending.length];
  const world = WORLDS[w];
  const vehicles = randomBoard(randInt(world.vehicles[0], world.vehicles[1] + 1));
  if (!vehicles || hasBlockingLaneCar(vehicles)) continue;
  const s = solve(vehicles, 300_000);
  if (!s || s.minMoves === 0 || !slots[w].has(s.minMoves) || slotFull(w, s.minMoves)) continue;
  const pruned = prune(vehicles, s.minMoves, world.vehicles[0]);
  if (pruned.length > world.vehicles[1]) continue;
  const c = describe(relabel(pruned));
  if (usedKeys.has(c.key)) continue;
  usedKeys.add(c.key);
  slots[w].get(c.minMoves)!.push(c);
}

const levels: Candidate[] = [...handMade];
WORLDS.forEach((world, w) => {
  const chosen: Candidate[] = [];
  for (const [m, count] of Object.entries(world.plan)) {
    const found = slots[w].get(Number(m))!;
    if (found.length < count) {
      throw new Error(`Mundo ${w + 1}: só achei ${found.length} fases de ${m} jogadas (precisa de ${count})`);
    }
    chosen.push(...shuffle(found).slice(0, count));
  }
  chosen.sort((a, b) => a.minMoves - b.minMoves || a.carsMoved - b.carsMoved || a.vehicles - b.vehicles);
  levels.push(...chosen);
});

const json =
  '[\n' +
  levels.map((l) => `  { "board": "${l.board}", "minMoves": ${l.minMoves} }`).join(',\n') +
  '\n]\n';
writeFileSync(OUT, json);

console.log(`${levels.length} fases geradas em ${attempts} tentativas`);
levels.forEach((l, i) => {
  if (i % 12 === 0) console.log(`\nMundo ${i / 12 + 1}`);
  console.log(`  ${String(i + 1).padStart(2)}: ${l.minMoves} jogadas, ${l.vehicles} veículos, ${l.carsMoved} movidos`);
});
