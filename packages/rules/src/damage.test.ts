import { describe, expect, it } from "vitest";
import {
  applyDamage,
  applyHealing,
  deathSave,
  grantTempHp,
  isStable,
  setHitPoints,
  type HitPointState,
} from "./damage";

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
    expect(deathSave(hp(0, 0, 12, 1, 2), 15)).toMatchObject({
      stable: true,
      current: 0,
      // Failures are reset on becoming Stable.
      deathSaves: { success: 3, fail: 0 },
    });
    expect(deathSave(hp(0, 0, 12, 2), 4).dead).toBe(true);
    expect(deathSave(hp(0, 0, 12, 1, 1), 20)).toMatchObject({
      current: 1,
      deathSaves: { success: 0, fail: 0 },
    });
  });

  it("doesn't let earlier failures count against a Stable character", () => {
    // Two failures, then Stable: one hit afterwards must not make it three.
    const stable = deathSave(hp(0, 0, 12, 2, 2), 15);
    const hit = applyDamage(stable, 1);
    expect(hit.deathSaves).toEqual({ success: 0, fail: 1 });
    expect(hit.dead).toBe(false);
    expect(applyDamage(stable, 1, { critical: true }).deathSaves.fail).toBe(2);
  });

  it("stays Stable until something changes it", () => {
    const stable = deathSave(hp(0, 0, 12, 0, 2), 15);
    expect(isStable(stable)).toBe(true);
    // Damage starts the saves over, with that damage as the first failure.
    expect(applyDamage(stable, 1).deathSaves).toEqual({ success: 0, fail: 1 });
    expect(isStable(applyDamage(stable, 1))).toBe(false);
    // Healing ends it altogether.
    const healed = applyHealing(stable, 1);
    expect(healed).toMatchObject({ current: 1, deathSaves: { success: 0, fail: 0 } });
    expect(isStable(healed)).toBe(false);
  });
});

describe("setHitPoints", () => {
  it("keeps HP within 0 and the maximum", () => {
    expect(setHitPoints(hp(5), 999).current).toBe(12);
    expect(setHitPoints(hp(5), -3).current).toBe(0);
    expect(setHitPoints(hp(5), 7).current).toBe(7);
  });

  it("clears death saves above 0, and keeps them at 0", () => {
    expect(setHitPoints(hp(0, 0, 12, 2, 1), 4).deathSaves).toEqual({ success: 0, fail: 0 });
    expect(setHitPoints(hp(0, 0, 12, 2, 1), 0).deathSaves).toEqual({ success: 1, fail: 2 });
  });
});
