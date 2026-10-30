// Weapons, armor, and the weapon property / mastery definitions.

import {
  chapter,
  paragraphs,
  parseCost,
  parseWeight,
  readLines,
  slugify,
  writeJson,
  type Line,
} from "./lib";

const equipment = chapter(readLines(), "Equipment");

// ── Weapon properties & masteries: size-12 headings under size-14 sections ───────
function definitions(sectionTitle: string) {
  const start = equipment.findIndex((l) => l.size === 14 && l.text === sectionTitle);
  const out: { id: string; name: string; description: string }[] = [];
  let cur: { name: string; body: Line[] } | undefined;
  const flush = () =>
    cur && out.push({ id: slugify(cur.name), name: cur.name, description: paragraphs(cur.body) });
  for (const l of equipment.slice(start + 1)) {
    if (l.size >= 14) break;
    if (l.size === 12) {
      flush();
      cur = { name: l.text, body: [] };
    } else if (cur && l.size === 10) cur.body.push(l);
  }
  flush();
  return out;
}
writeJson("weapon-properties.json", definitions("Properties"));
writeJson("weapon-masteries.json", definitions("Mastery Properties"));

// ── Weapons table ────────────────────────────────────────────────────────────────
const ROW_END = /\d[\d,]* (CP|SP|GP)$/;

const weaponTable = tableBlock("Name Damage Properties Mastery Weight Cost");
const weapons = [];
let category: "simple" | "martial" = "simple";
let kind: "melee" | "ranged" = "melee";
for (const row of weaponTable) {
  const group = /^(Simple|Martial) (Melee|Ranged) Weapons$/.exec(row);
  if (group) {
    category = group[1]!.toLowerCase() as typeof category;
    kind = group[2]!.toLowerCase() as typeof kind;
    continue;
  }
  const m =
    /^(.+?) (\d+d\d+|1) (\w+) (.+) (Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex) (—|[\d/]+ lb\.) ([\d,]+ (?:CP|SP|GP))$/.exec(
      row,
    );
  if (!m) throw new Error(`bad weapon row: ${row}`);
  const [, name, dice, dmgType, props, mastery, weight, cost] = m as unknown as string[];

  const properties: string[] = [];
  let range: { normal: number; long: number } | undefined;
  let versatileDice: string | undefined;
  let ammunition: string | undefined;
  let note: string | undefined;
  if (props !== "—") {
    // Split on commas outside parentheses: "Ammunition (Range 80/320; Bolt), Loading"
    for (const p of props!.split(/,\s*(?![^(]*\))/)) {
      const pm = /^([\w-]+(?: [\w-]+)?)(?: \((.+)\))?$/.exec(p.trim());
      if (!pm) throw new Error(`bad property "${p}" in ${name}`);
      const prop = slugify(pm[1]!);
      const arg = pm[2];
      properties.push(prop);
      if (arg?.startsWith("Range")) {
        const rm = /^Range (\d+)\/(\d+)(?:; (\w+))?$/.exec(arg)!;
        range = { normal: Number(rm[1]), long: Number(rm[2]) };
        if (rm[3]) ammunition = rm[3].toLowerCase();
      } else if (prop === "versatile") versatileDice = arg;
      else if (arg) note = `${pm[1]} (${arg})`;
    }
  }

  weapons.push({
    id: slugify(name!),
    name,
    category,
    kind,
    damage: { dice, type: dmgType!.toLowerCase() },
    properties,
    ...(range && { range }),
    ...(versatileDice && { versatileDice }),
    ...(ammunition && { ammunition }),
    ...(note && { note }),
    mastery: mastery!.toLowerCase(),
    weightLb: parseWeight(weight!),
    costCp: parseCost(cost!),
  });
}
writeJson("weapons.json", weapons);

// ── Armor table ──────────────────────────────────────────────────────────────────
const armor = [];
let armorCategory = "light";
for (const row of tableBlock("Armor Armor Class (AC) Strength Stealth Weight Cost")) {
  const group = /^(Light|Medium|Heavy) Armor \(|^Shield \(/.exec(row);
  if (group) {
    armorCategory = (group[1] ?? "shield").toLowerCase();
    continue;
  }
  const m =
    /^(.+?) (\+?\d+)( \+ Dex modifier(?: \(max (\d)\))?)? (—|Str \d+) (—|Disadvantage) ([\d/]+ lb\.) ([\d,]+ GP)$/.exec(
      row,
    );
  if (!m) throw new Error(`bad armor row: ${row}`);
  armor.push({
    id: slugify(m[1]!),
    name: m[1],
    category: armorCategory,
    ac: Number(m[2]!.replace("+", "")),
    addDex: Boolean(m[3]),
    ...(m[4] && { maxDex: Number(m[4]) }),
    ...(m[5] !== "—" && { strength: Number(m[5]!.slice(4)) }),
    stealthDisadvantage: m[6] === "Disadvantage",
    weightLb: parseWeight(m[7]!),
    costCp: parseCost(m[8]!),
  });
}
writeJson("armor.json", armor);

/** Rows of a size-9.5 table after its header row; wrapped rows are joined until a cost ends them. */
function tableBlock(header: string): string[] {
  const start = equipment.findIndex((l) => l.text === header);
  if (start < 0) throw new Error(`table "${header}" not found`);
  const rows: string[] = [];
  let pending = "";
  for (const l of equipment.slice(start + 1)) {
    if (l.size !== 9.5) break;
    const text = l.text.replace(/\*\*/g, ""); // table cells are not run-in labels
    pending = pending ? `${pending} ${text}` : text;
    const isGroup = / Weapons$|^(Light|Medium|Heavy) Armor \(|^Shield \(/.test(pending);
    if (isGroup || ROW_END.test(pending)) {
      rows.push(pending.replace(/, (Two-Handed)/, ", $1"));
      pending = "";
    }
  }
  return rows;
}
