// A brute-force "perfect player" used by the tests to prove that every scene
// can be completed with the real physics. Depth-first search over held-key
// states, with a visited set so the search stays small.

import { InputFrame, SceneRun } from '../src/game/World';
import { LevelDef, SceneDef } from '../src/levels/schema';

type Held = 'N' | 'J' | 'D' | 'G';

export interface SolveResult {
  ok: boolean;
  inputs: Held[]; // one held-state per decision
  nodes: number;
  deathAt?: number;
}

export const DECISION_FRAMES = 3;

function frame(prev: Held, now: Held): InputFrame {
  return {
    jumpHeld: now === 'J',
    duckHeld: now === 'D',
    jumpPressed: now === 'J' && prev !== 'J',
    grabPressed: now === 'G' && prev !== 'G',
  };
}

/** Plays one decision (DECISION_FRAMES steps). Returns false on death. */
function play(run: SceneRun, prev: Held, now: Held): boolean {
  const first = frame(prev, now);
  const rest: InputFrame = { ...first, jumpPressed: false, grabPressed: false };
  for (let i = 0; i < DECISION_FRAMES; i++) {
    run.step(i === 0 ? first : rest);
    if (run.dead) return false;
    if (run.complete) return true;
  }
  return true;
}

export function solveScene(level: LevelDef, scene: SceneDef, maxNodes = 400000): SolveResult {
  const run = new SceneRun(level, scene);
  const visited = new Set<string>();
  const path: Held[] = [];
  let nodes = 0;
  let furthest = 0;

  const key = (depth: number, held: Held): string => {
    const p = run.player;
    return [
      depth,
      held,
      Math.round(p.y / 2),
      Math.round(p.vy / 40),
      p.grounded ? 1 : 0,
      p.jumpCut ? 1 : 0,
      p.hang ? Math.round(p.hang.t * 60) : -1,
    ].join(',');
  };

  const order = (prev: Held): Held[] => {
    const all: Held[] = ['N', 'J', 'D', 'G'];
    if (!level.grab) all.pop();
    return [prev, ...all.filter((h) => h !== prev)];
  };

  const dfs = (depth: number, prev: Held): boolean => {
    if (run.complete) return true;
    if (++nodes > maxNodes) return false;
    for (const h of order(prev)) {
      const snap = run.snapshot();
      const alive = play(run, prev, h);
      furthest = Math.max(furthest, run.distance);
      if (alive) {
        const k = key(depth + 1, h);
        if (!visited.has(k)) {
          visited.add(k);
          path.push(h);
          if (dfs(depth + 1, h)) return true;
          path.pop();
        }
      }
      run.restore(snap);
    }
    return false;
  };

  const ok = dfs(0, 'N');
  return { ok, inputs: ok ? path : [], nodes, deathAt: ok ? undefined : furthest };
}

/** Replays a solution and returns the finished run (for scoring checks). */
export function replay(level: LevelDef, scene: SceneDef, inputs: Held[]): SceneRun {
  const run = new SceneRun(level, scene);
  let prev: Held = 'N';
  for (const h of inputs) {
    play(run, prev, h);
    prev = h;
    if (run.complete || run.dead) break;
  }
  return run;
}
