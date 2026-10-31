// Solver para "esvaziar a garagem" (com cercas na borda).
//
// Tirar um veículo só abre espaço, nunca atrapalha, e todo arrasto pode ser
// desfeito. Então: se algum veículo pode sair, tirá-lo é sempre uma boa
// jogada; se nenhum pode, uma busca em largura (BFS) acha o menor número de
// arrastos até alguém conseguir sair. Uma fase que tem solução nunca fica
// travada, não importa o que a criança faça.

import {
  OPEN_GATES,
  SIZE,
  buildGrid,
  exitSides,
  posOf,
  withPosition,
  without,
  type Gates,
  type Vehicle,
} from './board.ts';

export interface Move {
  index: number;
  /** Posição de destino; numa saída, fica fora da garagem. */
  to: number;
  /** Presente quando o veículo sai da garagem. */
  exit?: 'back' | 'forward';
}

export interface Analysis {
  /** Arrastos necessários (veículos empurrados para o lado) para esvaziar a garagem. */
  slides: number;
  /** Rodadas de saída (em cada rodada saem todos os veículos livres). */
  rounds: number;
}

/** Limite da busca de arrastos (estados visitados). */
const MAX_STATES = 60_000;

/** Quanto trabalho dá esvaziar a garagem; null se não tem solução (ou é difícil demais). */
export function analyze(
  vehicles: readonly Vehicle[],
  gates: Gates = OPEN_GATES,
  maxStates = MAX_STATES,
): Analysis | null {
  let current = [...vehicles];
  let slides = 0;
  let rounds = 0;
  while (current.length > 0) {
    const grid = buildGrid(current);
    const leaving = new Set(
      current.filter((_, i) => {
        const s = exitSides(current, i, gates, grid);
        return s.back || s.forward;
      }),
    );
    if (leaving.size > 0) {
      current = current.filter((v) => !leaving.has(v));
      rounds++;
      continue;
    }
    const found = searchSlides(current, gates, maxStates);
    if (!found) return null;
    slides += found.moves.length;
    for (const m of found.moves) current = withPosition(current, m.index, m.to);
  }
  return { slides, rounds };
}

/** Dica: tirar um veículo livre (o vermelho por último) ou, se nenhum estiver, o arrasto que libera alguém. */
export function nextMove(vehicles: readonly Vehicle[], gates: Gates = OPEN_GATES): Move | null {
  if (vehicles.length === 0) return null;
  const grid = buildGrid(vehicles);
  const order = vehicles.map((_, i) => i).sort((a, b) => Number(vehicles[a].target) - Number(vehicles[b].target));
  for (const i of order) {
    const s = exitSides(vehicles, i, gates, grid);
    if (s.forward) return { index: i, to: SIZE, exit: 'forward' };
    if (s.back) return { index: i, to: -vehicles[i].len, exit: 'back' };
  }
  return searchSlides(vehicles, gates, MAX_STATES)?.moves[0] ?? null;
}

/** Verdadeiro se, seguindo as dicas, a garagem fica vazia. */
export function clearsWithHints(vehicles: readonly Vehicle[], gates: Gates = OPEN_GATES, maxSteps = 300): boolean {
  let current = [...vehicles];
  for (let step = 0; step < maxSteps && current.length > 0; step++) {
    const m = nextMove(current, gates);
    if (!m) return false;
    current = m.exit ? without(current, m.index) : withPosition(current, m.index, m.to);
  }
  return current.length === 0;
}

// ---------- busca de arrastos ----------
// Cada estado guarda só a posição variável de cada veículo (0 a SIZE-2),
// codificada em base SIZE-1 num número comum (no 8x8: base 7, até 18 veículos).

const BASE = SIZE - 1;

interface Compiled {
  n: number;
  fixed: Int8Array; // linha (horizontal) ou coluna (vertical)
  len: Int8Array;
  horiz: Uint8Array;
  gateBack: Uint8Array; // 1 = saída aberta
  gateForward: Uint8Array;
  pow: number[];
}

function compile(vehicles: readonly Vehicle[], gates: Gates): Compiled {
  const n = vehicles.length;
  if (BASE ** n > Number.MAX_SAFE_INTEGER) throw new Error(`Veículos demais: ${n}`);
  const c: Compiled = {
    n,
    fixed: new Int8Array(n),
    len: new Int8Array(n),
    horiz: new Uint8Array(n),
    gateBack: new Uint8Array(n),
    gateForward: new Uint8Array(n),
    pow: [],
  };
  vehicles.forEach((v, i) => {
    const h = v.dir === 'h';
    c.fixed[i] = h ? v.row : v.col;
    c.len[i] = v.len;
    c.horiz[i] = h ? 1 : 0;
    c.gateBack[i] = (h ? gates.left[v.row] : gates.top[v.col]) ? 1 : 0;
    c.gateForward[i] = (h ? gates.right[v.row] : gates.bottom[v.col]) ? 1 : 0;
    c.pow.push(BASE ** i);
  });
  return c;
}

function decode(c: Compiled, code: number, out: Uint8Array): void {
  for (let i = 0; i < c.n; i++) {
    out[i] = code % BASE;
    code = Math.floor(code / BASE);
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

function anyExit(c: Compiled, pos: Uint8Array, grid: Int8Array): boolean {
  for (let i = 0; i < c.n; i++) {
    if (c.gateBack[i]) {
      let free = true;
      for (let q = pos[i] - 1; q >= 0 && free; q--) free = isFree(c, i, q, grid);
      if (free) return true;
    }
    if (c.gateForward[i]) {
      let free = true;
      for (let q = pos[i] + c.len[i]; q < SIZE && free; q++) free = isFree(c, i, q, grid);
      if (free) return true;
    }
  }
  return false;
}

/** Menor sequência de arrastos até algum veículo poder sair. */
function searchSlides(vehicles: readonly Vehicle[], gates: Gates, maxStates: number): { moves: Move[] } | null {
  const c = compile(vehicles, gates);
  let start = 0;
  vehicles.forEach((v, i) => (start += posOf(v) * c.pow[i]));
  const parent = new Map<number, number>([[start, -1]]);
  const queue: number[] = [start];
  const pos = new Uint8Array(c.n);
  const grid = new Int8Array(SIZE * SIZE);

  for (let head = 0; head < queue.length; head++) {
    const code = queue[head];
    decode(c, code, pos);
    fillGrid(c, pos, grid);
    if (code !== start && anyExit(c, pos, grid)) return { moves: path(c, parent, code) };
    if (parent.size > maxStates) return null;
    for (let i = 0; i < c.n; i++) {
      const p = pos[i];
      const visit = (q: number) => {
        const next = code + (q - p) * c.pow[i];
        if (!parent.has(next)) {
          parent.set(next, code);
          queue.push(next);
        }
      };
      for (let q = p - 1; q >= 0 && isFree(c, i, q, grid); q--) visit(q);
      for (let q = p + 1; q + c.len[i] <= SIZE && isFree(c, i, q + c.len[i] - 1, grid); q++) visit(q);
    }
  }
  return null;
}

function path(c: Compiled, parent: Map<number, number>, end: number): Move[] {
  const moves: Move[] = [];
  const a = new Uint8Array(c.n);
  const b = new Uint8Array(c.n);
  let cur = end;
  let prev = parent.get(cur) ?? -1;
  while (prev !== -1) {
    decode(c, prev, a);
    decode(c, cur, b);
    const index = a.findIndex((p, i) => p !== b[i]);
    moves.push({ index, to: b[index] });
    cur = prev;
    prev = parent.get(cur) ?? -1;
  }
  return moves.reverse();
}
