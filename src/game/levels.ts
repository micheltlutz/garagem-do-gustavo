import data from './levels.json';

export interface Level {
  board: string;
  /** Rodadas de saída para esvaziar a garagem (dificuldade). */
  depth: number;
}

export const LEVELS: readonly Level[] = data;
export const WORLD_SIZE = 12;
export const WORLD_COUNT = Math.ceil(LEVELS.length / WORLD_SIZE);

export function worldOf(levelIndex: number): number {
  return Math.floor(levelIndex / WORLD_SIZE);
}
