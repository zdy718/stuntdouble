// Title, menus, scene cards, the CUT! moment, level clear and the wrap party.

import { VIEW_H, VIEW_W } from '../constants';
import { LevelDef } from '../../levels/schema';
import { LevelRecord, Settings } from '../Save';
import { C, THEMES, hexA } from '../Themes';
import { Button, Ctx, clamp01, clapperboard, ease, fmtScore, pad2, panel, perfectBadge, roundRect, star, stripes, text } from './draw';

export interface MenuItem {
  id: string;
  label: string;
  value?: string;
  disabled?: boolean;
}

export function menuList(ctx: Ctx, items: MenuItem[], sel: number, cx: number, y: number, w: number, buttons: Button[], rowH = 46): void {
  items.forEach((it, i) => {
    const yy = y + i * rowH;
    const active = i === sel;
    const x = cx - w / 2;
    roundRect(ctx, x, yy, w, rowH - 8, 6);
    ctx.fillStyle = active ? C.gold : hexA(C.charcoal, 0.9);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.black;
    ctx.stroke();
    const col = it.disabled ? hexA(C.text, 0.35) : active ? C.black : C.text;
    if (it.value !== undefined) {
      text(ctx, it.label, x + 18, yy + rowH - 18, 26, { color: col });
      text(ctx, it.value, x + w - 18, yy + rowH - 19, 15, { font: 'mono', align: 'right', color: col });
    } else {
      text(ctx, it.label, cx, yy + rowH - 18, 28, { align: 'center', color: col, spacing: 1 });
    }
    buttons.push({ x, y: yy, w, h: rowH - 8, id: `item:${i}` });
  });
}

export function slider(v: number): string {
  const n = Math.round(v * 10);
  return '|'.repeat(n) + '.'.repeat(10 - n) + `  ${pad2(Math.round(v * 100))}%`.replace(/^ +/, ' ');
}

// ---------------------------------------------------------------- title

export function drawTitle(ctx: Ctx, t: number, needKey: boolean): void {
  ctx.fillStyle = hexA(C.black, 0.45);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const drop = ease.outBack(clamp01(t / 0.7));
  ctx.save();
  ctx.translate(VIEW_W / 2, 170 - (1 - drop) * 120);
  ctx.rotate(-0.04);
  stripes(ctx, -330, -96, 660, 22, 22);
  text(ctx, 'STUNT DOUBLE', 0, 30, 132, { align: 'center', color: C.text, spacing: 4 });
  text(ctx, 'STUNT DOUBLE', 0, 30, 132, { align: 'center', color: hexA(C.orange, 0.0) });
  stripes(ctx, -330, 52, 660, 22, 22);
  ctx.restore();
  text(ctx, 'FIVE ACTION SEQUENCES  -  AS FEW TAKES AS POSSIBLE', VIEW_W / 2, 282, 16, { font: 'mono', align: 'center', color: C.text, alpha: 0.85 });
  if (needKey && Math.floor(t * 1.6) % 2 === 0) {
    text(ctx, 'PRESS ANY KEY TO ROLL CAMERA', VIEW_W / 2, 350, 34, { align: 'center', color: C.gold, spacing: 2 });
  }
}

export function drawControls(ctx: Ctx, y: number): void {
  const items = [
    ['SPACE / UP / W', 'JUMP (hold = higher)'],
    ['DOWN / S', 'DUCK (hold)'],
    ['E / SHIFT', 'GRAB (level 3+)'],
    ['R', 'RETAKE'],
    ['ESC / P', 'PAUSE'],
  ];
  const w = VIEW_W - 80;
  roundRect(ctx, 40, y, w, 40, 6);
  ctx.fillStyle = hexA(C.charcoal, 0.85);
  ctx.fill();
  const colW = w / items.length;
  items.forEach(([k, v], i) => {
    const cx = 40 + colW * i + colW / 2;
    text(ctx, k, cx, y + 17, 12, { font: 'mono', align: 'center', color: C.gold });
    text(ctx, v, cx, y + 33, 11, { font: 'mono', align: 'center', color: C.text, alpha: 0.85 });
  });
}

// ---------------------------------------------------------------- level select

export function drawLevelSelect(
  ctx: Ctx,
  levels: LevelDef[],
  records: Record<string, LevelRecord>,
  unlocked: (id: number) => boolean,
  sel: number,
  total: number,
  title: string,
  t: number,
  buttons: Button[],
): void {
  ctx.fillStyle = hexA(C.black, 0.5);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, 'THE SHOOTING SCHEDULE', VIEW_W / 2, 62, 48, { align: 'center', spacing: 2 });
  const cw = 168;
  const gap = 12;
  const x0 = (VIEW_W - (cw * 5 + gap * 4)) / 2;
  levels.forEach((lv, i) => {
    const x = x0 + i * (cw + gap);
    const active = i === sel;
    const y = 96 + (active ? -8 : 0);
    const open = unlocked(lv.id);
    const rec = records[String(lv.id)];
    const th = THEMES[i];
    ctx.save();
    roundRect(ctx, x, y, cw, 300, 8);
    ctx.fillStyle = th.backdrop;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + 300);
    g.addColorStop(0, hexA(th.accent, 0.0));
    g.addColorStop(1, hexA(th.accent, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, cw, 300);
    ctx.fillStyle = th.mid;
    for (let k = 0; k < 6; k++) ctx.fillRect(x + k * 30, y + 190 - ((k * 37 + i * 11) % 60), 24, 120);
    ctx.fillStyle = th.ground;
    ctx.fillRect(x, y + 250, cw, 50);
    ctx.restore();
    roundRect(ctx, x, y, cw, 300, 8);
    ctx.lineWidth = active ? 5 : 3;
    ctx.strokeStyle = active ? C.gold : C.black;
    ctx.stroke();
    text(ctx, `SEQUENCE ${lv.id}`, x + 12, y + 26, 14, { font: 'mono', color: C.text, alpha: 0.8 });
    text(ctx, lv.name.toUpperCase(), x + 12, y + 62, 32, { color: C.text, maxW: cw - 24 });
    text(ctx, lv.trope, x + 12, y + 82, 12, { font: 'mono', color: C.text, alpha: 0.75 });
    text(ctx, `PAR ${lv.par} TAKE${lv.par > 1 ? 'S' : ''}`, x + 12, y + 102, 12, { font: 'mono', color: C.gold });
    if (!open) {
      ctx.fillStyle = hexA(C.black, 0.6);
      roundRect(ctx, x, y, cw, 300, 8);
      ctx.fill();
      text(ctx, 'LOCKED', x + cw / 2, y + 170, 34, { align: 'center', color: C.text, alpha: 0.7 });
      text(ctx, `wrap sequence ${lv.id - 1}`, x + cw / 2, y + 192, 12, { font: 'mono', align: 'center', color: C.text, alpha: 0.6 });
    } else {
      for (let s = 0; s < 3; s++) star(ctx, x + 40 + s * 44, y + 222, 15, !!rec && rec.bestStars > s);
      text(ctx, rec ? `BEST ${fmtScore(rec.bestScore)}` : 'NOT SHOT YET', x + cw / 2, y + 272, 13, { font: 'mono', align: 'center', color: C.text });
      if (rec) text(ctx, `${rec.bestTakes} take${rec.bestTakes > 1 ? 's' : ''}`, x + cw / 2, y + 290, 11, { font: 'mono', align: 'center', color: C.text, alpha: 0.7 });
      if (rec?.perfect) perfectBadge(ctx, x + cw - 44, y + 10, 1);
    }
    ctx.restore();
    buttons.push({ x, y, w: cw, h: 300, id: `level:${i}` });
  });
  roundRect(ctx, VIEW_W / 2 - 220, 418, 440, 50, 8);
  ctx.fillStyle = hexA(C.charcoal, 0.9);
  ctx.fill();
  star(ctx, VIEW_W / 2 - 190, 443, 13, true);
  text(ctx, `${total} / 15`, VIEW_W / 2 - 168, 452, 26, { color: C.text });
  text(ctx, title.toUpperCase(), VIEW_W / 2 + 200, 452, 26, { align: 'right', color: C.gold });
  text(ctx, 'LEFT / RIGHT choose   ENTER shoot   ESC back', VIEW_W / 2, 500, 13, { font: 'mono', align: 'center', color: C.text, alpha: 0.7 + Math.sin(t * 3) * 0.1 });
}

// ---------------------------------------------------------------- scene card

export function drawSceneCard(ctx: Ctx, level: LevelDef, sceneId: string, take: number, age: number, dur: number): void {
  const inK = ease.outBack(clamp01(age / 0.35));
  const outK = clamp01((age - (dur - 0.2)) / 0.2);
  const snap = age < 0.35 ? 0.2 : age < 0.45 ? 0.2 * (1 - (age - 0.35) / 0.1) : 0;
  ctx.fillStyle = hexA(C.black, 0.55 * (1 - outK));
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.globalAlpha = 1 - outK;
  ctx.translate(VIEW_W / 2, VIEW_H / 2 + (1 - inK) * 300);
  ctx.rotate(-0.03);
  const w = 520;
  const h = 300;
  const inner = clapperboard(ctx, -w / 2, -h / 2, w, h, snap);
  const rows: [string, string][] = [
    ['PROD.', 'STUNT DOUBLE'],
    ['SEQUENCE', `${level.id}  ${level.name.toUpperCase()}`],
  ];
  ctx.strokeStyle = hexA(C.text, 0.35);
  ctx.lineWidth = 2;
  let y = inner.y + 6;
  for (const [k, v] of rows) {
    text(ctx, k, inner.x + 10, y + 26, 14, { font: 'mono', color: C.text, alpha: 0.7 });
    text(ctx, v, inner.x + 130, y + 30, 34, { color: C.text });
    y += 48;
    ctx.beginPath();
    ctx.moveTo(inner.x, y);
    ctx.lineTo(inner.x + inner.w, y);
    ctx.stroke();
  }
  const third = inner.w / 3;
  const cells: [string, string][] = [
    ['SCENE', sceneId],
    ['TAKE', pad2(take)],
    ['PAR', String(level.par)],
  ];
  // Centre the big values in the space between the cell labels and the
  // bottom of the board (Bebas caps/digits are ~0.7em tall above the baseline).
  const bottom = inner.y + inner.h;
  const labelBottom = y + 30;
  const valueSize = Math.min(64, (bottom - labelBottom) * 1.1);
  const valueBase = (labelBottom + bottom) / 2 + valueSize * 0.35;
  cells.forEach(([k, v], i) => {
    const cx = inner.x + third * i;
    text(ctx, k, cx + 10, y + 24, 14, { font: 'mono', color: C.text, alpha: 0.7 });
    text(ctx, v, cx + third / 2, valueBase, valueSize, { align: 'center', color: k === 'TAKE' ? C.gold : C.text });
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, inner.y + inner.h);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// ---------------------------------------------------------------- CUT!

export function drawCut(ctx: Ctx, t: number, take: number): void {
  const k = clamp01((t - 0.05) / 0.15);
  if (k <= 0) return;
  const s = 2.6 - 1.6 * ease.outCubic(k);
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2 - 20);
  ctx.rotate(-0.12);
  ctx.scale(s, s);
  ctx.globalAlpha = k;
  roundRect(ctx, -170, -70, 340, 130, 10);
  ctx.lineWidth = 8;
  ctx.strokeStyle = C.red;
  ctx.stroke();
  text(ctx, 'CUT!', 0, 46, 150, { align: 'center', color: C.red, spacing: 6 });
  ctx.restore();
  if (t > 0.3) text(ctx, `TAKE ${pad2(take + 1)} COMING UP`, VIEW_W / 2, 400, 18, { font: 'mono', align: 'center', color: C.text, alpha: clamp01((t - 0.3) / 0.15) });
}

// ---------------------------------------------------------------- pause

export function drawPause(ctx: Ctx, items: MenuItem[], sel: number, buttons: Button[]): void {
  ctx.fillStyle = hexA(C.black, 0.65);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const inner = clapperboard(ctx, VIEW_W / 2 - 180, 70, 360, 120, 0.25);
  text(ctx, 'HOLD THE ROLL', inner.x + inner.w / 2, inner.y + 48, 44, { align: 'center' });
  menuList(ctx, items, sel, VIEW_W / 2, 214, 320, buttons);
}

// ---------------------------------------------------------------- scene / level clear

export function drawSceneClear(ctx: Ctx, sceneId: string, points: number, age: number): void {
  const k = ease.outBack(clamp01(age / 0.3));
  ctx.fillStyle = hexA(C.black, 0.35);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(VIEW_W / 2, 230);
  ctx.scale(k, k);
  text(ctx, `SCENE ${sceneId}`, 0, -30, 36, { align: 'center', color: C.text });
  text(ctx, "THAT'S A PRINT!", 0, 40, 84, { align: 'center', color: C.gold, spacing: 2 });
  text(ctx, `+${fmtScore(points)}`, 0, 92, 34, { align: 'center', color: C.text });
  ctx.restore();
}

export interface LevelClearData {
  level: LevelDef;
  takes: number;
  stars: number;
  result: string;
  scenePoints: number[];
  bonus: number;
  total: number;
  perfect: boolean;
  newBest: boolean;
}

export const STAR_GAP = 0.4;

export function drawLevelClear(ctx: Ctx, d: LevelClearData, age: number, isLast: boolean, buttons: Button[], sel: number): void {
  ctx.fillStyle = hexA(C.black, 0.6);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 150, 40, VIEW_W - 300, 450, hexA(C.charcoal, 0.96), 10);
  text(ctx, `SEQUENCE ${d.level.id}  -  ${d.level.name.toUpperCase()}`, VIEW_W / 2, 84, 30, { align: 'center' });
  text(ctx, "IT'S A WRAP", VIEW_W / 2, 138, 58, { align: 'center', color: C.gold, spacing: 2 });
  for (let i = 0; i < 3; i++) {
    const at = 0.45 + i * STAR_GAP;
    const k = clamp01((age - at) / 0.25);
    const filled = i < d.stars && k > 0;
    star(ctx, VIEW_W / 2 - 80 + i * 80, 200, 30, filled, filled ? ease.outBack(k) * 1 + 0.0001 : 1);
  }
  const after = 0.45 + 3 * STAR_GAP;
  const a = clamp01((age - after) / 0.3);
  ctx.save();
  ctx.globalAlpha = a;
  text(ctx, d.result.toUpperCase(), VIEW_W / 2, 266, 36, { align: 'center', color: C.text });
  text(ctx, `${d.takes} take${d.takes > 1 ? 's' : ''}  (par ${d.level.par})`, VIEW_W / 2, 290, 15, { font: 'mono', align: 'center', color: C.text, alpha: 0.8 });
  const rows: [string, string][] = [
    ['Scene A', fmtScore(d.scenePoints[0] ?? 0)],
    ['Scene B', fmtScore(d.scenePoints[1] ?? 0)],
    ['Wrap bonus', fmtScore(d.bonus)],
  ];
  rows.forEach(([k, v], i) => {
    const y = 326 + i * 22;
    text(ctx, k, VIEW_W / 2 - 150, y, 14, { font: 'mono', color: C.text, alpha: 0.8 });
    text(ctx, v, VIEW_W / 2 + 150, y, 14, { font: 'mono', align: 'right', color: C.text });
  });
  ctx.fillStyle = hexA(C.text, 0.3);
  ctx.fillRect(VIEW_W / 2 - 150, 384, 300, 2);
  text(ctx, 'TOTAL', VIEW_W / 2 - 150, 412, 26, { color: C.text });
  text(ctx, fmtScore(d.total), VIEW_W / 2 + 150, 412, 30, { align: 'right', color: C.gold });
  if (d.newBest) text(ctx, 'NEW BEST', VIEW_W / 2 + 150, 428, 11, { font: 'mono', align: 'right', color: C.gold });
  if (d.perfect) {
    perfectBadge(ctx, 200, 170, 2);
    text(ctx, 'PERFECT', 230, 248, 18, { align: 'center', color: C.gold });
    text(ctx, 'TAKE', 230, 266, 18, { align: 'center', color: C.gold });
  }
  ctx.restore();
  if (a >= 1) {
    const items: MenuItem[] = [
      { id: 'next', label: isLast ? 'WRAP PARTY' : 'NEXT SEQUENCE' },
      { id: 'again', label: 'RESHOOT' },
      { id: 'select', label: 'SCHEDULE' },
    ];
    const bw = 190;
    items.forEach((it, i) => {
      const x = VIEW_W / 2 - (bw * 3 + 20) / 2 + i * (bw + 10);
      const y = 440;
      roundRect(ctx, x, y, bw, 38, 6);
      ctx.fillStyle = i === sel ? C.gold : C.black;
      ctx.fill();
      text(ctx, it.label, x + bw / 2, y + 28, 24, { align: 'center', color: i === sel ? C.black : C.text });
      buttons.push({ x, y, w: bw, h: 38, id: `item:${i}` });
    });
  }
}

// ---------------------------------------------------------------- wrap party

export interface ResultsData {
  takes: number;
  stars: number;
  title: string;
  score: number;
  perLevel: { name: string; stars: number; takes: number; perfect: boolean }[];
}

export function drawResults(ctx: Ctx, d: ResultsData, age: number): void {
  ctx.fillStyle = hexA(C.black, 0.55);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const k = ease.outBack(clamp01(age / 0.5));
  ctx.save();
  ctx.translate(VIEW_W / 2, 90);
  ctx.scale(k, k);
  text(ctx, 'WRAP PARTY', 0, 0, 84, { align: 'center', color: C.gold, spacing: 4 });
  ctx.restore();
  text(ctx, "That's a wrap on Stunt Double. Thanks for the stunts.", VIEW_W / 2, 124, 14, { font: 'mono', align: 'center', alpha: 0.85 });
  d.perLevel.forEach((l, i) => {
    const y = 162 + i * 38;
    const a = clamp01((age - 0.4 - i * 0.15) / 0.2);
    ctx.save();
    ctx.globalAlpha = a;
    roundRect(ctx, 220, y, 520, 32, 5);
    ctx.fillStyle = hexA(C.charcoal, 0.9);
    ctx.fill();
    text(ctx, `${i + 1}. ${l.name.toUpperCase()}`, 236, y + 24, 22);
    for (let s = 0; s < 3; s++) star(ctx, 560 + s * 26, y + 16, 9, l.stars > s);
    text(ctx, `${l.takes}T`, 720, y + 22, 13, { font: 'mono', align: 'right' });
    if (l.perfect) perfectBadge(ctx, 520, y + 4, 0.75);
    ctx.restore();
  });
  const a = clamp01((age - 1.4) / 0.4);
  ctx.save();
  ctx.globalAlpha = a;
  text(ctx, `TOTAL TAKES ${d.takes}`, VIEW_W / 2 - 200, 384, 28);
  text(ctx, `${d.stars} / 15 STARS`, VIEW_W / 2 + 200, 384, 28, { align: 'right' });
  text(ctx, d.title.toUpperCase(), VIEW_W / 2, 446, 64, { align: 'center', color: C.gold, spacing: 3 });
  text(ctx, 'PRESS ENTER', VIEW_W / 2, 486, 14, { font: 'mono', align: 'center', alpha: 0.7 });
  ctx.restore();
}

// ---------------------------------------------------------------- settings

export function drawSettings(ctx: Ctx, s: Settings, sel: number, buttons: Button[]): MenuItem[] {
  ctx.fillStyle = hexA(C.black, 0.7);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, 'SETTINGS', VIEW_W / 2, 66, 54, { align: 'center', spacing: 2 });
  const items = settingsItems(s);
  menuList(ctx, items, sel, VIEW_W / 2, 92, 520, buttons, 50);
  text(ctx, 'UP / DOWN choose   LEFT / RIGHT adjust   ENTER toggle   ESC back', VIEW_W / 2, 470, 12, { font: 'mono', align: 'center', alpha: 0.7 });
  return items;
}

export function settingsItems(s: Settings): MenuItem[] {
  return [
    { id: 'master', label: 'MASTER VOLUME', value: slider(s.master) },
    { id: 'music', label: 'MUSIC', value: slider(s.music) },
    { id: 'sfx', label: 'EFFECTS', value: slider(s.sfx) },
    { id: 'muted', label: 'MUTE', value: s.muted ? 'ON' : 'OFF' },
    { id: 'grain', label: 'FILM GRAIN + VIGNETTE', value: s.grain ? 'ON' : 'OFF' },
    { id: 'reduceMotion', label: 'REDUCE MOTION', value: s.reduceMotion ? 'ON' : 'OFF' },
    { id: 'back', label: 'BACK' },
  ];
}
