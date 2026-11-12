// What keeps a draft from being ready. The builder shows these per step; the server refuses
// to finalize while any remain.

import type { BuildIssue, CharacterBuild } from "@dnd/contracts";
import {
  backgrounds,
  classes,
  feats,
  languages,
  skills,
  species,
  speciesBuilders,
  weapons,
} from "@dnd/data";
import {
  isStandardArray,
  multiclassProblems,
  validateBackgroundBonus,
  validatePointBuy,
  type AbilityScores,
} from "@dnd/rules";
import {
  classChoices,
  featAbilityIncrease,
  featById,
  featPrerequisite,
  invocationPrerequisite,
} from "./classChoices";
import { characterFeats, choiceKey, classLevels, deriveCharacter, finalScores } from "./derive";

const many = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

export function validateBuild(build: CharacterBuild): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const add = (step: BuildIssue["step"], message: string) => issues.push({ step, message });

  // ── Class ──
  if (!build.levels.length) add("class", "Choose a class.");
  const perClass = classLevels(build);
  for (const c of perClass) {
    const cls = classes.find((x) => x.id === c.classId);
    if (!cls) {
      add("class", `Unknown class "${c.classId}".`);
      continue;
    }
    if (c.level >= 3 && c.subclassId !== cls.subclass.id)
      add("class", `Choose a ${cls.name} subclass.`);
    if (c.level < 3 && c.subclassId) add("class", `${cls.name} gains a subclass at level 3.`);
  }
  build.levels.forEach((l, i) => {
    const die = classes.find((c) => c.id === l.classId)?.hitDie;
    if (i > 0 && die && l.hpRoll !== undefined && l.hpRoll > die) {
      add("class", `Level ${i + 1}: ${l.hpRoll} isn't a d${die} roll.`);
    }
  });

  // ── Origin ──
  const background = backgrounds.find((b) => b.id === build.backgroundId);
  if (!build.backgroundId) add("origin", "Choose a background.");
  else if (!background) add("origin", `Unknown background "${build.backgroundId}".`);

  const sp = species.find((s) => s.id === build.speciesId);
  if (!build.speciesId) add("origin", "Choose a species.");
  else if (!sp) add("origin", `Unknown species "${build.speciesId}".`);

  const builder = speciesBuilders.find((b) => b.speciesId === build.speciesId);
  for (const c of builder?.choices ?? []) {
    const answer = build.choices[choiceKey.species(c.id)];
    if (!c.options.some((o) => o.id === answer)) add("origin", `${sp?.name}: choose ${c.name}.`);
  }
  for (const g of builder?.grants ?? []) {
    if (g.type === "choose-skill") {
      const picked = many(build.choices[choiceKey.species("skills")]);
      if (picked.length !== g.count || !picked.every((s) => skills.some((k) => k.id === s))) {
        add("origin", `${sp?.name}: choose ${g.count} skill${g.count > 1 ? "s" : ""}.`);
      }
    }
    if (g.type === "choose-feat") {
      const feat = feats.find((f) => f.id === build.choices[choiceKey.species("feat")]);
      if (!feat || feat.category !== g.category)
        add("origin", `${sp?.name}: choose an ${g.category} feat.`);
    }
  }

  const standard = languages
    .filter((l) => l.rarity === "standard" && l.id !== "common")
    .map((l) => l.id);
  const langs = new Set(build.languages);
  if (
    langs.size !== 2 ||
    build.languages.length !== 2 ||
    ![...langs].every((l) => standard.includes(l))
  ) {
    add("origin", "Choose two standard languages besides Common.");
  }

  // ── Ability scores ──
  if (!build.baseScores) add("abilities", "Set your ability scores.");
  else {
    const base = build.baseScores;
    if (build.abilityMethod === "standard" && !isStandardArray(base)) {
      add("abilities", "Assign the standard array: 15, 14, 13, 12, 10, 8.");
    } else if (build.abilityMethod === "point-buy") {
      for (const m of validatePointBuy(base)) add("abilities", m);
    } else if (build.abilityMethod === "roll") {
      const rolled = [...(build.abilityRolls ?? [])].sort((a, b) => a - b).join();
      const assigned = Object.values(base)
        .sort((a, b) => a - b)
        .join();
      if (!build.abilityRolls) add("abilities", "Roll your ability scores.");
      else if (rolled !== assigned) add("abilities", "Assign each rolled score to one ability.");
    } else if (!build.abilityMethod) add("abilities", "Choose how to generate ability scores.");
  }
  if (background) {
    for (const m of validateBackgroundBonus(build.backgroundBonus, background.abilities))
      add("abilities", m);
  }
  let scores: AbilityScores | undefined;
  try {
    scores = finalScores(build);
  } catch (err) {
    add("abilities", `${(err as Error).message} after the background bonus.`);
  }
  if (scores && perClass.length > 1) {
    // Each class after the first must have been a legal multiclass when taken.
    perClass.slice(1).forEach((c, i) => {
      const before = perClass.slice(0, i + 1).map((x) => x.classId);
      for (const m of multiclassProblems(scores!, before, c.classId))
        add("class", `Multiclassing: ${m}.`);
    });
  }

  // ── Alignment ──
  if (!build.alignment) add("alignment", "Choose an alignment.");

  // ── Details ──
  if (!build.name.trim()) add("details", "Name your character.");
  const first = classes.find((c) => c.id === build.levels[0]?.classId);
  if (first) {
    const picked = many(build.choices[choiceKey.classSkills(first.id)]);
    const from = first.skillChoices.from.length ? first.skillChoices.from : skills.map((s) => s.id);
    const fromBackground = new Set(background?.skills ?? []);
    if (
      new Set(picked).size !== first.skillChoices.count ||
      picked.length !== first.skillChoices.count ||
      !picked.every((s) => from.includes(s))
    ) {
      add(
        "details",
        `${first.name}: choose ${first.skillChoices.count} skills from the class list.`,
      );
    } else if (picked.some((s) => fromBackground.has(s))) {
      add("details", "A class skill duplicates a background skill; pick a different one.");
    }
    if (!build.equipment.class) add("details", `Choose ${first.name} starting equipment.`);
  }
  if (background && !build.equipment.background)
    add("details", `Choose ${background.name} starting equipment.`);

  for (const m of classChoiceProblems(build)) add("details", m);

  return issues;
}

/**
 * Problems with the class choices (Fighting Style, feats, Expertise, Weapon Mastery, orders,
 * Invocations, Metamagic). Shared by the builder and level-up.
 */
export function classChoiceProblems(build: CharacterBuild): string[] {
  const problems: string[] = [];
  const derived = deriveCharacter(build);
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? id;
  const one = (key: string) => {
    const v = build.choices[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const exactly = (key: string, count: number) => {
    const picked = many(build.choices[key]);
    return picked.length === count && new Set(picked).size === count ? picked : undefined;
  };
  const taken = characterFeats(build);
  let scores: AbilityScores | undefined;
  try {
    scores = finalScores(build);
  } catch {
    scores = undefined; // reported by the ability scores step
  }
  const expertiseSoFar = new Set<string>();

  for (const c of classChoices(build)) {
    const who = `${className(c.classId)} (level ${c.characterLevel})`;
    if (c.kind === "fighting-style") {
      const feat = featById(one(c.key));
      if (feat?.category !== "fighting-style") problems.push(`${who}: choose a Fighting Style.`);
    } else if (c.kind === "feat") {
      const feat = featById(one(c.key));
      const label =
        c.category === "epic-boon" ? "an Epic Boon" : "a feat or Ability Score Improvement";
      if (!feat || feat.category !== c.category) {
        problems.push(`${who}: choose ${label}.`);
        continue;
      }
      const pre = featPrerequisite(feat);
      if (pre.level > c.characterLevel)
        problems.push(`${feat.name} needs character level ${pre.level}.`);
      if (
        scores &&
        pre.abilities.length &&
        !pre.abilities.some((a) => scores![a] >= pre.minScore)
      ) {
        problems.push(`${feat.name} needs ${pre.abilities.join(" or ")} ${pre.minScore}+.`);
      }
      if (!feat.repeatable && taken.filter((f) => f === feat.id).length > 1) {
        problems.push(`${feat.name} can only be taken once.`);
      }
      const increase = featAbilityIncrease(feat);
      if (increase) {
        const picked = many(build.choices[c.abilitiesKey]);
        const counts = picked.reduce<Record<string, number>>(
          (m, a) => ({ ...m, [a]: (m[a] ?? 0) + 1 }),
          {},
        );
        const ok =
          picked.length === increase.points &&
          picked.every((a) => increase.from.includes(a as never)) &&
          Object.values(counts).every((n) => n <= 2);
        if (!ok) {
          problems.push(
            increase.points === 2
              ? `${feat.name}: raise one ability by 2 or two abilities by 1.`
              : `${feat.name}: choose the ability to increase (${increase.from.join(", ")}).`,
          );
        }
      }
    } else if (c.kind === "expertise") {
      const picked = exactly(c.key, c.count);
      if (!picked || !picked.every((s) => derived.skills.includes(s) && !expertiseSoFar.has(s))) {
        problems.push(
          `${who}: choose Expertise in ${c.count} skill${c.count > 1 ? "s" : ""} you're proficient in.`,
        );
      }
      for (const s of picked ?? []) expertiseSoFar.add(s);
    } else if (c.kind === "weapon-mastery") {
      const picked = exactly(c.key, c.total);
      if (!picked || !picked.every((w) => weapons.some((x) => x.id === w))) {
        problems.push(
          `${className(c.classId)}: choose ${c.total} kinds of weapons for Weapon Mastery.`,
        );
      }
    } else if (c.kind === "order") {
      if (!c.options.some((o) => o.id === one(c.key))) problems.push(`${who}: choose a ${c.name}.`);
    } else if (c.kind === "invocations" || c.kind === "metamagic") {
      const cls = classes.find((x) => x.id === c.classId)!;
      const list = cls.options.find(
        (o) => o.id === (c.kind === "invocations" ? "eldritch-invocation" : "metamagic"),
      );
      const picked = exactly(c.key, c.total);
      const level = classLevels(build).find((x) => x.classId === c.classId)?.level ?? 0;
      const label = c.kind === "invocations" ? "Eldritch Invocations" : "Metamagic options";
      if (!picked || !list) {
        problems.push(`${className(c.classId)}: choose ${c.total} ${label}.`);
        continue;
      }
      for (const id of picked) {
        const entry = list.entries.find((e) => e.id === id);
        if (!entry) {
          problems.push(`${className(c.classId)}: unknown option "${id}".`);
          continue;
        }
        if (c.kind === "invocations") {
          const pre = invocationPrerequisite(entry.prerequisite);
          if (pre.level > level) problems.push(`${entry.name} needs Warlock level ${pre.level}.`);
          if (pre.invocation && !picked.includes(pre.invocation)) {
            problems.push(
              `${entry.name} needs the ${pre.invocation.replace(/-/g, " ")} invocation.`,
            );
          }
        }
      }
    } else if (c.kind === "languages") {
      const picked = exactly(c.key, c.count);
      if (!picked || !picked.every((l) => languages.some((x) => x.id === l))) {
        problems.push(`${who}: choose ${c.count} languages.`);
      }
    }
  }
  return problems;
}
