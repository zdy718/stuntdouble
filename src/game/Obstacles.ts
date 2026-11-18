// Obstacle runtime: hitboxes, holes in the floor, grab handles and timed
// behaviours. Coordinates are scene pixels: x = 0 at scene start, and the
// player's centre is at x = distance travelled.

import { GROUND_Y, HANDLE_Y, HELI_HANDLE_Y, HAZARD_TRIM } from './constants';
import { Box, trim } from './Collision';
import {
  Category,
  CRANE_REACH,
  DART_W,
  HELI_OFFSET,
  ObstacleDef,
  ObstacleType,
  ROPE_OFFSET,
  SIGN_W,
  TILE_W,
  categoryOf,
  extentOf,
} from '../levels/schema';

export const CRANE_PIVOT_Y = 40;
export const CRANE_LEN = 312; // pivot to the top of the hook block
export const CRANE_AMP = 0.7; // radians
export const CRANE_PERIOD = 4; // s
export const CRANE_BLOCK_W = 44;
export const CRANE_BLOCK_H = 40;
export const TILE_DROP_DELAY = 0.5;
export const DART_ACTIVE = 0.6; // fraction of each beat the volley is in the air
export const OVERHEAD_TOP = 200; // overhead hazards reach up out of jump range

export interface Tile {
  x: number;
  trig: number | null;
  dropAt: number | null;
}

export interface Handle {
  x: number;
  y: number;
}

export class ObstacleRT {
  readonly type: ObstacleType;
  readonly cat: Category;
  readonly x0: number;
  readonly x1: number;
  cleared = false;
  closeCall = false;
  nearNow = false;
  grabbed = false;
  perfect = false;
  /** Crane swing angle, updated each step. */
  angle = 0;
  /** Dart volley state, updated each step. */
  dartsActive = false;
  dartPhase = 0;
  tiles: Tile[] = [];
  handle: Handle | null = null;
  private craneT0 = 0;
  private boxes: Box[] = [];

  constructor(
    readonly def: ObstacleDef,
    readonly index: number,
    ppb: number,
    sceneLengthPx: number,
    speed: number,
  ) {
    this.type = def.type;
    this.cat = categoryOf(def.type);
    [this.x0, this.x1] = extentOf(def, ppb, sceneLengthPx);
    if (def.type === 'tiles') {
      const n = def.count ?? 4;
      for (let i = 0; i < n; i++) this.tiles.push({ x: this.x0 + i * TILE_W, trig: null, dropAt: null });
    }
    if (def.type === 'rope') this.handle = { x: this.x0 + ROPE_OFFSET, y: HANDLE_Y };
    if (def.type === 'heli') this.handle = { x: this.x0 + HELI_OFFSET, y: HELI_HANDLE_Y };
    if (def.type === 'crane') {
      // Default phase: the hook sweeps through the bottom of its arc, moving
      // towards the player, exactly when the player reaches the pivot.
      const pivot = def.beat * ppb;
      this.craneT0 = pivot / speed - (def.phase ?? 0);
    }
  }

  get pivotX(): number {
    return this.x0 + CRANE_REACH;
  }

  /** Crane hook block (visual box), world coords. */
  craneBlock(): Box {
    const px = this.x0 + CRANE_REACH;
    const bx = px + CRANE_LEN * Math.sin(this.angle);
    const by = CRANE_PIVOT_Y + CRANE_LEN * Math.cos(this.angle);
    return { x: bx - CRANE_BLOCK_W / 2, y: by, w: CRANE_BLOCK_W, h: CRANE_BLOCK_H };
  }

  /** Called once per fixed step before collision. beat = scene time in beats. */
  update(t: number, beat: number, playerX: number, playerGrounded: boolean, footprint: [number, number]): void {
    if (this.type === 'crane') {
      const w = (2 * Math.PI) / CRANE_PERIOD;
      this.angle = CRANE_AMP * Math.sin(w * (t - this.craneT0) + Math.PI);
    } else if (this.type === 'darts') {
      const f = beat + (this.def.phase ?? 0);
      this.dartPhase = f - Math.floor(f);
      this.dartsActive = this.dartPhase < DART_ACTIVE;
    } else if (this.type === 'tiles') {
      for (const tile of this.tiles) {
        if (tile.trig === null && playerGrounded && footprint[1] > tile.x && footprint[0] < tile.x + TILE_W) {
          tile.trig = t;
          tile.dropAt = t + TILE_DROP_DELAY;
        }
      }
    }
    void playerX;
  }

  /** Dangerous boxes right now. */
  hitboxes(t: number): Box[] {
    const b = this.boxes;
    b.length = 0;
    switch (this.type) {
      case 'crate':
        b.push(trim({ x: this.x0, y: GROUND_Y - 56, w: 56, h: 56 }, HAZARD_TRIM, true));
        break;
      case 'barrel':
        b.push(trim({ x: this.x0, y: GROUND_Y - 84, w: 56, h: 84 }, HAZARD_TRIM, true));
        break;
      case 'lowSign': {
        // Visual bar is 356..396; the hitbox reaches up out of jump range so
        // that ducking is the only answer.
        const inset = (SIGN_W * (1 - HAZARD_TRIM)) / 2;
        b.push({ x: this.x0 + inset, y: OVERHEAD_TOP, w: SIGN_W - inset * 2, h: 400 - OVERHEAD_TOP });
        break;
      }
      case 'crane':
        b.push(trim(this.craneBlock(), HAZARD_TRIM, false));
        break;
      case 'darts':
        if (this.dartsActive) b.push({ x: this.x0 + 8, y: 330, w: DART_W - 16, h: 72 });
        break;
      default:
        break;
    }
    void t;
    return b;
  }

  /** Holes in the floor, appended to out. */
  holes(t: number, out: [number, number][]): void {
    switch (this.type) {
      case 'gap':
      case 'spikes':
      case 'rope':
        out.push([this.x0, this.x1]);
        break;
      case 'heli':
        out.push([this.x0, this.x1 + 100000]);
        break;
      case 'tiles':
        for (const tile of this.tiles) if (tile.dropAt !== null && t >= tile.dropAt) out.push([tile.x, tile.x + TILE_W]);
        break;
      default:
        break;
    }
  }

  /** Right-most x the player must pass for this obstacle to count as cleared. */
  get clearX(): number {
    return this.x1;
  }

  reset(): void {
    this.cleared = false;
    this.closeCall = false;
    this.grabbed = false;
    this.perfect = false;
    for (const tile of this.tiles) {
      tile.trig = null;
      tile.dropAt = null;
    }
  }
}
