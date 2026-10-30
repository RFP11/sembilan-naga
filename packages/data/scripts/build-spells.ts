// Spells from "Spell Descriptions".

import { chapter, paragraphs, readLines, runIn, slugify, writeJson, type Line } from "./lib";

const all = chapter(readLines(), "Spells");
const HEADER = /^(?:Level (\d) (\w+)|(\w+) Cantrip) \((.+)$/;
const STAT_BLOCK_SECTIONS = new Set(["Traits", "Actions", "Bonus Actions", "Reactions"]);

// Summoned-creature stat blocks (size-14.6 name) float in a box between unrelated spells.
// Pull them out, then attach each to the spell that names it.
const lines: Line[] = [];
const statBlocks: { name: string; lines: Line[] }[] = [];
let inBlock = false;
for (const l of all.slice(
  all.findIndex((l) => l.size === 18 && l.text === "Spell Descriptions") + 1,
)) {
  if (l.size === 14.6) {
    inBlock = true;
    statBlocks.push({ name: l.text, lines: [] });
    continue;
  }
  const blockLine = l.size !== 10 && (l.size !== 12 || STAT_BLOCK_SECTIONS.has(l.text));
  if (inBlock && blockLine) statBlocks.at(-1)!.lines.push(l);
  else {
    inBlock = false;
    lines.push(l);
  }
}

const isSpellStart = (i: number) => lines[i]!.size === 12 && HEADER.test(lines[i + 1]?.text ?? "");
const starts = lines.map((_, i) => i).filter(isSpellStart);
const spells = starts.map((start, n) =>
  parseSpell(lines.slice(start, starts[n + 1] ?? lines.length)),
);

for (const block of statBlocks) {
  const owner = spells.find((s) => s.description.includes(`${block.name} stat block`));
  if (!owner) throw new Error(`no spell references the "${block.name}" stat block`);
  owner.description += `\n\n**${block.name}**\n\n` + paragraphs(block.lines.map(statBlockLine));
}
writeJson("spells.json", spells);

/** Stat-block lines read as plain text; section headings stay bold. */
function statBlockLine(l: Line): Line {
  return { ...l, size: 10, text: l.size === 12 ? `**${l.text}**` : l.text };
}

function parseSpell(block: Line[]) {
  const name = block[0]!.text;
  let i = 1;

  // "Level 2 Abjuration (Bard, Cleric, Druid, Paladin," + "Ranger)"
  let header = block[i++]!.text;
  while (!header.includes(")")) header += " " + block[i++]!.text;
  const h = HEADER.exec(header)!;
  const level = h[1] ? Number(h[1]) : 0;
  const school = (h[2] ?? h[3])!.toLowerCase();
  const classes = h[4]!
    .replace(/\)$/, "")
    .split(/,\s*/)
    .map((c) => c.toLowerCase());

  // "**Casting Time:** Action or Ritual" ... "**Duration:** 1 hour". Long values (a
  // Reaction trigger, a material component) wrap onto unlabeled lines.
  const meta: Record<string, string> = {};
  const open = (s: string) => (s.match(/\(/g)?.length ?? 0) > (s.match(/\)/g)?.length ?? 0);
  let key = "";
  while (i < block.length) {
    const r = runIn(block[i]!.text);
    if (r) {
      if (meta.Duration) break;
      key = r.name === "Component" ? "Components" : r.name; // typo in the SRD (Barkskin)
      meta[key] = r.rest;
    } else if (key && key !== "Duration") meta[key] += " " + block[i]!.text;
    else if (key === "Duration" && open(meta.Duration!)) meta.Duration += " " + block[i]!.text;
    else break;
    i++;
  }
  for (const k of ["Casting Time", "Range", "Components", "Duration"]) {
    if (!meta[k]) throw new Error(`${name}: missing ${k}`);
  }

  const castingTime = meta["Casting Time"]!;
  const ritual = / or Ritual$/.test(castingTime);
  const cm = /^([VSM, ]+?)(?: \((.+)\))?$/.exec(meta.Components!.replace(/-\s+/g, "-"));
  if (!cm) throw new Error(`${name}: bad components "${meta.Components}"`);

  // Description, with the higher-level paragraph split out.
  const body = block
    .slice(i)
    .map((l) => (l.size >= 12 ? { ...l, text: `**${l.text}**`, size: 10 } : l));
  const paras = paragraphs(body).split("\n\n");
  const upgradeIdx = paras.findIndex((p) =>
    /^\*\*(Using a Higher-Level Spell Slot|Cantrip Upgrade)\.\*\*/.test(p),
  );
  const higherLevels = upgradeIdx >= 0 ? runIn(paras[upgradeIdx]!)!.rest : undefined;
  if (upgradeIdx >= 0) paras.splice(upgradeIdx, 1);

  return {
    id: slugify(name),
    name,
    level,
    school,
    classes,
    castingTime: castingTime.replace(/ or Ritual$/, ""),
    ritual,
    range: meta.Range,
    components: cm[1]!.split(/,\s*/).filter(Boolean),
    ...(cm[2] && { material: cm[2] }),
    duration: meta.Duration,
    concentration: meta.Duration!.startsWith("Concentration"),
    description: paras.join("\n\n"),
    ...(higherLevels && { higherLevels }),
  };
}
