// Ícones dos botões (SVG embutido, sem arquivos de imagem).

const svg = (body: string) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
const stroke = (w = 5) =>
  `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
// Contorno arredondado para formas preenchidas.
const solidEdge = (w: number) => `stroke="currentColor" stroke-width="${w}" stroke-linejoin="round"`;

export const ICONS = {
  play: svg(`<path d="M17 11 L37 24 L17 37 Z" fill="currentColor" ${solidEdge(5)}/>`),
  home: svg(
    `<path d="M7 23 L24 8 L41 23" ${stroke()}/><path d="M12 20 V40 H36 V20" ${stroke()}/>` +
      `<rect x="20" y="28" width="8" height="12" rx="2" fill="currentColor"/>`,
  ),
  grid: svg(
    `<g fill="currentColor"><rect x="7" y="7" width="14" height="14" rx="4"/><rect x="27" y="7" width="14" height="14" rx="4"/>` +
      `<rect x="7" y="27" width="14" height="14" rx="4"/><rect x="27" y="27" width="14" height="14" rx="4"/></g>`,
  ),
  restart: svg(`<path d="M37 26 A13 13 0 1 1 32 14" ${stroke()}/><path d="M33 5 V15 H23" ${stroke()}/>`),
  bulb: svg(
    `<path d="M24 5 a12 12 0 0 1 7 21.7 V31 H17 V26.7 A12 12 0 0 1 24 5 z" fill="currentColor"/>` +
      `<rect x="17" y="34" width="14" height="4" rx="2" fill="currentColor"/>` +
      `<rect x="20" y="40" width="8" height="4" rx="2" fill="currentColor"/>`,
  ),
  soundOn: svg(
    `<path d="M8 19 H15 L25 10 V38 L15 29 H8 Z" fill="currentColor" ${solidEdge(3)}/>` +
      `<path d="M31 18 Q35 24 31 30 M36 12 Q44 24 36 36" ${stroke(4.5)}/>`,
  ),
  soundOff: svg(
    `<path d="M8 19 H15 L25 10 V38 L15 29 H8 Z" fill="currentColor" ${solidEdge(3)}/>` +
      `<path d="M32 18 L42 30 M42 18 L32 30" ${stroke(4.5)}/>`,
  ),
  back: svg(`<path d="M39 24 H11 M22 12 L10 24 L22 36" ${stroke(6)}/>`),
  next: svg(`<path d="M9 24 H37 M26 12 L38 24 L26 36" ${stroke(6)}/>`),
  check: svg(`<path d="M11 25 L20 34 L37 15" ${stroke(7)}/>`),
  chevrons: svg(`<path d="M10 12 L22 24 L10 36 M26 12 L38 24 L26 36" ${stroke(6)}/>`),
  trophy: svg(
    `<path d="M14 7 H34 V18 A10 10 0 0 1 14 18 Z" fill="currentColor"/>` +
      `<path d="M14 11 H8 V14 A7 7 0 0 0 15 21 M34 11 H40 V14 A7 7 0 0 1 33 21" ${stroke(3.5)}/>` +
      `<rect x="21" y="27" width="6" height="8" fill="currentColor"/><rect x="13" y="35" width="22" height="7" rx="3" fill="currentColor"/>`,
  ),
} as const;

export type IconName = keyof typeof ICONS;

/** Cria um botão só com ícone (o rótulo é lido pelo VoiceOver). */
export function iconButton(icon: IconName, label: string, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${className}`.trim();
  b.setAttribute('aria-label', label);
  b.innerHTML = ICONS[icon];
  return b;
}
