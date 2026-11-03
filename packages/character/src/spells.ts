import { classes, spells } from "@dnd/data";
import type { DerivedCharacter } from "./derive";

export interface ClassSpellLimits {
  classId: string;
  className: string;
  cantrips: number;
  prepared: number;
  /** The highest spell level this class can prepare at its level. */
  maxSpellLevel: number;
}

/**
 * What each of a character's classes may prepare, from the class tables. Each class counts its
 * own levels, as if single-classed, which is how multiclassing works for preparing spells.
 */
export function classSpellLimits(
  classLevels: readonly { classId: string; level: number }[],
): ClassSpellLimits[] {
  return classLevels.flatMap(({ classId, level }) => {
    const cls = classes.find((c) => c.id === classId);
    const columns = cls?.table.find((row) => row.level === level)?.columns;
    if (!cls || !columns || !columns["Prepared Spells"]) return [];
    const slotLevels = Object.keys(columns)
      .filter((k) => /^\d$/.test(k) && /^\d+$/.test(columns[k]!))
      .map(Number);
    return [
      {
        classId,
        className: cls.name,
        cantrips: Number(columns["Cantrips"] ?? 0),
        prepared: Number(columns["Prepared Spells"]),
        maxSpellLevel: Math.max(0, ...slotLevels, Number(columns["Slot Level"] ?? 0)),
      },
    ];
  });
}

/** The spells a class could choose from at these limits. */
export const spellsForClass = (limits: ClassSpellLimits) =>
  spells.filter(
    (s) =>
      (s.classes as readonly string[]).includes(limits.classId) &&
      (s.level === 0 ? limits.cantrips > 0 : s.level <= limits.maxSpellLevel),
  );

/** Why this choice isn't allowed, or null when it's fine. */
export function spellChoiceProblem(limits: ClassSpellLimits, spellIds: readonly string[]) {
  const allowed = spellsForClass(limits);
  const chosen = [];
  for (const id of new Set(spellIds)) {
    const spell = allowed.find((s) => s.id === id);
    if (!spell) return `${id} bukan spell ${limits.className} yang bisa dipilih di level ini`;
    chosen.push(spell);
  }
  const cantrips = chosen.filter((s) => s.level === 0).length;
  if (cantrips > limits.cantrips) return `cantrip maksimal ${limits.cantrips}`;
  if (chosen.length - cantrips > limits.prepared) {
    return `spell yang disiapkan maksimal ${limits.prepared}`;
  }
  return null;
}

/**
 * Which slot casting a spell uses. Without a choice, the lowest that works: nobody wants to burn
 * a high slot by accident. Null means there's none left.
 */
export function slotForCasting(
  derived: Pick<DerivedCharacter, "spellSlots" | "pactMagic">,
  used: { slots: Readonly<Record<string, number>>; pact: number },
  spellLevel: number,
  wanted?: number,
): { level: number; pact: boolean } | null {
  const hasRegular = (level: number) =>
    (derived.spellSlots[level - 1] ?? 0) > (used.slots[String(level)] ?? 0);
  const pact = derived.pactMagic;
  const hasPact = (level: number) =>
    Boolean(pact && pact.slotLevel === level && pact.slots > used.pact);

  if (wanted !== undefined) {
    if (wanted < spellLevel) return null;
    if (hasRegular(wanted)) return { level: wanted, pact: false };
    return hasPact(wanted) ? { level: wanted, pact: true } : null;
  }
  for (let level = spellLevel; level <= 9; level++) {
    if (hasPact(level)) return { level, pact: true };
    if (hasRegular(level)) return { level, pact: false };
  }
  return null;
}
