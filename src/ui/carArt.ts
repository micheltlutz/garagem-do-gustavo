// Desenhos dos veículos vistos de cima, em SVG.
// Cada casa vale 100 unidades; o desenho deixa uma pequena margem nas bordas.

import type { Dir } from '../game/board.ts';

export interface Paint {
  body: string;
  dark: string;
  light: string;
}

export const RED: Paint = { body: '#E53935', dark: '#B71C1C', light: '#EF9A9A' };

// Sem vermelho, laranja ou rosa: essas cores são só do carro-alvo.
export const PALETTE: Paint[] = [
  { body: '#42A5F5', dark: '#1565C0', light: '#90CAF9' }, // azul
  { body: '#66BB6A', dark: '#2E7D32', light: '#A5D6A7' }, // verde
  { body: '#FFEE58', dark: '#F9A825', light: '#FFF9C4' }, // amarelo
  { body: '#AB47BC', dark: '#6A1B9A', light: '#CE93D8' }, // roxo
  { body: '#26A69A', dark: '#00695C', light: '#80CBC4' }, // verde-água
  { body: '#5C6BC0', dark: '#283593', light: '#9FA8DA' }, // anil
  { body: '#26C6DA', dark: '#00838F', light: '#B2EBF2' }, // ciano
  { body: '#8D6E63', dark: '#4E342E', light: '#BCAAA4' }, // marrom
  { body: '#ECEFF1', dark: '#78909C', light: '#FFFFFF' }, // branco
  { body: '#37474F', dark: '#102027', light: '#62727B' }, // preto
];

const GLASS = '#B3E5FC';
const TIRE = '#263238';

function eyes(x: number, y1: number, y2: number, r: number): string {
  const eye = (y: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.1}" fill="#fff"/>` +
    `<circle cx="${x + r * 0.35}" cy="${y}" r="${r * 0.55}" fill="#263238"/>` +
    `<circle cx="${x + r * 0.5}" cy="${y - r * 0.25}" r="${r * 0.18}" fill="#fff"/>`;
  return eye(y1) + eye(y2);
}

function carShape(p: Paint, smile: boolean): string {
  return `
    <rect x="12" y="14" width="182" height="80" rx="26" fill="rgba(0,0,0,.28)"/>
    <rect x="34" y="5" width="34" height="16" rx="6" fill="${TIRE}"/>
    <rect x="132" y="5" width="34" height="16" rx="6" fill="${TIRE}"/>
    <rect x="34" y="79" width="34" height="16" rx="6" fill="${TIRE}"/>
    <rect x="132" y="79" width="34" height="16" rx="6" fill="${TIRE}"/>
    <rect x="7" y="11" width="186" height="78" rx="28" fill="${p.body}" stroke="${p.dark}" stroke-width="4"/>
    <rect x="58" y="22" width="70" height="56" rx="16" fill="${p.light}"/>
    <rect x="48" y="27" width="14" height="46" rx="7" fill="${GLASS}"/>
    <rect x="124" y="23" width="20" height="54" rx="9" fill="${GLASS}"/>
    <rect x="183" y="18" width="9" height="16" rx="4" fill="#FFF59D"/>
    <rect x="183" y="66" width="9" height="16" rx="4" fill="#FFF59D"/>
    <rect x="8" y="20" width="6" height="14" rx="3" fill="#FFCDD2"/>
    <rect x="8" y="66" width="6" height="14" rx="3" fill="#FFCDD2"/>
    ${eyes(163, 36, 64, 10)}
    ${smile ? `<path d="M178 40 Q190 50 178 60" stroke="${p.dark}" stroke-width="5" fill="none" stroke-linecap="round"/>` : ''}`;
}

function truckShape(p: Paint): string {
  return `
    <rect x="12" y="14" width="284" height="80" rx="16" fill="rgba(0,0,0,.28)"/>
    <rect x="30" y="4" width="36" height="16" rx="6" fill="${TIRE}"/>
    <rect x="110" y="4" width="36" height="16" rx="6" fill="${TIRE}"/>
    <rect x="232" y="6" width="34" height="16" rx="6" fill="${TIRE}"/>
    <rect x="30" y="80" width="36" height="16" rx="6" fill="${TIRE}"/>
    <rect x="110" y="80" width="36" height="16" rx="6" fill="${TIRE}"/>
    <rect x="232" y="78" width="34" height="16" rx="6" fill="${TIRE}"/>
    <rect x="7" y="9" width="200" height="82" rx="12" fill="${p.light}" stroke="${p.dark}" stroke-width="4"/>
    <path d="M47 13 V87 M87 13 V87 M127 13 V87 M167 13 V87" stroke="${p.body}" stroke-width="6" opacity=".55"/>
    <rect x="202" y="18" width="12" height="64" fill="${p.dark}"/>
    <rect x="210" y="13" width="84" height="74" rx="22" fill="${p.body}" stroke="${p.dark}" stroke-width="4"/>
    <rect x="252" y="22" width="18" height="56" rx="8" fill="${GLASS}"/>
    <rect x="284" y="19" width="8" height="14" rx="4" fill="#FFF59D"/>
    <rect x="284" y="67" width="8" height="14" rx="4" fill="#FFF59D"/>
    ${eyes(232, 36, 64, 9)}`;
}

/**
 * SVG de um veículo. O desenho base aponta para a direita; ele é girado
 * ou espelhado conforme a direção do veículo e o lado para onde "olha".
 */
export function vehicleSvg(len: number, dir: Dir, paint: Paint, flip: boolean, hero = false): string {
  const long = len * 100;
  const shape = len >= 3 ? truckShape(paint) : carShape(paint, hero);
  let w = long;
  let h = 100;
  let transform: string;
  if (dir === 'h') {
    transform = flip ? `translate(${long} 0) scale(-1 1)` : '';
  } else {
    w = 100;
    h = long;
    transform = flip ? `translate(0 ${long}) rotate(-90)` : 'translate(100 0) rotate(90)';
  }
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><g transform="${transform}">${shape}</g></svg>`;
}
