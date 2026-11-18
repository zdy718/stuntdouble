// Small drawing helpers shared by the HUD and the menus.

import { C } from '../Themes';

export const DISPLAY = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';
export const MONO = '"Space Mono", Menlo, Consolas, monospace';

export type Ctx = CanvasRenderingContext2D;

export function text(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  size: number,
  opts: { font?: 'display' | 'mono'; color?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline; alpha?: number; spacing?: number; maxW?: number } = {},
): number {
  ctx.save();
  ctx.font = `${opts.font === 'mono' ? '400' : '400'} ${size}px ${opts.font === 'mono' ? MONO : DISPLAY}`;
  ctx.fillStyle = opts.color ?? C.text;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.base ?? 'alphabetic';
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  if (opts.spacing) (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${opts.spacing}px`;
  if (opts.maxW) ctx.fillText(str, x, y, opts.maxW);
  else ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string = C.charcoal, r = 8): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.black;
  ctx.stroke();
}

/** Diagonal black/cream stripes inside a rect (the clapper sticks). */
export function stripes(ctx: Ctx, x: number, y: number, w: number, h: number, step = 22, light: string = C.text): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = C.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = light;
  for (let i = -h; i < w + h; i += step * 2) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + step, y + h);
    ctx.lineTo(x + i + step + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A clapperboard. `open` is the clapper stick angle in radians (0 = shut).
 * Returns the inner body rect for the caller to write on.
 */
export function clapperboard(ctx: Ctx, x: number, y: number, w: number, h: number, open: number): { x: number; y: number; w: number; h: number } {
  const stickH = Math.max(10, h * 0.2);
  // body
  ctx.fillStyle = C.charcoal;
  ctx.fillRect(x, y + stickH, w, h - stickH);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.black;
  ctx.strokeRect(x, y + stickH, w, h - stickH);
  // lower stick (fixed)
  stripes(ctx, x, y + stickH, w, stickH * 0.8, stickH * 0.9);
  ctx.strokeRect(x, y + stickH, w, stickH * 0.8);
  // upper stick (hinged at the left)
  ctx.save();
  ctx.translate(x, y + stickH);
  ctx.rotate(-open);
  stripes(ctx, 0, -stickH, w, stickH * 0.9, stickH * 0.9);
  ctx.strokeRect(0, -stickH, w, stickH * 0.9);
  ctx.restore();
  return { x: x + 8, y: y + stickH * 1.8 + 4, w: w - 16, h: h - stickH * 1.8 - 8 };
}

export function star(ctx: Ctx, cx: number, cy: number, r: number, filled: boolean, scale = 1): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? C.gold : C.charcoal;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.black;
  ctx.stroke();
  ctx.restore();
}

/** The Perfect Take badge: a small gold clapperboard. */
export function perfectBadge(ctx: Ctx, x: number, y: number, s = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, 8, 30, 20);
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(0, 8, 30, 20);
  ctx.save();
  ctx.translate(0, 8);
  ctx.rotate(-0.35);
  stripes(ctx, 0, -7, 30, 6, 6, C.gold);
  ctx.strokeRect(0, -7, 30, 6);
  ctx.restore();
  ctx.restore();
}

export interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtScore(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export const ease = {
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
};

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
