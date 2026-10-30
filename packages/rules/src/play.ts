// Small rules used during play: passive checks, Exhaustion, encounter budgets.

/** Passive score = 10 + the check's modifier (e.g. Passive Perception). */
export function passiveScore(checkBonus: number): number {
  return 10 + checkBonus;
}

/** Exhaustion: D20 Tests drop by 2 per level and Speed by 5 feet per level; level 6 is death. */
export function exhaustionEffects(level: number): {
  d20Penalty: number;
  speedPenalty: number;
  dead: boolean;
} {
  if (!Number.isInteger(level) || level < 0 || level > 6) {
    throw new RangeError(`exhaustion level must be 0-6, got ${level}`);
  }
  return { d20Penalty: -2 * level, speedPenalty: -5 * level, dead: level === 6 };
}

export type EncounterDifficulty = "low" | "moderate" | "high";

/** XP Budget per Character by character level (index 0 = level 1). */
export const XP_BUDGET_PER_CHARACTER: Readonly<Record<EncounterDifficulty, readonly number[]>> = {
  low: [
    50, 100, 150, 250, 500, 600, 750, 1000, 1300, 1600, 1900, 2200, 2600, 2900, 3300, 3800, 4500,
    5000, 5500, 6400,
  ],
  moderate: [
    75, 150, 225, 375, 750, 1000, 1300, 1700, 2000, 2300, 2900, 3700, 4200, 4900, 5400, 6100, 7200,
    8700, 10700, 13200,
  ],
  high: [
    100, 200, 400, 500, 1100, 1400, 1700, 2100, 2600, 3100, 4100, 4700, 5400, 6200, 7800, 9800,
    11700, 14200, 17200, 22000,
  ],
};

/** An encounter's XP budget: the per-character budget summed over the party. */
export function encounterXpBudget(
  partyLevels: readonly number[],
  difficulty: EncounterDifficulty,
): number {
  return partyLevels.reduce((sum, level) => {
    const budget = XP_BUDGET_PER_CHARACTER[difficulty][level - 1];
    if (budget === undefined) throw new RangeError(`level must be 1-20, got ${level}`);
    return sum + budget;
  }, 0);
}
