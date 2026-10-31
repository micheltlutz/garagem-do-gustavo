import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/game/board.ts';
import { LEVELS, WORLD_SIZE, worldOf } from '../src/game/levels.ts';
import { clearRounds, clearsWithHints } from '../src/game/solver.ts';

const WORLD_DEPTH: [number, number][] = [
  [1, 2],
  [2, 3],
  [3, 4],
];

describe('fases', () => {
  it('são 36, em 3 mundos de 12', () => {
    expect(LEVELS).toHaveLength(36);
    expect(WORLD_SIZE).toBe(12);
  });

  it.each(LEVELS.map((l, i) => [i + 1, l] as const))('fase %i dá para esvaziar com a dificuldade indicada', (n, level) => {
    const vehicles = parseBoard(level.board);
    expect(vehicles.some((v) => v.target)).toBe(true);
    expect(clearRounds(vehicles)).toBe(level.depth);
    expect(clearsWithHints(vehicles)).toBe(true);
    const [lo, hi] = WORLD_DEPTH[worldOf(n - 1)];
    expect(level.depth).toBeGreaterThanOrEqual(lo);
    expect(level.depth).toBeLessThanOrEqual(hi);
  });

  it('não têm garagens repetidas', () => {
    const boards = LEVELS.map((l) => l.board);
    expect(new Set(boards).size).toBe(boards.length);
  });
});
