// One running scene: scrolling, the player's physics, obstacles, collisions
// and scoring events. Headless and deterministic, so tests can drive it.

import {
  CARRY_TIME,
  CLOSE_CALL_PX,
  COYOTE_TIME,
  FAST_FALL_MULT,
  GRAB_WINDOW,
  GRAVITY,
  GROUND_Y,
  INPUT_BUFFER,
  JUMP_SPEED,
  PERFECT_WINDOW,
  PLAYER_W,
  ROPE_ANCHOR_Y,
  STEP,
  SUPPORT_W,
} from './constants';
import { Box, hasSolid, inflate, overlaps } from './Collision';
import { ObstacleRT } from './Obstacles';
import { Player } from './Player';
import { multiplierFor, obstaclePoints, POINTS } from './Score';
import { LevelDef, SceneDef, pixelsPerBeat } from '../levels/schema';

export interface InputFrame {
  jumpHeld: boolean;
  duckHeld: boolean;
  jumpPressed: boolean;
  grabPressed: boolean;
}

export const NO_INPUT: InputFrame = { jumpHeld: false, duckHeld: false, jumpPressed: false, grabPressed: false };

export type GameEvent =
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'duck' }
  | { type: 'grab'; perfect: boolean; heli: boolean }
  | { type: 'release' }
  | { type: 'clear'; ob: ObstacleRT; points: number; mult: number; closeCall: boolean }
  | { type: 'combo'; mult: number }
  | { type: 'die'; cause: 'hit' | 'fall' | 'wall'; ob?: ObstacleRT }
  | { type: 'tile'; ob: ObstacleRT }
  | { type: 'complete' };

export const HELI_CARRY = 1.3;

export class SceneRun {
  readonly player = new Player();
  readonly obstacles: ObstacleRT[];
  readonly ppb: number;
  readonly speed: number;
  readonly bpm: number;
  readonly lengthPx: number;
  readonly grabEnabled: boolean;
  distance = 0;
  t = 0;
  streak = 0;
  score = 0;
  multiplier = 1;
  complete = false;
  readonly events: GameEvent[] = [];
  private holes: [number, number][] = [];
  private pbox: Box = { x: 0, y: 0, w: 0, h: 0 };
  private sbox: Box = { x: 0, y: 0, w: 0, h: 0 };
  private wasDucking = false;

  constructor(
    readonly level: LevelDef,
    readonly scene: SceneDef,
  ) {
    const f = scene.speedFactor ?? 1;
    this.ppb = pixelsPerBeat(level);
    this.speed = level.speed * f;
    this.bpm = level.bpm * f;
    this.lengthPx = scene.length * this.ppb;
    this.grabEnabled = level.grab;
    this.obstacles = scene.obstacles.map((d, i) => new ObstacleRT(d, i, this.ppb, this.lengthPx, this.speed));
  }

  /** Captures all mutable state (used by the level solver in tests). */
  snapshot(): unknown {
    const p = this.player;
    return {
      w: [this.distance, this.t, this.streak, this.score, this.multiplier, this.complete, this.wasDucking],
      p: { ...p, hang: p.hang ? { ...p.hang } : null },
      o: this.obstacles.map((o) => ({
        cleared: o.cleared,
        closeCall: o.closeCall,
        grabbed: o.grabbed,
        perfect: o.perfect,
        tiles: o.tiles.map((t) => ({ ...t })),
        handle: o.handle ? { ...o.handle } : null,
      })),
    };
  }

  restore(snap: unknown): void {
    const s = snap as {
      w: [number, number, number, number, number, boolean, boolean];
      p: Player;
      o: { cleared: boolean; closeCall: boolean; grabbed: boolean; perfect: boolean; tiles: ObstacleRT['tiles']; handle: ObstacleRT['handle'] }[];
    };
    [this.distance, this.t, this.streak, this.score, this.multiplier, this.complete, this.wasDucking] = s.w;
    Object.assign(this.player, s.p, { hang: s.p.hang ? { ...s.p.hang } : null });
    s.o.forEach((d, i) => {
      const o = this.obstacles[i];
      o.cleared = d.cleared;
      o.closeCall = d.closeCall;
      o.grabbed = d.grabbed;
      o.perfect = d.perfect;
      o.tiles = d.tiles.map((t) => ({ ...t }));
      if (d.handle && o.handle) {
        o.handle.x = d.handle.x;
        o.handle.y = d.handle.y;
      }
    });
    // The hang record points at an obstacle: re-link it to this run's copy.
    if (this.player.hang) {
      const idx = this.player.hang.ob.index;
      this.player.hang.ob = this.obstacles[idx];
    }
  }

  get beat(): number {
    return (this.t * this.bpm) / 60;
  }

  get progress(): number {
    return Math.min(1, this.distance / this.lengthPx);
  }

  get dead(): boolean {
    return this.player.dead;
  }

  holesNow(): [number, number][] {
    const h = this.holes;
    h.length = 0;
    for (const o of this.obstacles) o.holes(this.t, h);
    return h;
  }

  /** Is there floor under the given x range right now? */
  solid(x0: number, x1: number): boolean {
    return hasSolid(x0, x1, this.holesNow());
  }

  step(input: InputFrame): GameEvent[] {
    const ev = this.events;
    ev.length = 0;
    const p = this.player;
    if (p.dead || this.complete) {
      if (p.dead) p.deadT += STEP;
      return ev;
    }
    const dt = STEP;
    this.t += dt;
    this.distance += this.speed * dt;
    const x = this.distance;

    // Visual timers
    p.stretch = Math.max(0, p.stretch - dt);
    p.squash = Math.max(0, p.squash - dt);
    p.runPhase += (dt * this.speed) / 34;

    // Input buffering
    p.jumpBuf = input.jumpPressed ? INPUT_BUFFER : Math.max(0, p.jumpBuf - dt);
    p.grabBuf = input.grabPressed && this.grabEnabled ? INPUT_BUFFER : Math.max(0, p.grabBuf - dt);

    const foot: [number, number] = [x - SUPPORT_W / 2, x + SUPPORT_W / 2];
    for (const o of this.obstacles) o.update(this.t, this.beat, x, p.grounded && !p.hang, foot);
    for (const o of this.obstacles) {
      if (o.type === 'tiles') {
        for (const tile of o.tiles) if (tile.trig === this.t) ev.push({ type: 'tile', ob: o });
      }
    }

    if (p.hang) {
      this.stepHang(x, ev);
    } else {
      this.stepFree(x, input, ev);
    }
    if (p.dead) return ev;

    // Hazard collision and close-call tracking
    const pb = p.hitbox(x, this.pbox);
    const sb = p.standingBox(x, this.sbox);
    for (const o of this.obstacles) {
      if (o.cleared) continue;
      if (o.x0 > x + 400 || o.x1 < x - 400) continue;
      const boxes = o.hitboxes(this.t);
      for (const b of boxes) {
        if (overlaps(pb, b)) {
          this.die('hit', ev, o);
          return ev;
        }
        const near = inflate(b, CLOSE_CALL_PX);
        if (o.cat === 'duck') {
          if (!p.ducking && !p.hang && overlaps(sb, near)) o.closeCall = true;
        } else if (overlaps(pb, near)) {
          o.closeCall = true;
        }
      }
    }

    // Cleared obstacles
    const back = x - PLAYER_W / 2;
    for (const o of this.obstacles) {
      if (o.cleared || o.type === 'heli') continue;
      if (o.clearX < back && p.y <= GROUND_Y + 1) this.award(o, ev);
    }

    // Scene end
    if (p.hang && p.hang.heli) {
      if (p.hang.t >= HELI_CARRY) {
        this.finish(ev);
      }
    } else if (this.distance >= this.lengthPx && p.y <= GROUND_Y + 1 && !p.hang) {
      this.finish(ev);
    }
    return ev;
  }

  private finish(ev: GameEvent[]): void {
    this.complete = true;
    this.score += POINTS.scene;
    ev.push({ type: 'complete' });
  }

  private award(o: ObstacleRT, ev: GameEvent[]): void {
    o.cleared = true;
    const m = multiplierFor(this.streak);
    const pts = obstaclePoints(m, { closeCall: o.closeCall, grab: o.grabbed, perfect: o.perfect });
    this.streak++;
    this.score += pts;
    ev.push({ type: 'clear', ob: o, points: pts, mult: m, closeCall: o.closeCall });
    const next = multiplierFor(this.streak);
    if (next > this.multiplier) ev.push({ type: 'combo', mult: next });
    this.multiplier = next;
  }

  private die(cause: 'hit' | 'fall' | 'wall', ev: GameEvent[], ob?: ObstacleRT): void {
    const p = this.player;
    p.dead = true;
    p.hang = null;
    this.streak = 0;
    this.multiplier = 1;
    ev.push({ type: 'die', cause, ob });
  }

  private stepHang(x: number, ev: GameEvent[]): void {
    const p = this.player;
    const h = p.hang!;
    const dt = STEP;
    h.t += dt;
    h.offset *= 0.8;
    if (h.heli) {
      h.ob.handle!.x = x - h.dx0; // the helicopter now flies with the player
      h.handY = h.ob.handle!.y - (60 * h.t + 160 * h.t * h.t);
      p.y = h.handY + 72;
      return;
    }
    const hd = h.ob.handle!;
    const L = hd.y - ROPE_ANCHOR_Y;
    const dx = Math.min(x - hd.x, L * 0.9);
    h.handY = ROPE_ANCHOR_Y + Math.sqrt(L * L - dx * dx) + h.offset;
    p.y = h.handY + 72;
    if (h.t >= CARRY_TIME) {
      p.hang = null;
      p.vy = -300;
      p.jumpCut = true;
      p.grounded = false;
      p.airTime = 0;
      ev.push({ type: 'release' });
    }
  }

  private stepFree(x: number, input: InputFrame, ev: GameEvent[]): void {
    const p = this.player;
    const dt = STEP;
    const holes = this.holesNow();
    const supported = hasSolid(x - SUPPORT_W / 2, x + SUPPORT_W / 2, holes);

    // Walked off an edge (or the floor fell away): start coyote time.
    if (p.grounded && !supported) {
      p.grounded = false;
      p.vy = 0;
      p.coyote = COYOTE_TIME;
      p.airTime = 0;
      p.jumpCut = true;
    }

    // Grab (checked first: a grab over a gap beats a late jump)
    if (p.grabBuf > 0 && p.y <= GROUND_Y + 50) {
      const target = this.grabTarget(x);
      if (target) {
        const hd = target.handle!;
        const dx = x - hd.x;
        const perfect = Math.abs(dx) <= PERFECT_WINDOW / 2;
        target.grabbed = true;
        target.perfect = perfect;
        const heli = target.type === 'heli';
        const L = hd.y - ROPE_ANCHOR_Y;
        const handY = heli ? hd.y : ROPE_ANCHOR_Y + Math.sqrt(L * L - dx * dx);
        p.hang = { ob: target, t: 0, heli, handY, offset: p.y - 72 - handY, dx0: dx };
        if (heli) p.hang.offset = 0;
        p.grabBuf = 0;
        p.jumpBuf = 0;
        p.grounded = false;
        p.ducking = false;
        p.vy = 0;
        if (heli) {
          // The helicopter grab is the final obstacle: score it at once.
          target.closeCall = false;
          this.award(target, ev);
        }
        ev.push({ type: 'grab', perfect, heli });
        return;
      }
    }

    // Jump (buffered, with coyote time)
    if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
      p.vy = -JUMP_SPEED;
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.jumpCut = false;
      p.ducking = false;
      p.airTime = 0;
      p.stretch = 0.1;
      ev.push({ type: 'jump' });
      // Jumping right at the lip of a gap is a close call.
      for (const o of this.obstacles) {
        if (o.cat === 'floor' || o.cleared) continue;
        if (o.type === 'gap' || o.type === 'spikes' || o.type === 'rope') {
          const front = x + PLAYER_W / 2;
          if (front > o.x0 - CLOSE_CALL_PX && front < o.x1) o.closeCall = true;
        }
      }
    }

    // Variable jump height: releasing early halves the upward speed once.
    if (!p.grounded && p.vy < 0 && !input.jumpHeld && !p.jumpCut) {
      p.vy *= 0.5;
      p.jumpCut = true;
    }

    // Duck
    const duckNow = input.duckHeld && p.grounded;
    if (duckNow && !this.wasDucking) ev.push({ type: 'duck' });
    p.ducking = duckNow;
    this.wasDucking = duckNow;

    if (!p.grounded) {
      const g = input.duckHeld && p.vy > -200 ? GRAVITY * FAST_FALL_MULT : GRAVITY;
      const prevY = p.y;
      p.vy += g * dt;
      p.y += p.vy * dt;
      p.coyote = Math.max(0, p.coyote - dt);
      p.airTime += dt;

      const solidNow = hasSolid(x - SUPPORT_W / 2, x + SUPPORT_W / 2, holes);
      const crossing = p.vy >= 0 && prevY <= GROUND_Y && p.y >= GROUND_Y;
      const ledgeSnap = p.vy >= 0 && p.y > GROUND_Y && p.y < GROUND_Y + 14 && prevY <= GROUND_Y + 14;
      if ((crossing || ledgeSnap) && solidNow) {
        const impact = p.vy;
        p.y = GROUND_Y;
        p.vy = 0;
        p.grounded = true;
        p.jumpCut = true;
        p.squash = 0.08;
        ev.push({ type: 'land', impact });
        // Landing right at the far lip of a gap is a close call.
        for (const o of this.obstacles) {
          if (o.cleared) continue;
          if (o.type === 'gap' || o.type === 'spikes' || o.type === 'rope') {
            const backEdge = x - PLAYER_W / 2;
            if (backEdge > o.x0 && backEdge < o.x1 + CLOSE_CALL_PX) o.closeCall = true;
          }
        }
        if (input.duckHeld) {
          p.ducking = true;
          this.wasDucking = true;
          ev.push({ type: 'duck' });
        }
      } else if (p.y > GROUND_Y + 2) {
        // Below the floor line: inside a pit.
        if (hasSolid(x - 20, x + 20, holes)) {
          this.die('wall', ev);
          return;
        }
        if (p.y > GROUND_Y + 70) {
          this.die('fall', ev);
          return;
        }
      }
    }
  }

  private grabTarget(x: number): ObstacleRT | null {
    let best: ObstacleRT | null = null;
    let bestD = Infinity;
    for (const o of this.obstacles) {
      if (!o.handle || o.grabbed) continue;
      const d = Math.abs(x - o.handle.x);
      if (d <= GRAB_WINDOW / 2 && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }
}
