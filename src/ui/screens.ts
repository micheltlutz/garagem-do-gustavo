// As três telas do jogo: inicial, mapa de fases e a fase em si.

import { sfx } from '../audio/sfx.ts';
import { LEVELS, WORLD_SIZE, worldOf } from '../game/levels.ts';
import { progress } from '../storage.ts';
import { BoardView } from './boardView.ts';
import { clearConfetti, confetti } from './confetti.ts';
import { ICONS, iconButton } from './icons.ts';

export interface Nav {
  home(): void;
  map(): void;
  play(level: number): void;
}

/** Tempo parado até a dica aparecer sozinha. */
const IDLE_HINT_MS = 40_000;

function makeScreen(className: string): HTMLElement {
  const el = document.createElement('section');
  el.className = `screen ${className}`;
  el.hidden = true;
  return el;
}

function onTap(button: HTMLButtonElement, action: () => void): HTMLButtonElement {
  button.addEventListener('click', () => {
    sfx.pop();
    action();
  });
  return button;
}

// Carrinho vermelho de lado, andando na estrada (tela inicial).
const wheel = (cx: number) => `
  <g class="wheel">
    <circle cx="${cx}" cy="214" r="50" fill="#263238"/>
    <circle cx="${cx}" cy="214" r="22" fill="#CFD8DC"/>
    <path d="M${cx - 22} 214 H${cx + 22} M${cx} 192 V236" stroke="#90A4AE" stroke-width="6"/>
  </g>`;

const HERO_SVG = `
<svg viewBox="0 0 520 300" aria-hidden="true">
  <rect x="0" y="236" width="520" height="64" rx="14" fill="#546E7A"/>
  <g class="dashes" fill="#fff">
    ${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${k * 130}" y="266" width="70" height="10" rx="5"/>`).join('')}
  </g>
  <g class="hero-car">
    <ellipse cx="260" cy="258" rx="196" ry="12" fill="#000" opacity=".2"/>
    <path d="M150 112 Q170 16 254 10 L322 10 Q376 14 402 112 Z" fill="#E53935"/>
    <rect x="68" y="96" width="384" height="118" rx="52" fill="#E53935"/>
    <path d="M182 104 Q196 42 252 38 L266 38 L266 104 Z" fill="#B3E5FC"/>
    <path d="M286 38 L320 38 Q356 42 374 104 L286 104 Z" fill="#B3E5FC"/>
    <ellipse cx="310" cy="76" rx="13" ry="17" fill="#fff"/>
    <ellipse cx="342" cy="76" rx="13" ry="17" fill="#fff"/>
    <circle cx="313" cy="79" r="7" fill="#263238"/>
    <circle cx="345" cy="79" r="7" fill="#263238"/>
    <path d="M374 162 Q404 180 432 162" stroke="#B71C1C" stroke-width="9" fill="none" stroke-linecap="round"/>
    <circle cx="434" cy="132" r="14" fill="#FFEB3B"/>
    <rect x="68" y="126" width="18" height="30" rx="6" fill="#FFCDD2"/>
    ${wheel(164)}
    ${wheel(356)}
  </g>
</svg>`;

export class HomeScreen {
  readonly el = makeScreen('home');
  private readonly soundBtn: HTMLButtonElement;

  constructor(nav: Nav) {
    this.el.dataset.world = '0';
    this.el.innerHTML = `
      <h1 class="title">Garagem <span>do Gustavo</span></h1>
      <div class="hero"><button type="button" class="hero-btn" aria-label="Buzinar">${HERO_SVG}</button></div>
      <div class="home-actions"></div>`;
    const hero = this.el.querySelector<HTMLButtonElement>('.hero-btn')!;
    hero.addEventListener('click', () => {
      sfx.honk();
      hero.animate(
        [{ transform: 'none' }, { transform: 'translateY(-14%) rotate(-3deg)' }, { transform: 'none' }],
        { duration: 420, easing: 'ease-out' },
      );
    });

    const actions = this.el.querySelector('.home-actions')!;
    this.soundBtn = onTap(iconButton('soundOn', 'Som'), () => {
      progress.sound = !progress.sound;
      this.render();
    });
    actions.append(
      onTap(iconButton('grid', 'Fases'), () => nav.map()),
      onTap(iconButton('play', 'Jogar', 'big play'), () => nav.play(progress.nextLevel(LEVELS.length))),
      this.soundBtn,
    );
  }

  show(): void {
    this.render();
  }

  private render(): void {
    this.soundBtn.innerHTML = progress.sound ? ICONS.soundOn : ICONS.soundOff;
    this.soundBtn.classList.toggle('off', !progress.sound);
  }
}

export class MapScreen {
  readonly el = makeScreen('map');
  private readonly tiles: HTMLButtonElement[] = [];

  constructor(nav: Nav) {
    this.el.dataset.world = '0';
    this.el.innerHTML = `<div class="topbar"></div><div class="map-body"><div class="map-grid"></div></div>`;
    this.el.querySelector('.topbar')!.append(onTap(iconButton('home', 'Início'), () => nav.home()));
    const grid = this.el.querySelector('.map-grid')!;
    LEVELS.forEach((_, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.world = String(worldOf(i));
      tile.setAttribute('aria-label', `Fase ${i + 1}`);
      tile.innerHTML = `<span class="num">${i + 1}</span><span class="sticker">${ICONS.check}</span>`;
      onTap(tile, () => nav.play(i));
      grid.appendChild(tile);
      this.tiles.push(tile);
    });
  }

  show(): void {
    const next = progress.nextLevel(LEVELS.length);
    const allDone = LEVELS.every((_, i) => progress.isDone(i));
    this.tiles.forEach((tile, i) => {
      tile.classList.toggle('done', progress.isDone(i));
      tile.classList.toggle('next', !allDone && i === next);
    });
  }
}

export class GameScreen {
  readonly el = makeScreen('game');
  private readonly board: BoardView;
  private readonly badge: HTMLElement;
  private readonly win: HTMLElement;
  private level = 0;
  private idleTimer = 0;
  /** Muda a cada fase aberta, para cancelar comemorações antigas. */
  private session = 0;
  private readonly nav: Nav;

  constructor(nav: Nav) {
    this.nav = nav;
    this.board = new BoardView({
      onMove: () => this.resetIdle(),
      onCleared: () => void this.celebrate(),
    });

    const controls = document.createElement('div');
    controls.className = 'controls';
    this.badge = document.createElement('div');
    this.badge.className = 'badge';
    const hint = onTap(iconButton('bulb', 'Dica', 'hint'), () => {
      this.board.showHint();
      this.resetIdle();
    });
    controls.append(
      onTap(iconButton('grid', 'Fases'), () => nav.map()),
      this.badge,
      onTap(iconButton('restart', 'Recomeçar'), () => {
        this.board.restart();
        this.resetIdle();
      }),
      hint,
    );

    this.win = document.createElement('div');
    this.win.className = 'win';
    this.win.hidden = true;

    this.el.append(controls, this.board.root, this.win);
  }

  open(level: number): void {
    this.session++;
    this.level = level;
    this.el.dataset.world = String(worldOf(level));
    this.badge.textContent = String(level + 1);
    this.win.hidden = true;
    clearConfetti(this.el);
    this.board.load(LEVELS[level].board, LEVELS[level].gates, level);
    this.resetIdle();
  }

  close(): void {
    this.session++;
    clearTimeout(this.idleTimer);
    clearConfetti(this.el);
    this.board.cancelDrag();
    this.board.clearHint();
  }

  /** App foi para o segundo plano. */
  pause(): void {
    this.board.cancelDrag();
  }

  private resetIdle(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.board.showHint();
      this.resetIdle();
    }, IDLE_HINT_MS);
  }

  private async celebrate(): Promise<void> {
    const session = this.session;
    clearTimeout(this.idleTimer);
    progress.markDone(this.level);
    await new Promise((r) => setTimeout(r, 150));
    if (session !== this.session) return;
    sfx.win();
    confetti(this.el);
    this.showWin();
  }

  private showWin(): void {
    const last = this.level === LEVELS.length - 1;
    const endOfWorld = (this.level + 1) % WORLD_SIZE === 0;
    this.win.innerHTML = `<div class="win-card"><div class="medal ${endOfWorld ? 'trophy' : ''}">${
      endOfWorld ? ICONS.trophy : ICONS.check
    }</div></div>`;
    const card = this.win.querySelector('.win-card')!;
    const next = onTap(iconButton(last ? 'grid' : 'next', last ? 'Fases' : 'Próxima fase', 'big next'), () =>
      last ? this.nav.map() : this.nav.play(this.level + 1),
    );
    card.append(next);
    if (!last) card.append(onTap(iconButton('grid', 'Fases', 'small'), () => this.nav.map()));
    this.win.hidden = false;
  }
}
