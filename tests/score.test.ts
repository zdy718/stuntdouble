import { describe, expect, it } from 'vitest';
import {
  POINTS,
  isPerfectTake,
  levelPoints,
  multiplierFor,
  obstaclePoints,
  ratingTitle,
  resultName,
  scenePoints,
  starsFor,
} from '../src/game/Score';

describe('combo multiplier', () => {
  it('follows the streak table', () => {
    expect([0, 4, 5, 9, 10, 19, 20, 99].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('points', () => {
  it('scores one obstacle with every bonus', () => {
    expect(obstaclePoints(1)).toBe(100);
    expect(obstaclePoints(2, { closeCall: true })).toBe(300);
    expect(obstaclePoints(1, { grab: true, perfect: true })).toBe(350);
    expect(obstaclePoints(3, { closeCall: true, grab: true, perfect: true })).toBe(3 * 400);
  });

  it('matches the worked example in the design document (3,400 points)', () => {
    // 12 obstacles, three close calls, one in each multiplier zone.
    const obs = Array.from({ length: 12 }, (_, i) => ({ closeCall: i === 0 || i === 5 || i === 10 }));
    expect(scenePoints(obs)).toBe(3400);
    // without the close calls it is 2,100 + 1,000
    expect(scenePoints(Array.from({ length: 12 }, () => ({})))).toBe(3100);
  });

  it('adds the level bonus once', () => {
    expect(levelPoints([3400, 5000])).toBe(3400 + 5000 + POINTS.level);
  });
});

describe('takes and stars', () => {
  it('rates against par', () => {
    expect(starsFor(1, 1)).toBe(3);
    expect(starsFor(2, 1)).toBe(2);
    expect(starsFor(3, 1)).toBe(2);
    expect(starsFor(4, 1)).toBe(1);
    expect(starsFor(3, 3)).toBe(3);
    expect(starsFor(5, 3)).toBe(2);
    expect(starsFor(6, 3)).toBe(1);
    expect(resultName(3)).toBe('Wrapped');
    expect(resultName(2)).toBe('Good take');
    expect(resultName(1)).toBe('Completed');
  });

  it('awards the Perfect Take only with zero failures', () => {
    expect(isPerfectTake(1)).toBe(true);
    expect(isPerfectTake(2)).toBe(false);
  });

  it('maps total stars to a title', () => {
    expect(ratingTitle(15)).toBe('Hollywood Legend');
    expect(ratingTitle(12)).toBe('Lead Stunt Double');
    expect(ratingTitle(14)).toBe('Lead Stunt Double');
    expect(ratingTitle(8)).toBe('Seasoned Pro');
    expect(ratingTitle(11)).toBe('Seasoned Pro');
    expect(ratingTitle(5)).toBe('Rookie Extra');
    expect(ratingTitle(7)).toBe('Rookie Extra');
  });
});
