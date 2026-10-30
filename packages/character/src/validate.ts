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
} from "@dnd/data";
import {
  isStandardArray,
  multiclassProblems,
  validateBackgroundBonus,
  validatePointBuy,
  type AbilityScores,
} from "@dnd/rules";
import { choiceKey, classLevels, finalScores } from "./derive";

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

  return issues;
}
