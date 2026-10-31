import { describe, expect, it } from 'vitest';
import { hasBlockingLaneCar, isSolved, parseBoard } from '../src/game/board.ts';
import { LEVELS, WORLD_SIZE, worldOf } from '../src/game/levels.ts';
import { puzzleKey, solve } from '../src/game/solver.ts';

const WORLD_MOVES: [number, number][] = [
  [1, 2],
  [3, 4],
  [5, 7],
];

describe('fases', () => {
  it('são 36, em 3 mundos de 12', () => {
    expect(LEVELS).toHaveLength(36);
    expect(WORLD_SIZE).toBe(12);
  });

  it.each(LEVELS.map((l, i) => [i + 1, l] as const))('fase %i é válida e tem a solução indicada', (n, level) => {
    const vehicles = parseBoard(level.board);
    expect(isSolved(vehicles)).toBe(false);
    expect(hasBlockingLaneCar(vehicles)).toBe(false);
    expect(solve(vehicles)?.minMoves).toBe(level.minMoves);
    const [lo, hi] = WORLD_MOVES[worldOf(n - 1)];
    expect(level.minMoves).toBeGreaterThanOrEqual(lo);
    expect(level.minMoves).toBeLessThanOrEqual(hi);
  });

  it('não têm quebra-cabeças repetidos', () => {
    const keys = LEVELS.map((l) => puzzleKey(parseBoard(l.board)));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
