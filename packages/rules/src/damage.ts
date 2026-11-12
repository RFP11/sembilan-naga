// Damage, healing and dying (SRD 5.2.1 "Damage and Healing", "Dropping to 0 Hit Points").

export interface HitPointState {
  current: number;
  temp: number;
  max: number;
  deathSaves: { success: number; fail: number };
}

export interface DamageResult extends HitPointState {
  /** Massive damage: the remainder after reaching 0 HP equals or exceeds the HP maximum. */
  dead: boolean;
}

/**
 * Temporary HP soak damage first. A character who drops to 0 dies outright if the leftover
 * damage is at least their HP maximum; damage taken at 0 HP adds a Death Save failure (two
 * on a Critical Hit) or kills if it equals the maximum. Three failures also mean death.
 */
/** At 0 HP with three successes: no more death saves, until damage or healing changes that. */
export const isStable = (hp: Pick<HitPointState, "current" | "deathSaves">) =>
  hp.current === 0 && hp.deathSaves.success >= 3;

export function applyDamage(
  hp: HitPointState,
  amount: number,
  { critical = false } = {},
): DamageResult {
  if (amount < 0) throw new RangeError("damage can't be negative");
  const absorbed = Math.min(hp.temp, amount);
  const temp = hp.temp - absorbed;
  const rest = amount - absorbed;

  if (hp.current === 0) {
    if (rest === 0) return { ...hp, temp, dead: false };
    // Becoming Stable reset the failures, so this starts a fresh count.
    const fail = Math.min(3, (isStable(hp) ? 0 : hp.deathSaves.fail) + (critical ? 2 : 1));
    return {
      ...hp,
      temp,
      // Damage ends being Stable: the saves start over, with this failure on them.
      deathSaves: { success: isStable(hp) ? 0 : hp.deathSaves.success, fail },
      dead: rest >= hp.max || fail >= 3,
    };
  }
  const current = Math.max(0, hp.current - rest);
  const overflow = rest - hp.current;
  return { ...hp, current, temp, dead: current === 0 && overflow >= hp.max };
}

/** Healing can't exceed the maximum; regaining any HP resets Death Saves. */
export function applyHealing(hp: HitPointState, amount: number): HitPointState {
  if (amount < 0) throw new RangeError("healing can't be negative");
  if (amount === 0) return hp;
  return {
    ...hp,
    current: Math.min(hp.max, hp.current + amount),
    deathSaves: { success: 0, fail: 0 },
  };
}

/** Temporary HP don't stack: keep the higher of the old and new amounts. */
export function grantTempHp(hp: HitPointState, amount: number): HitPointState {
  if (amount < 0) throw new RangeError("temporary HP can't be negative");
  return { ...hp, temp: Math.max(hp.temp, amount) };
}

/** A correction by hand: within 0 to the maximum, and back above 0 clears the death saves. */
export function setHitPoints(hp: HitPointState, amount: number): HitPointState {
  const current = Math.max(0, Math.min(hp.max, amount));
  return {
    ...hp,
    current,
    deathSaves: current > 0 ? { success: 0, fail: 0 } : hp.deathSaves,
  };
}

/**
 * A Death Saving Throw: 10+ succeeds, 1 counts as two failures, 20 regains 1 HP (and resets
 * the saves). Three successes make the character Stable: still at 0 HP, failures reset, and the
 * successes stay on the sheet because they're what says so.
 */
export function deathSave(
  hp: HitPointState,
  d20: number,
): HitPointState & { stable: boolean; dead: boolean } {
  if (d20 === 20) return { ...applyHealing(hp, 1), stable: false, dead: false };
  const success = hp.deathSaves.success + (d20 >= 10 ? 1 : 0);
  const fail = Math.min(3, hp.deathSaves.fail + (d20 === 1 ? 2 : d20 < 10 ? 1 : 0));
  if (success >= 3)
    return { ...hp, deathSaves: { success: 3, fail: 0 }, stable: true, dead: false };
  return { ...hp, deathSaves: { success, fail }, stable: false, dead: fail >= 3 };
}
