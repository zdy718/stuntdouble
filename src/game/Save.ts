// Persistence: best score, best stars and Perfect Take per level, plus the
// settings, under a single versioned localStorage key.

export const SAVE_KEY = 'stuntDouble.v1';
export const SAVE_VERSION = 1;

export interface LevelRecord {
  bestScore: number;
  bestStars: number;
  bestTakes: number;
  perfect: boolean;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  grain: boolean;
  reduceMotion: boolean;
}

export interface SaveData {
  version: number;
  levels: Record<string, LevelRecord>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.7,
  sfx: 0.8,
  muted: false,
  grain: true,
  reduceMotion: false,
};

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, levels: {}, settings: { ...DEFAULT_SETTINGS } };
}

/** Upgrades older formats; unknown or broken data falls back to a fresh save. */
export function migrate(raw: unknown): SaveData {
  const base = emptySave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  if (typeof r.version !== 'number' || r.version > SAVE_VERSION) return base;
  // (version 1 is the first format; future versions add steps here)
  const levels: Record<string, LevelRecord> = {};
  for (const [k, v] of Object.entries(r.levels ?? {})) {
    if (!v || typeof v !== 'object') continue;
    levels[k] = {
      bestScore: Number(v.bestScore) || 0,
      bestStars: Math.max(0, Math.min(3, Number(v.bestStars) || 0)),
      bestTakes: Number(v.bestTakes) || 0,
      perfect: !!v.perfect,
    };
  }
  return { version: SAVE_VERSION, levels, settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) } };
}

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function load(store: Storage | null = storage()): SaveData {
  try {
    const txt = store?.getItem(SAVE_KEY);
    return migrate(txt ? JSON.parse(txt) : null);
  } catch {
    return emptySave();
  }
}

export function persist(data: SaveData, store: Storage | null = storage()): void {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: the game still works, it just won't remember */
  }
}

/** Merges a finished level into the save. Returns true if it set a new best score. */
export function recordLevel(
  data: SaveData,
  levelId: number,
  result: { score: number; stars: number; takes: number; perfect: boolean },
): boolean {
  const key = String(levelId);
  const prev = data.levels[key];
  const best = !prev || result.score > prev.bestScore;
  data.levels[key] = {
    bestScore: Math.max(prev?.bestScore ?? 0, result.score),
    bestStars: Math.max(prev?.bestStars ?? 0, result.stars),
    bestTakes: prev?.bestTakes ? Math.min(prev.bestTakes, result.takes) : result.takes,
    perfect: (prev?.perfect ?? false) || result.perfect,
  };
  return best;
}

export function totalStars(data: SaveData, levelCount = 5): number {
  let n = 0;
  for (let i = 1; i <= levelCount; i++) n += data.levels[String(i)]?.bestStars ?? 0;
  return n;
}

export function isUnlocked(data: SaveData, levelId: number): boolean {
  return levelId === 1 || !!data.levels[String(levelId - 1)];
}
