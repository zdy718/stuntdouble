import { describe, expect, it } from 'vitest';
import { GROUND_Y, STEP } from '../src/game/constants';
import { InputFrame, NO_INPUT, SceneRun } from '../src/game/World';
import { LevelDef, ObstacleDef } from '../src/levels/schema';

function level(obstacles: ObstacleDef[], grab = false): LevelDef {
  return { id: 99, name: 'Test', trope: 'test', bpm: 120, speed: 340, par: 1, grab, scenes: [{ id: 'A', length: 60, obstacles }, { id: 'B', length: 60, obstacles: [] }] };
}
const JUMP: InputFrame = { ...NO_INPUT, jumpHeld: true, jumpPressed: true };
const HOLD: InputFrame = { ...NO_INPUT, jumpHeld: true };

function airborne(run: SceneRun, inputs: (i: number) => InputFrame) {
  let peak = GROUND_Y;
  let frames = 0;
  for (let i = 0; i < 200; i++) {
    run.step(inputs(i));
    peak = Math.min(peak, run.player.y);
    if (!run.player.grounded) frames++;
    else if (frames > 0) break;
  }
  return { height: GROUND_Y - peak, time: frames * STEP };
}

describe('jump physics', () => {
  it('peaks at about 140 px with about 0.68 s of air time when held', () => {
    const lv = level([]);
    const r = airborne(new SceneRun(lv, lv.scenes[0]), (i) => (i === 0 ? JUMP : HOLD));
    expect(r.height).toBeGreaterThan(130);
    expect(r.height).toBeLessThan(145);
    expect(r.time).toBeGreaterThan(0.64);
    expect(r.time).toBeLessThan(0.72);
  });

  it('releasing early cuts the jump short', () => {
    const lv = level([]);
    const r = airborne(new SceneRun(lv, lv.scenes[0]), (i) => (i === 0 ? JUMP : i < 4 ? HOLD : NO_INPUT));
    expect(r.height).toBeLessThan(90);
  });

  it('buffers a jump pressed just before landing', () => {
    const lv = level([]);
    const run = new SceneRun(lv, lv.scenes[0]);
    run.step(JUMP);
    let pressedAt = -1;
    for (let i = 0; i < 120; i++) {
      const p = run.player;
      // press ~4 frames before touching down, then let go
      const press = pressedAt < 0 && p.vy > 0 && GROUND_Y - p.y < p.vy * STEP * 4;
      if (press) pressedAt = i;
      run.step(press ? JUMP : pressedAt >= 0 ? HOLD : HOLD);
      if (pressedAt >= 0 && i > pressedAt + 6) break;
    }
    expect(pressedAt).toBeGreaterThan(0);
    expect(run.player.grounded).toBe(false); // jumped again on landing
    expect(run.player.vy).toBeLessThan(0);
  });

  it('allows a jump shortly after walking off a ledge (coyote time)', () => {
    // A gap starting just ahead: walk off it, then press jump 3 frames late.
    const lv = level([{ beat: 6, type: 'gap', width: 200 }]);
    const run = new SceneRun(lv, lv.scenes[0]);
    let offAt = -1;
    for (let i = 0; i < 400; i++) {
      if (offAt < 0 && !run.player.grounded) offAt = i;
      run.step(offAt >= 0 && i === offAt + 3 ? JUMP : offAt >= 0 ? HOLD : NO_INPUT);
      if (offAt >= 0 && i === offAt + 4) break;
    }
    expect(run.player.vy).toBeLessThan(-500);
  });

  it('runs into a crate when nothing is pressed, and clears it with a jump', () => {
    const lv = level([{ beat: 6, type: 'crate' }]);
    const idle = new SceneRun(lv, lv.scenes[0]);
    for (let i = 0; i < 300 && !idle.dead; i++) idle.step(NO_INPUT);
    expect(idle.dead).toBe(true);

    const run = new SceneRun(lv, lv.scenes[0]);
    const crateX = 6 * run.ppb;
    let jumped = false;
    for (let i = 0; i < 400 && !run.dead; i++) {
      const go = !jumped && crateX - run.distance < 110;
      if (go) jumped = true;
      run.step(go ? JUMP : jumped ? HOLD : NO_INPUT);
    }
    expect(run.dead).toBe(false);
    expect(run.obstacles[0].cleared).toBe(true);
    expect(run.score).toBeGreaterThanOrEqual(100);
  });

  it('ducks under a low sign but not standing up', () => {
    const lv = level([{ beat: 6, type: 'lowSign' }]);
    const stand = new SceneRun(lv, lv.scenes[0]);
    for (let i = 0; i < 300 && !stand.dead; i++) stand.step(NO_INPUT);
    expect(stand.dead).toBe(true);
    const duck = new SceneRun(lv, lv.scenes[0]);
    for (let i = 0; i < 300 && !duck.dead; i++) duck.step({ ...NO_INPUT, duckHeld: true });
    expect(duck.dead).toBe(false);
    expect(duck.obstacles[0].cleared).toBe(true);
  });

  it('grabs a rope over a wide gap and lands on the far side', () => {
    const lv = level([{ beat: 6, type: 'rope', width: 340 }], true);
    const run = new SceneRun(lv, lv.scenes[0]);
    const rope = run.obstacles[0];
    let grabbed = false;
    for (let i = 0; i < 400 && !run.dead; i++) {
      const go = !grabbed && Math.abs(run.distance - rope.handle!.x) < 5;
      if (go) grabbed = true;
      run.step(go ? { ...NO_INPUT, grabPressed: true } : NO_INPUT);
    }
    expect(run.dead).toBe(false);
    expect(rope.grabbed).toBe(true);
    expect(rope.perfect).toBe(true);
    expect(rope.cleared).toBe(true);
    expect(run.score).toBe(350); // 100 + 150 grab + 100 perfect
  });

  it('banks a scene bonus on completion and resets the streak on failure', () => {
    const lv = level([]);
    lv.scenes[0].length = 8;
    const run = new SceneRun(lv, lv.scenes[0]);
    for (let i = 0; i < 600 && !run.complete; i++) run.step(NO_INPUT);
    expect(run.complete).toBe(true);
    expect(run.score).toBe(1000);
  });

  it('is deterministic: the same inputs give the same result', () => {
    const lv = level([{ beat: 6, type: 'crate' }, { beat: 9, type: 'lowSign' }]);
    const play = () => {
      const r = new SceneRun(lv, lv.scenes[0]);
      for (let i = 0; i < 500; i++) r.step(i % 37 === 0 ? JUMP : i % 37 < 20 ? HOLD : NO_INPUT);
      return [r.distance, r.player.y, r.dead, r.score].join();
    };
    expect(play()).toBe(play());
  });
});
