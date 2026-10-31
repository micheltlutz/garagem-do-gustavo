// Regras do tabuleiro. Código puro (sem DOM), usado pelo jogo, pelo solver,
// pelo gerador de fases e pelos testes.
//
// Uma fase é uma string de 64 caracteres (8x8, linha por linha):
//   '.'  casa vazia
//   'A'  carrinho vermelho (o "herói"; segue as mesmas regras dos outros)
//   'B'..'Z' outros veículos (2 casas = carro, 3 casas = caminhão)
//
// Um veículo sai da garagem quando o caminho dele até a borda (pela frente
// ou por trás) está livre e aquela saída não tem cerca. A fase termina
// quando a garagem fica vazia.
//
// Cercas: string "cima direita baixo esquerda", 8 caracteres por lado
// ('o' = aberta, 'x' = cerca), uma posição para cada fileira/coluna.
// Cima e baixo vão da coluna 0 à 7; esquerda e direita, da linha 0 à 7.

export const SIZE = 8;
export const TARGET = 'A';

export type Dir = 'h' | 'v';

export interface Vehicle {
  id: string;
  row: number;
  col: number;
  len: number;
  dir: Dir;
  target: boolean;
}

export interface Range {
  min: number;
  max: number;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** Saídas da borda: true = aberta, false = cerca. Uma por fileira/coluna. */
export type Gates = Record<Side, boolean[]>;

export function parseGates(text?: string): Gates {
  const parts = text ? text.trim().split(/\s+/) : SIDES.map(() => 'o'.repeat(SIZE));
  if (parts.length !== 4 || parts.some((p) => p.length !== SIZE || /[^ox]/.test(p))) {
    throw new Error(`Cercas inválidas: "${text}"`);
  }
  const gates = {} as Gates;
  SIDES.forEach((side, k) => (gates[side] = [...parts[k]].map((ch) => ch === 'o')));
  return gates;
}

export function serializeGates(gates: Gates): string {
  return SIDES.map((side) => gates[side].map((open) => (open ? 'o' : 'x')).join('')).join(' ');
}

export const OPEN_GATES: Gates = parseGates();

/** Por qual lado da borda (e em qual faixa) o veículo sairia indo para trás ou para frente. */
export function gateOf(v: Vehicle, way: 'back' | 'forward'): { side: Side; lane: number } {
  if (v.dir === 'h') return { side: way === 'back' ? 'left' : 'right', lane: v.row };
  return { side: way === 'back' ? 'top' : 'bottom', lane: v.col };
}

export function gateOpen(gates: Gates, v: Vehicle, way: 'back' | 'forward'): boolean {
  const g = gateOf(v, way);
  return gates[g.side][g.lane];
}

export interface ExitSides {
  /** Caminho livre até a borda de cima/esquerda. */
  back: boolean;
  /** Caminho livre até a borda de baixo/direita. */
  forward: boolean;
}

/** Posição variável do veículo: coluna se horizontal, linha se vertical. */
export function posOf(v: Vehicle): number {
  return v.dir === 'h' ? v.col : v.row;
}

/** Última posição em que o veículo ainda está inteiro dentro da garagem. */
export function lastPos(v: Vehicle): number {
  return SIZE - v.len;
}

export function parseBoard(board: string): Vehicle[] {
  if (board.length !== SIZE * SIZE) {
    throw new Error(`Fase precisa ter ${SIZE * SIZE} casas, tem ${board.length}`);
  }
  const cells = new Map<string, number[]>();
  for (let i = 0; i < board.length; i++) {
    const ch = board[i];
    if (ch === '.') continue;
    if (!/[A-Z]/.test(ch)) throw new Error(`Caractere inválido '${ch}'`);
    const list = cells.get(ch) ?? [];
    list.push(i);
    cells.set(ch, list);
  }

  const vehicles: Vehicle[] = [];
  for (const [id, list] of cells) {
    const rows = list.map((i) => Math.floor(i / SIZE));
    const cols = list.map((i) => i % SIZE);
    const len = list.length;
    if (len < 2 || len > 3) throw new Error(`Veículo ${id} tem ${len} casas`);
    let dir: Dir;
    if (rows.every((r) => r === rows[0]) && cols.every((c, k) => c === cols[0] + k)) dir = 'h';
    else if (cols.every((c) => c === cols[0]) && rows.every((r, k) => r === rows[0] + k)) dir = 'v';
    else throw new Error(`Veículo ${id} não está em linha reta`);
    vehicles.push({ id, row: rows[0], col: cols[0], len, dir, target: id === TARGET });
  }
  vehicles.sort((a, b) => a.id.localeCompare(b.id));
  return vehicles;
}

export function serializeBoard(vehicles: readonly Vehicle[]): string {
  const out = new Array<string>(SIZE * SIZE).fill('.');
  for (const v of vehicles) {
    for (let k = 0; k < v.len; k++) {
      const r = v.dir === 'v' ? v.row + k : v.row;
      const c = v.dir === 'h' ? v.col + k : v.col;
      out[r * SIZE + c] = v.id;
    }
  }
  return out.join('');
}

/** Grade de ocupação: índice do veículo em cada casa, ou -1 se vazia. */
export function buildGrid(vehicles: readonly Vehicle[]): Int8Array {
  const grid = new Int8Array(SIZE * SIZE).fill(-1);
  vehicles.forEach((v, i) => {
    for (let k = 0; k < v.len; k++) {
      const r = v.dir === 'v' ? v.row + k : v.row;
      const c = v.dir === 'h' ? v.col + k : v.col;
      grid[r * SIZE + c] = i;
    }
  });
  return grid;
}

/** Até onde o veículo pode deslizar dentro da garagem (posições mínima e máxima). */
export function moveRange(vehicles: readonly Vehicle[], index: number, grid = buildGrid(vehicles)): Range {
  const v = vehicles[index];
  const at = (p: number) => (v.dir === 'h' ? grid[v.row * SIZE + p] : grid[p * SIZE + v.col]);
  const pos = posOf(v);
  let min = pos;
  while (min > 0 && at(min - 1) === -1) min--;
  let max = pos;
  while (max + v.len < SIZE && at(max + v.len) === -1) max++;
  return { min, max };
}

/** Para que lados o veículo consegue sair da garagem agora (caminho livre e sem cerca). */
export function exitSides(
  vehicles: readonly Vehicle[],
  index: number,
  gates: Gates = OPEN_GATES,
  grid = buildGrid(vehicles),
): ExitSides {
  const v = vehicles[index];
  const r = moveRange(vehicles, index, grid);
  return {
    back: r.min === 0 && gateOpen(gates, v, 'back'),
    forward: r.max === lastPos(v) && gateOpen(gates, v, 'forward'),
  };
}

/** Novo array com o veículo `index` na posição `pos` (não altera o original). */
export function withPosition(vehicles: readonly Vehicle[], index: number, pos: number): Vehicle[] {
  return vehicles.map((v, i) => {
    if (i !== index) return v;
    return v.dir === 'h' ? { ...v, col: pos } : { ...v, row: pos };
  });
}

/** Novo array sem o veículo `index` (ele saiu da garagem). */
export function without(vehicles: readonly Vehicle[], index: number): Vehicle[] {
  return vehicles.filter((_, i) => i !== index);
}
