import { describe, expect, it } from 'vitest';
import {
  buildGrid,
  exitSides,
  gateOf,
  moveRange,
  parseBoard,
  parseGates,
  serializeBoard,
  serializeGates,
  withPosition,
  without,
} from '../src/game/board.ts';

const rows = (...r: string[]) => r.join('');

const sample = rows(
  '...B....',
  '...B....',
  '...B....',
  'AA......',
  '........',
  '.CC.....',
  '........',
  '......DD',
);

describe('parseBoard', () => {
  it('lê veículos, direção e tamanho', () => {
    const v = parseBoard(sample);
    expect(v).toHaveLength(4);
    expect(v[0]).toMatchObject({ id: 'A', row: 3, col: 0, len: 2, dir: 'h', target: true });
    expect(v[1]).toMatchObject({ id: 'B', row: 0, col: 3, len: 3, dir: 'v', target: false });
    expect(v[2]).toMatchObject({ id: 'C', row: 5, col: 1, len: 2, dir: 'h' });
  });

  it('aceita o vermelho em qualquer lugar e direção', () => {
    const v = parseBoard(rows('........', '.....A..', '.....A..', '........', '........', '........', '........', '........'));
    expect(v[0]).toMatchObject({ id: 'A', dir: 'v', row: 1, col: 5 });
  });

  it('volta para a mesma string', () => {
    expect(serializeBoard(parseBoard(sample))).toBe(sample);
  });

  it('rejeita fases inválidas', () => {
    expect(() => parseBoard('AA')).toThrow();
    // veículo em L
    expect(() => parseBoard(rows('........', '........', '........', 'AA......', '...BB...', '....B...', '........', '........'))).toThrow();
    // veículo de 4 casas
    expect(() => parseBoard(rows('........', '........', '........', 'AA......', 'BBBB....', '........', '........', '........'))).toThrow();
    // caractere estranho
    expect(() => parseBoard(rows('........', '........', '........', 'AA..x...', '........', '........', '........', '........'))).toThrow();
  });
});

describe('moveRange', () => {
  it('para nos outros veículos e nas bordas', () => {
    const v = parseBoard(sample);
    const grid = buildGrid(v);
    expect(moveRange(v, 0, grid)).toEqual({ min: 0, max: 6 }); // A: linha livre
    expect(moveRange(v, 1, grid)).toEqual({ min: 0, max: 5 }); // B: caminhão
    expect(moveRange(v, 3, grid)).toEqual({ min: 0, max: 6 }); // D: encostado na direita
  });
});

describe('exitSides', () => {
  it('sai pelo lado em que o caminho até a borda está livre', () => {
    const v = parseBoard(rows('........', '........', '.B....C.', '.B.AA.C.', '........', '........', '........', '........'));
    expect(exitSides(v, 0)).toEqual({ back: false, forward: false }); // A preso entre B e C
    expect(exitSides(v, 1)).toEqual({ back: true, forward: true }); // B livre para cima e para baixo
  });

  it('veículo encostado na borda pode sair por ela', () => {
    const v = parseBoard(rows('AA......', 'B.......', 'B.......', '........', '........', '........', '........', '........'));
    expect(exitSides(v, 0)).toEqual({ back: true, forward: true });
    expect(exitSides(v, 1).back).toBe(false); // B tem o A em cima
    expect(exitSides(v, 1).forward).toBe(true);
  });
});

describe('withPosition / without', () => {
  it('não alteram o array original', () => {
    const v = parseBoard(sample);
    const moved = withPosition(v, 0, 2);
    expect(v[0].col).toBe(0);
    expect(moved[0].col).toBe(2);
    const fewer = without(v, 1);
    expect(fewer.map((x) => x.id)).toEqual(['A', 'C', 'D']);
    expect(v).toHaveLength(4);
  });
});

describe('cercas', () => {
  it('lê e escreve no formato "cima direita baixo esquerda"', () => {
    const text = 'oxoooooo oooooooo ooooooxo oooxoooo';
    const g = parseGates(text);
    expect(g.top[1]).toBe(false);
    expect(g.bottom[6]).toBe(false);
    expect(g.left[3]).toBe(false);
    expect(g.right.every(Boolean)).toBe(true);
    expect(serializeGates(g)).toBe(text);
    expect(serializeGates(parseGates())).toBe('oooooooo oooooooo oooooooo oooooooo');
  });

  it('rejeita cercas mal escritas', () => {
    expect(() => parseGates('oooo')).toThrow();
    expect(() => parseGates('oooooooo oooooooo oooooooo ooooooo?')).toThrow();
  });

  it('cada ponta da faixa corresponde a um lado da borda', () => {
    const [a, b] = parseBoard(rows('........', '.....B..', '.....B..', '.AA.....', '........', '........', '........', '........'));
    expect(gateOf(a, 'back')).toEqual({ side: 'left', lane: 3 });
    expect(gateOf(a, 'forward')).toEqual({ side: 'right', lane: 3 });
    expect(gateOf(b, 'back')).toEqual({ side: 'top', lane: 5 });
    expect(gateOf(b, 'forward')).toEqual({ side: 'bottom', lane: 5 });
  });

  it('com cerca, o veículo não sai por aquele lado mesmo com caminho livre', () => {
    const v = parseBoard(rows('........', '........', '........', '...AA...', '........', '........', '........', '........'));
    expect(exitSides(v, 0)).toEqual({ back: true, forward: true });
    const g = parseGates('oooooooo oooxoooo oooooooo oooooooo'); // cerca na direita da linha 3
    expect(exitSides(v, 0, g)).toEqual({ back: true, forward: false });
  });
});
