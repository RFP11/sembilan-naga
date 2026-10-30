import type { Alignment } from "@dnd/contracts";
import { classes, skills, species, type AbilityId } from "@dnd/data";

export const ABILITY_NAMES: Record<AbilityId, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const ABILITY_SHORT: Record<AbilityId, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export const ALIGNMENTS: { id: Alignment; name: string }[] = [
  { id: "lg", name: "Lawful Good" },
  { id: "ng", name: "Neutral Good" },
  { id: "cg", name: "Chaotic Good" },
  { id: "ln", name: "Lawful Neutral" },
  { id: "n", name: "Neutral" },
  { id: "cn", name: "Chaotic Neutral" },
  { id: "le", name: "Lawful Evil" },
  { id: "ne", name: "Neutral Evil" },
  { id: "ce", name: "Chaotic Evil" },
];

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export const className = (id: string) => classes.find((c) => c.id === id)?.name ?? id;
export const speciesName = (id: string | null | undefined) =>
  species.find((s) => s.id === id)?.name ?? "";
export const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

/** "Fighter 2 / Warlock 1" */
export const classSummary = (list: { classId: string; level: number }[]) =>
  list.map((c) => `${className(c.classId)} ${c.level}`).join(" / ");
