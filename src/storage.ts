// Progresso salvo no próprio iPad. Se o armazenamento falhar (modo privado,
// por exemplo), o jogo continua funcionando, só não lembra o progresso.

const KEY = 'garagem-do-gustavo:v1';

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
