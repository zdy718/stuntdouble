// Player state, hitbox and the vertical physics. The player never moves
// horizontally on screen: the world scrolls past, so the player's scene x is
// simply the distance travelled.

import { Box } from './Collision';
import { GROUND_Y, PLAYER_DUCK_H, PLAYER_H, PLAYER_W } from './constants';
import { ObstacleRT } from './Obstacles';

export interface Hang {
  ob: ObstacleRT;
  t: number;
  heli: boolean;
  handY: number;
  offset: number; // eases the snap from current pose onto the rope
  dx0: number;
}

export class Player {
  y = GROUND_Y; // feet
  vy = 0;
  grounded = true;
  ducking = false;
  dead = false;
  coyote = 0;
  jumpBuf = 0;
  grabBuf = 0;
  jumpCut = true;
  hang: Hang | null = null;
  airTime = 0;
  // Purely visual timers
  stretch = 0;
  squash = 0;
  runPhase = 0;
  deadT = 0;

  reset(): void {
    this.y = GROUND_Y;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.dead = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.grabBuf = 0;
    this.jumpCut = true;
    this.hang = null;
    this.airTime = 0;
    this.stretch = 0;
    this.squash = 0;
    this.deadT = 0;
  }

  /** Collision box at scene x. */
  hitbox(x: number, out: Box = { x: 0, y: 0, w: 0, h: 0 }): Box {
    if (this.hang) {
      out.x = x - 20;
      out.w = 40;
      out.y = this.hang.handY - 2;
      out.h = 66;
      return out;
    }
    const h = this.ducking ? PLAYER_DUCK_H : PLAYER_H;
    out.x = x - PLAYER_W / 2;
    out.w = PLAYER_W;
    out.y = this.y - h;
    out.h = h;
    return out;
  }

  /** Same box as if standing, used for duck close-call tests. */
  standingBox(x: number, out: Box = { x: 0, y: 0, w: 0, h: 0 }): Box {
    out.x = x - PLAYER_W / 2;
    out.w = PLAYER_W;
    out.y = this.y - PLAYER_H;
    out.h = PLAYER_H;
    return out;
  }
}
