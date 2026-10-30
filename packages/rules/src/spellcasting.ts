// Spell slots, Pact Magic and spell numbers (SRD 5.2.1 class tables and "Multiclassing").

/** How a class's levels count toward spell slots. */
export type CasterProgression = "full" | "half" | "pact" | "none";

export const CASTER_PROGRESSION: Readonly<Record<string, CasterProgression>> = {
  barbarian: "none",
  bard: "full",
  cleric: "full",
  druid: "full",
  fighter: "none",
  monk: "none",
  paladin: "half",
  ranger: "half",
  rogue: "none",
  sorcerer: "full",
  warlock: "pact",
  wizard: "full",
};

/**
 * Spell slots per spell level (index 0 = level 1) by spellcaster level, from the
 * Multiclass Spellcaster table. A single-class full caster uses the same numbers.
 */
export const SPELL_SLOTS: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export interface ClassLevel {
  classId: string;
  level: number;
}

/**
 * Spellcaster level for slots: all levels in full casters plus half (rounded up) of each
 * half-caster class. Warlock levels don't count; Pact Magic is separate.
 */
export function spellcasterLevel(classes: readonly ClassLevel[]): number {
  let total = 0;
  for (const c of classes) {
    const p = CASTER_PROGRESSION[c.classId] ?? "none";
    if (p === "full") total += c.level;
    else if (p === "half") total += Math.ceil(c.level / 2);
  }
  return total;
}

/** Spell slots per spell level (index 0 = level 1); empty with no spellcasting classes. */
export function spellSlots(classes: readonly ClassLevel[]): number[] {
  const level = spellcasterLevel(classes);
  return level === 0 ? [] : [...SPELL_SLOTS[Math.min(level, 20) - 1]!];
}

/** Warlock Pact Magic: slots that all share one level and come back on a Short Rest. */
export function pactMagic(warlockLevel: number): { slots: number; slotLevel: number } | undefined {
  if (warlockLevel < 1) return undefined;
  const slots = warlockLevel === 1 ? 1 : warlockLevel < 11 ? 2 : warlockLevel < 17 ? 3 : 4;
  const slotLevel = Math.min(5, Math.ceil(warlockLevel / 2));
  return { slots, slotLevel };
}

/** Spell save DC = 8 + spellcasting ability modifier + Proficiency Bonus. */
export function spellSaveDc(abilityMod: number, proficiencyBonus: number): number {
  return 8 + abilityMod + proficiencyBonus;
}

/** Spell attack bonus = spellcasting ability modifier + Proficiency Bonus. */
export function spellAttackBonus(abilityMod: number, proficiencyBonus: number): number {
  return abilityMod + proficiencyBonus;
}

/**
 * The damage dice count of a cantrip that scales at character levels 5, 11 and 17
 * (Fire Bolt: 1d10 → 2d10 → 3d10 → 4d10). Uses total character level, not class level.
 */
export function cantripDice(characterLevel: number): number {
  return characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;
}
