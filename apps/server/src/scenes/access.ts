import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { memberRole } from "../campaigns/membership";
import type { Db } from "../db";
import { campaigns, scenes } from "../db/schema";

const campaignParams = z.object({ id: z.uuid() });

/** Who may reach a campaign's maps. Outsiders get a 404, so a campaign's existence stays private. */
export function sceneAccess(db: Db) {
  const member = async (req: FastifyRequest, reply: FastifyReply) => {
    const params = campaignParams.safeParse(req.params);
    const role = params.success ? await memberRole(db.orm, params.data.id, req.user!.id) : null;
    if (!params.success || !role) {
      reply.code(404).send({ error: "not found" });
      return null;
    }
    return { campaignId: params.data.id, role };
  };

  const gm = async (req: FastifyRequest, reply: FastifyReply) => {
    const m = await member(req, reply);
    if (!m) return null;
    if (m.role !== "gm") {
      reply.code(403).send({ error: "khusus DM" });
      return null;
    }
    return m;
  };

  const activeSceneId = async (campaignId: string) => {
    const [row] = await db.orm
      .select({ activeSceneId: campaigns.activeSceneId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    return row?.activeSceneId ?? null;
  };

  const loadScene = async (campaignId: string, sceneId: string) => {
    const [row] = await db.orm
      .select()
      .from(scenes)
      .where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)));
    return row ?? null;
  };

  return { member, gm, activeSceneId, loadScene };
}
