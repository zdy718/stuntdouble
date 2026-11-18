// Canvas drawing for the world: parallax backdrop, lane, hazards, the stunt
// performer, particles and the film finish (grain, vignette, letterbox).

import { GROUND_Y, PLAYER_X, ROPE_ANCHOR_Y, VIEW_H, VIEW_W } from './constants';
import { Box } from './Collision';
import {
  CRANE_BLOCK_H,
  CRANE_BLOCK_W,
  CRANE_PIVOT_Y,
  DART_ACTIVE,
  ObstacleRT,
  TILE_DROP_DELAY,
} from './Obstacles';
import { Player } from './Player';
import { C, THEMES, TILE_LAYER_W, Layers, Theme, buildLayers, hexA, mix, rng } from './Themes';
import { SceneRun } from './World';
import { DART_W, SIGN_W, TILE_W } from '../levels/schema';
import { MONO, roundRect } from './ui/draw';

const OUTLINE = 3;

interface Particle {
  alive: boolean;
  x: number; // world x
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  screen: boolean; // x is screen-space rather than world-space
}

export interface WorldView {
  run: SceneRun;
  level: number; // 0-based
  distance: number; // interpolated
  playerY: number; // interpolated
  time: number; // real seconds, for cosmetic animation
  cutT: number; // seconds since the CUT (or -1)
  debug: boolean;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private layers = new Map<number, Layers>();
  private grain: HTMLCanvasElement[] = [];
  private grainPatterns: (CanvasPattern | null)[] = [];
  private vignette: HTMLCanvasElement | null = null;
  private particles: Particle[] = [];
  scale = 1;
  dpr = 1;
  ox = 0;
  oy = 0;
  shake = 0;
  flash = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (let i = 0; i < 320; i++)
      this.particles.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', grav: 0, screen: false });
    this.makeGrain();
  }

  // ---------------------------------------------------------------- setup

  resize(cssW: number, cssH: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.scale = Math.min(cssW / VIEW_W, cssH / VIEW_H);
    this.ox = (cssW - VIEW_W * this.scale) / 2;
    this.oy = (cssH - VIEW_H * this.scale) / 2;
    this.layers.clear(); // re-render backdrops at the new resolution
    this.vignette = null;
  }

  /** Converts a client (CSS pixel) point to logical coordinates. */
  toLogical(cx: number, cy: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [(cx - r.left - this.ox) / this.scale, (cy - r.top - this.oy) / this.scale];
  }

  private layerScale(): number {
    return Math.min(2, Math.max(1, this.scale * this.dpr));
  }

  private getLayers(level: number): Layers {
    let l = this.layers.get(level);
    if (!l) {
      l = buildLayers(level, this.layerScale());
      this.layers.set(level, l);
    }
    return l;
  }

  /** Pre-builds a level's backdrop so the first frame of a scene doesn't hitch. */
  warm(level: number): void {
    this.getLayers(level);
  }

  private makeGrain(): void {
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const g = c.getContext('2d')!;
      const img = g.createImageData(192, 192);
      const r = rng(77 + i);
      for (let p = 0; p < img.data.length; p += 4) {
        const v = r() * 255;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = r() < 0.5 ? 255 : 0;
      }
      g.putImageData(img, 0, 0);
      this.grain.push(c);
      this.grainPatterns.push(null);
    }
  }

  begin(shakeEnabled: boolean): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale * this.dpr;
    let sx = 0;
    let sy = 0;
    if (shakeEnabled && this.shake > 0.3) {
      sx = (Math.random() * 2 - 1) * this.shake;
      sy = (Math.random() * 2 - 1) * this.shake;
    }
    ctx.setTransform(s, 0, 0, s, (this.ox + sx * this.scale) * this.dpr, (this.oy + sy * this.scale) * this.dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();
  }

  end(): void {
    this.ctx.restore();
  }

  tick(dt: number): void {
    this.shake *= Math.pow(0.0005, dt); // fast exponential decay
    this.flash = Math.max(0, this.flash - dt * 2.4);
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ------------------------------------------------------------ particles

  emit(x: number, y: number, n: number, kind: 'dust' | 'spark' | 'debris' | 'ember' | 'confetti', screen = false): void {
    for (let i = 0; i < n; i++) {
      const p = this.particles.find((q) => !q.alive);
      if (!p) return;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.screen = screen;
      switch (kind) {
        case 'dust':
          p.vx = -60 - Math.random() * 120;
          p.vy = -30 - Math.random() * 60;
          p.grav = 120;
          p.max = p.life = 0.35 + Math.random() * 0.2;
          p.size = 3 + Math.random() * 4;
          p.color = 'rgba(244,239,230,0.45)';
          break;
        case 'spark':
          p.vx = (Math.random() * 2 - 1) * 260;
          p.vy = (Math.random() * 2 - 1) * 260;
          p.grav = 300;
          p.max = p.life = 0.25 + Math.random() * 0.15;
          p.size = 2 + Math.random() * 2;
          p.color = C.gold;
          break;
        case 'debris':
          p.vx = (Math.random() * 2 - 1) * 60;
          p.vy = Math.random() * 60;
          p.grav = 900;
          p.max = p.life = 0.9;
          p.size = 4 + Math.random() * 7;
          p.color = '#3a3d48';
          break;
        case 'ember':
          p.vx = -40 + Math.random() * 30;
          p.vy = -60 - Math.random() * 60;
          p.grav = -20;
          p.max = p.life = 0.6 + Math.random() * 0.5;
          p.size = 2 + Math.random() * 2;
          p.color = Math.random() < 0.5 ? C.gold : C.red;
          break;
        case 'confetti':
          p.vx = (Math.random() * 2 - 1) * 200;
          p.vy = -200 - Math.random() * 300;
          p.grav = 500;
          p.max = p.life = 1.6 + Math.random();
          p.size = 4 + Math.random() * 4;
          p.color = [C.gold, C.text, C.cyan, C.orange, C.red][Math.floor(Math.random() * 5)];
          break;
      }
    }
  }

  clearParticles(): void {
    for (const p of this.particles) p.alive = false;
  }

  drawParticles(distance: number, screenOnly = false): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      if (!p.alive || p.screen !== screenOnly) continue;
      const sx = p.screen ? p.x : p.x - distance + PLAYER_X;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- world

  drawWorld(v: WorldView): void {
    const ctx = this.ctx;
    const th = THEMES[v.level];
    const L = this.getLayers(v.level);
    const d = v.distance;
    const run = v.run;

    // Layers 0-2
    ctx.drawImage(L.sky, 0, 0, VIEW_W, VIEW_H);
    this.drawTiled(L.far, d * 0.2);
    this.drawTiled(L.mid, d * 0.5);
    if (v.level === 3) this.drawStormFlash(v.time);

    // Layer 3: the lane
    this.drawGround(v, th);
    if (v.level === 0) this.drawStuntCar(v.time, th);

    const dark = this.darkRanges(run);
    const tunnelOn = dark.length > 0;
    if (tunnelOn) this.drawTunnel(dark, d, th);

    for (const o of run.obstacles) this.drawObstacle(o, v, th, dark);
    this.drawParticles(d);
    if (v.level === 4) this.drawBoulder(v);
    this.drawPlayer(run.player, v);
    this.drawPrompts(v);

    // Layer 4: foreground silhouettes
    this.drawForeground(v.level, d, th);
    if (v.level === 4) this.drawSpeedLines(v.time);

    if (v.debug) this.drawDebug(v);
  }

  private drawTiled(img: HTMLCanvasElement, offset: number): void {
    const x = -(offset % TILE_LAYER_W);
    this.ctx.drawImage(img, x, 0, TILE_LAYER_W, VIEW_H);
    if (x + TILE_LAYER_W < VIEW_W) this.ctx.drawImage(img, x + TILE_LAYER_W, 0, TILE_LAYER_W, VIEW_H);
  }

  private drawStormFlash(t: number): void {
    const f = Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.3) - 0.93) * 6;
    if (f > 0) {
      this.ctx.fillStyle = `rgba(220,230,255,${f * 0.25})`;
      this.ctx.fillRect(0, 0, VIEW_W, GROUND_Y);
    }
  }

  private sx(worldX: number, d: number): number {
    return worldX - d + PLAYER_X;
  }

  /** Floor holes for drawing: gaps plus every tile run (tiles draw themselves). */
  private drawHoles(run: SceneRun): [number, number][] {
    const out: [number, number][] = [];
    for (const o of run.obstacles) {
      if (o.type === 'gap' || o.type === 'spikes' || o.type === 'rope') out.push([o.x0, o.x1]);
      else if (o.type === 'heli') out.push([o.x0, o.x1 + 100000]);
      else if (o.type === 'tiles') out.push([o.x0, o.x1]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  }

  private drawGround(v: WorldView, th: Theme): void {
    const d = v.distance;
    const holes = this.drawHoles(v.run);
    const left = d - PLAYER_X - 10;
    const right = d - PLAYER_X + VIEW_W + 10;
    // pits first (full width), then solid segments over them
    // Pits are see-through: the backdrop layers (drawn full height) show
    // through them, with a light depth haze added in drawPitDetail.
    this.drawPitDetail(v, th);

    const segs: [number, number][] = [];
    let cur = left;
    for (const [h0, h1] of holes) {
      if (h1 < left || h0 > right) continue;
      if (h0 > cur) segs.push([cur, h0]);
      cur = Math.max(cur, h1);
    }
    if (cur < right) segs.push([cur, right]);

    const collapseX = v.run.scene.collapse !== undefined ? v.run.scene.collapse * v.run.ppb : Infinity;
    for (const [a, b] of segs) {
      if (collapseX < Infinity && d > collapseX) this.drawCollapsingSegment(a, b, d, th, v.level, collapseX);
      else this.drawSegment(this.sx(a, d), this.sx(b, d), a, th, v.level, 0);
    }
  }

  private drawCollapsingSegment(a: number, b: number, d: number, th: Theme, level: number, collapseX: number): void {
    // The deck behind the player breaks into chunks that fall away.
    const edge = d - 70; // world x of the collapse front
    if (b <= Math.max(edge, collapseX)) {
      this.drawFallingChunks(a, b, d, th, level, edge);
      return;
    }
    const split = Math.max(a, Math.min(b, Math.max(edge, collapseX)));
    if (split > a) this.drawFallingChunks(a, split, d, th, level, edge);
    this.drawSegment(this.sx(split, d), this.sx(b, d), split, th, level, 0);
  }

  private drawFallingChunks(a: number, b: number, d: number, th: Theme, level: number, edge: number): void {
    const ctx = this.ctx;
    const CH = 48;
    for (let x = Math.floor(a / CH) * CH; x < b; x += CH) {
      const x0 = Math.max(a, x);
      const x1 = Math.min(b, x + CH);
      const behind = Math.max(0, edge - x1);
      const t = behind / 260;
      const dy = t * t * 420;
      const rot = ((x / CH) % 2 ? 1 : -1) * t * 0.5;
      if (dy > 140) continue;
      ctx.save();
      const cx = this.sx((x0 + x1) / 2, d);
      ctx.translate(cx, GROUND_Y + dy);
      ctx.rotate(rot);
      this.drawSegment(this.sx(x0, d) - cx, this.sx(x1, d) - cx, x0, th, level, 0, true);
      ctx.restore();
    }
  }

  /** One solid stretch of floor from screen x a to b (world x wa at a). */
  private drawSegment(a: number, b: number, wa: number, th: Theme, level: number, yOff: number, local = false): void {
    const ctx = this.ctx;
    const top = local ? 0 : GROUND_Y + yOff;
    const h = VIEW_H - GROUND_Y + 4;
    ctx.fillStyle = th.ground;
    ctx.fillRect(a, top, b - a, h);
    // lip: a lighter strip so the floor line reads instantly
    ctx.fillStyle = mix(th.far, th.ground, 0.15);
    ctx.fillRect(a, top, b - a, 5);
    ctx.fillStyle = C.black;
    ctx.fillRect(a, top + 5, b - a, 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a, top, b - a, h);
    ctx.clip();
    const wx = (sx: number) => wa + (sx - a);
    const detail = hexA(th.far, 0.35);
    ctx.fillStyle = detail;
    ctx.strokeStyle = detail;
    ctx.lineWidth = 2;
    if (level === 0) {
      // road with dashed markings
      const start = a - (((wx(a) % 120) + 120) % 120);
      for (let x = start; x < b; x += 120) ctx.fillRect(x, top + 52, 56, 5);
      ctx.fillStyle = hexA(th.far, 0.2);
      ctx.fillRect(a, top + 18, b - a, 2);
    } else if (level === 1) {
      // parapet bricks and a wall with dim windows
      const start = a - (((wx(a) % 40) + 40) % 40);
      for (let x = start; x < b; x += 40) ctx.fillRect(x, top + 8, 2, 14);
      ctx.fillRect(a, top + 22, b - a, 2);
      ctx.fillStyle = hexA(th.accent, 0.12);
      const ws = a - (((wx(a) % 70) + 70) % 70);
      for (let x = ws + 14; x < b; x += 70) ctx.fillRect(x, top + 44, 22, 26);
    } else if (level === 2) {
      // train car roof ridges, windows and wheels
      const start = a - (((wx(a) % 24) + 24) % 24);
      for (let x = start; x < b; x += 24) ctx.fillRect(x, top + 9, 12, 3);
      ctx.fillStyle = hexA(th.accent, 0.16);
      const ws = a - (((wx(a) % 80) + 80) % 80);
      for (let x = ws + 18; x < b; x += 80) ctx.fillRect(x, top + 26, 40, 22);
      ctx.fillStyle = C.black;
      const wh = a - (((wx(a) % 110) + 110) % 110);
      for (let x = wh + 30; x < b; x += 110) {
        ctx.beginPath();
        ctx.arc(x, top + 92, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (level === 3) {
      // bridge planks and truss
      const start = a - (((wx(a) % 32) + 32) % 32);
      for (let x = start; x < b; x += 32) ctx.fillRect(x, top + 7, 2, 18);
      ctx.fillRect(a, top + 25, b - a, 3);
      const ts = a - (((wx(a) % 64) + 64) % 64);
      ctx.beginPath();
      for (let x = ts; x < b + 64; x += 64) {
        ctx.moveTo(x, top + 28);
        ctx.lineTo(x + 32, top + 70);
        ctx.lineTo(x + 64, top + 28);
      }
      ctx.stroke();
    } else {
      // temple stone blocks
      const start = a - (((wx(a) % 64) + 64) % 64);
      for (let row = 0; row < 3; row++) {
        const y = top + 8 + row * 30;
        ctx.fillRect(a, y + 28, b - a, 2);
        for (let x = start + (row % 2) * 32; x < b; x += 64) ctx.fillRect(x, y, 2, 28);
      }
    }
    ctx.restore();
    // pit walls: a soft shaded edge in the floor's own colour
    ctx.fillStyle = mix(th.ground, '#000000', 0.35);
    ctx.fillRect(a, top + 7, 2, h);
    ctx.fillRect(b - 2, top + 7, 2, h);
  }

  private drawPitDetail(v: WorldView, th: Theme): void {
    const ctx = this.ctx;
    const d = v.distance;
    for (const o of v.run.obstacles) {
      if (o.type !== 'gap' && o.type !== 'spikes' && o.type !== 'rope' && o.type !== 'heli' && o.type !== 'tiles') continue;
      const a = this.sx(o.x0, d);
      const b = o.type === 'heli' ? VIEW_W + 10 : this.sx(o.x1, d);
      if (b < -10 || a > VIEW_W + 10) continue;
      // depth haze: clear at the lip, thickening further down
      const g = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
      g.addColorStop(0, hexA(th.backdrop, 0));
      g.addColorStop(1, hexA(mix(th.backdrop, '#000000', 0.35), 0.55));
      ctx.fillStyle = g;
      ctx.fillRect(a, GROUND_Y, b - a, VIEW_H - GROUND_Y);
      if (v.level === 3 || o.def.style === 'cliff') {
        // water / river far below
        ctx.fillStyle = hexA(th.far, 0.3);
        for (let x = a; x < b; x += 26) ctx.fillRect(x + ((v.time * 40) % 26), VIEW_H - 18 + Math.sin(x * 0.1 + v.time * 3) * 3, 14, 2);
      }
      if (o.type === 'spikes') {
        const n = Math.floor((o.x1 - o.x0) / 24);
        const w = (b - a) / n;
        for (let i = 0; i < n; i++) {
          const x = a + i * w;
          ctx.beginPath();
          ctx.moveTo(x + 2, VIEW_H);
          ctx.lineTo(x + w / 2, VIEW_H - 40);
          ctx.lineTo(x + w - 2, VIEW_H);
          ctx.closePath();
          ctx.fillStyle = C.cream;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = C.black;
          ctx.stroke();
          ctx.fillStyle = C.red;
          ctx.beginPath();
          ctx.moveTo(x + w / 2 - 4, VIEW_H - 32);
          ctx.lineTo(x + w / 2, VIEW_H - 40);
          ctx.lineTo(x + w / 2 + 4, VIEW_H - 32);
          ctx.fill();
        }
      }
      if (o.type === 'gap' || o.type === 'rope') {
        // a thin danger mark along both lips so gaps read even in the dark
        ctx.fillStyle = C.red;
        ctx.fillRect(a - 6, GROUND_Y, 6, 3);
        ctx.fillRect(b, GROUND_Y, 6, 3);
      }
    }
  }

  private drawStuntCar(t: number, th: Theme): void {
    const ctx = this.ctx;
    const x = 430 + Math.sin(t * 0.45) * 150;
    const y = 488;
    ctx.fillStyle = mix(th.far, '#000000', 0.1);
    roundRect(ctx, x - 70, y - 22, 140, 30, 8);
    ctx.fill();
    roundRect(ctx, x - 40, y - 42, 80, 24, 8);
    ctx.fill();
    ctx.fillStyle = hexA(th.accent, 0.35);
    ctx.fillRect(x - 32, y - 37, 28, 14);
    ctx.fillRect(x + 4, y - 37, 28, 14);
    ctx.fillStyle = hexA(th.accent, 0.6);
    ctx.fillRect(x + 64, y - 14, 6, 6);
    ctx.fillStyle = C.black;
    for (const wx of [x - 42, x + 42]) {
      ctx.beginPath();
      ctx.arc(wx, y + 10, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private darkRanges(run: SceneRun): [number, number][] {
    return (run.scene.dark ?? []).map(([a, b]) => [a * run.ppb, b * run.ppb] as [number, number]);
  }

  private drawTunnel(ranges: [number, number][], d: number, th: Theme): void {
    const ctx = this.ctx;
    for (const [a, b] of ranges) {
      const x0 = this.sx(a, d);
      const x1 = this.sx(b, d);
      if (x1 < 0 || x0 > VIEW_W) continue;
      ctx.fillStyle = hexA(C.tunnel, 0.9);
      ctx.fillRect(x0, 0, x1 - x0, VIEW_H);
      // portal arches
      for (const px of [x0, x1]) {
        ctx.fillStyle = C.black;
        ctx.fillRect(px - 18, 0, 36, GROUND_Y);
        ctx.fillStyle = hexA(th.far, 0.6);
        ctx.fillRect(px - 18, 0, 36, 6);
      }
      // ceiling lamps rushing past
      const start = Math.ceil(a / 220) * 220;
      for (let wx = start; wx < b; wx += 220) {
        const lx = this.sx(wx, d);
        if (lx < -40 || lx > VIEW_W + 40) continue;
        ctx.fillStyle = hexA(th.accent, 0.9);
        ctx.fillRect(lx - 14, 70, 28, 5);
        const g = ctx.createRadialGradient(lx, 74, 2, lx, 74, 70);
        g.addColorStop(0, hexA(th.accent, 0.28));
        g.addColorStop(1, hexA(th.accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(lx - 70, 20, 140, 120);
      }
    }
  }

  // ------------------------------------------------------------ obstacles

  private outline(): void {
    this.ctx.lineWidth = OUTLINE;
    this.ctx.strokeStyle = C.black;
    this.ctx.stroke();
  }

  private hazardRect(x: number, y: number, w: number, h: number, stripe: 'diag' | 'bands' | 'none' = 'diag'): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fillStyle = C.cream;
    ctx.fill();
    if (stripe === 'diag') {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = C.red;
      for (let i = -h; i < w; i += 22) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + h);
        ctx.lineTo(x + i + 10, y + h);
        ctx.lineTo(x + i + 10 + h, y);
        ctx.lineTo(x + i + h, y);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    this.outline();
  }

  private drawObstacle(o: ObstacleRT, v: WorldView, th: Theme, dark: [number, number][]): void {
    const d = v.distance;
    const ctx = this.ctx;
    const x = this.sx(o.x0, d);
    const x1 = this.sx(o.type === 'heli' ? o.x0 + 400 : o.x1, d);
    if (x1 < -120 || x > VIEW_W + 260) return;
    const t = v.time;

    // In the dark tunnel, hazards flash lit just before the player reaches them.
    let flash = 0;
    if (dark.some(([a, b]) => o.x0 >= a && o.x0 <= b)) {
      const dist = x - PLAYER_X;
      flash = Math.max(0, 1 - Math.abs(dist - 470) / 90);
    }

    switch (o.type) {
      case 'crate':
        if (o.def.style === 'chimney') this.drawChimney(x);
        else this.drawCrate(x);
        break;
      case 'barrel':
        this.drawBarrel(x, t);
        break;
      case 'lowSign':
        this.drawOverhead(x, o.def.style ?? 'sign', t);
        break;
      case 'rope':
        this.drawRope(o, v);
        break;
      case 'heli':
        this.drawHeli(o, v);
        break;
      case 'crane':
        this.drawCrane(o, d);
        break;
      case 'tiles':
        this.drawTiles(o, v, th);
        break;
      case 'darts':
        this.drawDarts(o, x, t);
        break;
      default:
        break;
    }

    if (flash > 0) {
      const g = ctx.createRadialGradient(x + (x1 - x) / 2, 380, 10, x + (x1 - x) / 2, 380, 160);
      g.addColorStop(0, `rgba(244,239,230,${0.5 * flash})`);
      g.addColorStop(1, 'rgba(244,239,230,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 160, 220, x1 - x + 320, 320);
    }
  }

  private drawCrate(x: number): void {
    const ctx = this.ctx;
    const y = GROUND_Y - 56;
    ctx.beginPath();
    ctx.rect(x, y, 56, 56);
    ctx.fillStyle = C.cream;
    ctx.fill();
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 6, y + 6, 44, 44);
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8);
    ctx.lineTo(x + 48, y + 48);
    ctx.moveTo(x + 48, y + 8);
    ctx.lineTo(x + 8, y + 48);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x, y, 56, 56);
    this.outline();
  }

  private drawChimney(x: number): void {
    const ctx = this.ctx;
    const y = GROUND_Y - 56;
    ctx.beginPath();
    ctx.rect(x + 4, y + 8, 48, 48);
    ctx.fillStyle = C.cream;
    ctx.fill();
    ctx.fillStyle = C.red;
    for (let r = 0; r < 4; r++) {
      ctx.fillRect(x + 4, y + 18 + r * 10, 48, 3);
      for (let c = 0; c < 3; c++) ctx.fillRect(x + 10 + c * 16 + (r % 2) * 8, y + 18 + r * 10, 3, 10);
    }
    ctx.beginPath();
    ctx.rect(x + 4, y + 8, 48, 48);
    this.outline();
    this.hazardRect(x, y, 56, 10, 'none');
  }

  private drawBarrel(x: number, t: number): void {
    const ctx = this.ctx;
    const y = GROUND_Y - 84;
    // flames (drawn first so the rim covers their base)
    for (let i = 0; i < 3; i++) {
      const fx = x + 12 + i * 16;
      const fh = 18 + Math.sin(t * 14 + i * 2) * 6;
      ctx.beginPath();
      ctx.moveTo(fx - 8, y + 4);
      ctx.quadraticCurveTo(fx - 2, y - fh * 0.5, fx + Math.sin(t * 9 + i) * 3, y - fh);
      ctx.quadraticCurveTo(fx + 4, y - fh * 0.5, fx + 8, y + 4);
      ctx.fillStyle = i === 1 ? C.gold : C.red;
      ctx.fill();
    }
    ctx.beginPath();
    roundRect(ctx, x, y, 56, 84, 10);
    ctx.fillStyle = C.cream;
    ctx.fill();
    ctx.fillStyle = C.red;
    ctx.fillRect(x, y + 16, 56, 9);
    ctx.fillRect(x, y + 58, 56, 9);
    ctx.fillStyle = C.black;
    ctx.fillRect(x + 22, y + 32, 12, 18);
    ctx.fillStyle = C.cream;
    ctx.fillRect(x + 26, y + 34, 4, 9);
    ctx.fillRect(x + 26, y + 45, 4, 3);
    roundRect(ctx, x, y, 56, 84, 10);
    this.outline();
  }

  private drawOverhead(x: number, style: string, t: number): void {
    const ctx = this.ctx;
    // Bottom edge sits at 396, above the ducked performer (top ~404) and
    // inside the hitbox (which ends at 400).
    const top = 356;
    const w = SIGN_W;
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.black;
    switch (style) {
      case 'laundry': {
        // Line strung between two poles, sagging so it passes through the
        // clothes pegs; each garment hangs from the line where it crosses.
        const x0 = x - 30;
        const x1 = x + w + 30;
        const endY = top - 34;
        const ctrlY = top + 26; // curve's lowest point = (endY + ctrlY) / 2 = top - 4
        const lineY = (px: number): number => {
          const u = (px - x0) / (x1 - x0);
          return (1 - u) * (1 - u) * endY + 2 * u * (1 - u) * ctrlY + u * u * endY;
        };
        ctx.fillStyle = C.charcoal;
        ctx.fillRect(x0 - 4, 0, 6, endY + 2);
        ctx.fillRect(x1 - 2, 0, 6, endY + 2);
        ctx.strokeStyle = C.cream;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, endY);
        ctx.quadraticCurveTo(x + w / 2, ctrlY, x1, endY);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const cx = x + 6 + i * 28;
          const sway = Math.sin(t * 3 + i) * 2;
          const peg = lineY(cx + 12);
          ctx.save();
          ctx.translate(cx + sway, peg);
          const h = top + 40 - peg;
          this.hazardRect(0, 0, 24, h, i % 2 ? 'diag' : 'none');
          if (i % 2 === 0) {
            ctx.fillStyle = C.red;
            ctx.fillRect(0, 12, 24, 5);
          }
          ctx.fillStyle = C.charcoal;
          ctx.fillRect(4, -3, 4, 7);
          ctx.fillRect(16, -3, 4, 7);
          ctx.restore();
        }
        return;
      }
      case 'antenna': {
        ctx.fillStyle = C.charcoal;
        ctx.fillRect(x + w / 2 - 3, 0, 6, top);
        this.hazardRect(x, top + 6, w, 14, 'diag');
        this.hazardRect(x + 14, top + 24, w - 28, 16, 'diag');
        return;
      }
      case 'signal': {
        ctx.fillStyle = C.charcoal;
        ctx.fillRect(x + 10, 0, 8, top);
        ctx.fillRect(x + w - 18, 0, 8, top);
        ctx.fillRect(x, top - 12, w, 12);
        this.hazardRect(x, top, w, 40, 'diag');
        ctx.fillStyle = C.black;
        ctx.beginPath();
        ctx.arc(x + w / 2, top + 20, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = Math.sin(t * 8) > 0 ? C.red : '#5a1a20';
        ctx.beginPath();
        ctx.arc(x + w / 2, top + 20, 7, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'branch': {
        ctx.fillStyle = C.charcoal;
        ctx.fillRect(x + w - 26, 0, 10, top);
        ctx.beginPath();
        ctx.moveTo(x - 6, top + 8);
        ctx.quadraticCurveTo(x + w / 2, top - 8, x + w + 6, top + 6);
        ctx.lineTo(x + w + 6, top + 40);
        ctx.quadraticCurveTo(x + w / 2, top + 30, x - 6, top + 40);
        ctx.closePath();
        ctx.fillStyle = C.cream;
        ctx.fill();
        ctx.fillStyle = C.red;
        for (let i = 0; i < 5; i++) ctx.fillRect(x + 6 + i * 24, top + 14, 10, 4);
        ctx.beginPath();
        ctx.moveTo(x - 6, top + 8);
        ctx.quadraticCurveTo(x + w / 2, top - 8, x + w + 6, top + 6);
        ctx.lineTo(x + w + 6, top + 40);
        ctx.quadraticCurveTo(x + w / 2, top + 30, x - 6, top + 40);
        ctx.closePath();
        this.outline();
        return;
      }
      default: {
        ctx.fillStyle = C.charcoal;
        ctx.fillRect(x + 14, 0, 6, top);
        ctx.fillRect(x + w - 20, 0, 6, top);
        this.hazardRect(x, top, w, 40, 'diag');
        ctx.fillStyle = C.black;
        ctx.fillRect(x + 30, top + 12, w - 60, 16);
        ctx.fillStyle = C.cream;
        ctx.font = `700 11px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText('LOW', x + w / 2, top + 24);
      }
    }
  }

  private handle(x: number, y: number, t: number, used: boolean): void {
    const ctx = this.ctx;
    const pulse = used ? 0 : (Math.sin(t * 7) + 1) / 2;
    if (!used) {
      ctx.fillStyle = hexA(C.cyan, 0.18 + pulse * 0.2);
      ctx.beginPath();
      ctx.arc(x, y, 18 + pulse * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.cyan;
    ctx.fill();
    this.outline();
  }

  private drawRope(o: ObstacleRT, v: WorldView): void {
    const ctx = this.ctx;
    const d = v.distance;
    const hd = o.handle!;
    const ax = this.sx(hd.x, d);
    const p = v.run.player;
    let ex = ax;
    let ey = hd.y;
    if (p.hang && p.hang.ob === o) {
      ex = PLAYER_X;
      ey = p.hang.handY;
    }
    const vine = o.def.style === 'vine';
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.black;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(ax, ROPE_ANCHOR_Y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (vine) {
      ctx.fillStyle = C.cyan;
      for (let i = 1; i < 8; i++) {
        const t = 0.55 + i * 0.055;
        const lx = ax + (ex - ax) * t;
        const ly = ROPE_ANCHOR_Y + (ey - ROPE_ANCHOR_Y) * t;
        ctx.beginPath();
        ctx.ellipse(lx + (i % 2 ? 6 : -6), ly, 6, 3, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!(p.hang && p.hang.ob === o)) this.handle(ex, ey, v.time, o.grabbed);
    ctx.lineCap = 'butt';
  }

  private drawHeli(o: ObstacleRT, v: WorldView): void {
    const ctx = this.ctx;
    const hd = o.handle!;
    const p = v.run.player;
    const hanging = !!(p.hang && p.hang.ob === o);
    const sx = hanging ? PLAYER_X - p.hang!.dx0 : this.sx(hd.x, v.distance);
    const sy = hanging ? p.hang!.handY : hd.y + Math.sin(v.time * 2) * 4;
    const by = sy - 120;
    // skid struts and bar (grab cyan)
    ctx.strokeStyle = C.black;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx - 30, sy);
    ctx.lineTo(sx - 20, by + 40);
    ctx.moveTo(sx + 30, sy);
    ctx.lineTo(sx + 20, by + 40);
    ctx.stroke();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.black;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(sx - 60, sy);
    ctx.lineTo(sx + 60, sy);
    ctx.stroke();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.lineCap = 'butt';
    // body
    ctx.fillStyle = '#3b3f4d';
    ctx.beginPath();
    ctx.ellipse(sx, by + 18, 80, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    this.outline();
    ctx.fillRect(sx + 60, by + 6, 120, 14);
    ctx.beginPath();
    ctx.rect(sx + 60, by + 6, 120, 14);
    this.outline();
    ctx.fillStyle = hexA(C.text, 0.35);
    ctx.beginPath();
    ctx.ellipse(sx - 34, by + 12, 30, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // rotor
    const r = Math.sin(v.time * 40) * 110;
    ctx.fillStyle = C.black;
    ctx.fillRect(sx - 4, by - 26, 8, 12);
    ctx.fillRect(sx - Math.abs(r), by - 30, Math.abs(r) * 2, 5);
    ctx.fillRect(sx + 172, by - 2 + Math.sin(v.time * 50) * 10, 6, 24);
    if (!hanging && !o.grabbed) this.handle(sx, sy, v.time, false);
  }

  private drawCrane(o: ObstacleRT, d: number): void {
    const ctx = this.ctx;
    const px = this.sx(o.pivotX, d);
    // girder across the top
    ctx.fillStyle = '#3b3f4d';
    ctx.fillRect(px - 120, CRANE_PIVOT_Y - 26, 240, 20);
    ctx.strokeStyle = C.black;
    ctx.lineWidth = 3;
    ctx.strokeRect(px - 120, CRANE_PIVOT_Y - 26, 240, 20);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -120; i < 120; i += 20) {
      ctx.moveTo(px + i, CRANE_PIVOT_Y - 26);
      ctx.lineTo(px + i + 20, CRANE_PIVOT_Y - 6);
    }
    ctx.stroke();
    const b = o.craneBlock();
    const bx = this.sx(b.x, d);
    // cable
    ctx.strokeStyle = C.black;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, CRANE_PIVOT_Y);
    ctx.lineTo(bx + CRANE_BLOCK_W / 2, b.y);
    ctx.stroke();
    ctx.strokeStyle = '#8a8f9e';
    ctx.lineWidth = 2;
    ctx.stroke();
    // block with hazard stripes, rotated with the swing
    ctx.save();
    ctx.translate(bx + CRANE_BLOCK_W / 2, b.y);
    ctx.rotate(-o.angle);
    this.hazardRect(-CRANE_BLOCK_W / 2, 0, CRANE_BLOCK_W, CRANE_BLOCK_H - 8, 'diag');
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.black;
    ctx.beginPath();
    ctx.arc(0, CRANE_BLOCK_H - 4, 7, Math.PI, Math.PI * 2.6);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.cream;
    ctx.stroke();
    ctx.restore();
  }

  private drawTiles(o: ObstacleRT, v: WorldView, th: Theme): void {
    const ctx = this.ctx;
    for (const tile of o.tiles) {
      let dx = 0;
      let dy = 0;
      let rot = 0;
      if (tile.trig !== null) {
        const since = v.run.t - tile.trig;
        if (since < TILE_DROP_DELAY) {
          dx = Math.sin(v.time * 60) * 2;
          dy = Math.sin(v.time * 47) * 1.5;
        } else {
          const f = since - TILE_DROP_DELAY;
          dy = 0.5 * 2000 * f * f;
          rot = f * 2 * (tile.x % 192 ? 1 : -1);
        }
      }
      if (dy > 200) continue;
      const x = this.sx(tile.x, v.distance);
      if (x > VIEW_W + 20 || x < -120) continue;
      ctx.save();
      ctx.translate(x + TILE_W / 2 + dx, GROUND_Y + 12 + dy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.rect(-TILE_W / 2 + 1, -12, TILE_W - 2, 24);
      ctx.fillStyle = mix(C.cream, th.ground, 0.2);
      ctx.fill();
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-30, -12);
      ctx.lineTo(-18, 0);
      ctx.lineTo(-26, 12);
      ctx.moveTo(14, -12);
      ctx.lineTo(24, -2);
      ctx.lineTo(16, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-TILE_W / 2 + 1, -12, TILE_W - 2, 24);
      this.outline();
      ctx.restore();
    }
  }

  private drawDarts(o: ObstacleRT, x: number, t: number): void {
    const ctx = this.ctx;
    const x1 = x + DART_W;
    // carved stone head on the right, above the lane
    ctx.fillStyle = '#2d4a3d';
    ctx.fillRect(x1 - 6, 0, 46, 330);
    ctx.beginPath();
    ctx.rect(x1 - 6, 270, 46, 60);
    this.outline();
    const charging = !o.dartsActive && o.dartPhase > 0.8;
    ctx.fillStyle = charging || o.dartsActive ? C.red : '#4a1a1e';
    ctx.fillRect(x1 + 4, 284, 8, 6);
    ctx.fillRect(x1 + 22, 284, 8, 6);
    // the volley zone marker on the floor
    ctx.fillStyle = hexA(C.red, 0.5);
    for (let i = 0; i < DART_W; i += 20) ctx.fillRect(x + i, GROUND_Y - 4, 10, 3);
    // vertical emitter slots
    ctx.fillStyle = C.black;
    for (const yy of [344, 368, 392]) ctx.fillRect(x1 - 8, yy - 4, 10, 8);
    if (o.dartsActive) {
      ctx.fillStyle = hexA(C.red, 0.12);
      ctx.fillRect(x, 330, DART_W, 66);
      const prog = o.dartPhase / DART_ACTIVE;
      for (const [row, yy] of [344, 368, 392].entries()) {
        for (let k = 0; k < 3; k++) {
          const f = (prog + k / 3 + row * 0.13) % 1;
          const dx = x1 - 10 - f * (DART_W + 20);
          if (dx < x - 20) continue;
          ctx.fillStyle = C.black;
          ctx.fillRect(dx - 2, yy - 4, 30, 8);
          ctx.fillStyle = C.cream;
          ctx.fillRect(dx + 6, yy - 2, 22, 4);
          ctx.fillStyle = C.red;
          ctx.beginPath();
          ctx.moveTo(dx - 2, yy);
          ctx.lineTo(dx + 8, yy - 4);
          ctx.lineTo(dx + 8, yy + 4);
          ctx.fill();
        }
      }
    }
    void t;
  }

  private drawPrompts(v: WorldView): void {
    const ctx = this.ctx;
    for (const o of v.run.obstacles) {
      if (!o.def.prompt || o.cleared || o.grabbed) continue;
      const x = this.sx(o.type === 'crane' ? o.pivotX - 60 : o.x0, v.distance);
      const dist = x - PLAYER_X;
      if (dist > 760 || dist < -40) continue;
      const a = Math.min(1, (760 - dist) / 120);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 15px ${MONO}`;
      const w = ctx.measureText(o.def.prompt).width + 28;
      const cx = Math.max(w / 2 + 10, Math.min(VIEW_W - w / 2 - 10, x + 40));
      const y = o.type === 'heli' ? 150 : o.cat === 'duck' ? 300 : 236;
      roundRect(ctx, cx - w / 2, y - 24, w, 34, 17);
      ctx.fillStyle = hexA(C.charcoal, 0.92);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = o.cat === 'grab' ? C.cyan : C.gold;
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.textAlign = 'center';
      ctx.fillText(o.def.prompt, cx, y - 2);
      ctx.restore();
    }
  }

  private drawBoulder(v: WorldView): void {
    const ctx = this.ctx;
    const r = 110;
    const cx = 30 + Math.sin(v.time * 1.3) * 14;
    const cy = GROUND_Y - r + 6;
    const ang = v.distance / r;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rr = r * (0.93 + ((i * 37) % 7) / 100);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#4a5a50';
    ctx.fill();
    this.outline();
    ctx.strokeStyle = '#2a3a32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-40, -30);
    ctx.lineTo(0, 0);
    ctx.lineTo(30, -50);
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 60);
    ctx.moveTo(-70, 30);
    ctx.lineTo(-30, 40);
    ctx.stroke();
    ctx.restore();
    if (Math.random() < 0.5) this.emit(v.distance - PLAYER_X + cx + 60, GROUND_Y - 4, 1, 'dust');
  }

  private drawSpeedLines(t: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(244,239,230,0.07)';
    for (let i = 0; i < 14; i++) {
      const y = i < 7 ? 20 + i * 24 : 480 + (i - 7) * 8;
      const len = 120 + ((i * 53) % 90);
      const x = VIEW_W - ((t * (1400 + i * 90) + i * 211) % (VIEW_W + len));
      ctx.fillRect(x, y, len, 2);
    }
  }

  private drawForeground(level: number, d: number, th: Theme): void {
    const ctx = this.ctx;
    const off = d * 1.4;
    const span = 520;
    const first = Math.floor((off - 200) / span);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = C.black;
    ctx.strokeStyle = C.black;
    // level 3's truss only fills its own span, so start one span further left
    for (let i = first - (level === 3 ? 1 : 0); i < first + 4; i++) {
      const x = i * span - off + 200;
      const h = ((i * 7919) % 100) / 100;
      ctx.lineWidth = 3;
      if (level === 0) {
        ctx.beginPath();
        ctx.moveTo(x - 200, 30);
        ctx.quadraticCurveTo(x + 60, 80, x + 320, 30);
        ctx.stroke();
        ctx.fillRect(x + 50, 50, 22, 50);
      } else if (level === 1) {
        ctx.fillRect(x, 0, 14, 90 + h * 60);
        ctx.beginPath();
        ctx.moveTo(x + 7, 50);
        ctx.quadraticCurveTo(x + 260, 120, x + 520, 50);
        ctx.stroke();
      } else if (level === 2) {
        ctx.beginPath();
        ctx.moveTo(x - 260, 46);
        ctx.quadraticCurveTo(x, 70, x + 260, 46);
        ctx.stroke();
        ctx.fillRect(x - 6, 0, 12, 50);
      } else if (level === 3) {
        // Overhead truss of the bridge, seen from below: braces zig-zag
        // between a top chord (off screen) and a bottom chord beam.
        const bay = span / 4;
        ctx.fillRect(x, 58, span, 9);
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const bx = x + k * bay;
          ctx.moveTo(bx, -10);
          ctx.lineTo(bx, 62);
          ctx.moveTo(bx, k % 2 ? -10 : 62);
          ctx.lineTo(bx + bay, k % 2 ? 62 : -10);
        }
        ctx.stroke();
      } else {
        const len = 140 + h * 100;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.quadraticCurveTo(x + 30, len / 2, x + 8, len);
        ctx.stroke();
        for (let k = 30; k < len; k += 26) {
          ctx.beginPath();
          ctx.ellipse(x + 14 + Math.sin(k) * 6, k, 13, 6, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    void th;
  }

  // ------------------------------------------------------------- the player

  drawPlayer(p: Player, v: WorldView, at?: { x: number; y: number; scale?: number; pose?: 'run' | 'hero' }): void {
    const ctx = this.ctx;
    const x = at ? at.x : PLAYER_X;
    const y = at ? at.y : v.playerY;
    const phase = at ? v.time * 9 : p.runPhase;
    ctx.save();
    ctx.translate(x, y);
    if (at?.scale) ctx.scale(at.scale, at.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let sxs = 1;
    let sys = 1;
    if (p.stretch > 0 && !at) {
      sys = 1.15;
      sxs = 0.9;
    } else if (p.squash > 0 && !at) {
      sys = 0.85;
      sxs = 1.12;
    }
    ctx.scale(sxs, sys);

    if (!at && p.dead) {
      // impact, flip, still on the ground
      const ct = Math.max(0, v.cutT);
      const k = Math.min(1, ct / 0.35);
      const lift = Math.sin(k * Math.PI) * 50;
      ctx.translate(0, -lift - 20);
      ctx.rotate(-k * Math.PI * 1.5);
      ctx.translate(0, 20);
      this.figure('fall', phase);
      ctx.restore();
      return;
    }

    let pose: 'run' | 'rise' | 'fall' | 'duck' | 'hang' | 'hero' = 'run';
    if (at?.pose === 'hero') pose = 'hero';
    else if (!at) {
      if (p.hang) pose = 'hang';
      else if (p.ducking) pose = 'duck';
      else if (!p.grounded) pose = p.vy < 0 ? 'rise' : 'fall';
    }
    this.figure(pose, phase, p.hang ? p.hang.t : 0);
    ctx.restore();
  }

  private limb(pts: [number, number][], w: number, color: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = C.black;
    ctx.lineWidth = w + OUTLINE * 2;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  private dot(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = C.black;
    ctx.stroke();
  }

  /** The stunt performer, feet at (0, 0), facing right. */
  private figure(pose: 'run' | 'rise' | 'fall' | 'duck' | 'hang' | 'hero', ph: number, hangT = 0): void {
    const O = C.orange;
    const leg = (hx: number, hy: number, a: number, bend: number): [number, number][] => {
      const kx = hx + Math.sin(a) * 17;
      const ky = hy + Math.cos(a) * 17;
      const b = a - bend;
      return [
        [hx, hy],
        [kx, ky],
        [kx + Math.sin(b) * 18, ky + Math.cos(b) * 18],
      ];
    };
    const arm = (sx: number, sy: number, a: number, bend: number): [number, number][] => {
      const ex = sx + Math.sin(a) * 13;
      const ey = sy + Math.cos(a) * 13;
      const b = a + bend;
      return [
        [sx, sy],
        [ex, ey],
        [ex + Math.sin(b) * 12, ey + Math.cos(b) * 12],
      ];
    };
    let hip: [number, number] = [0, -36];
    let sh: [number, number] = [4, -58];
    let head: [number, number] = [8, -70];
    let legs: [number, number][][] = [];
    let arms: [number, number][][] = [];

    if (pose === 'run' || pose === 'hero') {
      const bob = pose === 'run' ? -Math.abs(Math.sin(ph)) * 3 : 0;
      hip = [0, -36 + bob];
      sh = [5, -58 + bob];
      head = [10, -70 + bob];
      if (pose === 'hero') {
        legs = [leg(hip[0], hip[1], 0.25, 0), leg(hip[0], hip[1], -0.25, 0)];
        arms = [arm(sh[0], sh[1], 0.6, 1.8), arm(sh[0], sh[1], -2.6, 0.2)];
      } else {
        const s1 = Math.sin(ph);
        const s2 = Math.sin(ph + Math.PI);
        legs = [
          leg(hip[0], hip[1], s1 * 0.85, 0.3 + Math.max(0, Math.cos(ph)) * 1.3),
          leg(hip[0], hip[1], s2 * 0.85, 0.3 + Math.max(0, Math.cos(ph + Math.PI)) * 1.3),
        ];
        arms = [arm(sh[0], sh[1], -s1 * 0.9, -1.3), arm(sh[0], sh[1], -s2 * 0.9, -1.3)];
      }
    } else if (pose === 'rise') {
      legs = [leg(hip[0], hip[1], 1.1, 1.9), leg(hip[0], hip[1], 0.2, 1.4)];
      arms = [arm(sh[0], sh[1], 2.6, 0.3), arm(sh[0], sh[1], -2.4, -0.3)];
    } else if (pose === 'fall') {
      legs = [leg(hip[0], hip[1], 0.45, 0.4), leg(hip[0], hip[1], -0.3, 0.2)];
      arms = [arm(sh[0], sh[1], 2.2, 0.6), arm(sh[0], sh[1], -2.0, -0.5)];
    } else if (pose === 'duck') {
      // slide: lean back, front leg along the floor
      // Kept under 36px tall so it fits beneath every overhead hazard.
      hip = [-2, -10];
      sh = [-18, -19];
      head = [-27, -22];
      legs = [
        [
          [hip[0], hip[1]],
          [hip[0] + 16, -5],
          [hip[0] + 34, -4],
        ],
        [
          [hip[0], hip[1]],
          [hip[0] + 8, -2],
          [hip[0] - 6, -2],
        ],
      ];
      arms = [
        [
          [sh[0], sh[1]],
          [sh[0] - 6, sh[1] + 9],
          [sh[0] - 12, -3],
        ],
        [
          [sh[0], sh[1]],
          [sh[0] + 12, -23],
          [sh[0] + 24, -24],
        ],
      ];
    } else if (pose === 'hang') {
      const sw = Math.sin(hangT * 8) * 0.25;
      hip = [-2, -30];
      sh = [0, -56];
      head = [6, -60];
      arms = [
        [
          [sh[0], sh[1]],
          [sh[0] - 1, sh[1] - 9],
          [0, -72],
        ],
        [
          [sh[0], sh[1]],
          [sh[0] + 3, sh[1] - 9],
          [2, -72],
        ],
      ];
      legs = [leg(hip[0], hip[1], 0.5 + sw, 0.6), leg(hip[0], hip[1], 0.1 + sw, 0.2)];
    }

    // back limbs, torso, front limbs, head
    this.limb(legs[1], 8, mix(O, '#000000', 0.18));
    this.limb(arms[1], 6, mix(O, '#000000', 0.18));
    this.limb([hip, sh], 17, O);
    // belt
    this.ctx.fillStyle = C.charcoal;
    this.ctx.save();
    this.ctx.translate(hip[0], hip[1]);
    this.ctx.rotate(Math.atan2(sh[0] - hip[0], -(sh[1] - hip[1])));
    this.ctx.fillRect(-9, -6, 18, 5);
    this.ctx.restore();
    this.limb(legs[0], 8, O);
    const lf = legs[0][2];
    const bf = legs[1][2];
    this.dot(bf[0] + 2, bf[1], 4.5, C.charcoal);
    this.dot(lf[0] + 2, lf[1], 4.5, C.charcoal);
    this.limb(arms[0], 6, O);
    const h0 = arms[0][2];
    const h1 = arms[1][2];
    this.dot(h1[0], h1[1], 4, C.helmet);
    this.dot(h0[0], h0[1], 4, C.helmet);
    // helmet + visor
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 11.5, 0, Math.PI * 2);
    ctx.fillStyle = C.helmet;
    ctx.fill();
    ctx.lineWidth = OUTLINE;
    ctx.strokeStyle = C.black;
    ctx.stroke();
    ctx.fillStyle = C.black;
    ctx.beginPath();
    roundRect(ctx, head[0] + 1, head[1] - 4, 12, 8, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(244,239,230,0.6)';
    ctx.fillRect(head[0] + 4, head[1] - 2, 4, 2);
    ctx.fillStyle = C.orange;
    ctx.fillRect(head[0] - 9, head[1] - 3, 7, 3);
  }

  // ------------------------------------------------------------------ debug

  private drawDebug(v: WorldView): void {
    const ctx = this.ctx;
    const run = v.run;
    const d = v.distance;
    // beat grid
    ctx.strokeStyle = 'rgba(53,208,255,0.25)';
    ctx.lineWidth = 1;
    const first = Math.floor((d - PLAYER_X) / run.ppb);
    for (let b = first; b < first + 8; b++) {
      const x = this.sx(b * run.ppb, d);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEW_H);
      ctx.stroke();
      ctx.fillStyle = 'rgba(53,208,255,0.7)';
      ctx.font = `10px ${MONO}`;
      ctx.fillText(String(b), x + 2, 120);
    }
    const box = (b: Box, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.sx(b.x, d), b.y, b.w, b.h);
    };
    for (const o of run.obstacles) {
      for (const b of o.hitboxes(run.t)) box(b, '#ff3b3b');
      if (o.handle && !o.grabbed) {
        ctx.strokeStyle = '#35d0ff';
        ctx.strokeRect(this.sx(o.handle.x, d) - 45, o.handle.y - 20, 90, 40);
        ctx.strokeRect(this.sx(o.handle.x, d) - 15, o.handle.y - 14, 30, 28);
      }
    }
    for (const [a, b] of run.holesNow()) {
      ctx.fillStyle = 'rgba(255,0,0,0.25)';
      ctx.fillRect(this.sx(a, d), GROUND_Y, b - a, 6);
    }
    box(run.player.hitbox(run.distance), '#7dff7d');
    ctx.strokeStyle = 'rgba(125,255,125,0.5)';
    ctx.strokeRect(PLAYER_X - 30, GROUND_Y - 2, 60, 4);
  }

  // ------------------------------------------------------------ post effects

  filmFinish(time: number, grain: boolean, vignette: boolean, heavy = false): void {
    const ctx = this.ctx;
    if (vignette) {
      if (!this.vignette) {
        const c = document.createElement('canvas');
        c.width = 480;
        c.height = 270;
        const g = c.getContext('2d')!;
        const rg = g.createRadialGradient(240, 135, 90, 240, 135, 300);
        rg.addColorStop(0, 'rgba(0,0,0,0)');
        rg.addColorStop(1, 'rgba(0,0,0,0.55)');
        g.fillStyle = rg;
        g.fillRect(0, 0, 480, 270);
        this.vignette = c;
      }
      ctx.drawImage(this.vignette, 0, 0, VIEW_W, VIEW_H);
    }
    if (grain) {
      const i = Math.floor(time * 24) % this.grain.length;
      if (!this.grainPatterns[i]) this.grainPatterns[i] = ctx.createPattern(this.grain[i], 'repeat');
      const pat = this.grainPatterns[i]!;
      ctx.save();
      ctx.globalAlpha = heavy ? 0.13 : 0.06;
      const ox = (Math.floor(time * 24) * 53) % 192;
      const oy = (Math.floor(time * 24) * 97) % 192;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, VIEW_W + 192, VIEW_H + 192);
      ctx.restore();
      if (heavy && Math.floor(time * 24) % 5 === 0) {
        ctx.fillStyle = 'rgba(232,232,232,0.25)';
        ctx.fillRect((time * 9137) % VIEW_W, 0, 1.5, VIEW_H);
      }
    }
  }

  letterbox(amount: number): void {
    if (amount <= 0) return;
    const h = 56 * amount;
    this.ctx.fillStyle = C.black;
    this.ctx.fillRect(0, 0, VIEW_W, h);
    this.ctx.fillRect(0, VIEW_H - h, VIEW_W, h);
  }

  flashOverlay(): void {
    if (this.flash <= 0) return;
    this.ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  fade(a: number): void {
    if (a <= 0) return;
    this.ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Simple backdrop for menus: a level's sky and parallax, gently drifting. */
  drawMenuBackdrop(level: number, time: number): void {
    const L = this.getLayers(level);
    const th = THEMES[level];
    this.ctx.drawImage(L.sky, 0, 0, VIEW_W, VIEW_H);
    this.drawTiled(L.far, time * 12);
    this.drawTiled(L.mid, time * 30);
    this.ctx.fillStyle = th.ground;
    this.ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
    this.ctx.fillStyle = mix(th.far, th.ground, 0.15);
    this.ctx.fillRect(0, GROUND_Y, VIEW_W, 5);
  }

}
