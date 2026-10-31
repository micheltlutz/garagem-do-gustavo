// Progresso salvo no próprio iPad. Se o armazenamento falhar (modo privado,
// por exemplo), o jogo continua funcionando, só não lembra o progresso.

// v2: tabuleiro 8x8 com fases novas (o progresso do 6x6 não vale mais).
const KEY = 'garagem-do-gustavo:v2';
const OLD_KEY = 'garagem-do-gustavo:v1';

interface SaveData {
  done: number[];
  sound: boolean;
}

function read(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<SaveData>;
      return {
        done: Array.isArray(data.done) ? data.done.filter((n) => Number.isInteger(n)) : [],
        sound: data.sound !== false,
      };
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old) return { done: [], sound: (JSON.parse(old) as Partial<SaveData>).sound !== false };
  } catch {
    // ignora: começa do zero
  }
  return { done: [], sound: true };
}

const state = read();

function write(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // sem armazenamento disponível
  }
}

export const progress = {
  isDone: (level: number) => state.done.includes(level),
  markDone(level: number): void {
    if (!state.done.includes(level)) {
      state.done.push(level);
      write();
    }
  },
  /** Primeira fase ainda não concluída (ou a primeira, se já fez todas). */
  nextLevel(total: number): number {
    for (let i = 0; i < total; i++) if (!state.done.includes(i)) return i;
    return 0;
  },
  get sound(): boolean {
    return state.sound;
  },
  set sound(on: boolean) {
    state.sound = on;
    write();
  },
};
