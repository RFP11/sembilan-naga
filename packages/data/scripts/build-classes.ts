// Classes: core traits, features table, class features, option lists and the SRD subclass.

import {
  chapter,
  extractTables,
  paragraphs,
  readLines,
  slugify,
  writeJson,
  type Line,
} from "./lib";

const classesChapter = chapter(readLines(), "Classes");

// The features table's extra columns, in order. The PDF scatters these headers over
// several lines, so they're listed here instead of parsed.
const SLOTS_9 = ["Cantrips", "Prepared Spells", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const SLOTS_5 = ["Prepared Spells", "1", "2", "3", "4", "5"];
const COLUMNS: Record<string, string[]> = {
  barbarian: ["Rages", "Rage Damage", "Weapon Mastery"],
  bard: ["Bardic Die", ...SLOTS_9],
  cleric: ["Channel Divinity", ...SLOTS_9],
  druid: ["Wild Shape", ...SLOTS_9],
  fighter: ["Second Wind", "Weapon Mastery"],
  monk: ["Martial Arts", "Focus Points", "Unarmored Movement"],
  paladin: ["Channel Divinity", ...SLOTS_5],
  ranger: ["Favored Enemy", ...SLOTS_5],
  rogue: ["Sneak Attack"],
  sorcerer: ["Sorcery Points", ...SLOTS_9],
  warlock: ["Eldritch Invocations", "Cantrips", "Prepared Spells", "Spell Slots", "Slot Level"],
  wizard: SLOTS_9,
};

const ABILITY_IDS: Record<string, string> = {
  Strength: "str",
  Dexterity: "dex",
  Constitution: "con",
  Intelligence: "int",
  Wisdom: "wis",
  Charisma: "cha",
};

const CORE_LABELS = [
  "Primary Ability",
  "Hit Point Die",
  "Saving Throw Proficiencies",
  "Skill Proficiencies",
  "Weapon Proficiencies",
  "Tool Proficiencies",
  "Armor Training",
  "Starting Equipment",
];

// Split the chapter into one block per class (size-18 heading).
const blocks: { name: string; lines: Line[] }[] = [];
for (const l of classesChapter) {
  if (l.size === 18) blocks.push({ name: l.text, lines: [] });
  else blocks.at(-1)?.lines.push(l);
}

const classes = blocks.map(({ name, lines: raw }) => {
  const id = slugify(name);
  const { rest: lines, tables } = extractTables(raw);
  const used = new Set([`Core ${name} Traits`, `${name} Features`]);

  // ── Core traits table ──
  const coreText = joinRows(tables.get(`Core ${name} Traits`)!.slice(1));
  const core: Record<string, string> = {};
  const labelRe = new RegExp(`(${CORE_LABELS.join("|")}) `, "g");
  const marks = [...coreText.matchAll(labelRe)];
  marks.forEach((m, i) => {
    core[m[1]!] = coreText.slice(m.index! + m[0].length, marks[i + 1]?.index).trim();
  });
  // "Choose 2: Athletics, ..., or Survival"; the Bard's "Choose any 3 skills" → from: []
  const skillMatch = /^Choose (any )?(\d+)(?: skills)?:? ?(.*)$/i.exec(
    core["Skill Proficiencies"]!,
  )!;
  const skillFrom = skillMatch[1]
    ? []
    : skillMatch[3]!
        .replace(/,? or /, ", ")
        .split(/,\s*/)
        .map(slugify);

  // ── Features table ──
  const columns = COLUMNS[id]!;
  const table = featureRows(tables.get(`${name} Features`)!).map((row) => {
    const m = /^(\d+) \+(\d) (.*)$/.exec(row)!;
    let rest = m[3]!;
    const values: string[] = [];
    for (let c = 0; c < columns.length; c++) {
      const v = /\s(—|\d*[Dd]\d+|\+\d+(?: ft\.)?|\d+)$/.exec(" " + rest);
      if (!v)
        throw new Error(
          `${name} level ${m[1]}: can't read column ${columns.at(-1 - c)} from "${row}"`,
        );
      values.unshift(v[1]!.replace(/^D/, "d"));
      rest = rest.slice(0, rest.length - v[1]!.length).trimEnd();
    }
    return {
      level: Number(m[1]),
      proficiencyBonus: Number(m[2]),
      features: rest === "—" ? [] : rest.split(/,\s*(?![^(]*\))/),
      columns: Object.fromEntries(columns.map((c, i) => [c, values[i]!])),
    };
  });
  if (table.length !== 20) throw new Error(`${name}: features table has ${table.length} rows`);

  // ── Sections by size-14 heading ──
  const sections = new Map<string, Line[]>();
  let heading = "";
  for (const l of lines) {
    if (l.size === 14) {
      // "Monk Subclass: Warrior of the" + "Open Hand" — continue a heading cut mid-name
      if (heading.endsWith(":") || / (the|of)$/.test(heading) || heading.endsWith("Draconic")) {
        const body = sections.get(heading)!;
        sections.delete(heading);
        heading = `${heading} ${l.text}`;
        sections.set(heading, body);
      } else sections.set((heading = l.text), []);
    } else sections.get(heading)?.push(l);
  }

  const multiclassLines = sections.get(`Becoming a ${name} …`) ?? [];
  const mcStart = multiclassLines.findIndex((l) => l.text === "As a Multiclass Character");
  const multiclass = paragraphs(multiclassLines.slice(mcStart + 1));

  const attach = (features: { name: string; description: string }[]) => {
    for (const [title, tl] of tables) {
      if (used.has(title)) continue;
      const f = features.find((f) => f.description.includes(`${title} table`));
      if (f) {
        f.description += "\n\n" + paragraphs(tl);
        used.add(title);
      }
    }
    // Tables introduced as "the table below" (Circle of the Land) carry no name in the text.
    const below = features.find((f) => f.description.includes("table below"));
    for (const [title, tl] of tables) {
      if (!below || used.has(title) || isSpellList(title)) continue;
      below.description += "\n\n" + paragraphs(tl);
      used.add(title);
    }
    return features;
  };

  const features = attach(levelFeatures(sections.get(`${name} Class Features`)!));

  const options = [...sections.entries()]
    .filter(([h]) => h.endsWith(" Options"))
    .map(([h, body]) => ({
      id: slugify(h.replace(/ Options$/, "")),
      name: h,
      entries: optionEntries(body),
    }));

  const subHeading = [...sections.keys()].find((h) => h.startsWith(`${name} Subclass:`))!;
  const subName = subHeading.replace(`${name} Subclass: `, "");
  const subLines = sections.get(subHeading)!;
  const firstFeature = subLines.findIndex((l) => l.size === 12 && /^Level \d+:/.test(l.text));
  const subclass = {
    id: slugify(subName),
    name: subName,
    description: paragraphs(subLines.slice(0, firstFeature)),
    features: attach(levelFeatures(subLines.slice(firstFeature))),
  };

  const unused = [...tables.keys()].filter((t) => !used.has(t) && !isSpellList(t));
  if (unused.length) console.warn(`${name}: tables not attached: ${unused.join(", ")}`);

  return {
    id,
    name,
    primaryAbility: core["Primary Ability"]!,
    hitDie: Number(/^D(\d+)/i.exec(core["Hit Point Die"]!)![1]),
    savingThrows: core["Saving Throw Proficiencies"]!.split(" and ").map((a) => ABILITY_IDS[a]),
    skillChoices: { count: Number(skillMatch[2]), from: skillFrom },
    weaponProficiencies: core["Weapon Proficiencies"]!,
    ...(core["Tool Proficiencies"] && { toolProficiencies: core["Tool Proficiencies"] }),
    armorTraining: core["Armor Training"]!,
    startingEquipment: core["Starting Equipment"]!,
    multiclass,
    table,
    features,
    options,
    subclass,
  };
});
writeJson("classes.json", classes);

// ── helpers ──────────────────────────────────────────────────────────────────────

/** The class spell list tables ("Level 3 Wizard Spells"); spells.json already has them. */
function isSpellList(title: string): boolean {
  return /^(Cantrips|Level \d) \(?.*Spells/.test(title) || / Cantrips$/.test(title);
}

/** Table lines joined into one string, re-joining words hyphenated across lines. */
function joinRows(lines: Line[]): string {
  return lines
    .map((l) => l.text)
    .join(" ")
    .replace(/([a-z])- ([a-z])/g, "$1$2");
}

/** Features-table rows: each starts with "<level> +<PB>"; wrapped lines continue it. */
function featureRows(lines: Line[]): string[] {
  const rows: string[] = [];
  for (const l of lines) {
    if (l.size !== 9.5) continue;
    if (/^\d+ \+\d /.test(l.text)) rows.push(l.text);
    else if (rows.length) rows[rows.length - 1] += " " + l.text;
  }
  return rows;
}

/** "Level 3: Frenzy" headings → { level, name, description }. */
function levelFeatures(lines: Line[]) {
  const out: { level: number; name: string; description: string }[] = [];
  let cur: { level: number; name: string; body: Line[] } | undefined;
  const flush = () =>
    cur && out.push({ level: cur.level, name: cur.name, description: paragraphs(cur.body) });
  for (const l of lines) {
    const m = l.size === 12 ? /^Level (\d+): (.+)$/.exec(l.text) : null;
    if (m) {
      flush();
      cur = { level: Number(m[1]), name: m[2]!, body: [] };
    } else cur?.body.push(l.size === 12 ? { ...l, size: 10, text: `**${l.text}**` } : l);
  }
  flush();
  return out;
}

/** Option entries: size-12 name, optional "Prerequisite: ..." / "Cost: ..." line, then text. */
function optionEntries(lines: Line[]) {
  const out: { id: string; name: string; prerequisite?: string; description: string }[] = [];
  let cur: { name: string; body: Line[] } | undefined;
  const flush = () => {
    if (!cur) return;
    let first = cur.body[0]?.text ?? "";
    const pre = /^(?:Prerequisite|Cost): /.test(first);
    let skip = pre ? 1 : 0;
    // A wrapped prerequisite continues on a short Title Case line ("That Deals Damage").
    const next = cur.body[1]?.text ?? "";
    if (
      pre &&
      next.length < 40 &&
      /^([A-Z][\w’]*|a|an|of|or|the|via)( ([A-Z][\w’]*|a|an|of|or|the|via))*$/.test(next)
    ) {
      first += " " + next;
      skip = 2;
    }
    out.push({
      id: slugify(cur.name),
      name: cur.name,
      ...(pre && { prerequisite: first }),
      description: paragraphs(cur.body.slice(skip)),
    });
  };
  for (const l of lines) {
    if (l.size === 12) {
      flush();
      cur = { name: l.text, body: [] };
    } else cur?.body.push(l);
  }
  flush();
  return out;
}
