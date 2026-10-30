import { z } from "zod";

// Character API contract. A character is a *build* (choices the player makes; stats are
// derived from it by @dnd/character) plus, once ready, play *state* (HP, slots, items).

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const abilityId = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

export const abilityScores = z.object({
  str: z.number().int().min(1).max(30),
  dex: z.number().int().min(1).max(30),
  con: z.number().int().min(1).max(30),
  int: z.number().int().min(1).max(30),
  wis: z.number().int().min(1).max(30),
  cha: z.number().int().min(1).max(30),
});
export type AbilityScoresDto = z.infer<typeof abilityScores>;

export const alignment = z.enum(["lg", "ng", "cg", "ln", "n", "cn", "le", "ne", "ce"]);
export type Alignment = z.infer<typeof alignment>;

export const characterLevel = z.object({
  classId: slug,
  subclassId: slug.optional(),
  /** Hit die result for this level; omitted = the fixed value. Ignored for character level 1. */
  hpRoll: z.number().int().min(1).max(12).optional(),
});
export type CharacterLevel = z.infer<typeof characterLevel>;

// The build's fields without defaults, so a partial update only touches what it sends.
const buildFields = {
  name: z.string().trim().max(100),
  speciesId: slug.optional(),
  backgroundId: slug.optional(),
  alignment: alignment.optional(),
  abilityMethod: z.enum(["standard", "point-buy", "roll"]).optional(),
  /** Scores before the background bonus. */
  baseScores: abilityScores.optional(),
  /** Background ability increase: +2/+1 or +1/+1/+1. */
  backgroundBonus: z.partialRecord(abilityId, z.number().int().min(1).max(2)),
  /** In the order taken; the first entry is character level 1. */
  levels: z.array(characterLevel).max(20),
  /**
   * Answers to Choices, keyed "<source>:<choiceId>", e.g. "species:elven-lineage" → "drow",
   * "class:fighter:skills" → ["athletics", "perception"].
   */
  choices: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  /** Starting equipment package per source. */
  equipment: z.object({
    class: z.enum(["a", "b", "c"]).optional(),
    background: z.enum(["a", "b"]).optional(),
  }),
  /** Besides Common. */
  languages: z.array(slug),
  notes: z.string().max(10_000),
};

/** Everything the builder edits. All optional while the character is a draft. */
export const characterBuild = z.object({
  ...buildFields,
  name: buildFields.name.default(""),
  backgroundBonus: buildFields.backgroundBonus.default({}),
  levels: buildFields.levels.default([]),
  choices: buildFields.choices.default({}),
  equipment: buildFields.equipment.default({}),
  languages: buildFields.languages.default([]),
  notes: buildFields.notes.default(""),
});
export type CharacterBuild = z.infer<typeof characterBuild>;
export type CharacterBuildInput = z.input<typeof characterBuild>;

export const characterStatus = z.enum(["draft", "ready"]);

export const characterItem = z.object({
  id: z.uuid(),
  kind: z.enum(["weapon", "armor", "gear", "tool", "magic-item", "custom"]),
  /** SRD slug; null for custom items. */
  itemId: slug.nullable(),
  name: z.string().nullable(),
  variant: z.string().nullable(),
  quantity: z.number().int().min(0),
  equipped: z.boolean(),
  attuned: z.boolean(),
});
export type CharacterItem = z.infer<typeof characterItem>;

export const coins = z.object({
  cp: z.number().int().min(0),
  sp: z.number().int().min(0),
  ep: z.number().int().min(0),
  gp: z.number().int().min(0),
  pp: z.number().int().min(0),
});

export const characterState = z.object({
  hpCurrent: z.number().int(),
  hpTemp: z.number().int().min(0),
  hitDiceSpent: z.record(z.string(), z.number().int().min(0)),
  deathSaves: z.object({
    success: z.number().int().min(0).max(3),
    fail: z.number().int().min(0).max(3),
  }),
  exhaustion: z.number().int().min(0).max(6),
  heroicInspiration: z.boolean(),
  spellSlotsUsed: z.record(z.string(), z.number().int().min(0)),
  pactSlotsUsed: z.number().int().min(0),
  featureUses: z.record(z.string(), z.number().int().min(0)),
  conditions: z.array(z.string()),
  concentratingOn: z.string().nullable(),
  coins,
  version: z.number().int(),
});
export type CharacterState = z.infer<typeof characterState>;

export const character = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  campaignId: z.uuid().nullable(),
  status: characterStatus,
  builderStep: z.number().int().min(0),
  xp: z.number().int().min(0),
  build: characterBuild,
  /** Null while a draft. */
  state: characterState.nullable(),
  items: z.array(characterItem),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Character = z.infer<typeof character>;

export const characterSummary = character
  .pick({ id: true, ownerId: true, campaignId: true, status: true, updatedAt: true })
  .extend({
    name: z.string(),
    speciesId: slug.nullable(),
    /** e.g. [{ classId: "fighter", level: 3 }] */
    classes: z.array(z.object({ classId: slug, level: z.number().int() })),
    level: z.number().int(),
  });
export type CharacterSummary = z.infer<typeof characterSummary>;

export const createCharacterRequest = z.object({
  name: z.string().trim().max(100).default(""),
  campaignId: z.uuid().nullable().default(null),
});
export type CreateCharacterRequest = z.input<typeof createCharacterRequest>;

/** Draft edits: any build fields (replacing them), the builder step, or the campaign. */
export const updateCharacterRequest = z.object({
  build: z.object(buildFields).partial().optional(),
  builderStep: z.number().int().min(0).max(10).optional(),
  /** Move to another campaign the owner belongs to, or null to leave. */
  campaignId: z.uuid().nullable().optional(),
});
export type UpdateCharacterRequest = z.input<typeof updateCharacterRequest>;

/** One problem that keeps a draft from becoming ready. `step` points the builder at it. */
export const buildIssue = z.object({
  step: z.enum(["class", "origin", "abilities", "alignment", "details"]),
  message: z.string(),
});
export type BuildIssue = z.infer<typeof buildIssue>;
