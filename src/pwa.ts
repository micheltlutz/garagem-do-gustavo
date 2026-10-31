// Registro do service worker (modo offline) e atualizações.
// Uma versão nova só é aplicada fora das fases, para não interromper o jogo.

import { registerSW } from 'virtual:pwa-register';

let applyUpdate: (() => void) | null = null;

export function setupPWA(isSafeMoment: () => boolean): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      applyUpdate = () => void updateSW(true);
      if (isSafeMoment()) applyPendingUpdate();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // App instalado pode ficar dias "dormindo": procura atualização ao voltar.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      });
    },
  });
  void navigator.storage?.persist?.().catch(() => false);
}

/** Aplica uma atualização pendente (recarrega a página). */
export function applyPendingUpdate(): void {
  if (!applyUpdate) return;
  const apply = applyUpdate;
  applyUpdate = null;
  apply();
}
