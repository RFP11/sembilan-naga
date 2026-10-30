// Monster and animal stat blocks ("Monsters A–Z" and "Animals").

import { chapter, joinText, readLines, runIn, slugify, writeJson, type Line } from "./lib";

const all = readLines();
const DAMAGE_TYPES = new Set([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);
const SECTIONS: Record<
  string,
  "traits" | "actions" | "bonusActions" | "reactions" | "legendaryActions"
> = {
  Traits: "traits",
  Actions: "actions",
  "Bonus Actions": "bonusActions",
  Reactions: "reactions",
  "Legendary Actions": "legendaryActions",
};
const ABILITY_IDS: Record<string, "str" | "dex" | "con" | "int" | "wis" | "cha"> = {
  Strength: "str",
  Dexterity: "dex",
  Constitution: "con",
  Intelligence: "int",
  Wisdom: "wis",
  Charisma: "cha",
};
const LABELS = [
  "Skills",
  "Resistances",
  "Vulnerabilities",
  "Immunities",
  "Gear",
  "Senses",
  "Languages",
  "CR",
];

/** "−3" (U+2212) / "+4" → number. */
const signed = (s: string) => Number(s.replace("−", "-"));

const monsters = [
  ...statBlocks(chapter(all, "Monsters A–Z"), false),
  ...statBlocks(chapter(all, "Animals"), true),
];
writeJson("monsters.json", monsters);

function statBlocks(lines: Line[], animal: boolean) {
  const blocks: { group?: string; name: string; lines: Line[] }[] = [];
  let group: string | undefined;
  for (const l of lines) {
    if (l.size === 18) group = l.text;
    else if (l.size === 14.6) blocks.push({ group, name: l.text, lines: [] });
    else blocks.at(-1)?.lines.push(l);
  }
  return blocks.map((b) => parse(b, animal));
}

function parse(
  { group, name, lines }: { group?: string; name: string; lines: Line[] },
  animal: boolean,
) {
  const fail = (msg: string): never => {
    throw new Error(`${name}: ${msg}`);
  };

  // ── Header: type line, AC/Initiative, HP, Speed (may wrap) ──
  const typeLine = lines[0]!.text;
  const tm =
    /^((?:Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or (?:Tiny|Small|Medium|Large|Huge|Gargantuan))*) (.+), (.+)$/.exec(
      typeLine,
    ) ?? fail(`type line "${typeLine}"`);

  const header = new Map<string, string>(); // AC, HP, Speed, Skills, ..., CR
  const stats: string[] = [];
  let i = 1;
  let key = "";
  for (; i < lines.length && lines[i]!.size !== 12; i++) {
    const l = lines[i]!;
    if (l.size === 9.8) stats.push(l.text);
    else if (l.size === 6)
      continue; // "MOD SAVE" column headers
    else if (l.size === 9) {
      const label = ["AC", "HP", "Speed", ...LABELS].find((k) => l.text.startsWith(k + " "));
      if (label) header.set((key = label), l.text.slice(label.length + 1));
      else if (key === "AC" || !key) fail(`unexpected header line "${l.text}"`);
      else header.set(key, joinText([header.get(key)!, l.text]));
    }
  }

  const acm =
    /^(\d+) Initiative ([+−]\d+) \((\d+)\)$/.exec(header.get("AC") ?? "") ??
    fail(`AC "${header.get("AC")}"`);
  const hpm = /^(\d+) \((.+)\)$/.exec(header.get("HP") ?? "") ?? fail(`HP "${header.get("HP")}"`);

  const speed = header.get("Speed") ?? fail("no Speed");
  const speeds: Record<string, number> = {};
  for (const part of speed.split(/,\s*/)) {
    const sm = /^(?:(Burrow|Climb|Fly|Swim) )?(\d+) ft\.( \(hover\))?$/.exec(part);
    const kind = sm?.[1]?.toLowerCase() ?? "walk";
    // keep the first value; "30 ft., 40 ft. (wolf form only)" leaves the second in `speed`
    if (sm && !(kind in speeds)) speeds[kind] = Number(sm[2]);
  }

  // "Str 27 +8 +8 Dex 10 +0 +6 Con 25 +7 +7" (labels sometimes lowercase or unspaced; the
  // Young White Dragon's Int save lacks its sign in the SRD)
  const abilities: Record<string, { score: number; mod: number; save: number }> = {};
  for (const m of stats
    .join(" ")
    .matchAll(/(str|dex|con|int|wis|cha)\s*(\d+) ([+−]\d+) ([+−]?\d+)/gi)) {
    const mod = signed(m[3]!);
    // An unsigned save equal to |mod| is the unproficient save with its sign dropped.
    const save = /^\d/.test(m[4]!) && Number(m[4]) === Math.abs(mod) ? mod : signed(m[4]!);
    abilities[m[1]!.toLowerCase()] = { score: Number(m[2]), mod, save };
  }
  if (Object.keys(abilities).length !== 6) fail(`abilities from "${stats.join(" ")}"`);

  const skills: Record<string, number> = {};
  for (const m of (header.get("Skills") ?? "").matchAll(/([A-Z][\w ]+?) ([+−]\d+)/g))
    skills[slugify(m[1]!)] = signed(m[2]!);

  // "Fire, Poison; Charmed, Poisoned" → damage part / condition part
  const immunities = header.get("Immunities");
  const [immDamage, immCond] = splitImmunities(immunities);

  const senses = header.get("Senses") ?? fail("no Senses");
  const pp = /Passive Perception (\d+)/.exec(senses) ?? fail(`Senses "${senses}"`);

  // "17 (XP 18,000, or 20,000 in lair; PB +6)", "1/8 (XP 25; PB +2)", typo "3 (700 XP; PB +2)"
  const cr = header.get("CR") ?? fail("no CR");
  const crm =
    /^([\d/]+) \((?:XP ([\d,]+)|([\d,]+) XP)(?:,? or ([\d,]+) in lair)?; PB \+(\d)\)$/.exec(cr) ??
    fail(`CR "${cr}"`);
  const num = (s: string) => Number(s.replace(/,/g, ""));
  const [crN, crD] = crm[1]!.split("/").map(Number);

  // ── Sections ──
  const sections = {
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
  } as Record<string, { name: string; lines: string[] }[]>;
  let section: string | undefined;
  let legendaryActionUses: string | undefined;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.size === 12) {
      section = SECTIONS[l.text] ?? fail(`unknown section "${l.text}"`);
      continue;
    }
    if (!section) continue;
    const list = sections[section]!;
    if (section === "legendaryActions" && l.size === 9) {
      legendaryActionUses = legendaryActionUses ? joinText([legendaryActionUses, l.text]) : l.text;
      continue;
    }
    // A few labels aren't set in bold in the PDF ("Lightning Absorption."); accept a Title Case
    // label when the previous entry's text ended a sentence.
    const prevText = list.at(-1)?.lines.at(-1) ?? "";
    const plain =
      /^((?:[A-Z][\w’-]*|of|the|a|an|and|or|in|to)(?: (?:[A-Z][\w’-]*|of|the|a|an|and|or|in|to))*(?: \([^)]+\))?)\. (.+)$/.exec(
        l.text,
      );
    // "**At Will:** Detect Magic, ..." spell lists and "**1–4.** The target ..." roll results
    // belong to the entry above them.
    if (/^\*\*([^*]+:|\d[\d–]*\.)\*\*/.test(l.text) && list.length) {
      list.at(-1)!.lines.push("\n" + l.text);
      continue;
    }
    const r =
      runIn(l.text) ??
      (plain && (!list.length || /[.:]$/.test(prevText))
        ? { name: plain[1]!, rest: plain[2]! }
        : undefined);
    const opens = (s: string) => (s.match(/\(/g)?.length ?? 0) - (s.match(/\)/g)?.length ?? 0);
    if (r && opens(r.name) < 0 && list.length) {
      // A label wrapped over two lines: "Healing Touch (Celestial Only; Recharges after a Long" + "Rest)."
      const cur = list.at(-1)!;
      const start = cur.lines.pop()!;
      list.push({ name: `${start} ${r.name}`, lines: [r.rest] });
    } else if (r) list.push({ name: r.name, lines: [r.rest] });
    else if (list.length) list.at(-1)!.lines.push(l.text);
    else fail(`text before the first entry in ${section}: "${l.text}"`);
  }

  return {
    id: slugify(name),
    name,
    ...(group && group !== name && { group }),
    animal,
    size: tm[1]!.split(" or ").map((s) => s.toLowerCase()),
    type: tm[2]!,
    alignment: tm[3]!,
    ac: Number(acm[1]),
    initiative: { bonus: signed(acm[2]!), score: Number(acm[3]) },
    hp: { average: Number(hpm[1]), formula: hpm[2]!.replace("−", "-") },
    speed,
    speeds,
    hover: speed.includes("(hover)"),
    abilities,
    skills,
    ...(header.get("Resistances") && { resistances: header.get("Resistances") }),
    ...(header.get("Vulnerabilities") && { vulnerabilities: header.get("Vulnerabilities") }),
    ...(immunities && { immunities }),
    damageResistances: damageTypes(header.get("Resistances")),
    damageVulnerabilities: damageTypes(header.get("Vulnerabilities")),
    damageImmunities: immDamage,
    conditionImmunities: immCond,
    ...(header.get("Gear") && { gear: header.get("Gear") }),
    senses,
    passivePerception: Number(pp[1]),
    languages: header.get("Languages") ?? fail("no Languages"),
    cr: crm[1]!,
    crValue: crD ? crN! / crD : crN!,
    xp: num(crm[2] ?? crm[3]!),
    ...(crm[4] && { xpInLair: num(crm[4]) }),
    proficiencyBonus: Number(crm[5]),
    // "Legendary Action Uses: 3 (4 in Lair). Immediately after ..." → "3 (4 in Lair)"
    ...(legendaryActionUses && {
      legendaryActionUses: /^Legendary Action Uses: (.+?)\. /.exec(legendaryActionUses)![1],
    }),
    ...Object.fromEntries(
      Object.entries(sections).map(([k, list]) => [
        k,
        list.map((e) => entry(e.name, text(e.lines))),
      ]),
    ),
  };
}

/** Joins wrapped lines; a line marked with a leading "\n" starts a new paragraph. */
function text(lines: string[]): string {
  const paras: string[][] = [[]];
  for (const l of lines) {
    if (l.startsWith("\n")) paras.push([l.slice(1)]);
    else paras.at(-1)!.push(l);
  }
  return paras.map((p) => joinText(p)).join("\n\n");
}

function damageTypes(text: string | undefined): string[] {
  return (text ?? "")
    .split(/[,;]\s*|\s+and\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => DAMAGE_TYPES.has(s));
}

function splitImmunities(text: string | undefined): [string[], string[]] {
  if (!text) return [[], []];
  const [a, b] = text.split(/;\s*/);
  const damage = damageTypes(a);
  // Without a ";", the list is either all damage types or all conditions.
  const conditions = b ?? (damage.length ? "" : a!);
  return [
    damage,
    conditions
      .split(/,\s*/)
      .map((s) => slugify(s.replace(/\s*\(.*\)$/, ""))) // "Charmed (with Mind Blank)": note stays in `immunities`
      .filter(Boolean),
  ];
}

/** "Fire Breath (Recharge 5–6)" + text → structured entry. */
function entry(rawName: string, description: string) {
  const nm = /^(.+?)(?: \(([^()]+)\))?$/.exec(rawName)!;
  const out: Record<string, unknown> = { name: nm[1], ...(nm[2] && { usage: nm[2] }), description };

  const am =
    /^(Melee or Ranged|Melee|Ranged) Attack Roll: ([+−]\d+)(?: to hit)?(?: \([^)]*\))?, (?:reach (\d+) ft\.)?(?: or )?(?:range (\d+)(?:\/(\d+))? ft\.)?/.exec(
      description,
    );
  if (am) {
    out.attack = {
      kind: slugify(am[1]!),
      toHit: signed(am[2]!),
      ...(am[3] && { reach: Number(am[3]) }),
      ...(am[4] && { range: { normal: Number(am[4]), ...(am[5] && { long: Number(am[5]) }) } }),
    };
  }
  const sm =
    /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/.exec(
      description,
    );
  if (sm) out.save = { ability: ABILITY_IDS[sm[1]!], dc: Number(sm[2]) };

  // Damage dealt on a hit / failed save: the text up to "Success:" / "Miss:".
  const dealt = am || sm ? description.split(/ (?:Success|Miss|Failure or Success):/)[0]! : "";
  out.damage = [...dealt.matchAll(/(\d+)(?: \((\d+d\d+(?: [+−–] \d+)?)\))? (\w+) damage/g)]
    .filter((m) => DAMAGE_TYPES.has(m[3]!.toLowerCase()))
    .map((m) => ({
      average: Number(m[1]),
      ...(m[2] && { dice: m[2].replace(/[−–]/, "-").replace(/ /g, "") }),
      type: m[3]!.toLowerCase(),
    }));
  return out;
}
