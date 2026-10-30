import { describe, expect, it } from "vitest";
import type { AbilityScores } from "./abilities";
import { armorClass } from "./armor";
import { fixedHitPoints, hitDicePool, maxHitPoints } from "./hp";
import { levelForXp, xpForLevel } from "./levels";
import { multiclassProblems } from "./multiclass";
import { encounterXpBudget, exhaustionEffects, passiveScore } from "./play";
import {
  applyAbilityBonuses,
  isStandardArray,
  pointBuyCost,
  roll4d6DropLowest,
  validateBackgroundBonus,
  validatePointBuy,
} from "./scores";
import {
  cantripDice,
  pactMagic,
  spellAttackBonus,
  spellcasterLevel,
  spellSaveDc,
  spellSlots,
} from "./spellcasting";

const scores = (
  str: number,
  dex: number,
  con: number,
  int: number,
  wis: number,
  cha: number,
): AbilityScores => ({
  str,
  dex,
  con,
  int,
  wis,
  cha,
});

describe("levels", () => {
  it("maps XP to levels and back", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(10)).toBe(64000);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(1_000_000)).toBe(20);
  });
});

describe("ability scores", () => {
  it("prices point buy (14 costs 7; the standard 27-point spread is legal)", () => {
    expect(pointBuyCost(scores(15, 15, 15, 8, 8, 8))).toBe(27);
    expect(validatePointBuy(scores(15, 15, 15, 8, 8, 8))).toEqual([]);
    expect(validatePointBuy(scores(15, 15, 15, 9, 8, 8))).toEqual([
      "costs 28 points; the budget is 27",
    ]);
    expect(validatePointBuy(scores(16, 8, 8, 8, 8, 8))).toEqual([
      "point-buy scores must be between 8 and 15",
    ]);
  });

  it("recognizes the standard array in any order", () => {
    expect(isStandardArray(scores(8, 10, 12, 13, 14, 15))).toBe(true);
    expect(isStandardArray(scores(15, 15, 13, 12, 10, 8))).toBe(false);
  });

  it("rolls 4d6 and drops the lowest", () => {
    const dice = [0.99, 0, 0.5, 0.3]; // 6, 1, 4, 2
    const rng = () => dice.shift()!;
    expect(roll4d6DropLowest(rng)).toEqual({ rolls: [6, 1, 4, 2], dropped: 1, total: 12 });
  });

  it("validates background bonuses (+2/+1 or +1/+1/+1 among its three abilities)", () => {
    const soldier = ["str", "dex", "con"] as const;
    expect(validateBackgroundBonus({ str: 2, con: 1 }, soldier)).toEqual([]);
    expect(validateBackgroundBonus({ str: 1, dex: 1, con: 1 }, soldier)).toEqual([]);
    expect(validateBackgroundBonus({ str: 2, dex: 2 }, soldier)).toHaveLength(1);
    expect(validateBackgroundBonus({ str: 2, wis: 1 }, soldier)).toEqual([
      "wis is not one of this background's abilities (str, dex, con)",
    ]);
  });

  it("applies bonuses but never past 20", () => {
    expect(applyAbilityBonuses(scores(15, 14, 13, 12, 10, 8), [{ str: 2, con: 1 }])).toMatchObject({
      str: 17,
      con: 14,
    });
    expect(() => applyAbilityBonuses(scores(19, 8, 8, 8, 8, 8), [{ str: 2 }])).toThrow(
      "str would exceed 20",
    );
  });
});

describe("hit points", () => {
  it("uses the die maximum at level 1 and the fixed value after", () => {
    expect(fixedHitPoints(10)).toBe(6);
    // Fighter 1 with Con 14: 10 + 2
    expect(maxHitPoints([{ hitDie: 10 }], 2)).toBe(12);
    // Fighter 3, fixed: 12 + (6+2) + (6+2)
    expect(maxHitPoints([{ hitDie: 10 }, { hitDie: 10 }, { hitDie: 10 }], 2)).toBe(28);
  });

  it("uses rolls, gives at least 1 per level, and adds per-level bonuses", () => {
    expect(maxHitPoints([{ hitDie: 6 }, { hitDie: 6, roll: 1 }], -3)).toBe(4); // 3 + max(1, -2)
    // Dwarf wizard 2 (Dwarven Toughness: +1 per level): (6+1) + (4+1) + 2
    expect(maxHitPoints([{ hitDie: 6 }, { hitDie: 6, roll: 4 }], 1, { extraPerLevel: 1 })).toBe(14);
    expect(() => maxHitPoints([{ hitDie: 6 }, { hitDie: 6, roll: 7 }], 0)).toThrow(RangeError);
  });

  it("pools hit dice by size for multiclass characters", () => {
    expect(hitDicePool([{ hitDie: 8 }, { hitDie: 10 }, { hitDie: 8 }])).toEqual({ 8: 2, 10: 1 });
  });
});

describe("armorClass", () => {
  it("adds Dex to light armor and caps it for medium armor", () => {
    expect(armorClass({ dexMod: 3, armor: { ac: 11, addDex: true } })).toBe(14);
    expect(armorClass({ dexMod: 3, armor: { ac: 14, addDex: true, maxDex: 2 } })).toBe(16);
    expect(armorClass({ dexMod: 3, armor: { ac: 16, addDex: false }, shield: 2 })).toBe(18);
  });

  it("picks the best unarmored formula", () => {
    const barbarian = { abilityMod: 3, allowsShield: true };
    const monk = { abilityMod: 3, allowsShield: false };
    expect(armorClass({ dexMod: 2 })).toBe(12);
    expect(armorClass({ dexMod: 2, unarmored: [barbarian], shield: 2 })).toBe(17);
    expect(armorClass({ dexMod: 2, unarmored: [monk], shield: 2 })).toBe(14); // Monk loses it with a Shield
    expect(armorClass({ dexMod: 2, unarmored: [monk] })).toBe(15);
    expect(armorClass({ dexMod: 2, armor: { ac: 11, addDex: true }, unarmored: [barbarian] })).toBe(
      13,
    );
    expect(armorClass({ dexMod: 2, bonus: 1, armor: { ac: 18, addDex: false } })).toBe(19);
  });
});

describe("spellcasting", () => {
  it("adds full caster levels and half of half-caster levels, rounding up per class", () => {
    expect(spellcasterLevel([{ classId: "wizard", level: 3 }])).toBe(3);
    // The SRD example: Ranger 4 / Sorcerer 3 counts as level 5.
    expect(
      spellcasterLevel([
        { classId: "ranger", level: 4 },
        { classId: "sorcerer", level: 3 },
      ]),
    ).toBe(5);
    expect(spellcasterLevel([{ classId: "paladin", level: 1 }])).toBe(1);
    expect(
      spellcasterLevel([
        { classId: "fighter", level: 5 },
        { classId: "warlock", level: 5 },
      ]),
    ).toBe(0);
    expect(spellSlots([{ classId: "fighter", level: 5 }])).toEqual([]);
    expect(
      spellSlots([
        { classId: "ranger", level: 4 },
        { classId: "sorcerer", level: 3 },
      ]),
    ).toEqual([4, 3, 2]);
  });

  it("computes DCs and cantrip scaling", () => {
    expect(spellSaveDc(3, 2)).toBe(13);
    expect(spellAttackBonus(3, 2)).toBe(5);
    expect([1, 4, 5, 10, 11, 17, 20].map(cantripDice)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });

  it("gives Pact Magic slots", () => {
    expect(pactMagic(0)).toBeUndefined();
    expect(pactMagic(1)).toEqual({ slots: 1, slotLevel: 1 });
    expect(pactMagic(11)).toEqual({ slots: 3, slotLevel: 5 });
  });
});

describe("multiclassing", () => {
  const s = scores(14, 13, 12, 10, 13, 8);
  it("needs 13+ in the primary abilities of the old and new classes", () => {
    expect(multiclassProblems(s, ["fighter"], "druid")).toEqual([]);
    expect(multiclassProblems(s, ["fighter"], "paladin")).toEqual([
      "paladin needs str and cha 13+",
    ]);
    expect(multiclassProblems(s, ["wizard"], "fighter")).toEqual(["wizard needs int 13+"]);
    expect(multiclassProblems(s, ["fighter"], "fighter")).toEqual([]);
  });
});

describe("play", () => {
  it("passive scores, exhaustion, and encounter budgets", () => {
    expect(passiveScore(4)).toBe(14);
    expect(exhaustionEffects(3)).toEqual({ d20Penalty: -6, speedPenalty: -15, dead: false });
    expect(exhaustionEffects(6).dead).toBe(true);
    expect(encounterXpBudget([3, 3, 3, 3], "moderate")).toBe(900);
    expect(encounterXpBudget([1, 5], "high")).toBe(1200);
  });
});
