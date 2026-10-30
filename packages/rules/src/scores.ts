// Generating and adjusting ability scores (SRD 5.2.1 "Step 3: Ability Scores").

import { ABILITIES, type Ability, type AbilityScores } from "./abilities";
import type { Rng } from "./dice";

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_BUDGET = 27;
/** Cost of each score from 8 to 15. */
export const POINT_BUY_COST: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/** Points spent on a point-buy array, or undefined if a score is outside 8-15. */
export function pointBuyCost(scores: AbilityScores): number | undefined {
  let total = 0;
  for (const a of ABILITIES) {
    const cost = POINT_BUY_COST[scores[a]];
    if (cost === undefined) return undefined;
    total += cost;
  }
  return total;
}

/** Problems with a point-buy array; empty when it's legal (spending less than 27 is allowed). */
export function validatePointBuy(scores: AbilityScores): string[] {
  const cost = pointBuyCost(scores);
  if (cost === undefined) return ["point-buy scores must be between 8 and 15"];
  return cost > POINT_BUY_BUDGET ? [`costs ${cost} points; the budget is ${POINT_BUY_BUDGET}`] : [];
}

/** True when the six scores are a permutation of the standard array. */
export function isStandardArray(scores: AbilityScores): boolean {
  const sorted = ABILITIES.map((a) => scores[a]).sort((x, y) => y - x);
  return sorted.every((s, i) => s === STANDARD_ARRAY[i]);
}

/** One "roll four d6s and keep the highest three" score. */
export function roll4d6DropLowest(rng: Rng): { rolls: number[]; dropped: number; total: number } {
  const rolls = Array.from({ length: 4 }, () => Math.floor(rng() * 6) + 1);
  const dropped = Math.min(...rolls);
  const total = rolls.reduce((a, b) => a + b, 0) - dropped;
  return { rolls, dropped, total };
}

/** A background's ability score increase: +2/+1 to two of its abilities, or +1 to all three. */
export type AbilityBonus = Partial<Record<Ability, number>>;

/** Problems with a background bonus; empty when it's legal for the background's three abilities. */
export function validateBackgroundBonus(
  bonus: AbilityBonus,
  allowed: readonly Ability[],
): string[] {
  const entries = Object.entries(bonus).filter(([, v]) => v !== 0) as [Ability, number][];
  const errors = entries
    .filter(([a]) => !allowed.includes(a))
    .map(([a]) => `${a} is not one of this background's abilities (${allowed.join(", ")})`);
  const values = entries.map(([, v]) => v).sort();
  const shape = values.join(",");
  if (shape !== "1,2" && shape !== "1,1,1") {
    errors.push("increase one ability by 2 and another by 1, or three abilities by 1");
  }
  return errors;
}

/** Adds bonuses to base scores. Throws if a score would exceed `max` (20 for character creation). */
export function applyAbilityBonuses(
  base: AbilityScores,
  bonuses: readonly AbilityBonus[],
  max = 20,
): AbilityScores {
  const out = { ...base };
  for (const bonus of bonuses) for (const [a, v] of Object.entries(bonus)) out[a as Ability] += v;
  const over = ABILITIES.filter((a) => out[a] > max && out[a] > base[a]);
  if (over.length) throw new RangeError(`${over.join(", ")} would exceed ${max}`);
  return out;
}
