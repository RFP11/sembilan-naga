// Armor Class (SRD 5.2.1 "Armor", "Unarmored Defense", "Armor Class" when multiclassing).

export interface WornArmor {
  /** Base AC from the Armor table. */
  ac: number;
  addDex: boolean;
  /** Medium armor caps the Dexterity bonus at 2. */
  maxDex?: number;
}

/** An alternative base AC from a feature: 10 + Dex + another ability modifier. */
export interface UnarmoredDefense {
  /** Modifier added besides Dexterity (Con for Barbarian, Wis for Monk, Cha for Draconic Resilience). */
  abilityMod: number;
  /** Barbarian keeps the benefit with a Shield; Monk doesn't. */
  allowsShield: boolean;
}

export interface ArmorClassInput {
  dexMod: number;
  armor?: WornArmor;
  /** Shield bonus (+2 for a normal Shield; magic shields add more). */
  shield?: number;
  /** Features granting an unarmored formula; only usable without armor. */
  unarmored?: readonly UnarmoredDefense[];
  /** Flat bonuses: magic items, the Defense fighting style, spells. */
  bonus?: number;
}

/**
 * Armor Class. A creature with several ways to calculate its base AC uses the best one it
 * qualifies for (only one applies at a time); the Shield and flat bonuses then add on top.
 */
export function armorClass({
  dexMod,
  armor,
  shield,
  unarmored = [],
  bonus = 0,
}: ArmorClassInput): number {
  const bases: number[] = [];
  if (armor) {
    const dex = armor.addDex ? Math.min(dexMod, armor.maxDex ?? Infinity) : 0;
    bases.push(armor.ac + dex);
  } else {
    bases.push(10 + dexMod);
    for (const u of unarmored)
      if (!shield || u.allowsShield) bases.push(10 + dexMod + u.abilityMod);
  }
  return Math.max(...bases) + (shield ?? 0) + bonus;
}
