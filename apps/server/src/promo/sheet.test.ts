import { finalScores, validateBuild } from "@dnd/character";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFromSheet, readSheetFields } from "./sheet";

// A real D&D Beyond (2024) fillable sheet, the same file a player would upload.
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/rafle-sheet.pdf",
);

const readFixture = async () => readSheetFields(await readFile(FIXTURE));

describe("readSheetFields", () => {
  it("reads the sheet's AcroForm fields", async () => {
    const fields = await readFixture();
    expect(fields).toMatchObject({
      CharacterName: "Raffle Snapper",
      RACE: "Human",
      "CLASS  LEVEL": "Ranger 4",
      BACKGROUND: "Criminal / Spy",
      ALIGNMENT: "Chaotic Good",
      STR: "12",
      DEX: "18",
      CON: "10",
      INT: "9",
      WIS: "15",
      CHA: "13",
    });
  });
});

describe("buildFromSheet", () => {
  it("turns the D&D Beyond sheet into a prefilled build", async () => {
    const build = buildFromSheet(await readFixture(), "Fallback");

    expect(build.name).toBe("Raffle Snapper");
    expect(build.speciesId).toBe("human");
    expect(build.backgroundId).toBe("criminal");
    expect(build.alignment).toBe("cg");
    expect(build.levels.map((l) => l.classId)).toEqual(["ranger", "ranger", "ranger", "ranger"]);
    expect(build.levels[0]!.subclassId).toBeUndefined();
    expect(build.levels.slice(2).map((l) => l.subclassId)).toEqual(["hunter", "hunter"]);
    expect(build.choices["species:size"]).toBe("medium");
    expect(build.languages).toHaveLength(2);
    expect(build.notes).toContain("The Forgotten Robin Hood");

    // The sheet's final scores are reproduced: background bonus is subtracted from the base.
    expect(finalScores(build)).toEqual({ str: 12, dex: 18, con: 10, int: 9, wis: 15, cha: 13 });
    expect(build.abilityMethod).toBe("roll");
    expect(build.abilityRolls).toEqual([...build.abilityRolls!].sort((a, b) => a - b));
  });

  it("leaves only the steps the player still has to answer", async () => {
    const steps = new Set(
      validateBuild(buildFromSheet(await readFixture(), "")).map((i) => i.step),
    );
    expect(steps.has("class")).toBe(false);
    expect(steps.has("abilities")).toBe(false);
    expect(steps.has("alignment")).toBe(false);
    // Human's Skillful/Versatile, the class skills, and the starting equipment still need a call.
    expect(steps.has("origin")).toBe(true);
    expect(steps.has("details")).toBe(true);
  });

  it("falls back to the registration name when nothing can be read", () => {
    expect(buildFromSheet({}, "Kara")).toMatchObject({
      name: "Kara",
      levels: [],
      choices: {},
      languages: [],
      notes: "",
    });
  });
});
