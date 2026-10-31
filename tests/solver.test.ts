import { describe, expect, it } from 'vitest';
import { SIZE, parseBoard, parseGates, withPosition, without, type Gates, type Vehicle } from '../src/game/board.ts';
import { analyze, clearsWithHints, nextMove } from '../src/game/solver.ts';

const rows = (...r: string[]) => r.join('');
const empty = '........';
// Cercas: "cima direita baixo esquerda" ('o' = aberta, 'x' = cerca).
const OPEN = 'oooooooo oooooooo oooooooo oooooooo';

// Ninguém sai de primeira: A (direita) esbarra em B; B (só por baixo) esbarra
// em C; C (só pela esquerda) esbarra em D; D (só por cima) esbarra em A.
// Empurrar o C para a esquerda (ou o B para cima) quebra o ciclo.
const CYCLE = parseBoard(rows(empty, empty, '......B.', '..AA..B.', empty, '...D....', '...D.CC.', empty));
const CYCLE_GATES = parseGates('ooooooxo ooooooxo oooxoooo oooxoooo');

describe('analyze', () => {
  it('todos livres = 1 rodada, nenhum arrasto', () => {
    const v = parseBoard(rows(empty, '.B......', '.B......', '...AA...', empty, '......C.', '......C.', empty));
    expect(analyze(v)).toEqual({ slides: 0, rounds: 1 });
  });

  it('vermelho preso entre dois carros = 2 rodadas', () => {
    const v = parseBoard(rows(empty, empty, '.B....C.', '.B.AA.C.', empty, empty, empty, empty));
    expect(analyze(v)).toEqual({ slides: 0, rounds: 2 });
  });

  it('cercas mudam a ordem de saída', () => {
    // Cerca em cima do C e na esquerda do A: sai o D, depois o C, depois o A.
    const v = parseBoard(rows(empty, empty, '.B....C.', '.B.AA.C.', '......D.', '......D.', empty, empty));
    expect(analyze(v)).toEqual({ slides: 0, rounds: 2 });
    expect(analyze(v, parseGates('ooooooxo oooooooo oooooooo oooxoooo'))).toEqual({ slides: 0, rounds: 3 });
  });

  it('às vezes é preciso empurrar um veículo para o lado', () => {
    expect(analyze(CYCLE, CYCLE_GATES)).toEqual({ slides: 1, rounds: expect.any(Number) });
  });

  it('veículo com cerca nas duas pontas da faixa nunca sai', () => {
    const v = parseBoard(rows(empty, empty, empty, '...AA...', empty, empty, empty, empty));
    expect(analyze(v, parseGates('oooooooo oooxoooo oooooooo oooxoooo'))).toBeNull();
  });
});

describe('nextMove', () => {
  it('sugere tirar um veículo livre, deixando o vermelho por último', () => {
    const v = parseBoard(rows(empty, empty, '.B....C.', '.B.AA.C.', empty, empty, empty, empty));
    const m = nextMove(v)!;
    expect(m.exit).toBeDefined();
    expect(v[m.index].target).toBe(false);
  });

  it('com só o vermelho, sugere tirá-lo pela saída aberta', () => {
    const v = parseBoard(rows(empty, empty, empty, '...AA...', empty, empty, empty, empty));
    expect(nextMove(v)).toEqual({ index: 0, exit: 'forward', to: SIZE });
    expect(nextMove(v, parseGates('oooooooo oooxoooo oooooooo oooooooo'))).toEqual({ index: 0, exit: 'back', to: -2 });
  });

  it('se ninguém pode sair, sugere o arrasto que libera alguém', () => {
    const m = nextMove(CYCLE, CYCLE_GATES)!;
    expect(m.exit).toBeUndefined();
    const after = withPosition(CYCLE, m.index, m.to);
    expect(nextMove(after, CYCLE_GATES)?.exit).toBeDefined();
  });

  it('garagem vazia não tem dica', () => {
    expect(nextMove([])).toBeNull();
  });
});

describe('a garagem com solução nunca trava', () => {
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
  // Como no gerador: em cada faixa ocupada, uma ponta com cerca.
  function randomGates(vehicles: Vehicle[]): Gates {
    const g = parseGates(OPEN);
    for (let lane = 0; lane < SIZE; lane++) {
      for (const [dir, a, b] of [
        ['h', 'left', 'right'],
        ['v', 'top', 'bottom'],
      ] as const) {
        const used = vehicles.some((v) => v.dir === dir && (dir === 'h' ? v.row : v.col) === lane);
        if (used) g[rand() < 0.5 ? a : b][lane] = false;
      }
    }
    return g;
  }

  it('seguindo as dicas, toda garagem com solução esvazia', () => {
    let solvable = 0;
    for (let k = 0; k < 200; k++) {
      const v = randomBoard(4 + (k % 13));
      const g = randomGates(v);
      if (analyze(v, g)) {
        solvable++;
        expect(clearsWithHints(v, g)).toBe(true);
      }
    }
    expect(solvable).toBeGreaterThan(150);
  });

  it('tirar um veículo nunca deixa uma garagem com solução sem solução', () => {
    for (let k = 0; k < 100; k++) {
      const v = randomBoard(6 + (k % 10));
      const g = randomGates(v);
      if (!analyze(v, g)) continue;
      const m = nextMove(v, g)!;
      if (m.exit) expect(analyze(without(v, m.index), g)).not.toBeNull();
    }
  });
});
