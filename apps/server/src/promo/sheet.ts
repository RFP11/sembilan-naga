// Reading a player's uploaded character sheet (D&D Beyond's fillable PDF) into a character
// build. The sheet is an AcroForm, so the values come from its named fields — no OCR.
// Everything here is best-effort: a field we can't map is simply left for the player in the
// builder, and a sheet that can't be read still yields a draft with the name from the form.

import { characterBuild, type Alignment, type CharacterBuild } from "@dnd/contracts";
import { backgrounds, classes, languages, species, type AbilityId } from "@dnd/data";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

export type AbilityScores = Record<(typeof ABILITIES)[number], number>;

/** Keys as printed on the sheet, by normalized name ("CLASS  LEVEL" → "CLASS LEVEL"). */
function fieldMap(fields: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(fields)) {
    const name = key
      .replace(/\s+/g, " ")
      .replace(/\s*\d+$/, "")
      .trim()
      .toUpperCase();
    const text = value.trim();
    if (name && text && !map.has(name)) map.set(name, text);
  }
  return map;
}

const matchByName = <T extends { id: string; name: string }>(
  list: readonly T[],
  raw: string | undefined,
): T | undefined => {
  if (!raw) return undefined;
  const want = raw
    .split(/[/;,()]/)[0]!
    .trim()
    .toLowerCase();
  if (!want) return undefined;
  return (
    list.find((x) => x.name.toLowerCase() === want) ??
    list.find((x) => want.startsWith(x.name.toLowerCase()))
  );
};

const ALIGNMENTS: Record<string, Alignment> = {
  "lawful good": "lg",
  "neutral good": "ng",
  "chaotic good": "cg",
  "lawful neutral": "ln",
  neutral: "n",
  "true neutral": "n",
  "chaotic neutral": "cn",
  "lawful evil": "le",
  "neutral evil": "ne",
  "chaotic evil": "ce",
  lg: "lg",
  ng: "ng",
  cg: "cg",
  ln: "ln",
  n: "n",
  cn: "cn",
  le: "le",
  ne: "ne",
  ce: "ce",
};

function parseAlignment(raw: string | undefined): Alignment | undefined {
  if (!raw) return undefined;
  const key = raw.split("(")[0]!.trim().toLowerCase();
  return ALIGNMENTS[key];
}

function parseScores(get: (name: string) => string | undefined): AbilityScores | undefined {
  const scores = {} as AbilityScores;
  for (const ability of ABILITIES) {
    const value = Number(get(ability.toUpperCase()));
    if (!Number.isInteger(value) || value < 1 || value > 30) return undefined;
    scores[ability] = value;
  }
  return scores;
}

/**
 * The sheet shows final scores (background and feats already included). The app stores scores
 * before the background bonus, so the bonus is subtracted from the highest allowed abilities;
 * the result still derives back to exactly what the sheet shows.
 */
function scorePlan(
  final: AbilityScores,
  backgroundAbilities: readonly AbilityId[],
): { baseScores: AbilityScores; backgroundBonus: Partial<Record<AbilityId, number>> } {
  const allowed = [...backgroundAbilities].sort(
    (a, b) => final[b] - final[a] || ABILITIES.indexOf(a) - ABILITIES.indexOf(b),
  );
  if (allowed.length >= 2) {
    const bonus: Partial<Record<AbilityId, number>> = { [allowed[0]!]: 2, [allowed[1]!]: 1 };
    const base = { ...final };
    for (const ability of allowed.slice(0, 2)) base[ability] -= bonus[ability]!;
    if (ABILITIES.every((ability) => base[ability] >= 3))
      return { baseScores: base, backgroundBonus: bonus };
  }
  return { baseScores: final, backgroundBonus: {} };
}

function parseLevels(
  raw: string | undefined,
  features: string | undefined,
): CharacterBuild["levels"] {
  if (!raw) return [];
  const levels: CharacterBuild["levels"] = [];
  for (const part of raw.split("/")) {
    const match = /^(.+?)\s+(\d+)$/.exec(part.trim());
    if (!match) continue;
    const cls = matchByName(classes, match[1]);
    if (!cls) continue;
    const count = Math.min(Number(match[2]), 20 - levels.length);
    for (let i = 0; i < count; i++) levels.push({ classId: cls.id });
  }

  // The sheet's features panel names the subclass ("| Hunter"); all the app's classes have
  // exactly one, so a mention is enough to fill it in from level 3.
  const classIds = new Set(levels.map((l) => l.classId));
  for (const classId of classIds) {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) continue;
    const escaped = cls.subclass.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!features || !new RegExp(`\\|\\s*${escaped}`, "i").test(features)) continue;
    let taken = 0;
    for (const level of levels) {
      if (level.classId !== classId) continue;
      if (++taken >= 3) level.subclassId = cls.subclass.id;
    }
  }
  return levels;
}

function parseLanguages(raw: string | undefined): string[] {
  if (!raw) return [];
  const section = /===\s*LANGUAGES\s*===\s*([\s\S]*)/i.exec(raw)?.[1] ?? raw;
  const ids: string[] = [];
  for (const name of section.split(/[\n,]/)) {
    const language = languages.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
    if (!language || language.id === "common" || language.rarity !== "standard") continue;
    if (!ids.includes(language.id)) ids.push(language.id);
    if (ids.length === 2) break;
  }
  return ids;
}

const NOTE =
  "Diimpor dari character sheet PDF. Periksa pilihan skill, feat, equipment, dan bahasa sebelum finalize.";

/** Fields of an uploaded sheet (see `readSheetFields`) → the build to prefill a draft with. */
export function buildFromSheet(
  fields: Record<string, string>,
  fallbackName: string,
): CharacterBuild {
  const sheet = fieldMap(fields);
  const get = (name: string) => sheet.get(name);

  const name = (sheet.get("CHARACTERNAME") ?? fallbackName).slice(0, 100).trim();
  const foundSpecies = matchByName(species, sheet.get("RACE"));
  const foundBackground = matchByName(backgrounds, sheet.get("BACKGROUND"));
  const alignment = parseAlignment(sheet.get("ALIGNMENT"));
  const features = Object.entries(fields)
    .filter(([key]) => /^features ?traits\d*$/i.test(key.replace(/\s+/g, " ").trim()))
    .map(([, value]) => value)
    .join("\n");
  const levels = parseLevels(sheet.get("CLASS LEVEL"), features);
  const scores = parseScores(get);
  const plan = scores && scorePlan(scores, foundBackground?.abilities ?? []);
  const backstory = sheet.get("BACKSTORY") ?? "";
  const imported = Boolean(foundSpecies || foundBackground || levels.length || plan);
  const notes = [imported ? NOTE : "", backstory].filter(Boolean).join("\n\n").slice(0, 10_000);
  // Variable-size species (Human, Elf, ...) ask which one; the sheet says it outright.
  const size = sheet.get("SIZE")?.toLowerCase();
  const choices = size === "medium" || size === "small" ? { "species:size": size } : ({} as const);

  return characterBuild.parse({
    name,
    speciesId: foundSpecies?.id,
    backgroundId: foundBackground?.id,
    alignment,
    levels,
    choices,
    ...(plan && {
      abilityMethod: "roll" as const,
      baseScores: plan.baseScores,
      backgroundBonus: plan.backgroundBonus,
      abilityRolls: ABILITIES.map((a) => plan.baseScores[a]).sort((a, b) => a - b),
    }),
    languages: parseLanguages(sheet.get("PROFICIENCIESLANG")),
    notes,
  });
}

/** The form's named fields from an uploaded PDF, or `{}` when it has none. */
export async function readSheetFields(pdf: Uint8Array): Promise<Record<string, string>> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdf.js refuses a Node `Buffer`; it wants a plain Uint8Array.
  const data = Uint8Array.from(pdf);
  const doc = await getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  const fields: Record<string, string> = {};
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const annotations = await page.getAnnotations({ intent: "display" });
      for (const annotation of annotations) {
        const value = annotation.fieldValue;
        if (annotation.fieldName && typeof value === "string" && value.trim())
          fields[annotation.fieldName] = value;
      }
    }
  } finally {
    await doc.destroy();
  }
  return fields;
}

/** Reads bytes from a storage stream (MinIO returns one; tests use an in-memory stream). */
export async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
