// Database schema (Drizzle). Change it here, then `pnpm db:generate` to write a migration.
// Tables arrive with the phase that uses them; see docs/PLAN.md for the full design.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  type AnyPgColumn,
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
  /** The map on the table for everyone; other scenes stay hidden from players. */
  activeSceneId: uuid("active_scene_id").references((): AnyPgColumn => scenes.id, {
    onDelete: "set null",
  }),
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

export const registrationStatus = pgEnum("registration_status", [
  "pending",
  "accepted",
  "rejected",
]);

/** Sign-ups from the public campaign page; the DM reviews them. One per account. */
export const campaignRegistrations = pgTable(
  "campaign_registrations",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull(),
    characterName: text("character_name").notNull(),
    /** Island id from the server's world data; it also decides the faction. */
    startIsland: text("start_island").notNull(),
    /** Object name under `sheets/` in the storage bucket. */
    sheetKey: text("sheet_key").notNull(),
    /** The name the player's file had; display only. */
    sheetName: text("sheet_name").notNull(),
    sheetMime: text("sheet_mime").notNull(),
    sheetBytes: integer("sheet_bytes").notNull(),
    status: registrationStatus().notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("registrations_campaign_user_idx").on(t.campaignId, t.userId)],
);

/**
 * Invitations to become a co-DM. Each is tied to one email address and works once. Like
 * sessions, only the SHA-256 of the token is stored, so a leaked table can't be replayed.
 */
export const coDmInvites = pgTable(
  "co_dm_invites",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** Stored lowercased; must match the account that accepts. */
    email: text().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("co_dm_invites_campaign_idx").on(t.campaignId)],
);

/** Shared DM notes. Each island runs its own sessions, so notes belong to an island and session. */
export const campaignNotes = pgTable(
  "campaign_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** Island id, validated by the server; includes the hidden island. */
    islandId: text("island_id").notNull(),
    sessionNumber: smallint("session_number").notNull(),
    title: text().notNull(),
    body: text().notNull(),
    /** Kept when an account goes away, so the note survives it. */
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Bumped on every edit; clients send it back to detect concurrent edits. */
    version: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_notes_island_idx").on(t.campaignId, t.islandId, t.sessionNumber),
    check("campaign_notes_session_range", sql`${t.sessionNumber} between 1 and 9999`),
  ],
);

/**
 * Battle maps. The image lives in object storage; the grid says how many image pixels one square
 * spans, which is the space of a Medium token, and where the first line falls.
 */
export const scenes = pgTable(
  "scenes",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Object name under `scenes/` in the storage bucket. */
    mapKey: text("map_key").notNull(),
    mapMime: text("map_mime").notNull(),
    widthPx: integer("width_px").notNull(),
    heightPx: integer("height_px").notNull(),
    gridPx: doublePrecision("grid_px").notNull(),
    offsetX: doublePrecision("offset_x").notNull().default(0),
    offsetY: doublePrecision("offset_y").notNull().default(0),
    gridVisible: boolean("grid_visible").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("scenes_campaign_idx").on(t.campaignId)],
);

export const tokenKind = pgEnum("token_kind", ["monster", "npc", "character", "object"]);
export const tokenSize = pgEnum("token_size", [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
]);

/** Tokens on a map. x and y are grid cells, for the token's top-left corner. */
export const tokens = pgTable(
  "tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    kind: tokenKind().notNull(),
    name: text().notNull(),
    size: tokenSize().notNull().default("medium"),
    /** SRD slug; stat blocks live in @dnd/data, not the database. */
    monsterId: text("monster_id"),
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }),
    x: integer().notNull(),
    y: integer().notNull(),
    hidden: boolean().notNull().default(false),
    hpCurrent: integer("hp_current"),
    hpMax: integer("hp_max"),
    /** For NPCs and objects; monsters and characters have theirs elsewhere. */
    ac: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    index("tokens_scene_idx").on(t.sceneId),
    // One token per character on a map; other kinds have no character and don't collide.
    uniqueIndex("tokens_scene_character_idx").on(t.sceneId, t.characterId),
  ],
);

/** The fight in progress; one per campaign. It's deleted when it ends. */
export const encounters = pgTable("encounters", {
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .unique()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  round: integer().notNull().default(1),
  /** Who is acting. Not a foreign key: this row and its combatants refer to each other. */
  currentCombatantId: uuid("current_combatant_id"),
  createdAt: createdAt(),
});

export const combatants = pgTable(
  "combatants",
  {
    id: uuid().primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    /** Name and HP are read from the token, so changes there show here too. */
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    initiative: integer().notNull(),
    reactionUsed: boolean("reaction_used").notNull().default(false),
  },
  (t) => [
    uniqueIndex("combatants_encounter_token_idx").on(t.encounterId, t.tokenId),
    index("combatants_token_idx").on(t.tokenId),
  ],
);

/** Someone left an enemy's reach, and it hasn't answered yet. Cleared when the turn moves on. */
export const reactionPrompts = pgTable(
  "reaction_prompts",
  {
    id: uuid().primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    reactorTokenId: uuid("reactor_token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    targetTokenId: uuid("target_token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("reaction_prompts_unique_idx").on(t.encounterId, t.reactorTokenId)],
);

/** A hit whose damage hasn't been rolled. Kept on the server so damage can't follow a miss. */
export const pendingAttacks = pgTable("pending_attacks", {
  id: uuid().primaryKey().defaultRandom(),
  attackerTokenId: uuid("attacker_token_id")
    .notNull()
    .references(() => tokens.id, { onDelete: "cascade" }),
  targetTokenId: uuid("target_token_id")
    .notNull()
    .references(() => tokens.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  critical: boolean().notNull(),
  secret: boolean().notNull(),
  damage: jsonb().notNull(),
  createdAt: createdAt(),
});

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
    /** A DM's roll that players don't see. */
    secret: boolean().notNull().default(false),
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
