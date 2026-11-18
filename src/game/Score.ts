// Scoring as pure functions: points (style) and stars (consistency).

export const POINTS = {
  cleared: 100,
  closeCall: 50,
  grab: 150,
  perfectGrab: 100,
  scene: 1000,
  level: 2000,
} as const;

export interface ClearFlags {
  closeCall?: boolean;
  grab?: boolean;
  perfect?: boolean;
}

/** Multiplier for a given streak (obstacles cleared in a row before this one). */
export function multiplierFor(streak: number): number {
  if (streak >= 20) return 4;
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

/** Points for one obstacle at multiplier m. */
export function obstaclePoints(m: number, f: ClearFlags = {}): number {
  return (
    m *
    (POINTS.cleared +
      (f.closeCall ? POINTS.closeCall : 0) +
      (f.grab ? POINTS.grab : 0) +
      (f.perfect ? POINTS.perfectGrab : 0))
  );
}

/**
 * S_scene = sum_i m_i (100 + 50c_i + 150g_i + 100p_i) + 1000
 * The streak starts at zero at the beginning of every scene.
 */
export function scenePoints(obstacles: ClearFlags[]): number {
  let total = 0;
  obstacles.forEach((f, i) => {
    total += obstaclePoints(multiplierFor(i), f);
  });
  return total + POINTS.scene;
}

export function levelPoints(scenes: number[]): number {
  return scenes.reduce((a, b) => a + b, 0) + POINTS.level;
}

export type ResultName = 'Wrapped' | 'Good take' | 'Completed';

export function starsFor(takes: number, par: number): 1 | 2 | 3 {
  if (takes <= par) return 3;
  if (takes <= par + 2) return 2;
  return 1;
}

export function resultName(stars: number): ResultName {
  return stars === 3 ? 'Wrapped' : stars === 2 ? 'Good take' : 'Completed';
}

/** Perfect Take: the level was cleared with zero failures. */
export function isPerfectTake(takes: number): boolean {
  return takes === 1;
}

export function ratingTitle(totalStars: number): string {
  if (totalStars >= 15) return 'Hollywood Legend';
  if (totalStars >= 12) return 'Lead Stunt Double';
  if (totalStars >= 8) return 'Seasoned Pro';
  if (totalStars >= 5) return 'Rookie Extra';
  return 'Background Extra';
}
