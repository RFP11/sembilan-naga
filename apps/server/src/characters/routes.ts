import { validateBuild } from "@dnd/character";
import {
  characterBuild,
  createCharacterRequest,
  updateCharacterRequest,
  type Character,
  type User,
} from "@dnd/contracts";
import { roll4d6DropLowest } from "@dnd/rules";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/plugin";
import { memberRole } from "../campaigns/membership";
import type { Db } from "../db";
import { characters } from "../db/schema";
import { buildColumns, loadCharacter, replaceLevels, summaries } from "./repo";
import { finalizeCharacter } from "./service";

const idParams = z.object({ id: z.uuid() });

export const characterRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook("preHandler", requireUser);

  /**
   * Loads a character the user may see: the owner, or the GM of its campaign. Sends 404
   * otherwise (without revealing that it exists).
   */
  async function visible(
    user: User,
    rawId: unknown,
    reply: FastifyReply,
  ): Promise<Character | undefined> {
    const params = idParams.safeParse(rawId);
    const c = params.success ? await loadCharacter(db.orm, params.data.id) : undefined;
    const allowed =
      c &&
      (c.ownerId === user.id ||
        (c.campaignId !== null && (await memberRole(db.orm, c.campaignId, user.id)) === "gm"));
    if (!allowed) {
      reply.code(404).send({ error: "not found" });
      return undefined;
    }
    return c;
  }

  async function owned(user: User, rawId: unknown, reply: FastifyReply) {
    const c = await visible(user, rawId, reply);
    if (c && c.ownerId !== user.id) {
      reply.code(403).send({ error: "only the owner can change this character" });
      return undefined;
    }
    return c;
  }

  /** The user's characters. */
  app.get("/characters", async (req) => {
    const rows = await db.orm
      .select()
      .from(characters)
      .where(eq(characters.ownerId, req.user!.id))
      .orderBy(desc(characters.updatedAt));
    return summaries(db.orm, rows);
  });

  /** Ready characters in a campaign, for every member. */
  app.get("/campaigns/:id/characters", async (req, reply) => {
    const params = idParams.safeParse(req.params);
    if (!params.success || !(await memberRole(db.orm, params.data.id, req.user!.id))) {
      return reply.code(404).send({ error: "not found" });
    }
    const rows = await db.orm
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, params.data.id), eq(characters.status, "ready")))
      .orderBy(characters.name);
    return summaries(db.orm, rows);
  });

  app.post("/characters", async (req, reply) => {
    const parsed = createCharacterRequest.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    const { name, campaignId } = parsed.data;
    if (campaignId && !(await memberRole(db.orm, campaignId, req.user!.id))) {
      return reply.code(400).send({ error: "you're not a member of that campaign" });
    }
    const [row] = await db.orm
      .insert(characters)
      .values({
        ownerId: req.user!.id,
        campaignId,
        ...buildColumns(characterBuild.parse({ name })),
      })
      .returning({ id: characters.id });
    return reply.code(201).send(await loadCharacter(db.orm, row!.id));
  });

  app.get("/characters/:id", async (req, reply) => {
    const c = await visible(req.user!, req.params, reply);
    if (!c) return;
    return { ...c, issues: c.status === "draft" ? validateBuild(c.build) : [] };
  });

  /** Edit a draft's build or step, or move any of your characters to another campaign. */
  app.patch("/characters/:id", async (req, reply) => {
    const c = await owned(req.user!, req.params, reply);
    if (!c) return;
    const parsed = updateCharacterRequest.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "invalid payload", details: parsed.error.issues });
    const { build: patch, builderStep, campaignId } = parsed.data;

    if (patch && c.status !== "draft") {
      return reply
        .code(409)
        .send({ error: "ready characters change through level-up, not the builder" });
    }
    if (campaignId && !(await memberRole(db.orm, campaignId, req.user!.id))) {
      return reply.code(400).send({ error: "you're not a member of that campaign" });
    }

    await db.orm.transaction(async (tx) => {
      const next = patch ? characterBuild.parse({ ...c.build, ...patch }) : c.build;
      await tx
        .update(characters)
        .set({
          ...(patch && buildColumns(next)),
          ...(builderStep !== undefined && { builderStep }),
          ...(campaignId !== undefined && { campaignId }),
          updatedAt: new Date(),
        })
        .where(eq(characters.id, c.id));
      if (patch?.levels) await replaceLevels(tx, c.id, next);
    });
    const updated = (await loadCharacter(db.orm, c.id))!;
    return { ...updated, issues: updated.status === "draft" ? validateBuild(updated.build) : [] };
  });

  /**
   * Rolls six 4d6-drop-lowest scores on the server and stores them; the build then assigns
   * them (validateBuild checks the assignment). Rolling again replaces the set.
   */
  app.post("/characters/:id/roll-abilities", async (req, reply) => {
    const c = await owned(req.user!, req.params, reply);
    if (!c) return;
    if (c.status !== "draft") return reply.code(409).send({ error: "already ready" });
    const abilityRolls = Array.from({ length: 6 }, () => roll4d6DropLowest(Math.random).total);
    const next = characterBuild.parse({
      ...c.build,
      abilityMethod: "roll",
      abilityRolls,
      baseScores: undefined,
    });
    await db.orm.update(characters).set(buildColumns(next)).where(eq(characters.id, c.id));
    const updated = (await loadCharacter(db.orm, c.id))!;
    return { ...updated, issues: validateBuild(updated.build) };
  });

  /** Draft → ready (see finalizeCharacter); refused with the open issues while incomplete. */
  app.post("/characters/:id/finalize", async (req, reply) => {
    const c = await owned(req.user!, req.params, reply);
    if (!c) return;
    if (c.status !== "draft") return reply.code(409).send({ error: "already ready" });
    const issues = validateBuild(c.build);
    if (issues.length)
      return reply.code(422).send({ error: "the character isn't finished", issues });

    await finalizeCharacter(db.orm, c);
    return loadCharacter(db.orm, c.id);
  });

  app.delete("/characters/:id", async (req, reply) => {
    const c = await owned(req.user!, req.params, reply);
    if (!c) return;
    await db.orm.delete(characters).where(eq(characters.id, c.id));
    return reply.code(204).send();
  });
};
