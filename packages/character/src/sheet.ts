// Numbers the character sheet shows that depend on inventory: AC from worn armor,
// weapon attacks, and check / save bonuses.

import type { CharacterItem } from "@dnd/contracts";
import {
  armor as armorTable,
  classes,
  skills,
  weapons,
  type AbilityId,
  type Weapon,
} from "@dnd/data";
import { checkBonus, type WornArmor } from "@dnd/rules";
import type { DerivedCharacter } from "./derive";

/** Worn armor and the Shield bonus from equipped items (the first of each counts). */
export function equippedDefense(items: readonly CharacterItem[]): {
  armor?: WornArmor;
  shield?: number;
} {
  const worn = items
    .filter((i) => i.equipped && i.kind === "armor")
    .map((i) => armorTable.find((a) => a.id === i.itemId))
    .filter((a) => a !== undefined);
  const body = worn.find((a) => a.category !== "shield");
  const shield = worn.find((a) => a.category === "shield");
  return {
    ...(body && {
      armor: {
        ac: body.ac,
        addDex: body.addDex,
        ...(body.maxDex !== undefined && { maxDex: body.maxDex }),
      },
    }),
    ...(shield && { shield: shield.ac }),
  };
}

/**
 * Whether the classes' weapon proficiencies cover a weapon. Parses the SRD wording, e.g.
 * "Simple weapons and Martial weapons that have the Finesse or Light property".
 */
export function isProficientWith(
  classIds: readonly string[],
  weapon: Weapon,
  { martial = false }: { martial?: boolean } = {},
): boolean {
  if (martial) return true; // Protector / Warden: Simple and Martial weapons
  return classIds.some((id) => {
    const text = classes.find((c) => c.id === id)?.weaponProficiencies ?? "";
    if (weapon.category === "simple") return /Simple/.test(text);
    const limited = /Martial weapons that have the (.+?) propert/.exec(text);
    if (!limited) return /Martial/.test(text);
    const allowed = limited[1]!.toLowerCase().split(/ or /);
    return weapon.properties.some((p) => allowed.includes(p));
  });
}

export interface WeaponAttack {
  itemId: string;
  name: string;
  equipped: boolean;
  ability: AbilityId;
  proficient: boolean;
  toHit: number;
  /** "1d8+3" */
  damage: string;
  damageType: string;
  /** Two-handed damage for Versatile weapons. */
  versatileDamage?: string;
  range?: string;
  /** The weapon's mastery property, when the character has chosen this kind of weapon. */
  mastery?: string;
}

const withMod = (dice: string, mod: number) =>
  mod === 0 ? dice : `${dice}${mod > 0 ? "+" : ""}${mod}`;

/** One attack per weapon in the inventory (equipped ones first). */
export function weaponAttacks(
  derived: DerivedCharacter,
  items: readonly CharacterItem[],
): WeaponAttack[] {
  const mods = derived.modifiers ?? { str: 0, dex: 0 };
  const classIds = derived.classes.map((c) => c.classId);
  return items
    .filter((i) => i.kind === "weapon")
    .flatMap((i) => {
      const w = weapons.find((x) => x.id === i.itemId);
      if (!w) return [];
      // Ranged weapons use Dex, Finesse lets you pick the better of Str and Dex.
      const ability: AbilityId =
        w.kind === "ranged"
          ? "dex"
          : w.properties.includes("finesse") && mods.dex! > mods.str!
            ? "dex"
            : "str";
      const mod = mods[ability] ?? 0;
      const proficient = isProficientWith(classIds, w, { martial: derived.martialWeapons });
      // Archery fighting style: +2 to attack rolls with Ranged weapons.
      const archery = w.kind === "ranged" && derived.feats.includes("archery") ? 2 : 0;
      return [
        {
          itemId: i.id,
          name: w.name,
          equipped: i.equipped,
          ability,
          proficient,
          toHit: mod + (proficient ? derived.proficiencyBonus : 0) + archery,
          damage: withMod(w.damage.dice, mod),
          damageType: w.damage.type,
          ...(w.versatileDice && { versatileDamage: withMod(w.versatileDice, mod) }),
          ...(w.range && { range: `${w.range.normal}/${w.range.long} ft` }),
          ...(derived.weaponMasteries.includes(w.id) && { mastery: w.mastery }),
        },
      ];
    })
    .sort((a, b) => Number(b.equipped) - Number(a.equipped));
}

/** Bonus for every skill check and saving throw. */
export function checkBonuses(derived: DerivedCharacter) {
  const score = (a: AbilityId) => derived.scores?.[a] ?? 10;
  const level = Math.max(1, derived.level);
  return {
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      ability: s.ability,
      proficient: derived.skills.includes(s.id),
      expertise: derived.expertise.includes(s.id),
      bonus:
        checkBonus(
          score(s.ability),
          level,
          derived.expertise.includes(s.id)
            ? "expertise"
            : derived.skills.includes(s.id)
              ? "proficient"
              : "none",
        ) + (derived.skillBonus[s.id] ?? 0),
    })),
    saves: (["str", "dex", "con", "int", "wis", "cha"] as const).map((a) => ({
      ability: a,
      proficient: derived.savingThrows.includes(a),
      bonus: checkBonus(score(a), level, derived.savingThrows.includes(a) ? "proficient" : "none"),
    })),
    /** Plain ability checks. */
    abilities: (["str", "dex", "con", "int", "wis", "cha"] as const).map((a) => ({
      ability: a,
      bonus: checkBonus(score(a), level),
    })),
  };
}
