// Palette and per-level backdrops. Backdrop layers are painted once into
// offscreen canvases (1920 px wide, tileable) and scrolled with parallax.

import { GROUND_Y, VIEW_H, VIEW_W } from './constants';

/** Constant gameplay and interface colours: identical in every level. */
export const C = {
  orange: '#FF6B1A',
  helmet: '#F4F1EA',
  cream: '#F2E8CF',
  red: '#E63946',
  cyan: '#35D0FF',
  black: '#0E0E12',
  charcoal: '#1C1C24',
  text: '#F4EFE6',
  gold: '#F5B82E',
  tunnel: '#05080D',
} as const;

export interface Theme {
  backdrop: string;
  far: string;
  mid: string;
  ground: string;
  accent: string;
}

export const THEMES: Theme[] = [
  { backdrop: '#2D2B55', far: '#463D7A', mid: '#2F2859', ground: '#1E1A2E', accent: '#F7A072' },
  { backdrop: '#4A2C45', far: '#643B48', mid: '#3A2440', ground: '#231829', accent: '#FFB26B' },
  { backdrop: '#0F2A3F', far: '#1B4560', mid: '#163650', ground: '#0B1B2A', accent: '#9FE3FF' },
  { backdrop: '#353944', far: '#434856', mid: '#2B2E38', ground: '#1A1C24', accent: '#FF9F1C' },
  { backdrop: '#14352B', far: '#1F5240', mid: '#0F2B22', ground: '#0A1C16', accent: '#FF7B3A' },
];

export const TILE_LAYER_W = 1920;

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mix(h1: string, h2: string, t: number): string {
  const a = parseInt(h1.slice(1), 16);
  const b = parseInt(h2.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return '#' + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Draws fn at x and at x +/- the tile width so shapes wrap seamlessly. */
function wrap(x: number, w: number, fn: (x: number) => void): void {
  fn(x);
  if (x + w > TILE_LAYER_W) fn(x - TILE_LAYER_W);
  if (x < 0) fn(x + TILE_LAYER_W);
}

export interface Layers {
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
}

export function buildLayers(levelIndex: number, scale = 1): Layers {
  const th = THEMES[levelIndex];
  const S = scale;
  const [sky, s] = canvas(VIEW_W * S, VIEW_H * S);
  const [far, f] = canvas(TILE_LAYER_W * S, VIEW_H * S);
  const [mid, m] = canvas(TILE_LAYER_W * S, VIEW_H * S);
  s.scale(S, S);
  f.scale(S, S);
  m.scale(S, S);
  const r = rng(1000 + levelIndex * 77);

  // ---- layer 0: sky gradient + accent glow
  const g = s.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, mix(th.backdrop, '#000000', 0.45));
  g.addColorStop(0.7, th.backdrop);
  g.addColorStop(1, mix(th.backdrop, th.accent, 0.25));
  s.fillStyle = g;
  s.fillRect(0, 0, VIEW_W, VIEW_H);
  const glow = s.createRadialGradient(VIEW_W * 0.62, GROUND_Y - 30, 10, VIEW_W * 0.62, GROUND_Y - 30, 520);
  glow.addColorStop(0, hexA(th.accent, 0.35));
  glow.addColorStop(1, hexA(th.accent, 0));
  s.fillStyle = glow;
  s.fillRect(0, 0, VIEW_W, VIEW_H);

  if (levelIndex === 0 || levelIndex === 2) {
    // stars
    for (let i = 0; i < 90; i++) {
      s.fillStyle = `rgba(244,239,230,${0.15 + r() * 0.35})`;
      s.fillRect(r() * VIEW_W, r() * 260, 1.5, 1.5);
    }
  }
  if (levelIndex === 1) {
    // low sun
    s.fillStyle = hexA(th.accent, 0.75);
    s.beginPath();
    s.arc(VIEW_W * 0.62, GROUND_Y - 60, 70, 0, Math.PI * 2);
    s.fill();
    s.fillStyle = hexA(th.accent, 0.15);
    s.beginPath();
    s.arc(VIEW_W * 0.62, GROUND_Y - 60, 110, 0, Math.PI * 2);
    s.fill();
  }
  if (levelIndex === 2) {
    s.fillStyle = 'rgba(244,239,230,0.55)';
    s.beginPath();
    s.arc(760, 90, 26, 0, Math.PI * 2);
    s.fill();
  }
  if (levelIndex === 3) {
    // storm clouds
    for (let i = 0; i < 26; i++) {
      s.fillStyle = hexA(mix(th.backdrop, '#000000', 0.3), 0.5);
      s.beginPath();
      s.ellipse(r() * VIEW_W, 40 + r() * 140, 80 + r() * 120, 20 + r() * 26, 0, 0, Math.PI * 2);
      s.fill();
    }
  }

  const BRIDGE_DECK_Y = GROUND_Y - 26;

  // ---- layer 1: far silhouettes
  f.fillStyle = th.far;
  if (levelIndex === 0 || levelIndex === 1) {
    for (let x = 0; x < TILE_LAYER_W; ) {
      const w = 40 + r() * 80;
      const h = 110 + r() * 170;
      const xx = x;
      wrap(xx, w, (px) => {
        f.fillRect(px, GROUND_Y - h, w, h);
        if (r() < 0.3) f.fillRect(px + w / 2 - 2, GROUND_Y - h - 30, 4, 30);
      });
      x += w + r() * 14;
    }
  } else if (levelIndex === 2) {
    f.beginPath();
    f.moveTo(0, GROUND_Y);
    for (let x = 0; x <= TILE_LAYER_W; x += 60) {
      const y = GROUND_Y - 120 - Math.sin((x / TILE_LAYER_W) * Math.PI * 6) * 60 - Math.sin((x / TILE_LAYER_W) * Math.PI * 14) * 25;
      f.lineTo(x, y);
    }
    f.lineTo(TILE_LAYER_W, GROUND_Y);
    f.fill();
  } else if (levelIndex === 3) {
    f.beginPath();
    f.moveTo(0, GROUND_Y);
    for (let x = 0; x <= TILE_LAYER_W; x += 40) {
      f.lineTo(x, GROUND_Y - 70 - Math.sin((x / TILE_LAYER_W) * Math.PI * 4) * 30);
    }
    f.lineTo(TILE_LAYER_W, GROUND_Y);
    f.fill();
  } else {
    for (let x = 0; x < TILE_LAYER_W; x += 50) {
      const rad = 50 + r() * 60;
      wrap(x, rad, (px) => {
        f.beginPath();
        f.arc(px, GROUND_Y - 120 - r() * 60, rad, 0, Math.PI * 2);
        f.fill();
      });
    }
    f.fillRect(0, GROUND_Y - 140, TILE_LAYER_W, 140);
  }

  // ---- layer 2: set pieces
  m.fillStyle = th.mid;
  const win = hexA(th.accent, 0.22);
  if (levelIndex === 0) {
    for (let x = 0; x < TILE_LAYER_W; ) {
      const w = 70 + r() * 90;
      const h = 90 + r() * 150;
      const seedW = r();
      wrap(x, w, (px) => {
        m.fillStyle = th.mid;
        m.fillRect(px, GROUND_Y - h, w, VIEW_H - (GROUND_Y - h));
        m.fillStyle = win;
        const rr = rng(Math.floor(seedW * 1e6));
        for (let wy = GROUND_Y - h + 14; wy < VIEW_H - 8; wy += 22)
          for (let wx = px + 10; wx < px + w - 14; wx += 18) if (rr() < 0.4) m.fillRect(wx, wy, 8, 10);
      });
      x += w + 20 + r() * 60;
    }
  } else if (levelIndex === 1) {
    for (let x = 0; x < TILE_LAYER_W; x += 240 + r() * 160) {
      const xx = x;
      const h = 60 + r() * 80;
      wrap(xx, 140, (px) => {
        m.fillStyle = th.mid;
        m.fillRect(px, GROUND_Y - h, 140, VIEW_H - (GROUND_Y - h));
        // water tower
        m.fillRect(px + 30, GROUND_Y - h - 70, 50, 46);
        m.beginPath();
        m.moveTo(px + 26, GROUND_Y - h - 70);
        m.lineTo(px + 55, GROUND_Y - h - 92);
        m.lineTo(px + 84, GROUND_Y - h - 70);
        m.fill();
        m.fillRect(px + 34, GROUND_Y - h - 24, 4, 24);
        m.fillRect(px + 72, GROUND_Y - h - 24, 4, 24);
        m.fillStyle = win;
        for (let wy = GROUND_Y - h + 12; wy < VIEW_H - 8; wy += 20) for (let wx = px + 12; wx < px + 128; wx += 22) m.fillRect(wx, wy, 10, 8);
      });
    }
  } else if (levelIndex === 2) {
    for (let x = 0; x < TILE_LAYER_W; x += 120) {
      wrap(x, 10, (px) => {
        m.fillStyle = th.mid;
        m.fillRect(px, GROUND_Y - 170, 5, 170);
        m.fillRect(px - 16, GROUND_Y - 164, 37, 4);
      });
    }
    m.strokeStyle = th.mid;
    m.lineWidth = 1.5;
    for (let row = 0; row < 2; row++) {
      m.beginPath();
      for (let x = 0; x <= TILE_LAYER_W; x += 120) {
        m.moveTo(x - 16 + row * 37, GROUND_Y - 162);
        m.quadraticCurveTo(x + 44 + row * 37, GROUND_Y - 140, x + 104 + row * 37, GROUND_Y - 162);
      }
      m.stroke();
    }
    for (let x = 30; x < TILE_LAYER_W; x += 70 + r() * 90) {
      const h = 50 + r() * 70;
      wrap(x, 40, (px) => {
        m.fillStyle = th.mid;
        m.beginPath();
        m.moveTo(px, GROUND_Y);
        m.lineTo(px + 20, GROUND_Y - h);
        m.lineTo(px + 40, GROUND_Y);
        m.fill();
      });
    }
  } else if (levelIndex === 3) {
    for (let x = 200; x < TILE_LAYER_W; x += 960) {
      wrap(x, 60, (px) => {
        m.fillStyle = th.mid;
        m.fillRect(px, 60, 26, GROUND_Y - 60);
        m.fillRect(px + 64, 60, 26, GROUND_Y - 60);
        m.fillRect(px - 6, 60, 102, 16);
        m.fillRect(px - 6, 200, 102, 12);
      });
      // Main cable runs tower to tower; the last span crosses the tile seam,
      // so it is also drawn shifted one tile left to fill the wrap.
      for (const sx of [x, x - TILE_LAYER_W]) {
        m.strokeStyle = th.mid;
        m.lineWidth = 4;
        m.beginPath();
        m.moveTo(sx + 45, 66);
        m.quadraticCurveTo(sx + 525, 420, sx + 1005, 66);
        m.stroke();
        m.lineWidth = 1.5;
        for (let i = 1; i < 16; i++) {
          const t = i / 16;
          const cx = sx + 45 + 960 * t;
          const cy = (1 - t) * (1 - t) * 66 + 2 * (1 - t) * t * 420 + t * t * 66;
          m.beginPath();
          m.moveTo(cx, cy);
          m.lineTo(cx, BRIDGE_DECK_Y);
          m.stroke();
        }
      }
    }
    // the deck the hangers hold up
    m.fillStyle = th.mid;
    m.fillRect(0, BRIDGE_DECK_Y, TILE_LAYER_W, 12);
  } else {
    // temple columns and a stepped pyramid
    for (let x = 0; x < TILE_LAYER_W; x += 960) {
      wrap(x + 300, 420, (px) => {
        m.fillStyle = th.mid;
        for (let i = 0; i < 6; i++) m.fillRect(px + i * 30, GROUND_Y - 60 - i * 40, 420 - i * 60, 40);
        m.fillRect(px + 170, GROUND_Y - 320, 80, 50);
      });
    }
    for (let x = 40; x < TILE_LAYER_W; x += 180 + r() * 120) {
      const h = 120 + r() * 120;
      wrap(x, 40, (px) => {
        m.fillStyle = th.mid;
        m.fillRect(px, GROUND_Y - h, 34, h);
        m.fillRect(px - 6, GROUND_Y - h, 46, 12);
        m.fillRect(px - 6, GROUND_Y - 14, 46, 14);
      });
    }
  }
  // Gaps in the floor look straight through to these layers, so the scenery
  // has to carry on below the floor line. Silhouettes that stop at the floor
  // are continued downward by stretching their bottom row (buildings and
  // towers keep going, hills fill in). Levels 0-1 draw their own mid layer
  // down to the bottom, windows included.
  const extend = (cv: HTMLCanvasElement, c: CanvasRenderingContext2D): void => {
    c.drawImage(cv, 0, (GROUND_Y - 1) * S, cv.width, S, 0, GROUND_Y, TILE_LAYER_W, VIEW_H - GROUND_Y);
  };
  extend(far, f);
  if (levelIndex >= 2) extend(mid, m);

  return { sky, far, mid };
}
