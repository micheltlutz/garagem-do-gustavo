// Solver para "esvaziar a garagem".
//
// Com as bordas abertas, sempre há algum veículo que pode sair: na fileira
// ocupada mais alta, o primeiro veículo da esquerda sai pela esquerda (se for
// deitado) ou por cima (se for em pé). E tirar um veículo só abre espaço,
// nunca atrapalha. Por isso a garagem nunca trava e a dica é sempre
// "tire este aqui".

import { SIZE, buildGrid, exitSides, without, type Vehicle } from './board.ts';

export interface Move {
  index: number;
  /** Posição de destino, fora da garagem. */
  to: number;
  exit: 'back' | 'forward';
}

/**
 * Quantas rodadas são precisas para esvaziar a garagem (em cada rodada saem
 * todos os veículos que estão livres). É a medida de dificuldade das fases.
 */
export function clearRounds(vehicles: readonly Vehicle[]): number | null {
  let current = [...vehicles];
  let rounds = 0;
  while (current.length > 0) {
    const grid = buildGrid(current);
    const leaving = new Set(
      current.filter((_, i) => {
        const s = exitSides(current, i, grid);
        return s.back || s.forward;
      }),
    );
    if (leaving.size === 0) return null; // não acontece (ver o comentário no topo)
    current = current.filter((v) => !leaving.has(v));
    rounds++;
  }
  return rounds;
}

/** Dica: um veículo que pode sair agora (o vermelho fica por último, como "grand finale"). */
export function nextMove(vehicles: readonly Vehicle[]): Move | null {
  const grid = buildGrid(vehicles);
  const order = vehicles.map((_, i) => i).sort((a, b) => Number(vehicles[a].target) - Number(vehicles[b].target));
  for (const i of order) {
    const s = exitSides(vehicles, i, grid);
    if (s.forward) return { index: i, to: SIZE, exit: 'forward' };
    if (s.back) return { index: i, to: -vehicles[i].len, exit: 'back' };
  }
  return null;
}

/** Verdadeiro se, seguindo as dicas, a garagem fica vazia. */
export function clearsWithHints(vehicles: readonly Vehicle[]): boolean {
  let current = [...vehicles];
  while (current.length > 0) {
    const m = nextMove(current);
    if (!m) return false;
    current = without(current, m.index);
  }
  return true;
}
