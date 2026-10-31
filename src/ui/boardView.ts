// Tabuleiro na tela: desenha os veículos e cuida do arrastar e do tocar.

import {
  EXIT_ROW,
  SIZE,
  isSolved,
  moveRange,
  parseBoard,
  posOf,
  withPosition,
  type Range,
  type Vehicle,
} from '../game/board.ts';
import { nextMove } from '../game/solver.ts';
import { sfx } from '../audio/sfx.ts';
import { PALETTE, RED, vehicleSvg } from './carArt.ts';
import { ICONS } from './icons.ts';

/** Espessura da mureta em relação ao tamanho da casa. */
const WALL = 0.38;
/** Quanto o dedo pode andar e ainda contar como toque (px). */
const TAP_SLOP = 12;
/** Quanto o carro "estica" além do limite ao ser empurrado (em casas). */
const OVERSHOOT = 0.18;

export interface BoardEvents {
  /** Um veículo mudou de casa. */
  onMove(): void;
  /** O caminho do vermelho ficou livre (já depois da animação). */
  onSolved(): void;
}

interface Drag {
  index: number;
  pointerId: number;
  el: HTMLElement;
  range: Range;
  startPos: number;
  startClient: number;
  startX: number;
  startY: number;
  startTime: number;
  travel: number;
  shown: number;
  lastCell: number;
  bumped: boolean;
  samples: { t: number; p: number }[];
}

function seeded(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BoardView {
  readonly root: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly ghost: HTMLElement;
  private vehicles: Vehicle[] = [];
  private start: Vehicle[] = [];
  private els: HTMLElement[] = [];
  private cell = 60;
  private drag: Drag | null = null;
  private locked = false;
  private hintTimer = 0;
  private readonly events: BoardEvents;

  constructor(events: BoardEvents) {
    this.events = events;
    this.root = document.createElement('div');
    this.root.className = 'board-wrap';
    this.root.innerHTML = `
      <div class="board-frame">
        <div class="exit">${ICONS.chevrons}</div>
        <div class="board-grid">
          <div class="lane"></div>
          <div class="ghost" hidden>${ICONS.chevrons}</div>
        </div>
      </div>`;
    this.frame = this.root.querySelector('.board-frame')!;
    this.grid = this.root.querySelector('.board-grid')!;
    this.ghost = this.root.querySelector('.ghost')!;
    this.frame.style.setProperty('--exit-row', String(EXIT_ROW));

    this.grid.addEventListener('pointerdown', (e) => this.onDown(e));
    this.grid.addEventListener('pointermove', (e) => this.onDragMove(e));
    this.grid.addEventListener('pointerup', (e) => this.onUp(e, false));
    this.grid.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.grid.addEventListener('lostpointercapture', (e) => this.onUp(e, true));

    new ResizeObserver(() => this.layout()).observe(this.root);
  }

  /** Monta uma fase nova. */
  load(board: string, levelIndex: number): void {
    this.cancelDrag();
    this.clearHint();
    this.locked = false;
    this.start = parseBoard(board);
    this.vehicles = this.start;
    for (const el of this.els) el.remove();

    const rand = seeded(levelIndex + 1);
    const colors = [...PALETTE].sort(() => rand() - 0.5);
    this.els = this.vehicles.map((v, i) => {
      const el = document.createElement('div');
      el.className = 'vehicle';
      el.dataset.i = String(i);
      const flip = !v.target && rand() < 0.5;
      const paint = v.target ? RED : colors[(i - 1) % colors.length];
      el.innerHTML = `<div class="art">${vehicleSvg(v.len, v.dir, paint, flip, v.target)}</div>`;
      this.grid.appendChild(el);
      return el;
    });
    this.layout();
    this.els.forEach((el, i) => {
      el.querySelector('.art')!.animate(
        [{ transform: 'scale(0)' }, { transform: 'scale(1.12)', offset: 0.7 }, { transform: 'scale(1)' }],
        { duration: 420, delay: 80 + i * 70, easing: 'ease-out', fill: 'backwards' },
      );
    });
  }

  /** Volta todos os veículos para o começo da fase. */
  restart(): void {
    if (this.locked) return;
    this.cancelDrag();
    this.clearHint();
    const before = this.vehicles;
    this.vehicles = this.start;
    this.start.forEach((v, i) => {
      const from = posOf(before[i]);
      const to = posOf(v);
      if (from !== to) this.animateTo(i, from, to, 160 + 40 * Math.abs(to - from));
    });
  }

  /** Mostra qual carro mexer e para onde. */
  showHint(): void {
    if (this.locked || this.drag) return;
    const move = nextMove(this.vehicles);
    if (!move) return;
    this.clearHint();
    const v = this.vehicles[move.index];
    const el = this.els[move.index];
    const dirSign = Math.sign(move.to - posOf(v));
    const nudge = this.cell * 0.12 * dirSign;
    el.style.setProperty('--nx', v.dir === 'h' ? `${nudge}px` : '0px');
    el.style.setProperty('--ny', v.dir === 'v' ? `${nudge}px` : '0px');
    el.classList.add('hint');

    this.setBox(this.ghost, v);
    this.ghost.style.transform = this.translate(v, move.to);
    const angle = v.dir === 'h' ? (dirSign > 0 ? 0 : 180) : dirSign > 0 ? 90 : -90;
    this.ghost.style.setProperty('--arrow-rotate', `${angle}deg`);
    this.ghost.hidden = false;
    this.hintTimer = window.setTimeout(() => this.clearHint(), 6000);
  }

  clearHint(): void {
    clearTimeout(this.hintTimer);
    this.ghost.hidden = true;
    for (const el of this.els) el.classList.remove('hint');
  }

  /** O carro vermelho brilha, buzina e sai acelerando pela saída. */
  async driveOut(): Promise<void> {
    const i = this.vehicles.findIndex((v) => v.target);
    const v = this.vehicles[i];
    const el = this.els[i];
    el.classList.add('glow', 'leaving');
    sfx.honk();
    await wait(450);
    const gridLeft = this.grid.getBoundingClientRect().left;
    const end = (window.innerWidth - gridLeft) / this.cell + 0.5;
    sfx.engine();
    const anim = el.animate(
      [
        { transform: this.translate(v, v.col), offset: 0 },
        { transform: this.translate(v, v.col - 0.15), offset: 0.15 },
        { transform: this.translate(v, end), offset: 1 },
      ],
      { duration: 950, easing: 'cubic-bezier(.55,0,.85,.35)', fill: 'forwards' },
    );
    await anim.finished.catch(() => {});
  }

  /** Termina um arrasto em andamento (ex.: o app foi para o segundo plano). */
  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.finishDrag(d, Math.round(clamp(d.shown, d.range.min, d.range.max)), false);
  }

  // ---------- layout ----------

  private layout(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    this.cancelDrag();
    const units = SIZE + 2 * WALL;
    this.cell = Math.max(20, Math.floor(Math.min(w / (units + WALL), h / units)));
    const wall = Math.round(this.cell * WALL);
    const side = this.cell * SIZE + wall * 2;
    this.frame.style.setProperty('--cell', `${this.cell}px`);
    this.frame.style.setProperty('--wall-w', `${wall}px`);
    this.frame.style.width = `${side}px`;
    this.frame.style.height = `${side}px`;
    this.vehicles.forEach((v, i) => {
      this.setBox(this.els[i], v);
      this.els[i].style.transform = this.translate(v, posOf(v));
    });
  }

  private setBox(el: HTMLElement, v: Vehicle): void {
    el.style.width = `${(v.dir === 'h' ? v.len : 1) * this.cell}px`;
    el.style.height = `${(v.dir === 'v' ? v.len : 1) * this.cell}px`;
  }

  private translate(v: Vehicle, pos: number): string {
    const x = (v.dir === 'h' ? pos : v.col) * this.cell;
    const y = (v.dir === 'v' ? pos : v.row) * this.cell;
    return `translate3d(${x}px, ${y}px, 0)`;
  }

  private animateTo(i: number, from: number, to: number, duration: number): Animation {
    const v = this.vehicles[i];
    const el = this.els[i];
    el.style.transform = this.translate(v, to);
    return el.animate([{ transform: this.translate(v, from) }, { transform: this.translate(v, to) }], {
      duration,
      easing: 'cubic-bezier(.2,.8,.3,1)',
    });
  }

  private shake(i: number): void {
    const axis = this.vehicles[i].dir === 'h' ? 'X' : 'Y';
    const art = this.els[i].querySelector('.art')!;
    art.animate(
      [
        { transform: 'none' },
        { transform: `translate${axis}(-5%)` },
        { transform: `translate${axis}(5%)` },
        { transform: `translate${axis}(-2%)` },
        { transform: 'none' },
      ],
      { duration: 280, easing: 'ease-out' },
    );
  }

  // ---------- toque ----------

  private onDown(e: PointerEvent): void {
    const el = (e.target as Element).closest<HTMLElement>('.vehicle');
    // Um dedo por vez; outros dedos (e a palma) são ignorados.
    if (!el || this.locked || this.drag) return;
    e.preventDefault();
    const index = Number(el.dataset.i);
    for (const a of el.getAnimations()) a.finish();
    el.setPointerCapture(e.pointerId);
    this.clearHint();
    const v = this.vehicles[index];
    const pos = posOf(v);
    this.drag = {
      index,
      pointerId: e.pointerId,
      el,
      range: moveRange(this.vehicles, index),
      startPos: pos,
      startClient: v.dir === 'h' ? e.clientX : e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: e.timeStamp,
      travel: 0,
      shown: pos,
      lastCell: pos,
      bumped: false,
      samples: [{ t: e.timeStamp, p: pos }],
    };
    el.classList.add('dragging');
  }

  private onDragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const v = this.vehicles[d.index];
    d.travel = Math.max(d.travel, Math.hypot(e.clientX - d.startX, e.clientY - d.startY));
    if (d.travel < TAP_SLOP) return;

    const raw = d.startPos + ((v.dir === 'h' ? e.clientX : e.clientY) - d.startClient) / this.cell;
    const { min, max } = d.range;
    let shown = raw;
    const over = raw < min ? min - raw : raw > max ? raw - max : 0;
    if (over > 0) {
      // Efeito elástico ao empurrar contra algo.
      const stretch = OVERSHOOT * (1 - Math.exp(-over * 2.5));
      shown = raw < min ? min - stretch : max + stretch;
      if (!d.bumped && over > 0.1) {
        d.bumped = true;
        sfx.bump();
      }
    }
    const cellNow = Math.round(clamp(shown, min, max));
    if (cellNow !== d.lastCell) {
      d.lastCell = cellNow;
      sfx.tick();
    }
    d.shown = shown;
    d.samples.push({ t: e.timeStamp, p: raw });
    if (d.samples.length > 8) d.samples.shift();
    d.el.style.transform = this.translate(v, shown);
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const v = this.vehicles[d.index];
    const { min, max } = d.range;
    const isTap = !cancelled && d.travel < TAP_SLOP && e.timeStamp - d.startTime < 600;

    if (isTap) {
      if (v.target) sfx.honk();
      const target = this.tapTarget(d, e);
      if (target === d.startPos) {
        if (!v.target) sfx.bump();
        this.shake(d.index);
      }
      this.finishDrag(d, target, true);
      return;
    }

    let target = Math.round(clamp(d.shown, min, max));
    if (!cancelled) {
      // Leva em conta a velocidade do dedo: um "peteleco" vai mais longe.
      const recent = d.samples.filter((s) => e.timeStamp - s.t < 100);
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = last.t - first.t;
        if (dt > 8) {
          const velocity = (last.p - first.p) / dt; // casas por ms
          target = Math.round(clamp(clamp(d.shown, min, max) + velocity * 140, min, max));
        }
      }
    }
    // Tentou arrastar para o lado errado: o carro "treme" para mostrar que não vai.
    if (target === d.startPos && Math.abs(d.shown - d.startPos) < 0.2) this.shake(d.index);
    this.finishDrag(d, target, false);
  }

  /** Toque sem arrastar: desliza até o fim do caminho livre. */
  private tapTarget(d: Drag, e: PointerEvent): number {
    const { min, max } = d.range;
    const canBack = min < d.startPos;
    const canForward = max > d.startPos;
    if (canBack && canForward) {
      const rect = d.el.getBoundingClientRect();
      const v = this.vehicles[d.index];
      const firstHalf = v.dir === 'h' ? e.clientX < rect.left + rect.width / 2 : e.clientY < rect.top + rect.height / 2;
      return firstHalf ? min : max;
    }
    if (canBack) return min;
    if (canForward) return max;
    return d.startPos;
  }

  private finishDrag(d: Drag, target: number, fromTap: boolean): void {
    this.drag = null;
    d.el.classList.remove('dragging');
    if (d.el.hasPointerCapture(d.pointerId)) d.el.releasePointerCapture(d.pointerId);

    const from = fromTap ? d.startPos : d.shown;
    const distance = Math.abs(target - from);
    const duration = Math.min(380, 90 + 55 * distance);
    const anim = this.animateTo(d.index, from, target, duration);
    const ticks = fromTap ? distance : Math.abs(target - d.lastCell);
    if (ticks > 0) sfx.ticks(Math.round(ticks), duration);

    if (target === d.startPos) return;
    this.vehicles = withPosition(this.vehicles, d.index, target);
    this.events.onMove();
    if (isSolved(this.vehicles)) {
      this.locked = true;
      void anim.finished.catch(() => {}).then(() => this.events.onSolved());
    }
  }
}
