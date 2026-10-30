import { describe, expect, it } from "vitest";
import { abilityModifier, checkBonus, proficiencyBonus, unarmoredAC } from "./abilities";

describe("abilityModifier", () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [20, 5],
    [30, 10],
  ])("score %i -> %i", (score, mod) => {
    expect(abilityModifier(score)).toBe(mod);
  });
});

describe("proficiencyBonus", () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ])("level %i -> +%i", (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus);
  });

  it("rejects out-of-range levels", () => {
    expect(() => proficiencyBonus(0)).toThrow(RangeError);
    expect(() => proficiencyBonus(21)).toThrow(RangeError);
  });
});

describe("checkBonus", () => {
  it("adds proficiency and expertise", () => {
    expect(checkBonus(14, 5)).toBe(2);
    expect(checkBonus(14, 5, "proficient")).toBe(5);
    expect(checkBonus(14, 5, "expertise")).toBe(8);
  });
});

it("unarmoredAC", () => {
  expect(unarmoredAC(16)).toBe(13);
});
