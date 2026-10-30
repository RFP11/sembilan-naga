import {
  campaignSettings,
  createCampaignRequest,
  joinCampaignRequest,
  type Campaign,
  type CampaignDetail,
  type DiceRollResult,
  type MemberRole,
} from "@dnd/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireUser } from "../auth/plugin";
import type { Db } from "../db";
import { campaignMembers, campaigns, chatMessages, users } from "../db/schema";
import { memberRole } from "./membership";

// No 0/O or 1/I: invite codes get read aloud and typed by hand.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newInviteCode = () =>
  Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

const idParams = z.object({ id: z.uuid() });

type CampaignRow = typeof campaigns.$inferSelect;

function toCampaign(row: CampaignRow, role: MemberRole): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    ...(role === "gm" && { inviteCode: row.inviteCode }),
    settings: campaignSettings.parse(row.settings),
    createdAt: row.createdAt.toISOString(),
    role,
  };
}

export const campaignRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook("preHandler", requireUser);

  /** Campaigns the user belongs to. */
  app.get("/campaigns", async (req): Promise<Campaign[]> => {
    const rows = await db.orm
      .select({ campaign: campaigns, role: campaignMembers.role })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
      .where(eq(campaignMembers.userId, req.user!.id))
      .orderBy(desc(campaigns.createdAt));
    return rows.map((r) => toCampaign(r.campaign, r.role));
  });

  app.post("/campaigns", async (req, reply) => {
    const parsed = createCampaignRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    const row = await db.orm.transaction(async (tx) => {
      const [created] = await tx
        .insert(campaigns)
        .values({ ...parsed.data, ownerId: req.user!.id, inviteCode: newInviteCode() })
        .returning();
      await tx
        .insert(campaignMembers)
        .values({ campaignId: created!.id, userId: req.user!.id, role: "gm" });
      return created!;
    });
    return reply.code(201).send(toCampaign(row, "gm"));
  });

  /** Join by invite code as a player. Joining again is a no-op. */
  app.post("/campaigns/join", async (req, reply) => {
    const parsed = joinCampaignRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid invite code" });
    const [row] = await db.orm
      .select()
      .from(campaigns)
      .where(eq(campaigns.inviteCode, parsed.data.inviteCode));
    if (!row) return reply.code(404).send({ error: "no campaign with that invite code" });
    await db.orm
      .insert(campaignMembers)
      .values({ campaignId: row.id, userId: req.user!.id, role: "player" })
      .onConflictDoNothing();
    const role = (await memberRole(db.orm, row.id, req.user!.id))!;
    return toCampaign(row, role);
  });

  app.get("/campaigns/:id", async (req, reply) => {
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const role = await memberRole(db.orm, params.data.id, req.user!.id);
    if (!role) return reply.code(404).send({ error: "not found" });
    const [row] = await db.orm.select().from(campaigns).where(eq(campaigns.id, params.data.id));
    const members = await db.orm
      .select({
        userId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: campaignMembers.role,
      })
      .from(campaignMembers)
      .innerJoin(users, eq(campaignMembers.userId, users.id))
      .where(eq(campaignMembers.campaignId, params.data.id))
      .orderBy(campaignMembers.joinedAt);
    const detail: CampaignDetail = { ...toCampaign(row!, role), members };
    return detail;
  });

  /** Latest dice rolls, newest first. */
  app.get("/campaigns/:id/rolls", async (req, reply) => {
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    if (!(await memberRole(db.orm, params.data.id, req.user!.id)))
      return reply.code(404).send({ error: "not found" });
    const rows = await db.orm
      .select({ message: chatMessages, by: users.displayName })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id))
      .where(and(eq(chatMessages.campaignId, params.data.id), eq(chatMessages.kind, "roll")))
      .orderBy(desc(chatMessages.createdAt))
      .limit(50);
    return rows.map(({ message: m, by }): DiceRollResult => toRollResult(m, by));
  });
};

export function toRollResult(
  m: typeof chatMessages.$inferSelect,
  by: string | null,
): DiceRollResult {
  const rolls = m.rolls ?? [];
  return {
    id: m.id,
    campaignId: m.campaignId,
    expression: m.expression!,
    ...(m.label && { label: m.label }),
    rolls,
    modifier: m.total! - rolls.reduce((a, b) => a + b, 0),
    total: m.total!,
    by: by ?? "unknown",
    userId: m.userId,
    createdAt: m.createdAt.toISOString(),
  };
}
