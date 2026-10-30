// Database schema (Drizzle). Change it here, then `pnpm db:generate` to write a migration.
// Tables arrive with the phase that uses them; see docs/PLAN.md for the full design.

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
