// Choices that classes ask for as they level: Fighting Style, Ability Score Improvement or a
// feat, Expertise, Weapon Mastery, Divine / Primal Order, Eldritch Invocations, Metamagic.
// They're read off the SRD class tables (feature names and columns), so one function serves
// the builder, level-up, validation and the sheet.

import type { CharacterBuild } from "@dnd/contracts";
import { classes, feats, type AbilityId, type Feat } from "@dnd/data";

export const ABILITY_IDS: readonly AbilityId[] = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_BY_NAME: Record<string, AbilityId> = {
  Strength: "str",
  Dexterity: "dex",
  Constitution: "con",
  Intelligence: "int",
  Wisdom: "wis",
  Charisma: "cha",
};

/** Keys of the answers in `build.choices`. */
export const classChoiceKey = {
  fightingStyle: (classId: string) => `class:${classId}:fighting-style`,
  expertise: (classId: string, classLevel: number) => `class:${classId}:expertise:${classLevel}`,
  weaponMastery: (classId: string) => `class:${classId}:weapon-mastery`,
  order: (classId: string) => `class:${classId}:order`,
  invocations: (classId: string) => `class:${classId}:invocations`,
  metamagic: (classId: string) => `class:${classId}:metamagic`,
  languages: (classId: string) => `class:${classId}:languages`,
  /** Feat for the Ability Score Improvement / Epic Boon gained at this character level. */
  feat: (characterLevel: number) => `level:${characterLevel}:feat`,
  /** Abilities that feat raises: ["str", "str"] is +2 Str, ["str", "dex"] is +1 each. */
  featAbilities: (characterLevel: number) => `level:${characterLevel}:abilities`,
};

export type ClassChoice =
  | { kind: "fighting-style"; key: string; classId: string; characterLevel: number }
  | {
      kind: "feat";
      key: string;
      abilitiesKey: string;
      classId: string;
      characterLevel: number;
      category: "general" | "epic-boon";
    }
  | { kind: "expertise"; key: string; classId: string; characterLevel: number; count: number }
  | { kind: "weapon-mastery"; key: string; classId: string; characterLevel: number; total: number }
  | {
      kind: "order";
      key: string;
      classId: string;
      characterLevel: number;
      name: string;
      options: { id: string; name: string; description: string }[];
    }
  | {
      kind: "invocations" | "metamagic";
      key: string;
      classId: string;
      characterLevel: number;
      total: number;
    }
  | { kind: "languages"; key: string; classId: string; characterLevel: number; count: number };

/** Run-in options of a feature ("**Protector.** ...") → { id, name, description }. */
function featureOptions(description: string) {
  return [...description.matchAll(/\*\*([^*]+?)\.\*\* ([^\n]+)/g)].map((m) => ({
    id: m[1]!.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: m[1]!,
    description: m[2]!,
  }));
}

/**
 * Every choice the build's levels call for, in level order. A choice is introduced at the
 * character level shown; totals (Weapon Mastery, Invocations, Metamagic) are for the class's
 * current level, so levelling up only adds to the same answer.
 */
export function classChoices(build: Pick<CharacterBuild, "levels">): ClassChoice[] {
  const out: ClassChoice[] = [];
  const perClass = new Map<string, number>();
  const firstLevelOf = new Map<string, number>();

  build.levels.forEach((l, i) => {
    const characterLevel = i + 1;
    const classLevel = (perClass.get(l.classId) ?? 0) + 1;
    perClass.set(l.classId, classLevel);
    if (!firstLevelOf.has(l.classId)) firstLevelOf.set(l.classId, characterLevel);
    const cls = classes.find((c) => c.id === l.classId);
    const row = cls?.table.find((r) => r.level === classLevel);
    if (!cls || !row) return;

    for (const feature of row.features) {
      if (feature === "Fighting Style") {
        out.push({
          kind: "fighting-style",
          key: classChoiceKey.fightingStyle(cls.id),
          classId: cls.id,
          characterLevel,
        });
      } else if (feature === "Ability Score Improvement" || feature === "Epic Boon") {
        out.push({
          kind: "feat",
          key: classChoiceKey.feat(characterLevel),
          abilitiesKey: classChoiceKey.featAbilities(characterLevel),
          classId: cls.id,
          characterLevel,
          category: feature === "Epic Boon" ? "epic-boon" : "general",
        });
      } else if (feature === "Expertise" || feature === "Deft Explorer") {
        // Two skills, except Deft Explorer's one (it also teaches two languages).
        const count = feature === "Deft Explorer" ? 1 : 2;
        out.push({
          kind: "expertise",
          key: classChoiceKey.expertise(cls.id, classLevel),
          classId: cls.id,
          characterLevel,
          count,
        });
        if (feature === "Deft Explorer") {
          out.push({
            kind: "languages",
            key: classChoiceKey.languages(cls.id),
            classId: cls.id,
            characterLevel,
            count: 2,
          });
        }
      } else if (feature === "Divine Order" || feature === "Primal Order") {
        const text = cls.features.find((f) => f.name === feature)!.description;
        out.push({
          kind: "order",
          key: classChoiceKey.order(cls.id),
          classId: cls.id,
          characterLevel,
          name: feature,
          options: featureOptions(text),
        });
      }
    }
  });

  // Running totals: one answer per class, sized for its current level.
  for (const [classId, level] of perClass) {
    const cls = classes.find((c) => c.id === classId)!;
    const columns = cls.table.find((r) => r.level === level)?.columns ?? {};
    const at = firstLevelOf.get(classId)!;
    // Barbarian and Fighter grow it in a table column; Paladin, Ranger and Rogue keep two.
    const masteryFeature = cls.features.some((f) => f.name === "Weapon Mastery");
    if (columns["Weapon Mastery"] || masteryFeature) {
      out.push({
        kind: "weapon-mastery",
        key: classChoiceKey.weaponMastery(classId),
        classId,
        characterLevel: at,
        total: Number(columns["Weapon Mastery"] ?? 2),
      });
    }
    if (columns["Eldritch Invocations"]) {
      out.push({
        kind: "invocations",
        key: classChoiceKey.invocations(classId),
        classId,
        characterLevel: at,
        total: Number(columns["Eldritch Invocations"]),
      });
    }
    if (classId === "sorcerer" && level >= 2) {
      out.push({
        kind: "metamagic",
        key: classChoiceKey.metamagic(classId),
        classId,
        characterLevel: at,
        total: level >= 17 ? 6 : level >= 10 ? 4 : 2,
      });
    }
  }
  return out;
}

/**
 * The abilities a feat's "Ability Score Increase" lets you raise, how many points, and the cap.
 * The Ability Score Improvement feat itself gives 2 points (one ability +2, or two +1).
 */
export function featAbilityIncrease(
  feat: Feat,
): { from: AbilityId[]; points: number; max: number } | null {
  if (feat.id === "ability-score-improvement")
    return { from: [...ABILITY_IDS], points: 2, max: 20 };
  const benefit = feat.benefits.find((b) => b.name === "Ability Score Increase");
  if (!benefit) return null;
  const text = benefit.description;
  const max = /maximum of (\d+)/.exec(text)?.[1];
  const from = /one ability score of your choice/.test(text)
    ? [...ABILITY_IDS]
    : Object.entries(ABILITY_BY_NAME)
        .filter(([name]) => text.includes(name))
        .map(([, id]) => id);
  return { from, points: 1, max: max ? Number(max) : 20 };
}

/** "Level 4+, Strength or Dexterity 13+" → what a character must have to take the feat. */
export function featPrerequisite(feat: Feat): {
  level: number;
  abilities: AbilityId[];
  minScore: number;
} {
  const text = feat.prerequisite ?? "";
  const level = Number(/Level (\d+)\+/.exec(text)?.[1] ?? 0);
  const scoreMatch =
    /((?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:(?:,| or) (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))*) (\d+)\+/.exec(
      text,
    );
  const abilities = scoreMatch
    ? Object.entries(ABILITY_BY_NAME)
        .filter(([name]) => scoreMatch[1]!.includes(name))
        .map(([, id]) => id)
    : [];
  return { level, abilities, minScore: scoreMatch ? Number(scoreMatch[2]) : 0 };
}

/** "Prerequisite: Level 5+ Warlock, Pact of the Blade Invocation" → level and required invocation. */
export function invocationPrerequisite(text: string | undefined): {
  level: number;
  invocation?: string;
} {
  const level = Number(/Level (\d+)\+/.exec(text ?? "")?.[1] ?? 0);
  const needs = /, ([A-Z][\w ’']+?) Invocation/.exec(text ?? "")?.[1];
  return { level, ...(needs && { invocation: needs.toLowerCase().replace(/[^a-z0-9]+/g, "-") }) };
}

export const featById = (id: string | undefined) => feats.find((f) => f.id === id);
