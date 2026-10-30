// Multiclassing prerequisites (SRD 5.2.1 "Multiclassing").

import type { Ability, AbilityScores } from "./abilities";

/** Primary abilities per class: all of `all`, or one of `any`, must be 13+. */
export const MULTICLASS_PREREQUISITES: Readonly<
  Record<string, { all: readonly Ability[] } | { any: readonly Ability[] }>
> = {
  barbarian: { all: ["str"] },
  bard: { all: ["cha"] },
  cleric: { all: ["wis"] },
  druid: { all: ["wis"] },
  fighter: { any: ["str", "dex"] },
  monk: { all: ["dex", "wis"] },
  paladin: { all: ["str", "cha"] },
  ranger: { all: ["dex", "wis"] },
  rogue: { all: ["dex"] },
  sorcerer: { all: ["cha"] },
  warlock: { all: ["cha"] },
  wizard: { all: ["int"] },
};

const MIN = 13;

function meets(classId: string, scores: AbilityScores): boolean {
  const req = MULTICLASS_PREREQUISITES[classId];
  if (!req) throw new Error(`unknown class "${classId}"`);
  return "all" in req
    ? req.all.every((a) => scores[a] >= MIN)
    : req.any.some((a) => scores[a] >= MIN);
}

/**
 * Problems with taking a level in `newClass`. You need 13+ in the primary ability of the new
 * class and of every class you already have.
 */
export function multiclassProblems(
  scores: AbilityScores,
  currentClasses: readonly string[],
  newClass: string,
): string[] {
  if (currentClasses.includes(newClass)) return [];
  return [...new Set([...currentClasses, newClass])]
    .filter((c) => !meets(c, scores))
    .map((c) => {
      const req = MULTICLASS_PREREQUISITES[c]!;
      const abilities = "all" in req ? req.all.join(" and ") : req.any.join(" or ");
      return `${c} needs ${abilities} ${MIN}+`;
    });
}
