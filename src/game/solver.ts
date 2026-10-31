// Solver por busca em largura (BFS). Uma jogada = mover um veículo qualquer distância.
// Cada estado guarda só a posição variável de cada veículo (0 a 4), codificada em
// base 5 num número comum (5^22 < 2^53, então cabe com folga).

import { EXIT_ROW, SIZE, posOf, type Vehicle } from './board.ts';

export interface Move {
  index: number;
  to: number;
}

export interface Solution {
  minMoves: number;
  moves: Move[];
  explored: number;
}

interface Compiled {
  n: number;
  fixed: Int8Array; // linha (horizontal) ou coluna (vertical)
  len: Int8Array;
  horiz: Uint8Array;
  pow: number[];
  target: number;
}

function compile(vehicles: readonly Vehicle[]): Compiled {
  const n = vehicles.length;
  const fixed = new Int8Array(n);
  const len = new Int8Array(n);
  const horiz = new Uint8Array(n);
  const pow: number[] = [];
  let target = -1;
  vehicles.forEach((v, i) => {
    fixed[i] = v.dir === 'h' ? v.row : v.col;
    len[i] = v.len;
    horiz[i] = v.dir === 'h' ? 1 : 0;
    pow.push(5 ** i);
    if (v.target) target = i;
  });
  return { n, fixed, len, horiz, pow, target };
}

function encode(c: Compiled, positions: ArrayLike<number>): number {
  let code = 0;
  for (let i = 0; i < c.n; i++) code += positions[i] * c.pow[i];
  return code;
}

function decode(c: Compiled, code: number, out: Uint8Array): void {
  for (let i = 0; i < c.n; i++) {
    out[i] = code % 5;
    code = Math.floor(code / 5);
  }
}

function fillGrid(c: Compiled, pos: Uint8Array, grid: Int8Array): void {
  grid.fill(-1);
  for (let i = 0; i < c.n; i++) {
    for (let k = 0; k < c.len[i]; k++) {
      const p = pos[i] + k;
      grid[c.horiz[i] ? c.fixed[i] * SIZE + p : p * SIZE + c.fixed[i]] = i;
    }
  }
}

function isFree(c: Compiled, i: number, p: number, grid: Int8Array): boolean {
  return grid[c.horiz[i] ? c.fixed[i] * SIZE + p : p * SIZE + c.fixed[i]] === -1;
}

function solvedGrid(c: Compiled, pos: Uint8Array, grid: Int8Array): boolean {
  for (let col = pos[c.target] + c.len[c.target]; col < SIZE; col++) {
    if (grid[EXIT_ROW * SIZE + col] !== -1) return false;
  }
  return true;
}

/** Chama `visit` para cada estado vizinho (uma jogada de distância). */
function forEachNeighbor(
  c: Compiled,
  code: number,
  pos: Uint8Array,
  grid: Int8Array,
  visit: (next: number) => void,
): void {
  for (let i = 0; i < c.n; i++) {
    const p = pos[i];
    for (let q = p - 1; q >= 0 && isFree(c, i, q, grid); q--) visit(code + (q - p) * c.pow[i]);
    for (let q = p + 1; q + c.len[i] <= SIZE && isFree(c, i, q + c.len[i] - 1, grid); q++) {
      visit(code + (q - p) * c.pow[i]);
    }
  }
}

/** Menor número de jogadas até liberar o caminho do vermelho, ou null se impossível. */
export function solve(vehicles: readonly Vehicle[], maxStates = 2_000_000): Solution | null {
  const c = compile(vehicles);
  if (c.target < 0) return null;
  const start = encode(c, vehicles.map(posOf));
  const parent = new Map<number, number>([[start, -1]]);
  const queue: number[] = [start];
  const pos = new Uint8Array(c.n);
  const grid = new Int8Array(SIZE * SIZE);

  for (let head = 0; head < queue.length; head++) {
    const code = queue[head];
    decode(c, code, pos);
    fillGrid(c, pos, grid);
    if (solvedGrid(c, pos, grid)) {
      const moves = reconstruct(c, parent, code);
      return { minMoves: moves.length, moves, explored: parent.size };
    }
    forEachNeighbor(c, code, pos, grid, (next) => {
      if (!parent.has(next)) {
        parent.set(next, code);
        queue.push(next);
      }
    });
    if (parent.size > maxStates) return null;
  }
  return null;
}

function reconstruct(c: Compiled, parent: Map<number, number>, end: number): Move[] {
  const moves: Move[] = [];
  const a = new Uint8Array(c.n);
  const b = new Uint8Array(c.n);
  let cur = end;
  let prev = parent.get(cur) ?? -1;
  while (prev !== -1) {
    decode(c, prev, a);
    decode(c, cur, b);
    for (let i = 0; i < c.n; i++) {
      if (a[i] !== b[i]) {
        moves.push({ index: i, to: b[i] });
        break;
      }
    }
    cur = prev;
    prev = parent.get(cur) ?? -1;
  }
  return moves.reverse();
}

/** Próxima jogada da solução mais curta (para a dica). */
export function nextMove(vehicles: readonly Vehicle[]): Move | null {
  const s = solve(vehicles);
  return s && s.moves.length > 0 ? s.moves[0] : null;
}

/**
 * Identifica o "quebra-cabeça" independente da posição atual dos carros:
 * duas fases com a mesma chave são a mesma, só que em passos diferentes.
 */
export function puzzleKey(vehicles: readonly Vehicle[]): string {
  // Ordem canônica: veículos na mesma faixa nunca trocam de ordem entre si.
  const order = vehicles
    .map((v, i) => ({ v, i }))
    .sort(
      (x, y) =>
        Number(y.v.target) - Number(x.v.target) ||
        x.v.dir.localeCompare(y.v.dir) ||
        (x.v.dir === 'h' ? x.v.row - y.v.row : x.v.col - y.v.col) ||
        posOf(x.v) - posOf(y.v),
    )
    .map((x) => x.v);
  const c = compile(order);
  const start = encode(c, order.map(posOf));
  const seen = new Set<number>([start]);
  const queue: number[] = [start];
  const pos = new Uint8Array(c.n);
  const grid = new Int8Array(SIZE * SIZE);
  let min = start;
  for (let head = 0; head < queue.length; head++) {
    const code = queue[head];
    if (code < min) min = code;
    decode(c, code, pos);
    fillGrid(c, pos, grid);
    forEachNeighbor(c, code, pos, grid, (next) => {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    });
  }
  const lanes = order.map((v) => `${v.dir}${v.dir === 'h' ? v.row : v.col}${v.len}`).join(',');
  return `${lanes}:${min}`;
}
