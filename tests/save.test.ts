import { describe, expect, it } from 'vitest';
import { SAVE_KEY, emptySave, isUnlocked, load, migrate, persist, recordLevel, totalStars } from '../src/game/Save';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('save data', () => {
  it('round-trips under a single versioned key', () => {
    const store = memStore();
    const s = emptySave();
    recordLevel(s, 1, { score: 9000, stars: 3, takes: 1, perfect: true });
    persist(s, store);
    expect([...store.m.keys()]).toEqual([SAVE_KEY]);
    const back = load(store);
    expect(back.version).toBe(1);
    expect(back.levels['1']).toEqual({ bestScore: 9000, bestStars: 3, bestTakes: 1, perfect: true });
  });

  it('keeps the best of each field', () => {
    const s = emptySave();
    recordLevel(s, 2, { score: 5000, stars: 1, takes: 6, perfect: false });
    const best = recordLevel(s, 2, { score: 4000, stars: 3, takes: 2, perfect: false });
    expect(best).toBe(false);
    expect(s.levels['2']).toEqual({ bestScore: 5000, bestStars: 3, bestTakes: 2, perfect: false });
    expect(totalStars(s)).toBe(3);
  });

  it('survives corrupt or future data', () => {
    const store = memStore();
    store.setItem(SAVE_KEY, '{not json');
    expect(load(store).levels).toEqual({});
    expect(migrate({ version: 99, levels: { 1: {} } }).levels).toEqual({});
    expect(migrate({ version: 1, settings: { muted: true } }).settings.muted).toBe(true);
  });

  it('unlocks a level once the previous one is wrapped', () => {
    const s = emptySave();
    expect(isUnlocked(s, 1)).toBe(true);
    expect(isUnlocked(s, 2)).toBe(false);
    recordLevel(s, 1, { score: 1, stars: 1, takes: 9, perfect: false });
    expect(isUnlocked(s, 2)).toBe(true);
  });
});
