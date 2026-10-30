import { z } from "zod";

// Zod schemas for SRD content. Homebrew content (e.g. homebrew_items.data) reuses these,
// so they describe what the app needs, not how the PDF happens to lay things out.

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug: lowercase words joined by -");

export const abilityId = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
export type AbilityId = z.infer<typeof abilityId>;

export const ability = z.object({
  id: abilityId,
  name: z.string(),
  description: z.string(),
});
export type Ability = z.infer<typeof ability>;

export const skill = z.object({
  id,
  name: z.string(),
  ability: abilityId,
  description: z.string(),
});
export type Skill = z.infer<typeof skill>;

export const damageTypeId = z.enum([
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
export type DamageTypeId = z.infer<typeof damageTypeId>;

export const damageType = z.object({
  id: damageTypeId,
  name: z.string(),
  description: z.string(),
});
export type DamageType = z.infer<typeof damageType>;

/** A named rule: glossary entries, weapon properties, mastery properties. */
export const rule = z.object({
  id,
  name: z.string(),
  /** Glossary tag, e.g. "condition", "action", "area of effect". */
  tag: z.string().optional(),
  description: z.string(),
});
export type Rule = z.infer<typeof rule>;

export const condition = z.object({
  id,
  name: z.string(),
  description: z.string(),
});
export type Condition = z.infer<typeof condition>;

export const language = z.object({
  id,
  name: z.string(),
  rarity: z.enum(["standard", "rare"]),
  /** 1d12 roll range on the Standard Languages table, e.g. [3, 4]. Common has none. */
  roll: z.tuple([z.number().int(), z.number().int()]).optional(),
  note: z.string().optional(),
});
export type Language = z.infer<typeof language>;

// ── Equipment ──────────────────────────────────────────────────────────────────

/** Prices are stored in copper pieces: 1 GP = 100, 1 SP = 10. */
const costCp = z.number().int().min(0);

export const damage = z.object({
  dice: z.string(), // "1d8", or "1" for the Blowgun
  type: damageTypeId,
});

export const weaponProperty = z.enum([
  "ammunition",
  "finesse",
  "heavy",
  "light",
  "loading",
  "reach",
  "thrown",
  "two-handed",
  "versatile",
]);
export const weaponMastery = z.enum([
  "cleave",
  "graze",
  "nick",
  "push",
  "sap",
  "slow",
  "topple",
  "vex",
]);

export const weapon = z.object({
  id,
  name: z.string(),
  category: z.enum(["simple", "martial"]),
  kind: z.enum(["melee", "ranged"]),
  damage,
  properties: z.array(weaponProperty),
  /** Normal/long range in feet, for Thrown or Ammunition weapons. */
  range: z.object({ normal: z.number().int(), long: z.number().int() }).optional(),
  versatileDice: z.string().optional(),
  ammunition: z.string().optional(), // "arrow", "bolt", ...
  /** Free-text caveat, e.g. the Lance's "Two-Handed (unless mounted)". */
  note: z.string().optional(),
  mastery: weaponMastery,
  weightLb: z.number().min(0),
  costCp,
});
export type Weapon = z.infer<typeof weapon>;

export const armor = z.object({
  id,
  name: z.string(),
  category: z.enum(["light", "medium", "heavy", "shield"]),
  /** Base AC, or the bonus for a Shield. */
  ac: z.number().int(),
  addDex: z.boolean(),
  maxDex: z.number().int().optional(),
  strength: z.number().int().optional(),
  stealthDisadvantage: z.boolean(),
  weightLb: z.number().min(0),
  costCp,
});
export type Armor = z.infer<typeof armor>;

export const tool = z.object({
  id,
  name: z.string(),
  category: z.enum(["artisan", "other"]),
  /** Undefined when the price varies by variant (Gaming Set, Musical Instrument). */
  costCp: costCp.optional(),
  weightLb: z.number().min(0).optional(),
  ability: abilityId,
  utilize: z.string(),
  craft: z.array(z.string()),
  variants: z.string().optional(),
});
export type Tool = z.infer<typeof tool>;

export const gear = z.object({
  id,
  name: z.string(),
  costCp: costCp.optional(),
  weightLb: z.number().min(0).optional(),
  description: z.string(),
});
export type Gear = z.infer<typeof gear>;

export const rarity = z.enum(["common", "uncommon", "rare", "very-rare", "legendary", "artifact"]);
export type Rarity = z.infer<typeof rarity>;

export const magicItem = z.object({
  id,
  name: z.string(),
  category: z.enum([
    "armor",
    "potion",
    "ring",
    "rod",
    "scroll",
    "staff",
    "wand",
    "weapon",
    "wondrous-item",
  ]),
  /** Parenthetical after the category, e.g. "Any Medium or Heavy, Except Hide Armor". */
  baseItem: z.string().optional(),
  /** Every rarity the item comes in; "+1/+2/+3" items list several. Empty when it varies. */
  rarities: z.array(rarity),
  rarityNote: z.string(),
  attunement: z.boolean(),
  attunementNote: z.string().optional(),
  description: z.string(),
});
export type MagicItem = z.infer<typeof magicItem>;

// ── Spells ─────────────────────────────────────────────────────────────────────

export const spellSchool = z.enum([
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
]);

export const classId = z.enum([
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
]);
export type ClassId = z.infer<typeof classId>;

export const spell = z.object({
  id,
  name: z.string(),
  level: z.number().int().min(0).max(9),
  school: spellSchool,
  classes: z.array(classId),
  castingTime: z.string(),
  ritual: z.boolean(),
  range: z.string(),
  components: z.array(z.enum(["V", "S", "M"])),
  material: z.string().optional(),
  duration: z.string(),
  concentration: z.boolean(),
  description: z.string(),
  /** "Using a Higher-Level Spell Slot" or "Cantrip Upgrade" text. */
  higherLevels: z.string().optional(),
});
export type Spell = z.infer<typeof spell>;

// ── Origins & feats ────────────────────────────────────────────────────────────

/** A named rule paragraph ("Darkvision.", "Breath Weapon.") with its text. */
export const trait = z.object({
  name: z.string(),
  description: z.string(),
});
export type Trait = z.infer<typeof trait>;

export const species = z.object({
  id,
  name: z.string(),
  creatureType: z.string(),
  size: z.array(z.enum(["small", "medium"])),
  sizeNote: z.string(),
  speed: z.number().int(),
  traits: z.array(trait),
});
export type Species = z.infer<typeof species>;

export const background = z.object({
  id,
  name: z.string(),
  abilities: z.array(abilityId).length(3),
  feat: z.string(), // feat id, e.g. "magic-initiate"
  featNote: z.string().optional(), // e.g. "Cleric" for Magic Initiate (Cleric)
  skills: z.array(id).length(2),
  tool: z.string(),
  equipment: z.string(),
});
export type Background = z.infer<typeof background>;

export const feat = z.object({
  id,
  name: z.string(),
  category: z.enum(["origin", "general", "fighting-style", "epic-boon"]),
  prerequisite: z.string().optional(),
  repeatable: z.boolean(),
  description: z.string(),
  benefits: z.array(trait),
});
export type Feat = z.infer<typeof feat>;

// ── Classes ────────────────────────────────────────────────────────────────────

export const classFeature = z.object({
  level: z.number().int().min(1).max(20),
  name: z.string(),
  description: z.string(),
});
export type ClassFeature = z.infer<typeof classFeature>;

export const dndClass = z.object({
  id: classId,
  name: z.string(),
  primaryAbility: z.string(),
  hitDie: z.number().int(),
  savingThrows: z.array(abilityId).length(2),
  skillChoices: z.object({ count: z.number().int(), from: z.array(id) }),
  weaponProficiencies: z.string(),
  toolProficiencies: z.string().optional(),
  armorTraining: z.string(),
  startingEquipment: z.string(),
  multiclass: z.string(),
  /** Rows of the class features table: level → column values, e.g. {"Rages": "2"}. */
  table: z.array(
    z.object({
      level: z.number().int().min(1).max(20),
      proficiencyBonus: z.number().int(),
      features: z.array(z.string()),
      columns: z.record(z.string(), z.string()),
    }),
  ),
  features: z.array(classFeature),
  /** Choosable option lists, e.g. Metamagic Options, Eldritch Invocation Options. */
  options: z.array(
    z.object({
      id,
      name: z.string(),
      entries: z.array(
        z.object({
          id,
          name: z.string(),
          prerequisite: z.string().optional(),
          description: z.string(),
        }),
      ),
    }),
  ),
  subclass: z.object({
    id,
    name: z.string(),
    description: z.string(),
    features: z.array(classFeature),
  }),
});
export type DndClass = z.infer<typeof dndClass>;
