import { describe, expect, it } from 'vitest';
import { parseBoard, parseGates } from '../src/game/board.ts';
import { LEVELS, WORLD_SIZE, worldOf } from '../src/game/levels.ts';
import { analyze, clearsWithHints } from '../src/game/solver.ts';

// Arrastos necessários em cada mundo.
const WORLD_SLIDES: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 3],
];

describe('fases', () => {
  it('são 36, em 3 mundos de 12', () => {
    expect(LEVELS).toHaveLength(36);
    expect(WORLD_SIZE).toBe(12);
  });

  it('a primeira não tem cercas', () => {
    expect(LEVELS[0].gates).not.toContain('x');
  });

  it.each(LEVELS.map((l, i) => [i + 1, l] as const))('fase %i dá para esvaziar com a dificuldade indicada', (n, level) => {
    const vehicles = parseBoard(level.board);
    const gates = parseGates(level.gates);
    expect(vehicles.some((v) => v.target)).toBe(true);
    expect(analyze(vehicles, gates)).toEqual({ slides: level.slides, rounds: level.rounds });
    expect(clearsWithHints(vehicles, gates)).toBe(true);
    const [lo, hi] = WORLD_SLIDES[worldOf(n - 1)];
    expect(level.slides).toBeGreaterThanOrEqual(lo);
    expect(level.slides).toBeLessThanOrEqual(hi);
  });

  it('não têm garagens repetidas', () => {
    const keys = LEVELS.map((l) => `${l.board} ${l.gates}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
