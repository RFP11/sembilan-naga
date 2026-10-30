// Backgrounds, species and feats.

import {
  chapter,
  extractTables,
  paragraphs,
  readLines,
  runIn,
  slugify,
  writeJson,
  type Line,
} from "./lib";

const all = readLines();
const origins = chapter(all, "Character Origins");

const ABILITY_IDS: Record<string, string> = {
  Strength: "str",
  Dexterity: "dex",
  Constitution: "con",
  Intelligence: "int",
  Wisdom: "wis",
  Charisma: "cha",
};

// ── Backgrounds ──────────────────────────────────────────────────────────────────
const backgrounds = entries(between(origins, "Background Descriptions", "Character Species")).map(
  ({ name, body }) => {
    const f = fields(body);
    const feat = /^(.+?)(?: \((\w+)\))? \(see “Feats”\)$/.exec(f.Feat!)!;
    const skills = f["Skill Proficiencies"]!.split(" and ").map(slugify);
    return {
      id: slugify(name),
      name,
      abilities: f["Ability Scores"]!.split(", ").map((a) => ABILITY_IDS[a]),
      feat: slugify(feat[1]!),
      ...(feat[2] && { featNote: feat[2] }),
      skills,
      tool: f["Tool Proficiency"]!.replace(/ \(see “Equipment”\)$/, ""),
      equipment: f.Equipment!,
    };
  },
);
writeJson("backgrounds.json", backgrounds);

// ── Species ──────────────────────────────────────────────────────────────────────
const { rest: speciesLines, tables: speciesTables } = extractTables(
  between(origins, "Species Descriptions"),
);
const species = entries(speciesLines).map(({ name, body }) => {
  // Creature Type, Size (may wrap), Speed; traits follow.
  const speedLine = body.findIndex((l) => l.text.startsWith("**Speed:**"));
  const f = fields(body.slice(0, speedLine + 1));
  const size = f.Size!;
  return {
    id: slugify(name),
    name,
    creatureType: f["Creature Type"]!,
    size: [...size.matchAll(/(Small|Medium)/g)].map((m) => m[1]!.toLowerCase()),
    sizeNote: size,
    speed: Number(/^(\d+) feet$/.exec(f.Speed!)![1]),
    traits: withTables(traits(body.slice(speedLine + 1)), speciesTables),
  };
});
writeJson("species.json", species);

// ── Feats ────────────────────────────────────────────────────────────────────────
const featChapter = chapter(all, "Feats");
const CATEGORIES: Record<string, string> = {
  "Origin Feats": "origin",
  "General Feats": "general",
  "Fighting Style Feats": "fighting-style",
  "Epic Boon Feats": "epic-boon",
};
const feats = Object.entries(CATEGORIES).flatMap(([title, category]) => {
  const start = featChapter.findIndex((l) => l.size === 14 && l.text === title);
  const end = featChapter.findIndex((l, i) => i > start && l.size >= 14);
  return entries(featChapter.slice(start + 1, end < 0 ? undefined : end)).map(({ name, body }) => {
    // "General Feat (Prerequisite: Level 4+, Strength or" + "Dexterity 13+)"
    let i = 0;
    let header = body[i++]!.text;
    while ((header.match(/\(/g)?.length ?? 0) > (header.match(/\)/g)?.length ?? 0))
      header += " " + body[i++]!.text;
    const prerequisite = /\(Prerequisite: (.+)\)$/.exec(header)?.[1];
    const rest = body.slice(i);
    const benefits = traits(rest).filter((t) => t.name !== "Repeatable");
    return {
      id: slugify(name),
      name,
      category,
      ...(prerequisite && { prerequisite }),
      repeatable: rest.some((l) => l.text.startsWith("**Repeatable.**")),
      description: paragraphs(rest),
      benefits,
    };
  });
});
writeJson("feats.json", feats);

// ── helpers ──────────────────────────────────────────────────────────────────────

/** Lines after the size-14 heading `from`, up to the size-18 heading `to` (or the end). */
function between(lines: Line[], from: string, to?: string): Line[] {
  const start = lines.findIndex((l) => l.size === 14 && l.text === from);
  const end = to ? lines.findIndex((l) => l.size === 18 && l.text === to) : -1;
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** Splits lines into entries at each size-12 heading. */
function entries(lines: Line[]): { name: string; body: Line[] }[] {
  const out: { name: string; body: Line[] }[] = [];
  for (const l of lines) {
    if (l.size === 12) out.push({ name: l.text, body: [] });
    else out.at(-1)?.body.push(l);
  }
  return out;
}

/** "**Label:** value" lines (values may wrap) → { Label: value }. */
function fields(body: Line[]): Record<string, string> {
  const out: Record<string, string> = {};
  let key = "";
  for (const l of body) {
    const r = runIn(l.text);
    if (r) out[(key = r.name)] = r.rest;
    else if (key) out[key] = joinWrapped(out[key]!, l.text);
  }
  return out;
}

function joinWrapped(a: string, b: string): string {
  return /[a-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : `${a} ${b}`;
}

/** Run-in paragraphs → traits; unlabeled paragraphs and tables belong to the trait before. */
function traits(body: Line[]): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  for (const para of paragraphs(body).split("\n\n")) {
    const r = runIn(para);
    if (r) out.push({ name: r.name, description: r.rest });
    else if (out.length) out.at(-1)!.description += "\n\n" + para;
  }
  return out;
}

/** Appends each table to the first trait that names it. */
function withTables(list: { name: string; description: string }[], tables: Map<string, Line[]>) {
  for (const [title, lines] of tables) {
    const t = list.find((t) => t.description.includes(`${title} table`));
    if (t) t.description += "\n\n" + paragraphs(lines);
  }
  return list;
}
