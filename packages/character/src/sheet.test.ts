import { characterBuild, type CharacterItem } from "@dnd/contracts";
import { weapons } from "@dnd/data";
import { describe, expect, it } from "vitest";
import {
  checkBonuses,
  deriveCharacter,
  equippedDefense,
  isProficientWith,
  weaponAttacks,
} from "./index";

const item = (kind: CharacterItem["kind"], itemId: string, equipped = true): CharacterItem => ({
  id: `${kind}-${itemId}`,
  kind,
  itemId,
  name: null,
  variant: null,
  quantity: 1,
  equipped,
  attuned: false,
});

const rogue = characterBuild.parse({
  speciesId: "halfling",
  baseScores: { str: 10, dex: 17, con: 12, int: 10, wis: 12, cha: 8 },
  levels: [{ classId: "rogue" }],
  choices: { "class:rogue:skills": ["stealth", "acrobatics", "perception", "deception"] },
});

describe("sheet helpers", () => {
  it("reads worn armor and shield", () => {
    expect(equippedDefense([item("armor", "leather-armor"), item("armor", "shield")])).toEqual({
      armor: { ac: 11, addDex: true },
      shield: 2,
    });
    expect(equippedDefense([item("armor", "chain-mail", false)])).toEqual({});
    const d = deriveCharacter(rogue, equippedDefense([item("armor", "leather-armor")]));
    expect(d.ac).toBe(14); // 11 + Dex 3
  });

  it("parses class weapon proficiencies", () => {
    const w = (id: string) => weapons.find((x) => x.id === id)!;
    expect(isProficientWith(["rogue"], w("rapier"))).toBe(true); // Martial + Finesse
    expect(isProficientWith(["rogue"], w("longsword"))).toBe(false);
    expect(isProficientWith(["monk"], w("scimitar"))).toBe(true); // Light
    expect(isProficientWith(["wizard"], w("longsword"))).toBe(false);
    expect(isProficientWith(["wizard"], w("dagger"))).toBe(true);
    expect(isProficientWith(["fighter"], w("longbow"))).toBe(true);
  });

  it("builds weapon attacks with the right ability", () => {
    const d = deriveCharacter(rogue);
    const attacks = weaponAttacks(d, [
      item("weapon", "longsword", false),
      item("weapon", "rapier"),
      item("weapon", "shortbow"),
    ]);
    expect(attacks.map((a) => [a.name, a.ability, a.toHit, a.damage])).toEqual([
      ["Rapier", "dex", 5, "1d8+3"],
      ["Shortbow", "dex", 5, "1d6+3"],
      ["Longsword", "str", 0, "1d8"], // not proficient, Str +0
    ]);
    expect(attacks[2]!.versatileDamage).toBe("1d10");
  });

  it("computes skill and save bonuses", () => {
    const b = checkBonuses(deriveCharacter(rogue));
    expect(b.skills.find((s) => s.id === "stealth")).toMatchObject({ proficient: true, bonus: 5 });
    expect(b.skills.find((s) => s.id === "arcana")).toMatchObject({ proficient: false, bonus: 0 });
    expect(b.saves.find((s) => s.ability === "dex")).toMatchObject({ proficient: true, bonus: 5 });
  });
});
