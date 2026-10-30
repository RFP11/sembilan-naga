// Tools, adventuring gear and magic items.

import {
  chapter,
  extractTables,
  paragraphs,
  parseCost,
  parseWeight,
  readLines,
  runIn,
  slugify,
  writeJson,
  type Line,
} from "./lib";

const all = readLines();
const equipment = chapter(all, "Equipment");

const ABILITY_IDS: Record<string, string> = {
  Strength: "str",
  Dexterity: "dex",
  Constitution: "con",
  Intelligence: "int",
  Wisdom: "wis",
  Charisma: "cha",
};

/** Lines under a heading of `size` titled `title`, up to the next heading of that size or larger. */
function under(lines: Line[], size: number, title: string): Line[] {
  const start = lines.findIndex((l) => l.size === size && l.text === title);
  if (start < 0) throw new Error(`heading "${title}" not found`);
  const end = lines.findIndex((l, i) => i > start && l.size >= size);
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** Size-12 headings "Name (Price)" → entries. */
function priced(lines: Line[]) {
  const out: { name: string; price: string; body: Line[] }[] = [];
  for (const l of lines) {
    const m = l.size === 12 ? /^(.+?) \((.+)\)$/.exec(l.text) : null;
    if (m) out.push({ name: m[1]!, price: m[2]!, body: [] });
    else out.at(-1)?.body.push(l);
  }
  return out;
}

const cost = (price: string) => (price === "Varies" ? undefined : parseCost(price));
const weight = (w: string) => (w === "Varies" ? undefined : parseWeight(w));

// ── Tools ────────────────────────────────────────────────────────────────────────
const toolsSection = under(equipment, 18, "Tools");
const tools = (["Artisan’s Tools", "Other Tools"] as const).flatMap((group) =>
  priced(under(toolsSection, 14, group)).map(({ name, price, body }) => {
    const f: Record<string, string> = {};
    let key = "";
    for (const l of body) {
      const r = runIn(l.text);
      if (r) f[(key = r.name)] = r.rest;
      else if (key)
        f[key] = /[a-z]-$/.test(f[key]!) ? f[key]!.slice(0, -1) + l.text : `${f[key]} ${l.text}`;
    }
    const aw = /^(\w+) Weight: (.+)$/.exec(f.Ability!)!;
    return {
      id: slugify(name),
      name,
      category: group === "Artisan’s Tools" ? "artisan" : "other",
      ...(cost(price) !== undefined && { costCp: cost(price) }),
      ...(weight(aw[2]!) !== undefined && { weightLb: weight(aw[2]!) }),
      ability: ABILITY_IDS[aw[1]!],
      utilize: f.Utilize!,
      craft: f.Craft ? f.Craft.split(/,\s*/) : [],
      ...(f.Variants && { variants: f.Variants }),
    };
  }),
);
writeJson("tools.json", tools);

// ── Adventuring gear: descriptions + the Adventuring Gear table for weights ──────
const { rest: gearLines, tables: gearTables } = extractTables(
  under(equipment, 18, "Adventuring Gear"),
);
const weights = new Map<string, string>();
for (const l of gearTables.get("Adventuring Gear") ?? []) {
  const m = /^(.+?) (—|Varies|[\d/½]+ lb\.(?: \(full\))?) (?:Varies|[\d,]+ (?:CP|SP|GP))$/.exec(
    l.text.replace(/\*\*/g, ""),
  );
  if (m) weights.set(m[1]!, m[2]!);
}
const gear = priced(gearLines).map(({ name, price, body }) => {
  let description = paragraphs(body);
  for (const [title, tl] of gearTables) {
    if (title !== "Adventuring Gear" && description.includes(`${title} table`))
      description += "\n\n" + paragraphs(tl);
  }
  const w = weights.get(name);
  return {
    id: slugify(name),
    name,
    ...(cost(price) !== undefined && { costCp: cost(price) }),
    ...(w && weight(w) !== undefined && { weightLb: weight(w) }),
    description,
  };
});
writeJson("gear.json", gear);

// ── Magic items ──────────────────────────────────────────────────────────────────
const CATEGORY = /^(Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous Item)\b/;
const RARITIES: [string, RegExp][] = [
  ["common", /\bCommon\b/],
  ["uncommon", /\bUncommon\b/],
  ["rare", /(?<!Very )\bRare\b/],
  ["very-rare", /\bVery Rare\b/],
  ["legendary", /\bLegendary\b/],
  ["artifact", /\bArtifact\b/],
];

const magic = chapter(all, "Magic Items");
const az = magic.slice(magic.findIndex((l) => l.size === 18 && l.text === "Magic Items A–Z") + 1);
const itemStarts = az
  .map((_, i) => i)
  .filter((i) => az[i]!.size === 12 && CATEGORY.test(az[i + 1]?.text ?? ""));

const magicItems = itemStarts.map((start, n) => {
  const block = az.slice(start, itemStarts[n + 1] ?? az.length);
  const name = block[0]!.text;

  // "Weapon (Any Ammunition), Uncommon (+1), Rare (+2)," + "or Very Rare (+3)"
  let i = 1;
  let header = block[i++]!.text;
  const unbalanced = (s: string) => (s.match(/\(/g)?.length ?? 0) > (s.match(/\)/g)?.length ?? 0);
  while (
    i < block.length &&
    (unbalanced(header) ||
      /[,-]$/.test(header) ||
      /^(or |\(Requires|Requires)/.test(block[i]!.text))
  ) {
    header = header.endsWith("-")
      ? header.slice(0, -1) + block[i++]!.text
      : `${header} ${block[i++]!.text}`;
  }

  const hm =
    /^([\w ]+?)(?: \(([^)]*(?:\([^)]*\)[^)]*)*)\))?, (.+?)(?: \((Requires Attunement[^)]*)\))?$/.exec(
      header,
    );
  if (!hm) throw new Error(`${name}: bad header "${header}"`);
  const rarityNote = hm[3]!;
  const attune = hm[4];

  const body = block
    .slice(i)
    .map((l) => (l.size >= 12 ? { ...l, size: 10, text: `**${l.text}**` } : l));
  return {
    id: slugify(name),
    name,
    category: slugify(hm[1]!),
    ...(hm[2] && { baseItem: hm[2] }),
    rarities: RARITIES.filter(([, re]) => re.test(rarityNote)).map(([r]) => r),
    rarityNote,
    attunement: Boolean(attune),
    ...(attune && attune !== "Requires Attunement" && { attunementNote: attune }),
    description: paragraphs(body),
  };
});
writeJson("magic-items.json", magicItems);
