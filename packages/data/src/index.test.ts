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
  monsters: srd.monsters,
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
    expect(srd.monsters).toHaveLength(330);
    expect(srd.monsters.filter((m) => m.animal)).toHaveLength(95);
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

  it("nests species trait options under their parent trait", () => {
    const traitsOf = (id: string) => srd.species.find((s) => s.id === id)!.traits;
    const gnome = traitsOf("gnome");
    expect(gnome.find((t) => t.name === "Gnomish Lineage")!.options!.map((o) => o.name)).toEqual([
      "Forest Gnome",
      "Rock Gnome",
    ]);
    expect(gnome.map((t) => t.name)).not.toContain("Forest Gnome");
    expect(traitsOf("goliath").find((t) => t.name === "Giant Ancestry")!.options).toHaveLength(6);
  });
});

describe("SRD monsters", () => {
  // CR → XP from the SRD's "Experience Points by Challenge Rating" table.
  const XP: Record<string, number> = {
    "0": 10,
    "1/8": 25,
    "1/4": 50,
    "1/2": 100,
    "1": 200,
    "2": 450,
    "3": 700,
    "4": 1100,
    "5": 1800,
    "6": 2300,
    "7": 2900,
    "8": 3900,
    "9": 5000,
    "10": 5900,
    "11": 7200,
    "12": 8400,
    "13": 10000,
    "14": 11500,
    "15": 13000,
    "16": 15000,
    "17": 18000,
    "18": 20000,
    "19": 22000,
    "20": 25000,
    "21": 33000,
    "22": 41000,
    "23": 50000,
    "24": 62000,
    "25": 75000,
    "26": 90000,
    "27": 105000,
    "28": 120000,
    "29": 135000,
    "30": 155000,
  };
  // Inconsistencies printed in the SRD itself, kept as published.
  const SRD_ERRATA = new Set([
    "archmage:xp",
    "gray-ooze:initiative",
    "invisible-stalker:initiative",
  ]);
  const ok = (id: string, check: string, pass: boolean) => pass || SRD_ERRATA.has(`${id}:${check}`);

  it.each(srd.monsters.map((m) => [m.id, m] as const))("%s has consistent numbers", (id, m) => {
    expect(ok(id, "xp", m.xp === XP[m.cr] || (m.cr === "0" && m.xp === 0)), "XP for CR").toBe(true);
    expect(m.proficiencyBonus, "PB for CR").toBe(Math.max(2, Math.ceil(m.crValue / 4) + 1));
    expect(ok(id, "initiative", m.initiative.score === 10 + m.initiative.bonus), "initiative").toBe(
      true,
    );
    for (const [ability, a] of Object.entries(m.abilities)) {
      expect(a.mod, ability).toBe(Math.floor((a.score - 10) / 2));
      expect([a.mod, a.mod + m.proficiencyBonus], `${ability} save`).toContain(a.save);
    }
  });

  it("parses attacks into structured data", () => {
    const entries = srd.monsters.flatMap((m) => [
      ...m.actions,
      ...m.bonusActions,
      ...m.legendaryActions,
    ]);
    for (const e of entries) {
      if (/^(Melee|Ranged|Melee or Ranged) Attack Roll:/.test(e.description))
        expect(e.attack, e.name).toBeDefined();
    }
    const rend = srd.monsters
      .find((m) => m.id === "adult-red-dragon")!
      .actions.find((a) => a.name === "Rend")!;
    expect(rend).toMatchObject({
      attack: { kind: "melee", toHit: 14, reach: 10 },
      damage: [
        { average: 13, dice: "1d10+8", type: "slashing" },
        { average: 5, dice: "2d4", type: "fire" },
      ],
    });
    const breath = srd.monsters
      .find((m) => m.id === "adult-red-dragon")!
      .actions.find((a) => a.name === "Fire Breath")!;
    expect(breath).toMatchObject({ usage: "Recharge 5–6", save: { ability: "dex", dc: 21 } });
  });

  it("condition immunities reference real conditions", () => {
    const conditionIds = ids(srd.conditions);
    for (const m of srd.monsters)
      for (const c of m.conditionImmunities) expect(conditionIds, m.id).toContain(c);
  });
});
