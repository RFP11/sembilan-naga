// Hit Points and Hit Point Dice (SRD 5.2.1 "Hit Points" in Character Creation / Level Advancement).

/** The fixed per-level value instead of rolling: half the die + 1 (d10 → 6). */
export function fixedHitPoints(hitDie: number): number {
  return hitDie / 2 + 1;
}

export interface LevelHitPoints {
  hitDie: number;
  /** The die result for this level (rolled or `fixedHitPoints`); ignored for character level 1. */
  roll?: number;
}

/**
 * Hit Point maximum. `levels` are the character's levels in order (multiclass levels use
 * their own class's die). Character level 1 takes the die's maximum; later levels take
 * `roll` (or the fixed value). The Constitution modifier is added per level with a minimum
 * of 1, so raising Constitution later raises every level retroactively. `extraPerLevel`
 * covers features like Dwarven Toughness; `extra` covers flat bonuses.
 */
export function maxHitPoints(
  levels: readonly LevelHitPoints[],
  conMod: number,
  { extraPerLevel = 0, extra = 0 }: { extraPerLevel?: number; extra?: number } = {},
): number {
  let total = 0;
  levels.forEach((l, i) => {
    const die = i === 0 ? l.hitDie : (l.roll ?? fixedHitPoints(l.hitDie));
    if (i > 0 && (die < 1 || die > l.hitDie))
      throw new RangeError(`roll ${die} isn't on a d${l.hitDie}`);
    total += Math.max(1, die + conMod);
  });
  return total + extraPerLevel * levels.length + extra;
}

/** Hit Point Dice available, grouped by die size: { 10: 5, 8: 5 } for Fighter 5 / Cleric 5. */
export function hitDicePool(levels: readonly { hitDie: number }[]): Record<number, number> {
  const pool: Record<number, number> = {};
  for (const l of levels) pool[l.hitDie] = (pool[l.hitDie] ?? 0) + 1;
  return pool;
}
