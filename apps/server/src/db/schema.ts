// Database schema (Drizzle). Change it here, then `pnpm db:generate` to write a migration.
// Tables arrive with the phase that uses them; see docs/PLAN.md for the full design.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── Accounts ─────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Google's stable account id ("sub" claim). Null for dev-login seed users. */
    googleSub: text("google_sub").unique(),
    /** Stored lowercased. */
    email: text().notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the token itself only lives in the cookie. */
    id: text().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ── Campaigns ────────────────────────────────────────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text().notNull().default(""),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  inviteCode: text("invite_code").notNull().unique(),
  /** Validated by `campaignSettings` in @dnd/contracts. */
  settings: jsonb().notNull().default({}),
  createdAt: createdAt(),
});

export const memberRole = pgEnum("member_role", ["gm", "player", "spectator"]);

export const campaignMembers = pgTable(
  "campaign_members",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole().notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.userId] }),
    index("members_user_idx").on(t.userId),
  ],
);

// ── Chat & dice log ──────────────────────────────────────────────────────────────

export const messageKind = pgEnum("message_kind", ["text", "roll", "system"]);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: messageKind().notNull(),
    body: text(),
    expression: text(),
    rolls: integer().array(),
    total: integer(),
    label: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("chat_campaign_created_idx").on(t.campaignId, t.createdAt),
    check(
      "chat_roll_has_result",
      sql`${t.kind} <> 'roll' OR (${t.expression} IS NOT NULL AND ${t.total} IS NOT NULL)`,
    ),
  ],
);

// ── Characters ───────────────────────────────────────────────────────────────────
// The build (player choices) lives in `characters` + `character_levels`; derived numbers
// (AC, saves, max HP...) are computed by @dnd/character and never stored.

export const characterStatus = pgEnum("character_status", ["draft", "ready"]);

export const characters = pgTable(
  "characters",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Characters belong to their owner and can move between campaigns. */
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    status: characterStatus().notNull().default("draft"),
    builderStep: smallint("builder_step").notNull().default(0),
    name: text().notNull().default(""),
    speciesId: text("species_id"),
    backgroundId: text("background_id"),
    alignment: text(),
    xp: integer().notNull().default(0),
    /** Scores before the background bonus. */
    str: smallint(),
    dex: smallint(),
    con: smallint(),
    int: smallint(),
    wis: smallint(),
    cha: smallint(),
    backgroundBonus: jsonb("background_bonus").notNull().default({}),
    /** The rest of the build (ability method, Choice answers, equipment, languages, notes). */
    build: jsonb().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("characters_owner_idx").on(t.ownerId),
    index("characters_campaign_idx").on(t.campaignId),
  ],
);

export const characterLevels = pgTable(
  "character_levels",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    level: smallint().notNull(),
    classId: text("class_id").notNull(),
    subclassId: text("subclass_id"),
    /** Hit die result; null = the fixed value (and always ignored for level 1). */
    hpRoll: smallint("hp_roll"),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.level] }),
    check("character_levels_level_range", sql`${t.level} between 1 and 20`),
  ],
);

/** Play state, created when a draft becomes ready. One "hot" row updated during play. */
export const characterState = pgTable("character_state", {
  characterId: uuid("character_id")
    .primaryKey()
    .references(() => characters.id, { onDelete: "cascade" }),
  hpCurrent: integer("hp_current").notNull(),
  hpTemp: integer("hp_temp").notNull().default(0),
  hitDiceSpent: jsonb("hit_dice_spent").notNull().default({}),
  deathSaveSuccess: smallint("death_save_success").notNull().default(0),
  deathSaveFail: smallint("death_save_fail").notNull().default(0),
  exhaustion: smallint().notNull().default(0),
  heroicInspiration: boolean("heroic_inspiration").notNull().default(false),
  spellSlotsUsed: jsonb("spell_slots_used").notNull().default({}),
  pactSlotsUsed: smallint("pact_slots_used").notNull().default(0),
  featureUses: jsonb("feature_uses").notNull().default({}),
  conditions: text()
    .array()
    .notNull()
    .default(sql`'{}'`),
  concentratingOn: text("concentrating_on"),
  coins: jsonb().notNull().default({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }),
  /** Bumped on every write; clients send it back to detect concurrent edits. */
  version: integer().notNull().default(0),
});

export const itemKind = pgEnum("item_kind", [
  "weapon",
  "armor",
  "gear",
  "tool",
  "magic-item",
  "custom",
]);

export const characterItems = pgTable(
  "character_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    kind: itemKind().notNull(),
    /** SRD slug within `kind`; null for custom items. Homebrew items arrive with the homebrew table. */
    itemId: text("item_id"),
    name: text(),
    variant: text(),
    quantity: integer().notNull().default(1),
    equipped: boolean().notNull().default(false),
    attuned: boolean().notNull().default(false),
    chargesUsed: smallint("charges_used").notNull().default(0),
    notes: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("character_items_character_idx").on(t.characterId),
    check(
      "character_items_has_identity",
      sql`(${t.kind} = 'custom' AND ${t.name} IS NOT NULL) OR (${t.kind} <> 'custom' AND ${t.itemId} IS NOT NULL)`,
    ),
  ],
);

export const characterSpells = pgTable(
  "character_spells",
  {
    id: uuid().primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    spellId: text("spell_id").notNull(),
    /** Where the spell comes from: a class id, "species", or a feat id. */
    source: text().notNull(),
    prepared: boolean().notNull().default(false),
    alwaysPrepared: boolean("always_prepared").notNull().default(false),
  },
  (t) => [uniqueIndex("character_spells_unique_idx").on(t.characterId, t.spellId, t.source)],
);
