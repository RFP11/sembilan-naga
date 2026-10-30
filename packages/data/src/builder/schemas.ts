import { z } from "zod";
import { abilityId, damageTypeId } from "../schemas";

// Structured data the character builder computes with. The SRD prints these choices as
// prose or multi-column tables, so they're written by hand (see species.ts, equipment.ts)
// and checked against the generated SRD data in builder.test.ts.

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** What a character gets from a trait, feature or chosen option. */
export const grant = z.discriminatedUnion("type", [
  z.object({ type: z.literal("darkvision"), range: z.number().int() }),
  /** Sets the walking Speed (Wood Elf: 35). */
  z.object({ type: z.literal("speed"), walk: z.number().int() }),
  z.object({ type: z.literal("resistance"), damageType: damageTypeId }),
  z.object({ type: z.literal("cantrip"), spellId: id }),
  /**
   * An always-prepared spell gained at `minLevel` (character level). `freeCasts` is how often
   * it can be cast without a slot: once per Long Rest, or Proficiency Bonus times.
   */
  z.object({
    type: z.literal("spell"),
    spellId: id,
    minLevel: z.number().int().min(1).max(20),
    freeCasts: z.enum(["once", "proficiency-bonus"]),
  }),
  z.object({ type: z.literal("skill"), skillId: id }),
  /** Pick any `count` skills (Human: Skillful). */
  z.object({ type: z.literal("choose-skill"), count: z.number().int().min(1) }),
  /** Pick a feat of this category (Human: Versatile). */
  z.object({
    type: z.literal("choose-feat"),
    category: z.enum(["origin", "general", "fighting-style"]),
  }),
  z.object({ type: z.literal("size"), size: z.enum(["small", "medium"]) }),
  /** The spellcasting ability for spells from the same trait. */
  z.object({ type: z.literal("spellcasting-ability"), ability: abilityId }),
  /** Hit Point maximum +value per character level (Dwarven Toughness). */
  z.object({ type: z.literal("hit-points-per-level"), value: z.number().int() }),
  /** A named option of the trait whose rules are text only (Goliath: Fire's Burn). */
  z.object({ type: z.literal("feature"), name: z.string() }),
]);
export type Grant = z.infer<typeof grant>;

export const choiceOption = z.object({ id, name: z.string(), grants: z.array(grant) });
export type ChoiceOption = z.infer<typeof choiceOption>;

/** One decision the player makes, e.g. Elven Lineage → Drow / High Elf / Wood Elf. */
export const choice = z.object({
  id,
  name: z.string(),
  /** The SRD trait this choice belongs to. */
  trait: z.string(),
  options: z.array(choiceOption).min(2),
});
export type Choice = z.infer<typeof choice>;

export const speciesBuilder = z.object({
  speciesId: id,
  /** Applied automatically. */
  grants: z.array(grant),
  choices: z.array(choice),
});
export type SpeciesBuilder = z.infer<typeof speciesBuilder>;

// ── Starting equipment ─────────────────────────────────────────────────────────

export const itemRef = z.discriminatedUnion("kind", [
  /** An item from the SRD equipment data; `variant` names a form from its table (Arrows, Orb). */
  z.object({
    kind: z.enum(["weapon", "armor", "gear", "tool"]),
    id,
    quantity: z.number().int().min(1).default(1),
    variant: z.string().optional(),
    /** The player picks the variant (Bard: "Musical Instrument of your choice"). */
    chooseVariant: z.boolean().optional(),
    /** Free-text detail that isn't a table variant, e.g. a Book's subject ("prayers"). */
    note: z.string().optional(),
  }),
  /** The same tool the character chose for a tool proficiency (Monk, Soldier). */
  z.object({ kind: z.literal("proficient-tool") }),
  /** Not an equipment item in the SRD (the Wizard's Spellbook comes from a class feature). */
  z.object({ kind: z.literal("custom"), name: z.string() }),
]);
export type ItemRef = z.infer<typeof itemRef>;

export const equipmentOption = z.object({
  id: z.enum(["a", "b", "c"]),
  items: z.array(itemRef),
  gp: z.number().int().min(0),
});
export type EquipmentOption = z.infer<typeof equipmentOption>;

export const startingEquipment = z.object({
  source: z.enum(["class", "background"]),
  sourceId: id,
  options: z.array(equipmentOption).min(2),
});
export type StartingEquipment = z.infer<typeof startingEquipment>;
