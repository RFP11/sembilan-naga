// Abilities, skills, damage types, conditions, languages and the Rules Glossary.

import { chapter, paragraphs, readLines, slugify, writeJson, type Line } from "./lib";

const lines = readLines();

// ── Abilities ("Ability Descriptions" table) ──────────────────────────────────────
const ABILITY_IDS = {
  Strength: "str",
  Dexterity: "dex",
  Constitution: "con",
  Intelligence: "int",
  Wisdom: "wis",
  Charisma: "cha",
} as const;
type AbilityName = keyof typeof ABILITY_IDS;

const abilities = tableRows(lines, "Ability Descriptions", 6).map((text) => {
  const [name, ...rest] = text.split(" ");
  return { id: ABILITY_IDS[name as AbilityName], name: name!, description: rest.join(" ") };
});
writeJson("abilities.json", abilities);

// ── Skills ("Skills" table: Skill Ability Example Uses) ──────────────────────────
const skillRe = new RegExp(`^(.+?) (${Object.keys(ABILITY_IDS).join("|")}) (.+)$`);
const skills = tableRows(lines, "Skill Ability Example Uses", 18, true).map((text) => {
  const m = skillRe.exec(text);
  if (!m) throw new Error(`bad skill row: ${text}`);
  return {
    id: slugify(m[1]!),
    name: m[1]!,
    ability: ABILITY_IDS[m[2] as AbilityName],
    description: m[3]!,
  };
});
writeJson("skills.json", skills);

// ── Rules Glossary ───────────────────────────────────────────────────────────────
// Entries are size-12 headings, optionally tagged: "Blinded [Condition]".
// Sidebars (size 11 heading + size 9 body) interrupt paragraphs, so they're dropped.
const glossaryLines = chapter(lines, "Rules Glossary").filter((l) => l.size !== 9 && l.size !== 11);
const glossary: { id: string; name: string; tag?: string; description: string }[] = [];
const start = glossaryLines.findIndex((l) => l.size === 12);
let entry: { name: string; tag?: string; body: Line[] } | undefined;
const flush = () => {
  if (!entry) return;
  glossary.push({
    id: slugify(entry.name),
    name: entry.name,
    ...(entry.tag && { tag: entry.tag.toLowerCase() }),
    description: paragraphs(entry.body),
  });
};
for (const l of glossaryLines.slice(start)) {
  if (l.size === 12) {
    flush();
    const m = /^(.+?)(?: \[(.+)\])?$/.exec(l.text)!;
    entry = { name: m[1]!, tag: m[2], body: [] };
  } else if (l.size >= 9.3 && l.size <= 10.5) {
    entry!.body.push(l);
  }
}
flush();
writeJson("glossary.json", glossary);

const conditions = glossary
  .filter((g) => g.tag === "condition")
  .map(({ id, name, description }) => ({ id, name, description }));
writeJson("conditions.json", conditions);

// ── Damage types (glossary table) ────────────────────────────────────────────────
const damageTypes = glossaryLines
  .filter((l) => l.size === 9.5)
  .map((l) =>
    /^(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) (.+)$/.exec(
      l.text,
    ),
  )
  .filter((m) => m !== null)
  .map((m) => ({ id: m[1]!.toLowerCase(), name: m[1]!, description: m[2]! }));
writeJson("damage-types.json", damageTypes);

// ── Languages (Standard / Rare Languages tables in Character Creation) ───────────
const languages: {
  id: string;
  name: string;
  rarity: "standard" | "rare";
  roll?: [number, number];
  note?: string;
}[] = [{ id: "common", name: "Common", rarity: "standard" }];
for (const text of tableRows(lines, "1d12 Language", 10, true).slice(1)) {
  const m = /^(\d+)(?:–(\d+))? (.+)$/.exec(text);
  if (!m) throw new Error(`bad language row: ${text}`);
  languages.push({
    id: slugify(m[3]!),
    name: m[3]!,
    rarity: "standard",
    roll: [Number(m[1]), Number(m[2] ?? m[1])],
  });
}
const rareRows = tableRows(lines, "Language Language", 5, true);
for (const name of rareRows.flatMap((r) => splitRareRow(r))) {
  const clean = name.replace(/\*$/, "");
  languages.push({
    id: slugify(clean),
    name: clean,
    rarity: "rare",
    ...(clean === "Primordial" && {
      note: "Includes the Aquan, Auran, Ignan, and Terran dialects.",
    }),
  });
}
writeJson("languages.json", languages);

// ── helpers ──────────────────────────────────────────────────────────────────────

/** Body rows (size 9.5) after a table header line, joining rows the PDF wrapped. */
function tableRows(all: Line[], header: string, count: number, headerIsRow = false): string[] {
  const i = all.findIndex((l) => l.text === header && (headerIsRow ? l.size === 9.3 : true));
  if (i < 0) throw new Error(`table "${header}" not found`);
  const rows: string[] = [];
  for (const l of all.slice(i + 1)) {
    if (rows.length === count && l.size !== 9.5) break;
    if (l.size === 9.3) continue; // repeated header in the second column
    if (l.size !== 9.5) {
      if (rows.length) break;
      continue;
    }
    // Lines starting lowercase continue the previous row.
    if (rows.length && /^[a-z]/.test(l.text)) rows[rows.length - 1] += " " + l.text;
    else if (rows.length < count) rows.push(l.text);
    else break;
  }
  if (rows.length !== count)
    throw new Error(`table "${header}": expected ${count} rows, got ${rows.length}`);
  return rows;
}

/** "Abyssal Primordial*" → two cells; "Deep Speech Thieves’ Cant" → two cells. */
function splitRareRow(row: string): string[] {
  const known = [
    "Abyssal",
    "Celestial",
    "Deep Speech",
    "Druidic",
    "Infernal",
    "Primordial*",
    "Sylvan",
    "Thieves’ Cant",
    "Undercommon",
  ];
  const cells = known.filter((k) => row.includes(k));
  if (cells.join(" ").length !== row.length)
    throw new Error(`unrecognized rare language row: ${row}`);
  return cells;
}
