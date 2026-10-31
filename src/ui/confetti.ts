// Confete simples com elementos DOM e Web Animations (sem biblioteca).

const COLORS = ['#FFEB3B', '#42A5F5', '#66BB6A', '#AB47BC', '#FFFFFF', '#E53935', '#26C6DA'];
const MAX_DURATION = 3400;
const MAX_DELAY = 400;

export function confetti(container: HTMLElement, count = 90): void {
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  container.appendChild(layer);
  const { width, height } = container.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    const size = 8 + Math.random() * 10;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (Math.random() < 0.5 ? 0.6 : 1)}px`;
    piece.style.left = `${Math.random() * width}px`;
    piece.style.background = COLORS[i % COLORS.length];
    if (Math.random() < 0.3) piece.style.borderRadius = '50%';
    layer.appendChild(piece);
    const dx = (Math.random() - 0.5) * 240;
    const spin = (Math.random() - 0.5) * 1440;
    piece.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${dx}px, ${height + 80}px) rotate(${spin}deg)` },
      ],
      {
        duration: MAX_DURATION - Math.random() * 1600,
        delay: Math.random() * MAX_DELAY,
        easing: 'cubic-bezier(.25,.6,.45,1)',
        fill: 'both',
      },
    );
  }
  // Remove por tempo (não depende das animações terminarem: elas param se a tela some).
  setTimeout(() => layer.remove(), MAX_DURATION + MAX_DELAY + 100);
}

/** Tira qualquer confete que tenha sobrado na tela. */
export function clearConfetti(container: HTMLElement): void {
  for (const layer of container.querySelectorAll('.confetti-layer')) layer.remove();
}
