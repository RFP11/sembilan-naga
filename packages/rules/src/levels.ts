// Character advancement (SRD 5.2.1 "Character Advancement" table).

/** Minimum XP for levels 1-20; index 0 is level 1. */
export const XP_BY_LEVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
] as const;

/** The XP a character starts with at `level` (e.g. starting at level 10 → 64,000). */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError(`level must be 1-20, got ${level}`);
  }
  return XP_BY_LEVEL[level - 1]!;
}

/** The level an XP total reaches (capped at 20). */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 20 && xp >= XP_BY_LEVEL[level]!) level++;
  return level;
}
