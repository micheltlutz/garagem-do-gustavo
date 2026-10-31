import { describe, expect, it } from 'vitest';
import {
  buildGrid,
  hasBlockingLaneCar,
  isSolved,
  moveRange,
  parseBoard,
  serializeBoard,
  withPosition,
} from '../src/game/board.ts';

const rows = (...r: string[]) => r.join('');

const sample = rows(
  '...B..',
  '...B..',
  'AA.B..',
  '......',
  '.CC...',
  '......',
);

describe('parseBoard', () => {
  it('lê veículos, direção e tamanho', () => {
    const v = parseBoard(sample);
    expect(v).toHaveLength(3);
    expect(v[0]).toMatchObject({ id: 'A', row: 2, col: 0, len: 2, dir: 'h', target: true });
    expect(v.find((x) => x.id === 'B')).toMatchObject({ row: 0, col: 3, len: 3, dir: 'v' });
    expect(v.find((x) => x.id === 'C')).toMatchObject({ row: 4, col: 1, len: 2, dir: 'h' });
  });

  it('volta para a mesma string', () => {
    expect(serializeBoard(parseBoard(sample))).toBe(sample);
  });

  it('rejeita fases inválidas', () => {
    expect(() => parseBoard('AA')).toThrow();
    expect(() => parseBoard(rows('......', '......', '......', '......', '......', '......'))).toThrow();
    // vermelho em pé
    expect(() => parseBoard(rows('......', 'A.....', 'A.....', '......', '......', '......'))).toThrow();
    // vermelho fora da linha da saída
    expect(() => parseBoard(rows('AA....', '......', '......', '......', '......', '......'))).toThrow();
    // veículo em L
    expect(() => parseBoard(rows('......', '......', 'AA....', '...BB.', '....B.', '......'))).toThrow();
    // veículo de 4 casas
    expect(() => parseBoard(rows('......', '......', 'AA....', 'BBBB..', '......', '......'))).toThrow();
  });
});

describe('moveRange', () => {
  it('para nos outros veículos e nas bordas', () => {
    const v = parseBoard(sample);
    const grid = buildGrid(v);
    expect(moveRange(v, 0, grid)).toEqual({ min: 0, max: 1 }); // A encosta em B
    const b = v.findIndex((x) => x.id === 'B');
    expect(moveRange(v, b, grid)).toEqual({ min: 0, max: 3 });
    const c = v.findIndex((x) => x.id === 'C');
    expect(moveRange(v, c, grid)).toEqual({ min: 0, max: 4 });
  });
});

describe('isSolved', () => {
  it('é verdadeiro só quando o caminho até a saída está livre', () => {
    const v = parseBoard(sample);
    expect(isSolved(v)).toBe(false);
    const b = v.findIndex((x) => x.id === 'B');
    expect(isSolved(withPosition(v, b, 3))).toBe(true);
  });
});

describe('withPosition', () => {
  it('não altera o array original', () => {
    const v = parseBoard(sample);
    const moved = withPosition(v, 0, 1);
    expect(v[0].col).toBe(0);
    expect(moved[0].col).toBe(1);
  });
});

describe('hasBlockingLaneCar', () => {
  it('detecta carro deitado à direita do vermelho', () => {
    expect(hasBlockingLaneCar(parseBoard(rows('......', '......', 'AA..BB', '......', '......', '......')))).toBe(true);
    expect(hasBlockingLaneCar(parseBoard(sample))).toBe(false);
  });
});
