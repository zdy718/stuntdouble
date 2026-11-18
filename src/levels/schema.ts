// Level data format + validator.
//
// Levels are authored in beats rather than pixels: x = beat * pixelsPerBeat,
// where pixelsPerBeat = speed * 60 / bpm. Changing tempo or speed therefore
// rescales the spacing automatically.

import { JUMP_SPEED, GRAVITY, SUPPORT_W } from '../game/constants';

export type ObstacleType =
  | 'crate'
  | 'barrel'
  | 'gap'
  | 'spikes'
  | 'lowSign'
  | 'rope'
  | 'heli'
  | 'crane'
  | 'tiles'
  | 'darts';

export type Category = 'jump' | 'duck' | 'grab' | 'floor';

export interface ObstacleDef {
  /** Leading edge (crane: pivot) in beats from scene start. */
  beat: number;
  type: ObstacleType;
  /** Width in px for gaps / spikes / rope gaps. */
  width?: number;
  /** Number of 96 px tiles for a falling tile run. */
  count?: number;
  /** Cosmetic variant: 'sign' | 'antenna' | 'laundry' | 'signal' | 'vine' ... */
  style?: string;
  /** Crane: phase offset in seconds. Darts: phase offset in beats. */
  phase?: number;
  /** Tutorial prompt shown as the obstacle approaches. */
  prompt?: string;
}

export interface SceneDef {
  id: 'A' | 'B';
  /** Scene length in beats. */
  length: number;
  /** Speed (and music tempo) multiplier for this scene: the in-level ramp. */
  speedFactor?: number;
  /** Dark tunnel stretches, [fromBeat, toBeat]. */
  dark?: [number, number][];
  /** Beat from which the set collapses behind the player (cosmetic). */
  collapse?: number;
  obstacles: ObstacleDef[];
}

export interface LevelDef {
  id: number;
  name: string;
  trope: string;
  bpm: number;
  speed: number;
  par: number;
  /** True once the grab action is unlocked (level 3 onward). */
  grab: boolean;
  /** Chasing boulder behind the player (cosmetic pace marker). */
  boulder?: boolean;
  scenes: SceneDef[];
}

export const TILE_W = 96;
export const DART_W = 180;
export const SIGN_W = 120;
export const CRANE_REACH = 230; // half-width swept by a crane hook
export const ROPE_OFFSET = 30; // rope hangs this far into its gap
export const HELI_OFFSET = 40;

export const DEFAULT_WIDTH: Partial<Record<ObstacleType, number>> = {
  crate: 56,
  barrel: 56,
  gap: 160,
  spikes: 200,
  lowSign: SIGN_W,
  rope: 360,
  darts: DART_W,
};

export function categoryOf(type: ObstacleType): Category {
  switch (type) {
    case 'crate':
    case 'barrel':
    case 'gap':
    case 'spikes':
      return 'jump';
    case 'lowSign':
    case 'darts':
    case 'crane':
      return 'duck';
    case 'rope':
    case 'heli':
      return 'grab';
    case 'tiles':
      return 'floor';
  }
}

export function pixelsPerBeat(level: Pick<LevelDef, 'speed' | 'bpm'>): number {
  return (level.speed * 60) / level.bpm;
}

/** Horizontal extent of an obstacle in scene pixels (0 = scene start). */
export function extentOf(o: ObstacleDef, ppb: number, sceneLengthPx: number): [number, number] {
  const x = o.beat * ppb;
  switch (o.type) {
    case 'crane':
      return [x - CRANE_REACH, x + CRANE_REACH];
    case 'tiles':
      return [x, x + (o.count ?? 4) * TILE_W];
    case 'heli':
      return [x, sceneLengthPx];
    default:
      return [x, x + (o.width ?? DEFAULT_WIDTH[o.type] ?? 56)];
  }
}

/** Air time of a full jump. */
export const JUMP_AIR_TIME = (2 * JUMP_SPEED) / GRAVITY;

/** Widest gap a full jump can clear with a comfortable timing window. */
export function maxJumpableGap(speed: number): number {
  return speed * 0.5 + SUPPORT_W;
}

/** Rough distance from the grab point to the landing after a rope carry. */
export function grabLandingDistance(speed: number): number {
  return speed * 1.45;
}

export interface Spacing {
  clear: number; // min px between end of previous and start of next, in beats
  startToStart?: number; // in beats
}

/** Minimum spacing rules, in beats, keyed "prev>next" by category. */
export const SPACING: Record<string, Spacing> = {
  'jump>jump': { clear: 1.6, startToStart: 2 },
  'jump>duck': { clear: 2.0, startToStart: 2.5 },
  'duck>jump': { clear: 1.2 },
  'duck>duck': { clear: 0.75 },
  'jump>grab': { clear: 1.6 },
  'duck>grab': { clear: 1.5 },
};

/**
 * Returns a list of human-readable problems. An empty list means the level is
 * valid. The game refuses to load invalid levels, so authoring mistakes are
 * caught at load time instead of when a player gets stuck.
 */
export function validateLevel(level: LevelDef): string[] {
  const errors: string[] = [];
  const ppb = pixelsPerBeat(level);
  if (level.scenes.length !== 2) errors.push(`level ${level.id}: expected 2 scenes`);

  for (const scene of level.scenes) {
    const tag = `level ${level.id} scene ${scene.id}`;
    const speed = level.speed * (scene.speedFactor ?? 1);
    const lengthPx = scene.length * ppb;
    const obs = [...scene.obstacles].sort((a, b) => extentOf(a, ppb, lengthPx)[0] - extentOf(b, ppb, lengthPx)[0]);

    for (const o of obs) {
      const [s, e] = extentOf(o, ppb, lengthPx);
      if (o.beat < 6) errors.push(`${tag}: ${o.type}@${o.beat} starts before beat 6 (no time to read it)`);
      if (o.type !== 'heli' && e > lengthPx - 2 * ppb)
        errors.push(`${tag}: ${o.type}@${o.beat} ends too close to the end of the scene`);
      if ((o.type === 'rope' || o.type === 'heli') && !level.grab)
        errors.push(`${tag}: ${o.type}@${o.beat} used before grab is unlocked`);
      if ((o.type === 'gap' || o.type === 'spikes') && e - s > maxJumpableGap(speed))
        errors.push(`${tag}: ${o.type}@${o.beat} is ${e - s}px wide, max jumpable is ${Math.floor(maxJumpableGap(speed))}px`);
      if (o.type === 'rope' && e - s <= maxJumpableGap(speed) + 20)
        errors.push(`${tag}: rope gap @${o.beat} is narrow enough to jump; widen it so the grab is required`);
      if (o.type === 'rope' && e - s > grabLandingDistance(speed) + ROPE_OFFSET - 60)
        errors.push(`${tag}: rope gap @${o.beat} is too wide to land after the carry`);
    }

    // Floor tiles must not overlap gaps.
    const tiles = obs.filter((o) => o.type === 'tiles');
    for (const t of tiles) {
      const [ts, te] = extentOf(t, ppb, lengthPx);
      for (const o of obs) {
        if (o === t || !['gap', 'spikes', 'rope', 'heli', 'tiles'].includes(o.type)) continue;
        const [s, e] = extentOf(o, ppb, lengthPx);
        if (s < te && e > ts) errors.push(`${tag}: tiles@${t.beat} overlap ${o.type}@${o.beat}`);
      }
    }

    // Pairwise spacing between consecutive action hazards.
    const action = obs.filter((o) => categoryOf(o.type) !== 'floor');
    for (let i = 1; i < action.length; i++) {
      const prev = action[i - 1];
      const next = action[i];
      const [ps, pe] = extentOf(prev, ppb, lengthPx);
      const [ns] = extentOf(next, ppb, lengthPx);
      const pc = categoryOf(prev.type);
      const nc = categoryOf(next.type);
      const label = `${tag}: ${prev.type}@${prev.beat} -> ${next.type}@${next.beat}`;

      if (pc === 'grab') {
        if (prev.type === 'heli') {
          errors.push(`${label}: nothing may follow the helicopter`);
          continue;
        }
        const need = ps + ROPE_OFFSET + grabLandingDistance(speed) + ppb;
        if (ns < need) errors.push(`${label}: needs ${Math.ceil((need - ns) / ppb * 100) / 100} more beats after the carry`);
        continue;
      }
      const rule = SPACING[`${pc}>${nc}`];
      if (!rule) continue;
      const clear = (ns - pe) / ppb;
      if (clear < rule.clear - 1e-6) errors.push(`${label}: clearance ${clear.toFixed(2)} beats < ${rule.clear}`);
      if (rule.startToStart && (ns - ps) / ppb < rule.startToStart - 1e-6)
        errors.push(`${label}: start-to-start ${((ns - ps) / ppb).toFixed(2)} beats < ${rule.startToStart}`);
    }

    const last = obs.filter((o) => o.type === 'heli');
    if (last.length > 1) errors.push(`${tag}: at most one helicopter per scene`);
  }
  return errors;
}

/** Number of obstacles that award points (everything in the level data). */
export function obstacleCount(level: LevelDef): number {
  return level.scenes.reduce((n, s) => n + s.obstacles.length, 0);
}
