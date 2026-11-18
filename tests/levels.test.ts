import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { obstacleCount, pixelsPerBeat, validateLevel, LevelDef } from '../src/levels/schema';
import { NO_INPUT, SceneRun } from '../src/game/World';
import { solveScene, replay } from './solver';

describe('level data', () => {
  it('has five levels with the designed obstacle counts and pars', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5]);
    expect(LEVELS.map(obstacleCount)).toEqual([24, 34, 42, 50, 60]);
    expect(LEVELS.map((l) => l.par)).toEqual([1, 2, 2, 3, 3]);
  });

  it('passes the spacing validator', () => {
    for (const l of LEVELS) expect(validateLevel(l)).toEqual([]);
  });

  it('keeps pixels-per-beat in the 165-185 range', () => {
    for (const l of LEVELS) {
      const ppb = pixelsPerBeat(l);
      expect(ppb).toBeGreaterThan(165);
      expect(ppb).toBeLessThan(185);
    }
  });

  it('rejects ground hazards that are too close', () => {
    const bad: LevelDef = JSON.parse(JSON.stringify(LEVELS[0]));
    bad.scenes[0].obstacles[1].beat = bad.scenes[0].obstacles[0].beat + 1;
    expect(validateLevel(bad).join('\n')).toMatch(/crate@8 -> crate@9/);
  });

  it('rejects gaps that are too wide to jump', () => {
    const bad: LevelDef = JSON.parse(JSON.stringify(LEVELS[1]));
    bad.scenes[0].obstacles[0].width = 400;
    expect(validateLevel(bad).join('\n')).toMatch(/max jumpable/);
  });

  it('rejects grab targets before grab is unlocked', () => {
    const bad: LevelDef = JSON.parse(JSON.stringify(LEVELS[0]));
    bad.scenes[0].obstacles.push({ beat: 50, type: 'rope', width: 300 });
    expect(validateLevel(bad).join('\n')).toMatch(/before grab is unlocked/);
  });
});

describe('every scene is beatable with the real physics', () => {
  for (const level of LEVELS) {
    for (const scene of level.scenes) {
      it(`level ${level.id} scene ${scene.id}`, () => {
        // Doing nothing must fail: every scene has to ask something of the player.
        const idle = new SceneRun(level, scene);
        for (let i = 0; i < 60 * 120 && !idle.dead && !idle.complete; i++) idle.step(NO_INPUT);
        expect(idle.dead).toBe(true);

        const res = solveScene(level, scene);
        expect(res.ok, `stuck near x=${Math.round(res.deathAt ?? 0)} (beat ${((res.deathAt ?? 0) / pixelsPerBeat(level)).toFixed(1)})`).toBe(true);
        const run = replay(level, scene, res.inputs);
        expect(run.complete).toBe(true);
        expect(run.obstacles.every((o) => o.cleared)).toBe(true);
      });
    }
  }
});
