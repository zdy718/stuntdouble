// The fixed-step loop and the state machine:
// Title -> Menu -> Level Select -> Scene Card -> Playing -> (Cut | Scene Clear)
//   -> Level Clear (stars) -> ... -> Results (wrap party)

import { AudioEngine } from './Audio';
import { CUT_FADE, CUT_TIME, SCENE_CARD_TIME, STEP, VIEW_W, GROUND_Y } from './constants';
import { Input, MenuKey } from './Input';
import { Renderer } from './Renderer';
import { SaveData, isUnlocked, load, persist, recordLevel, totalStars } from './Save';
import { POINTS, isPerfectTake, ratingTitle, resultName, starsFor } from './Score';
import { C } from './Themes';
import { GameEvent, SceneRun } from './World';
import { drawHud } from './ui/Hud';
import {
  LevelClearData,
  MenuItem,
  ResultsData,
  STAR_GAP,
  drawControls,
  drawCut,
  drawLevelClear,
  drawLevelSelect,
  drawPause,
  drawResults,
  drawSceneCard,
  drawSceneClear,
  drawSettings,
  drawTitle,
  menuList,
  settingsItems,
} from './ui/Screens';
import { Button, text } from './ui/draw';
import { LEVELS, checkLevels } from '../levels';
import { LevelDef } from '../levels/schema';

type State = 'title' | 'menu' | 'select' | 'settings' | 'card' | 'playing' | 'paused' | 'cut' | 'sceneClear' | 'levelClear' | 'results';

const SCENE_CLEAR_TIME = 1.4;

export class Game {
  private canvas: HTMLCanvasElement;
  private r: Renderer;
  private input = new Input();
  private audio: AudioEngine;
  private save: SaveData;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private disposers: (() => void)[] = [];

  private state: State = 'title';
  private stateT = 0; // seconds in the current state
  private time = 0; // real seconds since start
  private sel = 0;
  private settingsReturn: State = 'menu';
  private buttons: Button[] = [];

  // current shoot
  private levelIdx = 0;
  private sceneIdx = 0;
  private take = 1;
  private banked: number[] = [];
  private run: SceneRun | null = null;
  private prevDistance = 0;
  private prevY = GROUND_Y;
  private takePulse = 0;
  private multPulse = 0;
  private slowT = 0;
  private timeDebt = 0;
  private cutT = -1;
  private clearData: LevelClearData | null = null;
  private campaign: Record<number, { stars: number; takes: number; perfect: boolean; score: number }> = {};
  private resultsData: ResultsData | null = null;

  // debug (?debug=1)
  private debug: boolean;
  private debugSlow = false;
  private invincible = false;
  private fps = 60;

  constructor(private container: HTMLElement) {
    checkLevels(LEVELS);
    this.debug = /[?&]debug=1/.test(location.search);
    this.save = load();
    this.audio = new AudioEngine(this.save.settings);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stunt-double-canvas';
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    this.r = new Renderer(this.canvas);
    this.input.attach(window, this.canvas);
    this.input.onFirstInput = () => this.unlockAudio();

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));
    const onVis = () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        this.audio.suspend();
      } else if (this.state !== 'paused') this.audio.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));
    this.bindPointer();
    this.resize();
    for (let i = 0; i < LEVELS.length; i++) this.r.warm(i);
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.canvas.focus();
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    for (const d of this.disposers) d();
    this.disposers = [];
    this.audio.dispose();
    this.canvas.remove();
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(320, rect.width || window.innerWidth);
    const h = Math.max(180, rect.height || window.innerHeight);
    this.r.resize(w, h);
  }

  private unlockAudio(): void {
    this.audio.unlock();
  }

  // -------------------------------------------------------------- pointer

  private bindPointer(): void {
    const c = this.canvas;
    const active = new Map<number, 'jump' | 'duck' | 'grab'>();
    const down = (e: PointerEvent) => {
      e.preventDefault();
      this.unlockAudio();
      const [x, y] = this.r.toLogical(e.clientX, e.clientY);
      if (this.state === 'playing') {
        if (Math.hypot(x - (VIEW_W - 90), y - 420) < 56 && this.run?.grabEnabled) {
          active.set(e.pointerId, 'grab');
          this.input.touch('grab');
        } else if (x > VIEW_W / 2) {
          active.set(e.pointerId, 'jump');
          this.input.touch('jumpDown');
        } else {
          active.set(e.pointerId, 'duck');
          this.input.touch('duckDown');
        }
        if (y < 90 && x > VIEW_W / 2 - 100 && x < VIEW_W / 2 + 100) this.pause();
        return;
      }
      const b = this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (b) this.click(b.id);
      else this.handleMenu(['any', ...(this.state === 'title' || this.state === 'card' || this.state === 'results' ? (['confirm'] as MenuKey[]) : [])]);
    };
    const up = (e: PointerEvent) => {
      const kind = active.get(e.pointerId);
      active.delete(e.pointerId);
      if (kind === 'jump') this.input.touch('jumpUp');
      if (kind === 'duck') this.input.touch('duckUp');
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    this.disposers.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    });
  }

  private click(id: string): void {
    const [kind, n] = id.split(':');
    const i = Number(n);
    if (kind === 'level') {
      if (this.sel === i) this.handleMenu(['confirm']);
      else {
        this.sel = i;
        this.audio.menu();
      }
    } else if (kind === 'item') {
      this.sel = i;
      this.handleMenu(['confirm']);
    }
  }

  // -------------------------------------------------------------- states

  private go(s: State, sel = 0): void {
    this.state = s;
    this.stateT = 0;
    this.sel = sel;
  }

  private get level(): LevelDef {
    return LEVELS[this.levelIdx];
  }

  private startLevel(idx: number): void {
    this.levelIdx = idx;
    this.sceneIdx = 0;
    this.take = 1;
    this.banked = [];
    this.beginScene(true);
  }

  /** Builds a fresh run of the current scene. Shows the scene card if asked. */
  private beginScene(card: boolean): void {
    this.run = new SceneRun(this.level, this.level.scenes[this.sceneIdx]);
    this.prevDistance = 0;
    this.prevY = GROUND_Y;
    this.acc = 0;
    this.slowT = 0;
    this.timeDebt = 0;
    this.cutT = -1;
    this.multPulse = 0;
    this.r.clearParticles();
    this.input.clearLatches();
    this.audio.stopMusic();
    if (card) {
      this.go('card');
      this.audio.clack();
    } else {
      this.rollCamera();
    }
  }

  private rollCamera(): void {
    this.input.clearLatches(); // the key that skipped the card must not also jump
    this.go('playing');
    this.audio.playMusic(this.levelIdx, this.run!.bpm);
  }

  /** Failure or R: the same scene again, as the next take. */
  private retake(): void {
    this.take++;
    this.takePulse = 1;
    this.beginScene(false);
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.go('paused');
    this.audio.suspend();
    this.input.releaseAll();
  }

  private resume(): void {
    this.go('playing');
    this.audio.resume();
    this.last = performance.now();
  }

  private sceneDone(): void {
    const run = this.run!;
    this.banked[this.sceneIdx] = run.score;
    this.audio.stopMusic();
    this.audio.clack();
    if (this.sceneIdx === 0) {
      this.go('sceneClear');
      this.audio.fanfare();
    } else {
      this.levelDone();
    }
  }

  private levelDone(): void {
    const lv = this.level;
    const stars = starsFor(this.take, lv.par);
    const perfect = isPerfectTake(this.take);
    const total = this.banked.reduce((a, b) => a + b, 0) + POINTS.level;
    const newBest = recordLevel(this.save, lv.id, { score: total, stars, takes: this.take, perfect });
    persist(this.save);
    this.campaign[lv.id] = { stars, takes: this.take, perfect, score: total };
    this.clearData = {
      level: lv,
      takes: this.take,
      stars,
      result: resultName(stars),
      scenePoints: [...this.banked],
      bonus: POINTS.level,
      total,
      perfect,
      newBest,
    };
    this.go('levelClear');
    this.audio.fanfare();
    for (let i = 0; i < 40; i++) this.r.emit(VIEW_W / 2 + (Math.random() - 0.5) * 400, 120, 1, 'confetti', true);
  }

  private showResults(): void {
    const per = LEVELS.map((l) => {
      const c = this.campaign[l.id];
      const rec = this.save.levels[String(l.id)];
      return {
        name: l.name,
        stars: c?.stars ?? rec?.bestStars ?? 0,
        takes: c?.takes ?? rec?.bestTakes ?? 0,
        perfect: c?.perfect ?? rec?.perfect ?? false,
      };
    });
    const stars = totalStars(this.save, LEVELS.length);
    this.resultsData = {
      takes: per.reduce((a, b) => a + b.takes, 0),
      stars,
      title: ratingTitle(stars),
      score: 0,
      perLevel: per,
    };
    this.go('results');
    this.audio.fanfare();
  }

  // -------------------------------------------------------------- input

  private menuItems(): MenuItem[] {
    const anyDone = Object.keys(this.save.levels).length > 0;
    return [
      { id: 'play', label: anyDone ? 'CONTINUE SHOOT' : 'ACTION!' },
      { id: 'select', label: 'SHOOTING SCHEDULE' },
      { id: 'settings', label: 'SETTINGS' },
    ];
  }

  private pauseItems(): MenuItem[] {
    return [
      { id: 'resume', label: 'RESUME' },
      { id: 'retake', label: 'RETAKE (R)' },
      { id: 'settings', label: 'SETTINGS' },
      { id: 'quit', label: 'BACK TO SCHEDULE' },
    ];
  }

  private nextLevelToPlay(): number {
    for (let i = 0; i < LEVELS.length; i++) if (!this.save.levels[String(LEVELS[i].id)]) return i;
    return 0;
  }

  private handleMenu(keys: MenuKey[]): void {
    for (const k of keys) this.menuKey(k);
  }

  private menuKey(k: MenuKey): void {
    const s = this.state;
    const move = (n: number, count: number) => {
      this.sel = (this.sel + n + count) % count;
      this.audio.menu();
    };
    switch (s) {
      case 'title':
        if (k === 'any') {
          this.unlockAudio();
          this.audio.clack();
          this.go('menu');
        }
        break;
      case 'menu': {
        const items = this.menuItems();
        if (k === 'up') move(-1, items.length);
        if (k === 'down') move(1, items.length);
        if (k === 'confirm') {
          const id = items[this.sel].id;
          this.audio.clack();
          if (id === 'play') this.startLevel(this.nextLevelToPlay());
          if (id === 'select') this.go('select', this.nextLevelToPlay());
          if (id === 'settings') {
            this.settingsReturn = 'menu';
            this.go('settings');
          }
        }
        if (k === 'pause' || k === 'back') this.go('title');
        break;
      }
      case 'select':
        if (k === 'left') move(-1, LEVELS.length);
        if (k === 'right') move(1, LEVELS.length);
        if (k === 'confirm') {
          if (isUnlocked(this.save, LEVELS[this.sel].id) || this.debug) {
            this.audio.clack();
            this.startLevel(this.sel);
          }
        }
        if (k === 'pause' || k === 'back') this.go('menu', 1);
        break;
      case 'settings': {
        const items = settingsItems(this.save.settings);
        const st = this.save.settings;
        const id = items[this.sel].id as keyof typeof st | 'back';
        if (k === 'up') move(-1, items.length);
        if (k === 'down') move(1, items.length);
        const adjust = (dir: number) => {
          if (id === 'master' || id === 'music' || id === 'sfx') {
            st[id] = Math.round(Math.max(0, Math.min(1, st[id] + dir * 0.1)) * 10) / 10;
          } else if (id !== 'back') {
            st[id] = !st[id];
          }
          this.audio.apply(st);
          this.audio.menu();
          persist(this.save);
        };
        if (k === 'left') adjust(-1);
        if (k === 'right') adjust(1);
        if (k === 'confirm') {
          if (id === 'back') this.leaveSettings();
          else adjust(id === 'master' || id === 'music' || id === 'sfx' ? 1 : 0);
        }
        if (k === 'pause' || k === 'back') this.leaveSettings();
        break;
      }
      case 'card':
        if (k === 'any' && this.stateT > 0.15) this.rollCamera();
        break;
      case 'paused': {
        const items = this.pauseItems();
        if (k === 'up') move(-1, items.length);
        if (k === 'down') move(1, items.length);
        if (k === 'pause') this.resume();
        if (k === 'retake') {
          this.audio.resume();
          this.retake();
        }
        if (k === 'confirm') {
          const id = items[this.sel].id;
          if (id === 'resume') this.resume();
          if (id === 'retake') {
            this.audio.resume();
            this.retake();
          }
          if (id === 'settings') {
            this.settingsReturn = 'paused';
            this.go('settings');
          }
          if (id === 'quit') {
            this.audio.resume();
            this.audio.stopMusic();
            this.go('select', this.levelIdx);
          }
        }
        break;
      }
      case 'sceneClear':
        if (k === 'any' && this.stateT > 0.4) this.nextScene();
        break;
      case 'levelClear': {
        const ready = this.stateT > 0.45 + 3 * STAR_GAP + 0.3;
        if (!ready) {
          if (k === 'confirm' && this.stateT > 0.3) this.stateT = 0.45 + 3 * STAR_GAP + 0.3;
          break;
        }
        if (k === 'left') move(-1, 3);
        if (k === 'right') move(1, 3);
        if (k === 'retake') this.startLevel(this.levelIdx);
        if (k === 'confirm') {
          this.audio.clack();
          const last = this.levelIdx === LEVELS.length - 1;
          if (this.sel === 0) {
            if (last) this.showResults();
            else this.startLevel(this.levelIdx + 1);
          } else if (this.sel === 1) this.startLevel(this.levelIdx);
          else this.go('select', this.levelIdx);
        }
        break;
      }
      case 'results':
        if (k === 'confirm' && this.stateT > 1) this.go('select', 0);
        break;
      default:
        break;
    }
  }

  private leaveSettings(): void {
    persist(this.save);
    this.go(this.settingsReturn, this.settingsReturn === 'paused' ? 2 : 2);
  }

  private nextScene(): void {
    this.sceneIdx = 1;
    this.beginScene(true);
  }

  // -------------------------------------------------------------- frame

  private frame(now: number): void {
    const dtReal = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dtReal;
    this.stateT += dtReal;
    this.fps = this.fps * 0.95 + (dtReal > 0 ? 1 / dtReal : 60) * 0.05;
    this.takePulse = Math.max(0, this.takePulse - dtReal * 2.5);
    this.multPulse = Math.max(0, this.multPulse - dtReal * 5);

    const menuKeys = this.input.menu();
    if (this.debug) this.debugKeys();

    switch (this.state) {
      case 'playing':
        if (menuKeys.includes('pause')) this.pause();
        else if (menuKeys.includes('retake')) this.retake();
        else this.updatePlaying(dtReal);
        break;
      case 'cut':
        if (menuKeys.includes('retake')) {
          this.retake();
          break;
        }
        if (this.stateT >= CUT_TIME + CUT_FADE) this.retake();
        this.cutT = this.stateT;
        break;
      case 'card':
        this.handleMenu(menuKeys);
        if (this.state === 'card' && this.stateT >= SCENE_CARD_TIME) this.rollCamera();
        break;
      case 'sceneClear':
        this.handleMenu(menuKeys);
        if (this.state === 'sceneClear' && this.stateT >= SCENE_CLEAR_TIME) this.nextScene();
        break;
      default:
        this.handleMenu(menuKeys);
        break;
    }
    this.r.tick(dtReal);
    this.render();
  }

  private updatePlaying(dtReal: number): void {
    const run = this.run!;
    const reduce = this.save.settings.reduceMotion;
    let scale = this.debugSlow ? 0.25 : 1;
    if (this.slowT > 0 && !reduce) {
      this.slowT -= dtReal;
      scale *= 0.5;
      this.timeDebt += dtReal * 0.5;
    } else if (this.timeDebt > 0 && !this.debugSlow) {
      // catch back up with the music after a slow-motion moment
      const extra = Math.min(this.timeDebt, dtReal * 0.2);
      this.timeDebt -= extra;
      scale += extra / Math.max(1e-6, dtReal);
    }
    this.acc += dtReal * scale;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.acc -= STEP;
      steps++;
      this.prevDistance = run.distance;
      this.prevY = run.player.y;
      const ev = run.step(this.input.frame());
      this.handleEvents(ev);
      if (this.state !== 'playing') return;
    }
  }

  private handleEvents(ev: GameEvent[]): void {
    const run = this.run!;
    for (const e of ev) {
      switch (e.type) {
        case 'jump':
          this.audio.jump();
          this.r.emit(run.distance, GROUND_Y - 2, 4, 'dust');
          break;
        case 'land':
          this.audio.land(e.impact);
          this.r.emit(run.distance, GROUND_Y - 2, 6, 'dust');
          break;
        case 'duck':
          this.audio.duck();
          this.r.emit(run.distance + 20, GROUND_Y - 2, 3, 'dust');
          break;
        case 'grab':
          this.audio.grab(e.perfect);
          if (e.perfect) this.r.emit(run.distance, run.player.hang?.handY ?? 350, 10, 'spark');
          break;
        case 'release':
          break;
        case 'clear':
          if (e.closeCall) {
            this.audio.closeCall();
            this.slowT = 0.08;
            this.r.emit(run.distance + 20, run.player.y - 40, 8, 'spark');
          }
          break;
        case 'combo':
          this.audio.combo(e.mult);
          this.multPulse = 1;
          break;
        case 'tile':
          this.audio.tile();
          break;
        case 'die':
          if (this.invincible) {
            // debug: undo the death and keep rolling
            run.player.dead = false;
            if (run.player.y > GROUND_Y) {
              run.player.y = GROUND_Y;
              run.player.vy = 0;
              run.player.grounded = true;
            }
            break;
          }
          this.onCut();
          return;
        case 'complete':
          this.sceneDone();
          return;
      }
    }
  }

  private onCut(): void {
    this.go('cut');
    this.cutT = 0;
    this.audio.stopMusic();
    this.audio.cut();
    if (!this.save.settings.reduceMotion) this.r.shake = 6;
    this.r.flash = 0.9;
    this.r.emit(this.run!.distance + 10, this.run!.player.y - 30, 12, 'spark');
  }

  // -------------------------------------------------------------- debug

  private debugKeys(): void {
    for (const c of this.input.pollCodes()) {
      if (/^Digit[1-5]$/.test(c)) this.startLevel(Number(c.slice(5)) - 1);
      if (c === 'KeyB' && this.run) {
        this.sceneIdx = 1;
        this.beginScene(true);
      }
      if (c === 'KeyT') this.debugSlow = !this.debugSlow;
      if (c === 'KeyI') this.invincible = !this.invincible;
      if (c === 'KeyN' && this.state === 'playing') {
        this.run!.score += POINTS.scene;
        this.sceneDone();
      }
    }
  }

  // -------------------------------------------------------------- render

  private render(): void {
    const r = this.r;
    const ctx = r.ctx;
    const st = this.save.settings;
    this.buttons = [];
    r.begin(!st.reduceMotion);

    const inShoot = ['card', 'playing', 'paused', 'cut', 'sceneClear'].includes(this.state) && this.run;
    if (inShoot) {
      const run = this.run!;
      const alpha = this.state === 'playing' ? Math.min(1, this.acc / STEP) : 1;
      const distance = this.prevDistance + (run.distance - this.prevDistance) * alpha;
      const py = this.prevY + (run.player.y - this.prevY) * alpha;
      r.drawWorld({ run, level: this.levelIdx, distance, playerY: py, time: this.time, cutT: this.cutT, debug: this.debug });
      if (this.state !== 'card') {
        drawHud(ctx, {
          take: this.take,
          takePulse: this.takePulse,
          score: this.banked.slice(0, this.sceneIdx).reduce((a, b) => a + b, 0) + run.score,
          mult: run.multiplier,
          multPulse: this.multPulse,
          progress: this.levelProgress(run),
          sceneSplit: this.sceneSplit(),
          sceneId: run.scene.id,
          levelId: this.level.id,
          sceneTime: run.t,
          levelName: this.level.name,
        });
        if (run.grabEnabled && this.state === 'playing' && matchMedia('(pointer: coarse)').matches) this.drawGrabButton();
      }
    } else {
      const bg = this.state === 'levelClear' || this.state === 'results' ? this.levelIdx : this.state === 'select' ? this.sel : 0;
      r.drawMenuBackdrop(bg, this.time);
      if (this.state === 'title' || this.state === 'menu') {
        const p = this.run?.player ?? new SceneRun(LEVELS[0], LEVELS[0].scenes[0]).player;
        r.drawPlayer(p, { run: null as unknown as SceneRun, level: 0, distance: 0, playerY: GROUND_Y, time: this.time, cutT: -1, debug: false }, { x: 110, y: 430, scale: 1.2, pose: 'run' });
      }
    }

    r.drawParticles(0, true);
    if (st.grain || this.state === 'cut') r.filmFinish(this.time, st.grain && !st.reduceMotion, st.grain);

    // letterbox bars only during title cards and the CUT! moment
    let lb = 0;
    if (this.state === 'card') lb = Math.min(1, this.stateT / 0.2) * (this.stateT > SCENE_CARD_TIME - 0.2 ? Math.max(0, (SCENE_CARD_TIME - this.stateT) / 0.2) : 1);
    if (this.state === 'cut') lb = Math.min(1, this.stateT / 0.12);
    if (this.state === 'title') lb = 1;
    r.letterbox(lb);

    switch (this.state) {
      case 'title':
        drawTitle(ctx, this.stateT, true);
        drawControls(ctx, 440);
        break;
      case 'menu':
        drawTitle(ctx, 10, false);
        menuList(ctx, this.menuItems(), this.sel, VIEW_W / 2, 310, 360, this.buttons);
        drawControls(ctx, 470);
        break;
      case 'select':
        drawLevelSelect(
          ctx,
          LEVELS,
          this.save.levels,
          (id) => isUnlocked(this.save, id) || this.debug,
          this.sel,
          totalStars(this.save, LEVELS.length),
          ratingTitle(totalStars(this.save, LEVELS.length)),
          this.time,
          this.buttons,
        );
        break;
      case 'settings':
        drawSettings(ctx, st, this.sel, this.buttons);
        break;
      case 'card':
        drawSceneCard(ctx, this.level, this.level.scenes[this.sceneIdx].id, this.take, this.stateT, SCENE_CARD_TIME);
        break;
      case 'paused':
        drawPause(ctx, this.pauseItems(), this.sel, this.buttons);
        break;
      case 'cut': {
        r.flashOverlay();
        drawCut(ctx, this.stateT, this.take);
        const f = (this.stateT - CUT_TIME) / CUT_FADE;
        r.fade(f);
        break;
      }
      case 'sceneClear':
        drawSceneClear(ctx, this.run!.scene.id, this.banked[0] ?? 0, this.stateT);
        break;
      case 'levelClear':
        if (this.clearData) {
          drawLevelClear(ctx, this.clearData, this.stateT, this.levelIdx === LEVELS.length - 1, this.buttons, this.sel);
          this.starSounds();
        }
        break;
      case 'results':
        if (this.resultsData) drawResults(ctx, this.resultsData, this.stateT);
        if (Math.random() < 0.15) r.emit(Math.random() * VIEW_W, -10, 1, 'confetti', true);
        break;
      default:
        break;
    }
    r.drawParticles(0, true);
    if (this.state === 'playing') r.flashOverlay();

    if (this.debug) {
      const run = this.run;
      const lines = [
        `FPS ${this.fps.toFixed(0)}  ${this.debugSlow ? 'SLOW 0.25x' : ''} ${this.invincible ? 'INVINCIBLE' : ''}`,
        run ? `beat ${run.beat.toFixed(2)}  x ${run.distance.toFixed(0)}  y ${run.player.y.toFixed(0)}  vy ${run.player.vy.toFixed(0)}` : '',
        '1-5 level  B scene B  N finish scene  T slow  I invincible',
      ];
      lines.forEach((l, i) => text(ctx, l, 12, 110 + i * 16, 12, { font: 'mono', color: C.cyan }));
    }
    r.end();
  }

  private lastStarCount = 0;
  private starSounds(): void {
    const t = this.stateT;
    let n = 0;
    for (let i = 0; i < (this.clearData?.stars ?? 0); i++) if (t >= 0.45 + i * STAR_GAP) n = i + 1;
    if (t < 0.1) this.lastStarCount = 0;
    if (n > this.lastStarCount) {
      this.audio.star(n - 1);
      this.lastStarCount = n;
      this.r.emit(VIEW_W / 2 - 80 + (n - 1) * 80, 200, 12, 'spark', true);
    }
  }

  private drawGrabButton(): void {
    const ctx = this.r.ctx;
    ctx.beginPath();
    ctx.arc(VIEW_W - 90, 420, 44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(53,208,255,0.25)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.cyan;
    ctx.stroke();
    text(ctx, 'GRAB', VIEW_W - 90, 428, 24, { align: 'center', color: C.cyan });
  }

  private sceneSplit(): number {
    const [a, b] = this.level.scenes;
    return a.length / (a.length + b.length);
  }

  private levelProgress(run: SceneRun): number {
    const split = this.sceneSplit();
    return this.sceneIdx === 0 ? run.progress * split : split + run.progress * (1 - split);
  }
}
