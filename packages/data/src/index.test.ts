import { describe, expect, it } from "vitest";
import * as srd from "./index";

const collections = {
  abilities: srd.abilities,
  skills: srd.skills,
  damageTypes: srd.damageTypes,
  conditions: srd.conditions,
  languages: srd.languages,
  glossary: srd.glossary,
  weapons: srd.weapons,
  weaponProperties: srd.weaponProperties,
  weaponMasteries: srd.weaponMasteries,
  armor: srd.armor,
  tools: srd.tools,
  gear: srd.gear,
  magicItems: srd.magicItems,
  spells: srd.spells,
  species: srd.species,
  backgrounds: srd.backgrounds,
  feats: srd.feats,
  classes: srd.classes,
};

const ids = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));

describe("SRD data", () => {
  it.each(Object.entries(collections) as [string, { id: string }[]][])(
    "%s has unique ids",
    (_, list) => {
      expect(list.length).toBeGreaterThan(0);
      expect(ids(list).size).toBe(list.length);
    },
  );

  it("has the full SRD 5.2.1 counts", () => {
    expect(srd.abilities).toHaveLength(6);
    expect(srd.skills).toHaveLength(18);
    expect(srd.conditions).toHaveLength(15);
    expect(srd.damageTypes).toHaveLength(13);
    expect(srd.weapons).toHaveLength(38);
    expect(srd.armor).toHaveLength(13);
    expect(srd.species).toHaveLength(9);
    expect(srd.backgrounds).toHaveLength(4);
    expect(srd.classes).toHaveLength(12);
    expect(srd.spells).toHaveLength(339);
  });

  it("backgrounds reference existing feats and skills", () => {
    const featIds = ids(srd.feats);
    const skillIds = ids(srd.skills);
    for (const b of srd.backgrounds) {
      expect(featIds, b.id).toContain(b.feat);
      for (const s of b.skills) expect(skillIds, b.id).toContain(s);
    }
  });

  it("class skill choices reference existing skills", () => {
    const skillIds = ids(srd.skills);
    for (const c of srd.classes)
      for (const s of c.skillChoices.from) expect(skillIds, c.id).toContain(s);
  });

  it("weapons reference existing properties and masteries", () => {
    const props = ids(srd.weaponProperties);
    const masteries = ids(srd.weaponMasteries);
    for (const w of srd.weapons) {
      for (const p of w.properties) expect(props, w.id).toContain(p);
      expect(masteries, w.id).toContain(w.mastery);
    }
  });

  it("class tables cover levels 1-20 with the standard Proficiency Bonus", () => {
    for (const c of srd.classes) {
      expect(c.table.map((r) => r.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      for (const r of c.table)
        expect(r.proficiencyBonus, `${c.id} ${r.level}`).toBe(Math.ceil(r.level / 4) + 1);
    }
  });

  it("every spellcasting class has spells", () => {
    for (const c of [
      "bard",
      "cleric",
      "druid",
      "paladin",
      "ranger",
      "sorcerer",
      "warlock",
      "wizard",
    ] as const) {
      expect(
        srd.spells.some((s) => s.classes.includes(c)),
        c,
      ).toBe(true);
    }
  });

  it("parses known entries correctly", () => {
    const fireball = srd.spells.find((s) => s.id === "fireball")!;
    expect(fireball).toMatchObject({
      level: 3,
      school: "evocation",
      range: "150 feet",
      concentration: false,
    });
    expect(fireball.higherLevels).toMatch(/1d6 for each spell slot level above 3/);

    expect(srd.weapons.find((w) => w.id === "longsword")).toMatchObject({
      damage: { dice: "1d8", type: "slashing" },
      versatileDice: "1d10",
      mastery: "sap",
      costCp: 1500,
    });
    expect(srd.armor.find((a) => a.id === "half-plate-armor")).toMatchObject({ ac: 15, maxDex: 2 });

    const wizard = srd.classes.find((c) => c.id === "wizard")!;
    expect(wizard).toMatchObject({ hitDie: 6, savingThrows: ["int", "wis"] });
    expect(wizard.table[0]!.columns).toMatchObject({
      Cantrips: "3",
      "Prepared Spells": "4",
      "1": "2",
    });
  });
});
