import { LevelDef, validateLevel } from './schema';
import l1 from './level1.json';
import l2 from './level2.json';
import l3 from './level3.json';
import l4 from './level4.json';
import l5 from './level5.json';

export const LEVELS: LevelDef[] = [l1, l2, l3, l4, l5] as LevelDef[];

/** Validates every level at load time; throws with every problem found. */
export function checkLevels(levels: LevelDef[] = LEVELS): void {
  const errors = levels.flatMap(validateLevel);
  if (errors.length) throw new Error('Invalid level data:\n' + errors.join('\n'));
}
