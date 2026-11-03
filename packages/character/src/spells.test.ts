import { spells } from "@dnd/data";
import { describe, expect, it } from "vitest";
import { classSpellLimits, slotForCasting, spellChoiceProblem, spellsForClass } from "./spells";

const at = (classId: string, level: number) => classSpellLimits([{ classId, level }])[0]!;
const ids = (classId: string, level: number, count: number) =>
  spells
    .filter((s) => (s.classes as readonly string[]).includes(classId) && s.level === level)
    .slice(0, count)
    .map((s) => s.id);

describe("classSpellLimits", () => {
  it("reads a full caster's limits from the class table", () => {
    expect(at("wizard", 5)).toMatchObject({ cantrips: 4, prepared: 9, maxSpellLevel: 3 });
    expect(at("wizard", 1)).toMatchObject({ cantrips: 3, prepared: 4, maxSpellLevel: 1 });
  });

  it("handles half casters, who have no cantrips and lower spells", () => {
    expect(at("paladin", 5)).toMatchObject({ cantrips: 0, prepared: 6, maxSpellLevel: 2 });
  });

  it("reads a warlock's level from its Pact Magic", () => {
    expect(at("warlock", 5)).toMatchObject({ cantrips: 3, prepared: 6, maxSpellLevel: 3 });
  });

  it("leaves out classes without spells", () => {
    expect(classSpellLimits([{ classId: "fighter", level: 5 }])).toEqual([]);
  });

  it("counts each class on its own when multiclassing", () => {
    const limits = classSpellLimits([
      { classId: "fighter", level: 2 },
      { classId: "warlock", level: 1 },
    ]);
    expect(limits).toEqual([expect.objectContaining({ classId: "warlock", prepared: 2 })]);
  });

  it("has sensible numbers for every caster at every level", () => {
    for (const classId of ["bard", "cleric", "druid", "sorcerer", "warlock", "wizard"]) {
      for (let level = 1; level <= 20; level++) {
        const l = at(classId, level);
        expect(l.prepared).toBeGreaterThan(0);
        expect(l.cantrips).toBeGreaterThan(0);
        expect(l.maxSpellLevel).toBeGreaterThanOrEqual(1);
        expect(l.maxSpellLevel).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe("spellChoiceProblem", () => {
  const wizard = at("wizard", 5);

  it("accepts a choice within the limits", () => {
    const pick = [...ids("wizard", 0, 4), ...ids("wizard", 3, 2), ...ids("wizard", 1, 7)];
    expect(spellChoiceProblem(wizard, pick)).toBeNull();
    expect(spellChoiceProblem(wizard, [])).toBeNull();
  });

  it("refuses too many cantrips or prepared spells", () => {
    expect(spellChoiceProblem(wizard, ids("wizard", 0, 5))).toMatch(/cantrip maksimal 4/);
    expect(spellChoiceProblem(wizard, ids("wizard", 1, 10))).toMatch(/disiapkan maksimal 9/);
  });

  it("doesn't count the same spell twice", () => {
    const one = ids("wizard", 1, 1)[0]!;
    expect(spellChoiceProblem(wizard, Array(20).fill(one))).toBeNull();
  });

  it("refuses spells from another class, too high a level, or that don't exist", () => {
    const clericOnly = spells.find(
      (s) => s.classes.includes("cleric") && !s.classes.includes("wizard"),
    )!;
    expect(spellChoiceProblem(wizard, [clericOnly.id])).toMatch(/bukan spell/);
    expect(spellChoiceProblem(wizard, ids("wizard", 4, 1))).toMatch(/bukan spell/);
    expect(spellChoiceProblem(wizard, ["pikachu"])).toMatch(/bukan spell/);
  });

  it("offers a half caster no cantrips", () => {
    expect(spellsForClass(at("paladin", 5)).every((s) => s.level > 0)).toBe(true);
  });
});

describe("slotForCasting", () => {
  const caster = { spellSlots: [2, 1, 1], pactMagic: undefined };
  const none = { slots: {}, pact: 0 };

  it("uses the lowest slot that works", () => {
    expect(slotForCasting(caster, none, 1)).toEqual({ level: 1, pact: false });
    expect(slotForCasting(caster, none, 2)).toEqual({ level: 2, pact: false });
  });

  it("moves up when the lower slots are spent, and stops when all are", () => {
    expect(slotForCasting(caster, { slots: { "1": 2 }, pact: 0 }, 1)).toEqual({
      level: 2,
      pact: false,
    });
    const spent = { slots: { "1": 2, "2": 1, "3": 1 }, pact: 0 };
    expect(slotForCasting(caster, spent, 1)).toBeNull();
  });

  it("takes a chosen higher slot, but not a lower or empty one", () => {
    expect(slotForCasting(caster, none, 1, 3)).toEqual({ level: 3, pact: false });
    expect(slotForCasting(caster, none, 2, 1)).toBeNull();
    expect(slotForCasting(caster, { slots: { "3": 1 }, pact: 0 }, 1, 3)).toBeNull();
    expect(slotForCasting(caster, none, 1, 9)).toBeNull();
  });

  it("uses Pact Magic, which recovers on a Short Rest, first", () => {
    const warlock = { spellSlots: [2], pactMagic: { slots: 1, slotLevel: 1 } };
    expect(slotForCasting(warlock, none, 1)).toEqual({ level: 1, pact: true });
    expect(slotForCasting(warlock, { slots: {}, pact: 1 }, 1)).toEqual({ level: 1, pact: false });
  });

  it("reaches a spell of a level only Pact Magic has", () => {
    const warlock = { spellSlots: [], pactMagic: { slots: 2, slotLevel: 3 } };
    expect(slotForCasting(warlock, none, 1)).toEqual({ level: 3, pact: true });
    expect(slotForCasting(warlock, { slots: {}, pact: 2 }, 1)).toBeNull();
  });
});
