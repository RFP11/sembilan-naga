import { characterBuild, type CharacterBuildInput, type CharacterItem } from "@dnd/contracts";
import { describe, expect, it } from "vitest";
import {
  checkBonuses,
  choiceKey,
  classChoiceKey as key,
  classChoiceProblems,
  classChoices,
  classSpellLimits,
  deriveCharacter,
  equippedDefense,
  featAbilityIncrease,
  featById,
  featPrerequisite,
  invocationPrerequisite,
  weaponAttacks,
} from "./index";

const build = (input: CharacterBuildInput) => characterBuild.parse(input);
const levels = (classId: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    classId,
    ...(i >= 2 && { subclassId: subclassOf[classId] }),
  }));
const subclassOf: Record<string, string> = {
  fighter: "champion",
  rogue: "thief",
  warlock: "fiend-patron",
  sorcerer: "draconic-sorcery",
  cleric: "life-domain",
};
const base = {
  baseScores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  backgroundId: "soldier",
  backgroundBonus: { str: 2, con: 1 },
};
const kinds = (b: CharacterBuildInput) =>
  classChoices(build(b)).map((c) => `${c.kind}@${c.characterLevel}`);

describe("classChoices", () => {
  it("reads each class's choices off its table", () => {
    expect(kinds({ levels: levels("fighter", 1) })).toEqual([
      "fighting-style@1",
      "weapon-mastery@1",
    ]);
    expect(kinds({ levels: levels("rogue", 6) })).toEqual([
      "expertise@1",
      "feat@4",
      "expertise@6",
      "weapon-mastery@1",
    ]);
    expect(kinds({ levels: levels("ranger", 2) })).toEqual([
      "expertise@2",
      "languages@2",
      "fighting-style@2",
      "weapon-mastery@1",
    ]);
    expect(kinds({ levels: levels("cleric", 1) })).toEqual(["order@1"]);
  });

  it("sizes running totals for the class level", () => {
    const totals = (classId: string, n: number) =>
      classChoices(build({ levels: levels(classId, n) }))
        .filter((c) => "total" in c)
        .map((c) => [c.kind, "total" in c ? c.total : 0]);
    expect(totals("fighter", 4)).toEqual([["weapon-mastery", 4]]);
    expect(totals("warlock", 5)).toEqual([["invocations", 5]]);
    expect(totals("sorcerer", 10)).toEqual([["metamagic", 4]]);
  });

  it("parses Divine Order options", () => {
    const order = classChoices(build({ levels: levels("cleric", 1) }))[0]!;
    expect(order.kind === "order" && order.options.map((o) => o.id)).toEqual([
      "protector",
      "thaumaturge",
    ]);
  });
});

describe("feat and invocation parsing", () => {
  it("reads ability increases and prerequisites", () => {
    expect(featAbilityIncrease(featById("ability-score-improvement")!)).toMatchObject({
      points: 2,
      max: 20,
    });
    expect(featAbilityIncrease(featById("grappler")!)).toEqual({
      from: ["str", "dex"],
      points: 1,
      max: 20,
    });
    expect(featAbilityIncrease(featById("boon-of-fate")!)).toMatchObject({ points: 1, max: 30 });
    expect(featAbilityIncrease(featById("alert")!)).toBeNull();
    expect(featPrerequisite(featById("grappler")!)).toEqual({
      level: 4,
      abilities: ["str", "dex"],
      minScore: 13,
    });
    expect(
      invocationPrerequisite("Prerequisite: Level 9+ Warlock, Pact of the Blade Invocation"),
    ).toEqual({
      level: 9,
      invocation: "pact-of-the-blade",
    });
  });
});

describe("class choice effects", () => {
  const fighter4: CharacterBuildInput = {
    ...base,
    levels: levels("fighter", 4),
    choices: {
      [choiceKey.classSkills("fighter")]: ["perception", "athletics"],
      [key.fightingStyle("fighter")]: "archery",
      [key.weaponMastery("fighter")]: ["longbow", "greatsword", "javelin", "flail"],
      [key.feat(4)]: "ability-score-improvement",
      [key.featAbilities(4)]: ["dex", "dex"],
    },
  };

  it("applies Ability Score Improvements and checks them", () => {
    const d = deriveCharacter(build(fighter4));
    expect(d.scores).toMatchObject({ str: 17, dex: 16 });
    expect(classChoiceProblems(build(fighter4))).toEqual([]);

    const bad = build({
      ...fighter4,
      choices: { ...fighter4.choices, [key.featAbilities(4)]: ["dex"] },
    });
    expect(classChoiceProblems(bad)).toContain(
      "Ability Score Improvement: raise one ability by 2 or two abilities by 1.",
    );
  });

  it("adds Archery to ranged attacks and shows chosen masteries", () => {
    const d = deriveCharacter(build(fighter4));
    const item = (itemId: string): CharacterItem => ({
      id: itemId,
      kind: "weapon",
      itemId,
      name: null,
      variant: null,
      quantity: 1,
      equipped: true,
      attuned: false,
    });
    const [bow, sword] = weaponAttacks(d, [item("longbow"), item("shortsword")]);
    expect(bow).toMatchObject({ toHit: 3 + 2 + 2, mastery: "slow" }); // Dex 16 +3, PB +2, Archery +2
    expect(sword!.mastery).toBeUndefined();
  });

  it("applies Defense, Alert and Expertise", () => {
    const rogue = build({
      ...base,
      backgroundId: "criminal",
      backgroundBonus: { dex: 2, con: 1 },
      speciesId: "human",
      levels: levels("rogue", 1),
      choices: {
        [choiceKey.species("feat")]: "alert",
        [choiceKey.classSkills("rogue")]: ["acrobatics", "perception", "athletics", "deception"],
        [key.expertise("rogue", 1)]: ["stealth", "perception"],
      },
    });
    const d = deriveCharacter(rogue);
    // Dex 14 + 2 = 16 (+3); Alert adds the Proficiency Bonus (+2).
    expect(d.initiative).toBe(5);
    const skill = (id: string) => checkBonuses(d).skills.find((s) => s.id === id)!;
    expect(skill("stealth")).toMatchObject({ expertise: true, bonus: 3 + 4 }); // Expertise doubles PB
    expect(skill("perception")).toMatchObject({ expertise: true, bonus: 0 + 4 });
    expect(d.passivePerception).toBe(14);

    const defense = build({
      ...base,
      levels: levels("fighter", 1),
      choices: { [key.fightingStyle("fighter")]: "defense" },
    });
    const armor = equippedDefense([
      {
        id: "a",
        kind: "armor",
        itemId: "chain-mail",
        name: null,
        variant: null,
        quantity: 1,
        equipped: true,
        attuned: false,
      },
    ]);
    expect(deriveCharacter(defense, armor).ac).toBe(16 + 1);
    expect(deriveCharacter(defense).ac).toBe(12); // no armor, no Defense bonus
  });

  it("rejects Expertise in skills without proficiency", () => {
    const rogue = build({
      ...base,
      levels: levels("rogue", 1),
      choices: { [key.expertise("rogue", 1)]: ["arcana", "athletics"] },
    });
    expect(classChoiceProblems(rogue)).toContain(
      "Rogue (level 1): choose Expertise in 2 skills you're proficient in.",
    );
  });

  it("gives Thaumaturge an extra cantrip and Wisdom on Arcana and Religion", () => {
    const cleric = build({
      ...base,
      baseScores: { str: 10, dex: 12, con: 13, int: 10, wis: 15, cha: 14 },
      backgroundBonus: {},
      levels: levels("cleric", 1),
      choices: { [key.order("cleric")]: "thaumaturge" },
    });
    const d = deriveCharacter(cleric);
    expect(classSpellLimits(d.classes)[0]!.cantrips).toBe(3 + 1);
    const arcana = checkBonuses(d).skills.find((s) => s.id === "arcana")!;
    expect(arcana.bonus).toBe(0 + 2); // Int 10 (+0) + Wis 15 (+2)
  });

  it("checks invocation prerequisites", () => {
    const warlock = (invocations: string[]) =>
      build({
        ...base,
        levels: levels("warlock", 2),
        choices: { [key.invocations("warlock")]: invocations },
      });
    expect(
      classChoiceProblems(warlock(["pact-of-the-blade", "devils-sight", "armor-of-shadows"])),
    ).toEqual([]);
    expect(
      classChoiceProblems(warlock(["lifedrinker", "devils-sight", "armor-of-shadows"])),
    ).toEqual(
      expect.arrayContaining([
        "Lifedrinker needs Warlock level 9.",
        "Lifedrinker needs the pact of the blade invocation.",
      ]),
    );
  });
});
