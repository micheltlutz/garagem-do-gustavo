import data from './levels.json';

export interface Level {
  board: string;
  /** Cercas na borda: "cima direita baixo esquerda" ('o' = aberta, 'x' = cerca). */
  gates: string;
  /** Veículos que precisam ser empurrados para o lado (dificuldade). */
  slides: number;
  /** Rodadas de saída até esvaziar a garagem. */
  rounds: number;
}

export const LEVELS: readonly Level[] = data;
export const WORLD_SIZE = 12;
export const WORLD_COUNT = Math.ceil(LEVELS.length / WORLD_SIZE);

export function worldOf(levelIndex: number): number {
  return Math.floor(levelIndex / WORLD_SIZE);
}
