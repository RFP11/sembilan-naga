// Core 5e math. Pure functions only: no I/O, no randomness (see dice.ts).

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

/** Score 10-11 -> +0, 12-13 -> +1, 8-9 -> -1, ... */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Level 1-4 -> +2, 5-8 -> +3, 9-12 -> +4, 13-16 -> +5, 17-20 -> +6 */
export function proficiencyBonus(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError(`level must be 1-20, got ${level}`);
  }
  return Math.ceil(level / 4) + 1;
}

/** Skill or saving-throw bonus. Expertise doubles proficiency. */
export function checkBonus(
  score: number,
  level: number,
  proficiency: "none" | "proficient" | "expertise" = "none",
): number {
  const multiplier = { none: 0, proficient: 1, expertise: 2 }[proficiency];
  return abilityModifier(score) + proficiencyBonus(level) * multiplier;
}

/** Unarmored AC: 10 + DEX modifier. */
export function unarmoredAC(dex: number): number {
  return 10 + abilityModifier(dex);
}
