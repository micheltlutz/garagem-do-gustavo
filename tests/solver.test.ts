import { describe, expect, it } from 'vitest';
import { isSolved, parseBoard, withPosition } from '../src/game/board.ts';
import { nextMove, puzzleKey, solve } from '../src/game/solver.ts';

const rows = (...r: string[]) => r.join('');

describe('solve', () => {
  it('fase já vencida precisa de 0 jogadas', () => {
    expect(solve(parseBoard(rows('......', '......', 'AA....', '......', '......', '......')))?.minMoves).toBe(0);
  });

  it('um carro bloqueando = 1 jogada', () => {
    expect(solve(parseBoard(rows('......', '......', 'AA..B.', '....B.', '......', '......')))?.minMoves).toBe(1);
  });

  it('caminhão preso por um carro = 2 jogadas', () => {
    const s = solve(parseBoard(rows('..B...', '..B...', 'AAB...', '......', '......', '..CC..')));
    expect(s?.minMoves).toBe(2);
  });

  it('a solução encontrada realmente resolve a fase', () => {
    let v = parseBoard(rows('....B.', '....BC', 'AA..BC', '......', '....DD', '..EE..'));
    const s = solve(v)!;
    expect(s.minMoves).toBeGreaterThan(0);
    for (const m of s.moves) v = withPosition(v, m.index, m.to);
    expect(isSolved(v)).toBe(true);
  });

  it('fase impossível devolve null', () => {
    expect(solve(parseBoard(rows('......', '......', 'AA..BB', '......', '......', '......')))).toBeNull();
  });
});

describe('nextMove', () => {
  it('cada dica reduz a distância até a vitória', () => {
    let v = parseBoard(rows('....B.', '....BC', 'AA..BC', '......', '....DD', '..EE..'));
    let remaining = solve(v)!.minMoves;
    while (remaining > 0) {
      const m = nextMove(v)!;
      v = withPosition(v, m.index, m.to);
      remaining--;
      expect(solve(v)!.minMoves).toBe(remaining);
    }
    expect(nextMove(v)).toBeNull();
  });
});

describe('puzzleKey', () => {
  it('é igual para dois momentos do mesmo quebra-cabeça', () => {
    const v = parseBoard(rows('..B...', '..B...', 'AAB...', '......', '......', '..CC..'));
    const c = v.findIndex((x) => x.id === 'C');
    const moved = withPosition(v, c, 4);
    expect(puzzleKey(moved)).toBe(puzzleKey(v));
  });

  it('não depende das letras', () => {
    const a = parseBoard(rows('......', '...B..', 'AA.B.C', '.....C', '......', '......'));
    const b = parseBoard(rows('......', '...C..', 'AA.C.B', '.....B', '......', '......'));
    expect(puzzleKey(a)).toBe(puzzleKey(b));
  });

  it('é diferente para quebra-cabeças diferentes', () => {
    const a = parseBoard(rows('......', '......', 'AA..B.', '....B.', '......', '......'));
    const b = parseBoard(rows('......', '......', 'AA.B..', '...B..', '......', '......'));
    expect(puzzleKey(a)).not.toBe(puzzleKey(b));
  });
});
