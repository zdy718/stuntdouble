// In-play HUD: take counter clapperboard, score and multiplier, film-strip
// progress bar and a timecode.

import { VIEW_W } from '../constants';
import { C, hexA } from '../Themes';
import { Ctx, clapperboard, ease, fmtScore, pad2, roundRect, text } from './draw';

export interface HudState {
  take: number;
  takePulse: number; // 0..1, decays after a new take
  score: number;
  mult: number;
  multPulse: number; // 0..1, decays after a combo step
  progress: number; // 0..1 across the whole level
  sceneSplit: number; // where scene B begins on the bar (0..1)
  sceneId: string;
  levelId: number;
  sceneTime: number;
  levelName: string;
}

export function drawHud(ctx: Ctx, h: HudState): void {
  // --- take counter (top left)
  const tp = h.takePulse;
  ctx.save();
  ctx.translate(16, 12);
  const s = 1 + tp * 0.15;
  ctx.scale(s, s);
  const inner = clapperboard(ctx, 0, 0, 132, 66, tp * 0.5);
  text(ctx, `TAKE ${pad2(h.take)}`, inner.x + inner.w / 2, inner.y + inner.h - 2, 30, { align: 'center', color: C.text });
  ctx.restore();

  // --- timecode (top centre)
  const t = h.sceneTime;
  const tc = `${pad2(h.levelId)}${h.sceneId}  ${pad2(Math.floor(t / 60))}:${pad2(Math.floor(t) % 60)}:${pad2(Math.floor((t % 1) * 24))}`;
  ctx.save();
  roundRect(ctx, VIEW_W / 2 - 92, 14, 184, 26, 4);
  ctx.fillStyle = hexA(C.charcoal, 0.75);
  ctx.fill();
  ctx.restore();
  text(ctx, tc, VIEW_W / 2, 32, 13, { font: 'mono', align: 'center', color: C.text });
  ctx.fillStyle = C.red;
  if (Math.floor(t * 2) % 2 === 0) {
    ctx.beginPath();
    ctx.arc(VIEW_W / 2 - 78, 27, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- score and multiplier (top right)
  text(ctx, fmtScore(h.score), VIEW_W - 18, 52, 46, { align: 'right', color: C.text });
  ctx.save();
  ctx.font = `46px "Bebas Neue", Impact, sans-serif`;
  const sw = ctx.measureText(fmtScore(h.score)).width;
  ctx.restore();
  const mp = h.multPulse;
  const ms = 1 + ease.outCubic(mp) * 0.6;
  ctx.save();
  ctx.translate(VIEW_W - 30 - sw - 28, 40);
  ctx.scale(ms, ms);
  roundRect(ctx, -24, -18, 48, 30, 6);
  ctx.fillStyle = h.mult > 1 ? C.gold : C.charcoal;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.black;
  ctx.stroke();
  text(ctx, `x${h.mult}`, 0, 8, 26, { align: 'center', color: h.mult > 1 ? C.black : C.text });
  if (mp > 0) {
    ctx.globalAlpha = mp;
    ctx.fillStyle = '#fff';
    roundRect(ctx, -24, -18, 48, 30, 6);
    ctx.fill();
  }
  ctx.restore();

  drawFilmStrip(ctx, h.progress, h.sceneSplit);
}

export function drawFilmStrip(ctx: Ctx, progress: number, split: number): void {
  const x = 170;
  const w = VIEW_W - 340;
  const y = 508;
  const hgt = 22;
  ctx.fillStyle = C.charcoal;
  ctx.fillRect(x, y, w, hgt);
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, hgt);
  // exposed film
  ctx.fillStyle = hexA(C.text, 0.18);
  ctx.fillRect(x + 2, y + 6, (w - 4) * progress, hgt - 12);
  // sprocket holes
  ctx.fillStyle = hexA(C.text, 0.55);
  for (let i = x + 6; i < x + w - 6; i += 14) {
    ctx.fillRect(i, y + 2, 6, 3);
    ctx.fillRect(i, y + hgt - 5, 6, 3);
  }
  // scene A/B tick
  const sx = x + w * split;
  ctx.fillStyle = C.gold;
  ctx.fillRect(sx - 1.5, y - 5, 3, hgt + 10);
  text(ctx, 'A', x + 8, y + hgt - 7, 13, { font: 'mono', color: C.text, alpha: 0.8 });
  text(ctx, 'B', sx + 6, y + hgt - 7, 13, { font: 'mono', color: C.text, alpha: 0.8 });
  // marker in the performer's colour
  const mx = x + w * progress;
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.moveTo(mx, y - 2);
  ctx.lineTo(mx - 7, y - 12);
  ctx.lineTo(mx + 7, y - 12);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.black;
  ctx.stroke();
  ctx.fillRect(mx - 1.5, y, 3, hgt);
}
