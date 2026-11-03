import {
  campaignRoom,
  createTokenRequest,
  sceneGridSize,
  TOKEN_CELLS,
  updateTokenRequest,
  type Token,
  type TokenMove,
  type TokenSize,
} from "@dnd/contracts";
import { monsters } from "@dnd/data/monsters";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/plugin";
import { memberRole } from "../campaigns/membership";
import type { Db, Orm } from "../db";
import { campaigns, characters, scenes, tokens } from "../db/schema";
import type { IO } from "../plugins/socket";
import { sceneAccess } from "./access";
import { removeFromEncounter } from "./encounter";

const sceneParams = z.object({ id: z.uuid(), sceneId: z.uuid() });
const tokenParams = sceneParams.extend({ tokenId: z.uuid() });

type TokenRow = typeof tokens.$inferSelect;
type SceneRow = typeof scenes.$inferSelect;

/** The furthest a token of this size can sit and still be on the map. */
function clampToMap(scene: SceneRow, size: TokenSize, x: number, y: number) {
  const { cols, rows } = sceneGridSize(scene);
  const cells = TOKEN_CELLS[size];
  return {
    x: Math.max(0, Math.min(Math.max(0, cols - cells), x)),
    y: Math.max(0, Math.min(Math.max(0, rows - cells), y)),
  };
}

/** The free spot closest to the map's centre, so new tokens are easy to find and don't stack. */
function findFreeCell(scene: SceneRow, size: TokenSize, taken: Set<string>) {
  const { cols, rows } = sceneGridSize(scene);
  const cells = TOKEN_CELLS[size];
  const centre = clampToMap(
    scene,
    size,
    Math.floor((cols - cells) / 2),
    Math.floor((rows - cells) / 2),
  );
  const isFree = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + cells > cols || y + cells > rows) return false;
    for (let dx = 0; dx < cells; dx++) {
      for (let dy = 0; dy < cells; dy++) if (taken.has(`${x + dx},${y + dy}`)) return false;
    }
    return true;
  };
  for (let radius = 0; radius <= Math.max(cols, rows); radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (isFree(centre.x + dx, centre.y + dy)) return { x: centre.x + dx, y: centre.y + dy };
      }
    }
  }
  return centre; // The map is full: better on top of another token than refused.
}

function occupy(taken: Set<string>, size: TokenSize, x: number, y: number) {
  const cells = TOKEN_CELLS[size];
  for (let dx = 0; dx < cells; dx++) {
    for (let dy = 0; dy < cells; dy++) taken.add(`${x + dx},${y + dy}`);
  }
}

/** Goblin, Goblin 2, Goblin 3: picks up from what's already on the map. */
function nextNames(base: string, count: number, existing: string[]) {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?: (\\d+))?$`);
  const used = existing.flatMap((name) => {
    const match = pattern.exec(name);
    return match ? [Number(match[1] ?? 1)] : [];
  });
  if (used.length === 0 && count === 1) return [base];
  const start = used.length ? Math.max(...used) + 1 : 1;
  return Array.from({ length: count }, (_, i) => `${base} ${start + i}`);
}

/**
 * Moves a token if this user may. Returns where it ended up, or null when refused. The DM moves
 * anything; a player only their own character's token on the map that's on the table.
 */
export async function moveToken(orm: Orm, userId: string, move: TokenMove) {
  const [row] = await orm
    .select({
      token: tokens,
      scene: scenes,
      activeSceneId: campaigns.activeSceneId,
      ownerId: characters.ownerId,
    })
    .from(tokens)
    .innerJoin(scenes, eq(tokens.sceneId, scenes.id))
    .innerJoin(campaigns, eq(scenes.campaignId, campaigns.id))
    .leftJoin(characters, eq(tokens.characterId, characters.id))
    .where(and(eq(tokens.id, move.tokenId), eq(scenes.campaignId, move.campaignId)));
  if (!row) return null;

  const role = await memberRole(orm, move.campaignId, userId);
  const allowed =
    role === "gm" ||
    (role === "player" &&
      row.ownerId === userId &&
      row.activeSceneId === row.scene.id &&
      !row.token.hidden);
  if (!allowed) return null;

  const { x, y } = clampToMap(row.scene, row.token.size, move.x, move.y);
  await orm.update(tokens).set({ x, y }).where(eq(tokens.id, row.token.id));
  return { x, y, hidden: row.token.hidden, from: { x: row.token.x, y: row.token.y } };
}

export const tokenRoutes: FastifyPluginAsync<{ db: Db; io: IO }> = async (app, { db, io }) => {
  app.addHook("preHandler", requireUser);
  const { member, gm, activeSceneId, loadScene } = sceneAccess(db);

  /** Clients fetch again rather than being sent the data, so hidden tokens can't leak this way. */
  const announce = (campaignId: string) =>
    io.to(campaignRoom(campaignId)).emit("tokens:changed", { campaignId });

  const toToken = (
    row: TokenRow,
    ownerId: string | null,
    viewerId: string,
    isGm: boolean,
  ): Token => ({
    id: row.id,
    sceneId: row.sceneId,
    kind: row.kind,
    name: row.name,
    size: row.size,
    x: row.x,
    y: row.y,
    hidden: isGm && row.hidden,
    monsterId: row.monsterId,
    characterId: row.characterId,
    hpCurrent: isGm ? row.hpCurrent : null,
    hpMax: isGm ? row.hpMax : null,
    ac: isGm ? row.ac : null,
    canMove: isGm || ownerId === viewerId,
  });

  app.get("/campaigns/:id/scenes/:sceneId/tokens", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const params = sceneParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const scene = await loadScene(m.campaignId, params.data.sceneId);
    if (!scene) return reply.code(404).send({ error: "not found" });
    const isGm = m.role === "gm";
    if (!isGm && (await activeSceneId(m.campaignId)) !== scene.id)
      return reply.code(404).send({ error: "not found" });

    const rows = await db.orm
      .select({ token: tokens, ownerId: characters.ownerId })
      .from(tokens)
      .leftJoin(characters, eq(tokens.characterId, characters.id))
      .where(and(eq(tokens.sceneId, scene.id), ...(isGm ? [] : [eq(tokens.hidden, false)])))
      .orderBy(asc(tokens.createdAt), asc(tokens.name));
    return rows.map((r) => toToken(r.token, r.ownerId, req.user!.id, isGm));
  });

  app.post("/campaigns/:id/scenes/:sceneId/tokens", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const params = sceneParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const scene = await loadScene(m.campaignId, params.data.sceneId);
    if (!scene) return reply.code(404).send({ error: "not found" });
    const parsed = createTokenRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "data token belum lengkap" });
    const body = parsed.data;

    const existing = await db.orm.select().from(tokens).where(eq(tokens.sceneId, scene.id));

    let base: string;
    let size: TokenSize;
    let count = 1;
    let hpMax: number | null = null;
    let ac: number | null = null;
    let monsterId: string | null = null;
    let characterId: string | null = null;

    if (body.kind === "monster") {
      const monster = monsters.find((x) => x.id === body.monsterId);
      if (!monster) return reply.code(400).send({ error: "monster tidak dikenal" });
      base = monster.name;
      size = body.size ?? monster.size[0] ?? "medium";
      count = body.count;
      hpMax = monster.hp.average;
      monsterId = monster.id;
    } else if (body.kind === "character") {
      const [character] = await db.orm
        .select()
        .from(characters)
        .where(eq(characters.id, body.characterId));
      if (!character || character.campaignId !== m.campaignId)
        return reply.code(400).send({ error: "karakter itu tidak ada di campaign ini" });
      if (existing.some((t) => t.characterId === character.id))
        return reply.code(409).send({ error: "karakter itu sudah ada di peta ini" });
      base = character.name || "Tanpa nama";
      size = body.size;
      characterId = character.id;
    } else {
      base = body.name;
      size = body.size;
      count = body.count;
      hpMax = body.hpMax ?? null;
      ac = body.ac ?? null;
    }

    const taken = new Set<string>();
    for (const t of existing) occupy(taken, t.size, t.x, t.y);
    const names =
      body.kind === "character"
        ? [base]
        : nextNames(
            base,
            count,
            existing.map((t) => t.name),
          );
    const values = names.map((name) => {
      const at = findFreeCell(scene, size, taken);
      occupy(taken, size, at.x, at.y);
      return {
        sceneId: scene.id,
        kind: body.kind,
        name: name.slice(0, 60),
        size,
        ...at,
        hidden: body.hidden,
        monsterId,
        characterId,
        hpCurrent: hpMax,
        hpMax,
        ac,
      };
    });
    const rows = await db.orm.insert(tokens).values(values).returning();
    announce(m.campaignId);
    return reply.code(201).send(rows.map((r) => toToken(r, null, req.user!.id, true)));
  });

  app.patch("/campaigns/:id/scenes/:sceneId/tokens/:tokenId", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const params = tokenParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const scene = await loadScene(m.campaignId, params.data.sceneId);
    if (!scene) return reply.code(404).send({ error: "not found" });
    const parsed = updateTokenRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "data token tidak valid" });
    const inScene = and(eq(tokens.id, params.data.tokenId), eq(tokens.sceneId, scene.id));
    const [row] = await db.orm.select().from(tokens).where(inScene);
    if (!row) return reply.code(404).send({ error: "not found" });

    const size = parsed.data.size ?? row.size;
    const hpMax = parsed.data.hpMax !== undefined ? parsed.data.hpMax : row.hpMax;
    const wanted = parsed.data.hpCurrent !== undefined ? parsed.data.hpCurrent : row.hpCurrent;
    // Current HP only means something against a maximum, and can't exceed it.
    const hpCurrent = hpMax === null ? null : Math.min(wanted ?? hpMax, hpMax);
    const [updated] = await db.orm
      .update(tokens)
      .set({ ...parsed.data, size, hpMax, hpCurrent, ...clampToMap(scene, size, row.x, row.y) })
      .where(inScene)
      .returning();
    announce(m.campaignId);
    return toToken(updated!, null, req.user!.id, true);
  });

  app.delete("/campaigns/:id/scenes/:sceneId/tokens/:tokenId", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const params = tokenParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const scene = await loadScene(m.campaignId, params.data.sceneId);
    if (!scene) return reply.code(404).send({ error: "not found" });
    const { deleted, inFight } = await db.orm.transaction(async (tx) => {
      const inFight = await removeFromEncounter(tx, params.data.tokenId);
      const [deleted] = await tx
        .delete(tokens)
        .where(and(eq(tokens.id, params.data.tokenId), eq(tokens.sceneId, scene.id)))
        .returning({ id: tokens.id });
      return { deleted, inFight };
    });
    if (!deleted) return reply.code(404).send({ error: "not found" });
    announce(m.campaignId);
    if (inFight)
      io.to(campaignRoom(m.campaignId)).emit("encounter:changed", { campaignId: m.campaignId });
    return { ok: true };
  });
};
