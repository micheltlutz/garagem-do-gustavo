import { describe, expect, it } from 'vitest';
import { SIZE, parseBoard, type Vehicle } from '../src/game/board.ts';
import { clearRounds, clearsWithHints, nextMove } from '../src/game/solver.ts';

const rows = (...r: string[]) => r.join('');
const empty = '........';

describe('clearRounds', () => {
  it('todos livres = 1 rodada', () => {
    expect(clearRounds(parseBoard(rows(empty, '.B......', '.B......', '...AA...', empty, '......C.', '......C.', empty)))).toBe(1);
  });

  it('vermelho preso entre dois carros = 2 rodadas', () => {
    expect(clearRounds(parseBoard(rows(empty, empty, '.B....C.', '.B.AA.C.', empty, empty, empty, empty)))).toBe(2);
  });

  it('cadeia de bloqueios = 3 rodadas', () => {
    // A preso por dois caminhões, e cada caminhão preso por dois carros.
    const b = rows(empty, 'GG....EE', '.B....C.', '.B.AA.C.', '.B....C.', 'HH....FF', empty, empty);
    expect(clearRounds(parseBoard(b))).toBe(3);
  });
});

describe('nextMove', () => {
  it('sugere tirar um veículo livre, deixando o vermelho por último', () => {
    const v = parseBoard(rows(empty, empty, '.B....C.', '.B.AA.C.', empty, empty, empty, empty));
    const m = nextMove(v)!;
    expect(v[m.index].target).toBe(false);
  });

  it('com só o vermelho, sugere tirá-lo', () => {
    const v = parseBoard(rows(empty, empty, empty, '...AA...', empty, empty, empty, empty));
    expect(nextMove(v)).toEqual({ index: 0, exit: 'forward', to: SIZE });
  });

  it('pela frente quando dá, senão por trás', () => {
    const v = parseBoard(rows(empty, empty, empty, '.AA..BB.', empty, empty, empty, empty));
    // B está livre para a direita; A só sai pela esquerda (B está no caminho).
    const m = nextMove(v)!;
    expect(v[m.index].id).toBe('B');
    expect(m.exit).toBe('forward');
  });

  it('garagem vazia não tem dica', () => {
    expect(nextMove([])).toBeNull();
  });
});

describe('a garagem nunca trava', () => {
  // Sorteio reproduzível (mulberry32).
  let seed = 12345;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  function randomBoard(count: number): Vehicle[] {
    const cells = new Array<string>(SIZE * SIZE).fill('.');
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let placed = 0;
    for (let tries = 0; placed < count && tries < 2000; tries++) {
      const len = rand() < 0.3 ? 3 : 2;
      const h = rand() < 0.5;
      const row = Math.floor(rand() * (h ? SIZE : SIZE - len + 1));
      const col = Math.floor(rand() * (h ? SIZE - len + 1 : SIZE));
      const idx = Array.from({ length: len }, (_, k) => (h ? row * SIZE + col + k : (row + k) * SIZE + col));
      if (idx.some((i) => cells[i] !== '.')) continue;
      for (const i of idx) cells[i] = letters[placed];
      placed++;
    }
    return parseBoard(cells.join(''));
  }

  it('em 500 garagens sorteadas (até lotadas), sempre dá para esvaziar', () => {
    for (let k = 0; k < 500; k++) {
      const v = randomBoard(4 + (k % 22));
      expect(clearRounds(v)).not.toBeNull();
      expect(clearsWithHints(v)).toBe(true);
    }
  });
});
