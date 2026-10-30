// Build → derived numbers. Pure: everything comes from the build and the SRD data.

import type { CharacterBuild } from "@dnd/contracts";
import {
  backgrounds,
  classes,
  species as allSpecies,
  speciesBuilders,
  type AbilityId,
  type Grant,
} from "@dnd/data";
import {
  ABILITIES,
  abilityModifier,
  applyAbilityBonuses,
  armorClass,
  checkBonus,
  maxHitPoints,
  pactMagic,
  passiveScore,
  proficiencyBonus,
  spellAttackBonus,
  spellSaveDc,
  spellSlots,
  type AbilityScores,
  type UnarmoredDefense,
  type WornArmor,
} from "@dnd/rules";

/** Spellcasting ability per class (from each class's Spellcasting / Pact Magic feature). */
export const SPELLCASTING_ABILITY: Readonly<Record<string, AbilityId>> = {
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  ranger: "wis",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int",
};

/** Key of a Choice answer in `build.choices`. */
export const choiceKey = {
  species: (choiceId: string) => `species:${choiceId}`,
  classSkills: (classId: string) => `class:${classId}:skills`,
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Class levels grouped in first-taken order: [{ classId: "fighter", level: 3 }, ...]. */
export function classLevels(build: Pick<CharacterBuild, "levels">) {
  const out: { classId: string; level: number; subclassId?: string }[] = [];
  for (const l of build.levels) {
    const c = out.find((x) => x.classId === l.classId);
    if (c) {
      c.level++;
      c.subclassId ??= l.subclassId;
    } else out.push({ classId: l.classId, level: 1, subclassId: l.subclassId });
  }
  return out;
}

/** Grants from the species plus the options chosen for its Choices. */
export function speciesGrants(build: Pick<CharacterBuild, "speciesId" | "choices">): Grant[] {
  const b = speciesBuilders.find((s) => s.speciesId === build.speciesId);
  if (!b) return [];
  const chosen = b.choices.flatMap((c) => {
    const answer = one(build.choices[choiceKey.species(c.id)]);
    return c.options.find((o) => o.id === answer)?.grants ?? [];
  });
  return [...b.grants, ...chosen];
}

/** Final ability scores, or undefined until base scores are set. Throws past 20 (see validate). */
export function finalScores(
  build: Pick<CharacterBuild, "baseScores" | "backgroundBonus">,
): AbilityScores | undefined {
  return build.baseScores && applyAbilityBonuses(build.baseScores, [build.backgroundBonus]);
}

export interface DerivedOptions {
  armor?: WornArmor;
  shield?: number;
  acBonus?: number;
}

export function deriveCharacter(build: CharacterBuild, opts: DerivedOptions = {}) {
  const level = build.levels.length;
  const pb = proficiencyBonus(Math.max(1, level));
  const perClass = classLevels(build);
  const species = allSpecies.find((s) => s.id === build.speciesId);
  const background = backgrounds.find((b) => b.id === build.backgroundId);
  const grants = speciesGrants(build);

  let scores: AbilityScores | undefined;
  try {
    scores = finalScores(build);
  } catch {
    scores = build.baseScores; // over 20: validate reports it; show the unboosted numbers
  }
  const mod = (a: AbilityId) => (scores ? abilityModifier(scores[a]) : 0);

  // ── Hit points ──
  const hitDie = (classId: string) => classes.find((c) => c.id === classId)?.hitDie ?? 8;
  const hpPerLevel = grants.reduce(
    (n, g) => (g.type === "hit-points-per-level" ? n + g.value : n),
    0,
  );
  // Draconic Resilience: +1 per Sorcerer level once the subclass is taken (level 3).
  const sorcerer = perClass.find((c) => c.classId === "sorcerer");
  const draconic =
    sorcerer?.subclassId === "draconic-sorcery" && sorcerer.level >= 3 ? sorcerer.level : 0;
  const hp =
    level === 0
      ? 0
      : maxHitPoints(
          build.levels.map((l) => ({ hitDie: hitDie(l.classId), roll: l.hpRoll })),
          mod("con"),
          { extraPerLevel: hpPerLevel, extra: draconic },
        );

  // ── Armor Class ──
  const unarmored: UnarmoredDefense[] = [];
  if (perClass.some((c) => c.classId === "barbarian"))
    unarmored.push({ abilityMod: mod("con"), allowsShield: true });
  if (perClass.some((c) => c.classId === "monk"))
    unarmored.push({ abilityMod: mod("wis"), allowsShield: false });
  if (draconic) unarmored.push({ abilityMod: mod("cha"), allowsShield: true });
  const ac = armorClass({
    dexMod: mod("dex"),
    armor: opts.armor,
    shield: opts.shield,
    unarmored,
    bonus: opts.acBonus,
  });

  // ── Proficiencies ──
  const firstClass = classes.find((c) => c.id === build.levels[0]?.classId);
  const savingThrows = new Set<AbilityId>(firstClass?.savingThrows ?? []);
  const skills = new Set<string>([
    ...(background?.skills ?? []),
    ...perClass.flatMap((c) => many(build.choices[choiceKey.classSkills(c.classId)])),
    ...grants.flatMap((g) => (g.type === "skill" ? [g.skillId] : [])),
    ...many(build.choices[choiceKey.species("skills")]),
  ]);

  // ── Senses, speed, defenses ──
  const speed = grants.reduce((s, g) => (g.type === "speed" ? g.walk : s), species?.speed ?? 30);
  const darkvision = Math.max(0, ...grants.map((g) => (g.type === "darkvision" ? g.range : 0)));
  const resistances = [
    ...new Set(grants.flatMap((g) => (g.type === "resistance" ? [g.damageType] : []))),
  ];
  const sizeGrant = grants.find((g) => g.type === "size");
  const size = sizeGrant?.type === "size" ? sizeGrant.size : (species?.size[0] ?? "medium");

  // ── Spellcasting ──
  const casting = perClass
    .filter((c) => SPELLCASTING_ABILITY[c.classId])
    .map((c) => {
      const ability = SPELLCASTING_ABILITY[c.classId]!;
      return {
        classId: c.classId,
        ability,
        saveDc: spellSaveDc(mod(ability), pb),
        attackBonus: spellAttackBonus(mod(ability), pb),
      };
    });
  const warlock = perClass.find((c) => c.classId === "warlock");

  const perceptionBonus = checkBonus(
    scores?.wis ?? 10,
    Math.max(1, level),
    skills.has("perception") ? "proficient" : "none",
  );

  return {
    level,
    proficiencyBonus: pb,
    classes: perClass,
    scores,
    modifiers: scores ? Object.fromEntries(ABILITIES.map((a) => [a, mod(a)])) : undefined,
    savingThrows: [...savingThrows],
    skills: [...skills],
    maxHp: hp,
    ac,
    initiative: mod("dex"),
    speed,
    size,
    darkvision,
    resistances,
    passivePerception: passiveScore(perceptionBonus),
    spellcasting: casting,
    spellSlots: spellSlots(perClass),
    pactMagic: warlock ? pactMagic(warlock.level) : undefined,
    grants,
  };
}

export type DerivedCharacter = ReturnType<typeof deriveCharacter>;
