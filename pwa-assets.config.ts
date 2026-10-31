import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Gera os ícones PNG (Tela de Início, favicon) a partir de public/icon.svg.
// O desenho já ocupa o quadrado inteiro, então não precisa de margem.
const resizeOptions = { background: '#4FC3F7' };
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions },
  },
  images: ['public/icon.svg'],
});
