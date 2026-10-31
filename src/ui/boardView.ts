// Tabuleiro na tela: desenha os veículos e as cercas e cuida do arrastar e do tocar.
// Um veículo com caminho livre até uma saída sem cerca pode sair da garagem;
// a fase termina quando ela fica vazia.

import {
  SIDES,
  SIZE,
  exitSides,
  gateOf,
  gateOpen,
  parseGates,
  lastPos,
  moveRange,
  parseBoard,
  posOf,
  withPosition,
  without,
  type Gates,
  type Range,
  type Vehicle,
} from '../game/board.ts';
import { nextMove } from '../game/solver.ts';
import { sfx } from '../audio/sfx.ts';
import { PALETTE, RED, vehicleSvg } from './carArt.ts';
import { ICONS } from './icons.ts';

/** Largura da rua em volta da garagem, em casas. */
const ROAD = 0.45;
/** Quanto o dedo pode andar e ainda contar como toque (px). */
const TAP_SLOP = 12;
/** Quanto o carro "estica" além do limite ao ser empurrado (em casas). */
const OVERSHOOT = 0.18;
/** Quanto o veículo precisa passar da borda para sair (em casas). Pouco, para mãos pequenas. */
const EXIT_PUSH = 0.15;

export interface BoardEvents {
  /** Um veículo mudou de casa ou saiu. */
  onMove(): void;
  /** A garagem ficou vazia (já depois da animação do último). */
  onCleared(): void;
}

interface Drag {
  id: string;
  pointerId: number;
  el: HTMLElement;
  /** Até onde dá para deslizar dentro da garagem. */
  range: Range;
  /** Até onde dá para arrastar, incluindo sair pelas bordas livres. */
  reach: Range;
  /** Lados em que o veículo, encostado na borda, bate numa cerca. */
  fenced: { back: boolean; forward: boolean };
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

export class BoardView {
  readonly root: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly events: BoardEvents;
  private vehicles: Vehicle[] = [];
  private start: Vehicle[] = [];
  private gates: Gates = parseGates();
  private levelIndex = 0;
  private readonly els = new Map<string, HTMLElement>();
  private cell = 60;
  private drag: Drag | null = null;
  private locked = false;
  private hintTimer = 0;

  constructor(events: BoardEvents) {
    this.events = events;
    this.root = document.createElement('div');
    this.root.className = 'board-wrap';
    this.root.innerHTML = `
      <div class="board-frame">
        <div class="board-grid">
          <div class="ghost" hidden>${ICONS.chevrons}</div>
          <div class="hint-arrow" hidden>${ICONS.chevrons}</div>
        </div>
      </div>`;
    this.frame = this.root.querySelector('.board-frame')!;
    this.grid = this.root.querySelector('.board-grid')!;
    this.arrow = this.root.querySelector('.hint-arrow')!;
    this.ghost = this.root.querySelector('.ghost')!;
    this.frame.style.setProperty('--grid-n', String(SIZE));

    this.grid.addEventListener('pointerdown', (e) => this.onDown(e));
    this.grid.addEventListener('pointermove', (e) => this.onDragMove(e));
    this.grid.addEventListener('pointerup', (e) => this.onUp(e, false));
    this.grid.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.grid.addEventListener('lostpointercapture', (e) => this.onUp(e, true));

    new ResizeObserver(() => this.layout()).observe(this.root);
  }

  /** Monta uma fase nova. */
  load(board: string, gates: string, levelIndex: number): void {
    this.levelIndex = levelIndex;
    this.start = parseBoard(board);
    this.gates = parseGates(gates);
    this.renderFences();
    this.render(80);
  }

  /** Coloca todos os veículos de volta no começo da fase. */
  restart(): void {
    if (this.locked) return;
    this.render(0);
  }

  /**
   * Dica: o veículo certo balança. Se ele pode sair, uma seta pulsa na borda;
   * se precisa ser empurrado para o lado, um contorno mostra para onde.
   */
  showHint(): void {
    if (this.locked || this.drag) return;
    const move = nextMove(this.vehicles, this.gates);
    if (!move) return;
    this.clearHint();
    const v = this.vehicles[move.index];
    const el = this.els.get(v.id)!;
    const sign = Math.sign(move.to - posOf(v));
    const nudge = this.cell * 0.12 * sign;
    el.style.setProperty('--nx', v.dir === 'h' ? `${nudge}px` : '0px');
    el.style.setProperty('--ny', v.dir === 'v' ? `${nudge}px` : '0px');
    el.classList.add('hint');
    const angle = v.dir === 'h' ? (sign > 0 ? 0 : 180) : sign > 0 ? 90 : -90;

    if (move.exit) {
      // A seta fica em cima da borda, na faixa do veículo, apontando para fora.
      const edge = move.exit === 'forward' ? SIZE - 0.5 : -0.5;
      const x = v.dir === 'h' ? edge : v.col;
      const y = v.dir === 'v' ? edge : v.row;
      this.arrow.style.transform = `translate3d(${x * this.cell}px, ${y * this.cell}px, 0)`;
      this.arrow.style.setProperty('--arrow-rotate', `${angle}deg`);
      this.arrow.hidden = false;
    } else {
      this.setBox(this.ghost, v);
      this.ghost.style.transform = this.translate(v, move.to);
      this.ghost.style.setProperty('--arrow-rotate', `${angle}deg`);
      this.ghost.hidden = false;
    }
    this.hintTimer = window.setTimeout(() => this.clearHint(), 6000);
  }

  clearHint(): void {
    clearTimeout(this.hintTimer);
    this.arrow.hidden = true;
    this.ghost.hidden = true;
    for (const el of this.els.values()) el.classList.remove('hint');
  }

  /** Termina um arrasto em andamento (ex.: o app foi para o segundo plano). */
  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.finishDrag(d, Math.round(clamp(d.shown, d.range.min, d.range.max)), false);
  }

  // ---------- montagem e layout ----------

  /** Recria os veículos na posição inicial, com uma animação de "pop". */
  private render(popDelay: number): void {
    this.cancelDrag();
    this.clearHint();
    this.locked = false;
    for (const el of this.grid.querySelectorAll('.vehicle')) el.remove();
    this.els.clear();
    this.vehicles = this.start;

    const rand = seeded(this.levelIndex + 1);
    const colors = [...PALETTE].sort(() => rand() - 0.5);
    let colorIndex = 0;
    this.vehicles.forEach((v, i) => {
      const el = document.createElement('div');
      el.className = 'vehicle';
      el.dataset.id = v.id;
      // O veículo "olha" para a saída aberta; com as duas abertas, para um lado qualquer.
      const backOpen = gateOpen(this.gates, v, 'back');
      const flip = backOpen === gateOpen(this.gates, v, 'forward') ? rand() < 0.5 : backOpen;
      const paint = v.target ? RED : colors[colorIndex++ % colors.length];
      el.innerHTML = `<div class="art">${vehicleSvg(v.len, v.dir, paint, flip, v.target)}</div>`;
      this.grid.appendChild(el);
      this.els.set(v.id, el);
      el.querySelector('.art')!.animate(
        [{ transform: 'scale(0)' }, { transform: 'scale(1.12)', offset: 0.7 }, { transform: 'scale(1)' }],
        { duration: 380, delay: popDelay + i * 35, easing: 'ease-out', fill: 'backwards' },
      );
    });
    this.layout();
  }

  /** Desenha uma cerca listrada em cada saída fechada. */
  private renderFences(): void {
    for (const el of this.frame.querySelectorAll('.fence')) el.remove();
    for (const side of SIDES) {
      this.gates[side].forEach((open, lane) => {
        if (open) return;
        const el = document.createElement('div');
        el.className = `fence fence-${side}`;
        el.dataset.side = side;
        el.style.setProperty('--lane', String(lane));
        this.frame.appendChild(el);
      });
    }
  }

  /** A cerca balança quando um veículo bate nela. */
  private hitFence(v: Vehicle, way: 'back' | 'forward'): void {
    const g = gateOf(v, way);
    const el = [...this.frame.querySelectorAll<HTMLElement>(`.fence-${g.side}`)].find(
      (f) => f.style.getPropertyValue('--lane') === String(g.lane),
    );
    if (!el) return;
    const axis = v.dir === 'h' ? 'X' : 'Y';
    const push = way === 'forward' ? 1 : -1;
    el.animate(
      [
        { transform: 'none' },
        { transform: `translate${axis}(${push * 30}%)` },
        { transform: `translate${axis}(${-push * 6}%)` },
        { transform: 'none' },
      ],
      { duration: 300, easing: 'ease-out' },
    );
  }

  private layout(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    this.cancelDrag();
    const units = SIZE + 2 * ROAD;
    this.cell = Math.max(16, Math.floor(Math.min(w, h) / units));
    const road = Math.round(this.cell * ROAD);
    const side = this.cell * SIZE + road * 2;
    this.frame.style.setProperty('--cell', `${this.cell}px`);
    this.frame.style.setProperty('--road-w', `${road}px`);
    this.frame.style.width = `${side}px`;
    this.frame.style.height = `${side}px`;
    for (const v of this.vehicles) {
      const el = this.els.get(v.id)!;
      this.setBox(el, v);
      el.style.transform = this.translate(v, posOf(v));
    }
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

  private indexOf(id: string): number {
    return this.vehicles.findIndex((v) => v.id === id);
  }

  private animateTo(v: Vehicle, from: number, to: number, duration: number): void {
    const el = this.els.get(v.id)!;
    el.style.transform = this.translate(v, to);
    el.animate([{ transform: this.translate(v, from) }, { transform: this.translate(v, to) }], {
      duration,
      easing: 'cubic-bezier(.2,.8,.3,1)',
    });
  }

  private shake(v: Vehicle): void {
    const axis = v.dir === 'h' ? 'X' : 'Y';
    this.els.get(v.id)!.querySelector('.art')!.animate(
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

  /** Posição (em casas) em que o veículo some da tela, saindo por um dos lados. */
  private offscreen(v: Vehicle, side: 'back' | 'forward'): number {
    const rect = this.grid.getBoundingClientRect();
    if (side === 'forward') {
      const room = v.dir === 'h' ? window.innerWidth - rect.left : window.innerHeight - rect.top;
      return room / this.cell + 0.3;
    }
    const room = v.dir === 'h' ? rect.left : rect.top;
    return -room / this.cell - v.len - 0.3;
  }

  // ---------- toque ----------

  private onDown(e: PointerEvent): void {
    const el = (e.target as Element).closest<HTMLElement>('.vehicle');
    // Um dedo por vez; outros dedos (e a palma) são ignorados. Veículos saindo não contam.
    if (!el || this.locked || this.drag || el.classList.contains('leaving')) return;
    const index = this.indexOf(el.dataset.id!);
    if (index < 0) return;
    e.preventDefault();
    for (const a of el.getAnimations()) a.finish();
    el.setPointerCapture(e.pointerId);
    this.clearHint();
    const v = this.vehicles[index];
    const pos = posOf(v);
    const range = moveRange(this.vehicles, index);
    const sides = exitSides(this.vehicles, index, this.gates);
    this.drag = {
      id: v.id,
      pointerId: e.pointerId,
      el,
      range,
      reach: { min: sides.back ? -v.len : range.min, max: sides.forward ? SIZE : range.max },
      fenced: {
        back: range.min === 0 && !gateOpen(this.gates, v, 'back'),
        forward: range.max === lastPos(v) && !gateOpen(this.gates, v, 'forward'),
      },
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
    const v = this.vehicles[this.indexOf(d.id)];
    d.travel = Math.max(d.travel, Math.hypot(e.clientX - d.startX, e.clientY - d.startY));
    if (d.travel < TAP_SLOP) return;

    const raw = d.startPos + ((v.dir === 'h' ? e.clientX : e.clientY) - d.startClient) / this.cell;
    const { min, max } = d.reach;
    let shown = raw;
    const over = raw < min ? min - raw : raw > max ? raw - max : 0;
    if (over > 0) {
      // Efeito elástico ao empurrar contra algo.
      const stretch = OVERSHOOT * (1 - Math.exp(-over * 2.5));
      shown = raw < min ? min - stretch : max + stretch;
      if (!d.bumped && over > 0.1) {
        d.bumped = true;
        sfx.bump();
        const way = raw < min ? 'back' : 'forward';
        if (d.fenced[way]) this.hitFence(v, way);
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
    const isTap = !cancelled && d.travel < TAP_SLOP && e.timeStamp - d.startTime < 600;
    if (isTap) {
      this.onTap(d, e);
      return;
    }

    const v = this.vehicles[this.indexOf(d.id)];
    let projected = clamp(d.shown, d.reach.min, d.reach.max);
    if (!cancelled) {
      // Leva em conta a velocidade do dedo: um "peteleco" vai mais longe.
      const recent = d.samples.filter((s) => e.timeStamp - s.t < 100);
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = last.t - first.t;
        if (dt > 8) projected += ((last.p - first.p) / dt) * 140; // casas por ms
      }
      // Arrastou para fora (ou deu um peteleco em direção a uma borda livre).
      if (d.reach.min < 0 && Math.min(d.shown, projected) <= -EXIT_PUSH) {
        this.exit(d, 'back', d.shown);
        return;
      }
      if (d.reach.max > lastPos(v) && Math.max(d.shown, projected) >= lastPos(v) + EXIT_PUSH) {
        this.exit(d, 'forward', d.shown);
        return;
      }
    }
    const target = Math.round(clamp(projected, d.range.min, d.range.max));
    // Tentou arrastar para o lado errado: o veículo "treme" para mostrar que não vai.
    if (target === d.startPos && Math.abs(d.shown - d.startPos) < 0.2) this.shake(v);
    this.finishDrag(d, target, false);
  }

  /** Toque sem arrastar: sai pela borda livre ou desliza até o fim do caminho. */
  private onTap(d: Drag, e: PointerEvent): void {
    const v = this.vehicles[this.indexOf(d.id)];
    const canBack = d.reach.min < d.startPos;
    const canForward = d.reach.max > d.startPos;
    let side: 'back' | 'forward' | null = null;
    if (canBack && canForward) {
      const rect = d.el.getBoundingClientRect();
      const firstHalf = v.dir === 'h' ? e.clientX < rect.left + rect.width / 2 : e.clientY < rect.top + rect.height / 2;
      side = firstHalf ? 'back' : 'forward';
    } else if (canBack) side = 'back';
    else if (canForward) side = 'forward';

    if (v.target) sfx.honk();
    if (!side) {
      if (!v.target) sfx.bump();
      this.shake(v);
      if (d.fenced.back && d.startPos === 0) this.hitFence(v, 'back');
      if (d.fenced.forward && d.startPos === lastPos(v)) this.hitFence(v, 'forward');
      this.finishDrag(d, d.startPos, true);
      return;
    }
    if (side === 'back' && d.reach.min < 0) return this.exit(d, 'back', d.startPos);
    if (side === 'forward' && d.reach.max > lastPos(v)) return this.exit(d, 'forward', d.startPos);
    this.finishDrag(d, side === 'back' ? d.range.min : d.range.max, true);
  }

  private finishDrag(d: Drag, target: number, fromTap: boolean): void {
    this.drag = null;
    d.el.classList.remove('dragging');
    if (d.el.hasPointerCapture(d.pointerId)) d.el.releasePointerCapture(d.pointerId);

    const index = this.indexOf(d.id);
    const v = this.vehicles[index];
    const from = fromTap ? d.startPos : d.shown;
    const distance = Math.abs(target - from);
    const duration = Math.min(380, 90 + 55 * distance);
    this.animateTo(v, from, target, duration);
    const ticks = fromTap ? distance : Math.abs(target - d.lastCell);
    if (ticks > 0) sfx.ticks(Math.round(ticks), duration);

    if (target === d.startPos) return;
    this.vehicles = withPosition(this.vehicles, index, target);
    this.events.onMove();
  }

  /** O veículo sai da garagem acelerando. Se era o último, a fase termina. */
  private exit(d: Drag, side: 'back' | 'forward', from: number): void {
    this.drag = null;
    d.el.classList.remove('dragging');
    d.el.classList.add('leaving');
    if (d.el.hasPointerCapture(d.pointerId)) d.el.releasePointerCapture(d.pointerId);
    this.clearHint();

    const index = this.indexOf(d.id);
    const v = this.vehicles[index];
    this.vehicles = without(this.vehicles, index);
    this.els.delete(v.id);
    const last = this.vehicles.length === 0;
    if (last) this.locked = true;

    const to = this.offscreen(v, side);
    if (v.target) sfx.honk();
    sfx.engine(0.5);
    const anim = d.el.animate([{ transform: this.translate(v, from) }, { transform: this.translate(v, to) }], {
      duration: clamp(220 + Math.abs(to - from) * 45, 380, 800),
      easing: 'cubic-bezier(.35,.1,.85,.45)',
      fill: 'forwards',
    });
    this.events.onMove();
    void anim.finished
      .catch(() => {})
      .then(() => {
        d.el.remove();
        if (last && this.locked) this.events.onCleared();
      });
  }
}
