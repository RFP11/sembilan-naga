import { describe, expect, it } from "vitest";
import { applyDamage, applyHealing, deathSave, grantTempHp, type HitPointState } from "./damage";

const hp = (current: number, temp = 0, max = 12, fail = 0, success = 0): HitPointState => ({
  current,
  temp,
  max,
  deathSaves: { success, fail },
});

describe("damage", () => {
  it("uses temporary HP first", () => {
    expect(applyDamage(hp(10, 5), 7)).toMatchObject({ current: 8, temp: 0, dead: false });
    expect(applyDamage(hp(10, 5), 3)).toMatchObject({ current: 10, temp: 2 });
  });

  it("kills outright when the overflow reaches the HP maximum (the SRD example)", () => {
    // Max 12, at 6 HP, takes 18: 12 remains after hitting 0.
    expect(applyDamage(hp(6), 18)).toMatchObject({ current: 0, dead: true });
    expect(applyDamage(hp(6), 17)).toMatchObject({ current: 0, dead: false });
  });

  it("adds Death Save failures for damage at 0 HP", () => {
    expect(applyDamage(hp(0), 3).deathSaves.fail).toBe(1);
    expect(applyDamage(hp(0), 3, { critical: true }).deathSaves.fail).toBe(2);
    expect(applyDamage(hp(0, 0, 12, 2), 1).dead).toBe(true);
    expect(applyDamage(hp(0), 12).dead).toBe(true);
  });
});

describe("healing", () => {
  it("caps at the maximum and resets Death Saves", () => {
    expect(applyHealing(hp(0, 0, 12, 2, 1), 5)).toMatchObject({
      current: 5,
      deathSaves: { success: 0, fail: 0 },
    });
    expect(applyHealing(hp(10), 50).current).toBe(12);
  });

  it("keeps the higher temporary HP", () => {
    expect(grantTempHp(hp(10, 5), 3).temp).toBe(5);
    expect(grantTempHp(hp(10, 5), 8).temp).toBe(8);
  });
});

describe("deathSave", () => {
  it("counts successes and failures, with 1 and 20 special", () => {
    expect(deathSave(hp(0), 12).deathSaves).toEqual({ success: 1, fail: 0 });
    expect(deathSave(hp(0), 9).deathSaves).toEqual({ success: 0, fail: 1 });
    expect(deathSave(hp(0), 1).deathSaves).toEqual({ success: 0, fail: 2 });
    expect(deathSave(hp(0, 0, 12, 0, 2), 15)).toMatchObject({
      stable: true,
      deathSaves: { success: 0, fail: 0 },
    });
    expect(deathSave(hp(0, 0, 12, 2), 4).dead).toBe(true);
    expect(deathSave(hp(0, 0, 12, 1, 1), 20)).toMatchObject({
      current: 1,
      deathSaves: { success: 0, fail: 0 },
    });
  });
});
