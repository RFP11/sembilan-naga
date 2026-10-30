import { characterBuild, type CharacterBuildInput } from "@dnd/contracts";
import { describe, expect, it } from "vitest";
import { choiceKey, deriveCharacter, startingInventory, validateBuild } from "./index";

const build = (input: CharacterBuildInput) => characterBuild.parse(input);

/** A complete level-1 dwarf fighter (soldier). */
const fighter: CharacterBuildInput = {
  name: "Brunhild",
  speciesId: "dwarf",
  backgroundId: "soldier",
  alignment: "lg",
  abilityMethod: "standard",
  baseScores: { str: 15, dex: 14, con: 13, int: 8, wis: 10, cha: 12 },
  backgroundBonus: { str: 2, con: 1 },
  levels: [{ classId: "fighter" }],
  choices: { [choiceKey.classSkills("fighter")]: ["perception", "survival"] },
  equipment: { class: "a", background: "a" },
  languages: ["dwarvish", "giant"],
};

describe("validateBuild", () => {
  it("accepts a complete character", () => {
    expect(validateBuild(build(fighter))).toEqual([]);
  });

  it("lists what an empty draft still needs, per step", () => {
    const steps = new Set(validateBuild(build({})).map((i) => i.step));
    expect(steps).toEqual(new Set(["class", "origin", "abilities", "alignment", "details"]));
  });

  it("checks the ability score method and the background bonus", () => {
    const issues = validateBuild(
      build({
        ...fighter,
        baseScores: { ...fighter.baseScores!, str: 14 },
        backgroundBonus: { str: 2, wis: 1 },
      }),
    ).map((i) => i.message);
    expect(issues).toContain("Assign the standard array: 15, 14, 13, 12, 10, 8.");
    expect(issues).toContain("wis is not one of this background's abilities (str, dex, con)");
  });

  it("requires species choices and the subclass at level 3", () => {
    const elf = build({
      ...fighter,
      speciesId: "elf",
      levels: [{ classId: "fighter" }, { classId: "fighter" }, { classId: "fighter" }],
    });
    const messages = validateBuild(elf).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Elf: choose Elven Lineage.",
        "Elf: choose Spellcasting Ability.",
        "Elf: choose Keen Senses.",
        "Choose a Fighter subclass.",
      ]),
    );
  });

  it("enforces human skill/feat picks, skill lists, and multiclass prerequisites", () => {
    const human = build({
      ...fighter,
      speciesId: "human",
      choices: {
        [choiceKey.species("size")]: "medium",
        [choiceKey.species("skills")]: "stealth",
        [choiceKey.species("feat")]: "grappler", // a General feat, not Origin
        [choiceKey.classSkills("fighter")]: ["athletics", "arcana"], // athletics: also Soldier; arcana: not Fighter
      },
      levels: [{ classId: "fighter" }, { classId: "wizard" }],
    });
    const messages = validateBuild(human).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Human: choose an origin feat.",
        "Fighter: choose 2 skills from the class list.",
        "Multiclassing: wizard needs int 13+.",
      ]),
    );
  });
});

describe("deriveCharacter", () => {
  it("computes level-1 numbers", () => {
    const d = deriveCharacter(build(fighter));
    expect(d.scores).toEqual({ str: 17, dex: 14, con: 14, int: 8, wis: 10, cha: 12 });
    // d10 + Con 2 + Dwarven Toughness 1
    expect(d.maxHp).toBe(13);
    expect(d).toMatchObject({ level: 1, proficiencyBonus: 2, ac: 12, speed: 30, darkvision: 120 });
    expect(d.resistances).toEqual(["poison"]);
    expect(d.savingThrows).toEqual(["str", "con"]);
    expect(d.skills.sort()).toEqual(["athletics", "intimidation", "perception", "survival"]);
    expect(d.passivePerception).toBe(12);
    expect(d.spellSlots).toEqual([]);
  });

  it("applies species options, armor and spellcasting", () => {
    const d = deriveCharacter(
      build({
        ...fighter,
        speciesId: "elf",
        choices: { [choiceKey.species("elven-lineage")]: "wood-elf" },
        levels: [{ classId: "wizard" }, { classId: "wizard", hpRoll: 2 }],
        baseScores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
        backgroundBonus: {},
      }),
      { armor: { ac: 11, addDex: true } },
    );
    expect(d).toMatchObject({ speed: 35, darkvision: 60, ac: 13, maxHp: 6 + 1 + (2 + 1) });
    expect(d.spellcasting).toEqual([
      { classId: "wizard", ability: "int", saveDc: 12, attackBonus: 4 },
    ]);
    expect(d.spellSlots).toEqual([3]);
  });
});

describe("startingInventory", () => {
  it("collects the chosen packages and gold", () => {
    const { items, gp } = startingInventory(build(fighter));
    expect(gp).toBe(4 + 14);
    expect(items).toEqual(
      expect.arrayContaining([
        {
          kind: "armor",
          itemId: "chain-mail",
          name: null,
          variant: null,
          quantity: 1,
          equipped: true,
        },
        {
          kind: "weapon",
          itemId: "javelin",
          name: null,
          variant: null,
          quantity: 8,
          equipped: true,
        },
        {
          kind: "gear",
          itemId: "ammunition",
          name: null,
          variant: "Arrows",
          quantity: 20,
          equipped: false,
        },
        {
          kind: "custom",
          itemId: null,
          name: "Tool (your proficiency)",
          variant: null,
          quantity: 1,
          equipped: false,
        },
      ]),
    );
  });

  it("gives only gold for the gold option", () => {
    expect(
      startingInventory(build({ ...fighter, equipment: { class: "c", background: "b" } })),
    ).toEqual({
      items: [],
      gp: 155 + 50,
    });
  });
});
