import { useSyncExternalStore } from "react";

// How the 3D dice behave on this device. The colour is the player's own and lives on the server
// (others see it too); whether dice tumble and clatter is a matter for each screen.

export interface DiceSettings {
  animate: boolean;
  sound: boolean;
}

const KEY = "dice-settings";
const listeners = new Set<() => void>();

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function load(): DiceSettings {
  const defaults = { animate: !reducedMotion(), sound: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<DiceSettings> | null;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

let current: DiceSettings | null = null;

export function getDiceSettings(): DiceSettings {
  return (current ??= load());
}

export function setDiceSettings(change: Partial<DiceSettings>) {
  current = { ...getDiceSettings(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private windows may refuse storage; the setting still holds until the page closes.
  }
  for (const l of listeners) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useDiceSettings = () => useSyncExternalStore(subscribe, getDiceSettings);
