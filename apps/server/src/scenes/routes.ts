import {
  campaignRoom,
  MAX_MAP_BYTES,
  MAX_MAP_SIDE,
  MIN_GRID_PX,
  setActiveSceneRequest,
  updateSceneRequest,
  type Scene,
  type ScenesResponse,
} from "@dnd/contracts";
import multipart from "@fastify/multipart";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { imageSize } from "image-size";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "../auth/plugin";
import type { Db } from "../db";
import { campaigns, scenes } from "../db/schema";
import type { IO } from "../plugins/socket";
import { sceneKey, type Storage } from "../storage";
import { sceneAccess } from "./access";

// Vector formats stay out: an SVG can carry scripts.
const MAP_TYPES: Record<string, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  webp: { mime: "image/webp", ext: "webp" },
};
/** A starting guess until the DM sets the scale: a common size for exported battle maps. */
const DEFAULT_GRID_PX = 70;
const STORAGE_DOWN = { error: "penyimpanan file sedang bermasalah, coba lagi nanti" };

const sceneParams = z.object({ id: z.uuid(), sceneId: z.uuid() });

type SceneRow = typeof scenes.$inferSelect;

const toScene = (row: SceneRow): Scene => ({
  id: row.id,
  name: row.name,
  widthPx: row.widthPx,
  heightPx: row.heightPx,
  gridPx: row.gridPx,
  offsetX: row.offsetX,
  offsetY: row.offsetY,
  gridVisible: row.gridVisible,
  createdAt: row.createdAt.toISOString(),
});

/** The file's real type and size, read from its content rather than the browser's claim. */
function readMap(data: Buffer) {
  try {
    const { type, width, height } = imageSize(data);
    const known = type ? MAP_TYPES[type] : undefined;
    return known ? { ...known, width, height } : null;
  } catch {
    return null;
  }
}

export const sceneRoutes: FastifyPluginAsync<{
  db: Db;
  io: IO;
  storage: Storage | null;
}> = async (app, { db, io, storage }) => {
  app.addHook("preHandler", requireUser);
  await app.register(multipart, {
    limits: { fileSize: MAX_MAP_BYTES, files: 1, fields: 3, fieldSize: 1024 },
  });

  const { member, gm, activeSceneId, loadScene } = sceneAccess(db);

  /** Tells everyone at the table to fetch the map again. */
  const announce = (campaignId: string) =>
    io.to(campaignRoom(campaignId)).emit("scene:changed", { campaignId });

  app.get("/campaigns/:id/scenes", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const active = await activeSceneId(m.campaignId);
    if (m.role === "gm") {
      const rows = await db.orm
        .select()
        .from(scenes)
        .where(eq(scenes.campaignId, m.campaignId))
        .orderBy(desc(scenes.createdAt));
      return { activeSceneId: active, scenes: rows.map(toScene) } satisfies ScenesResponse;
    }
    const row = active ? await loadScene(m.campaignId, active) : null;
    return { activeSceneId: active, scenes: row ? [toScene(row)] : [] } satisfies ScenesResponse;
  });

  app.post("/campaigns/:id/scenes", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    if (!storage) return reply.code(503).send(STORAGE_DOWN);
    if (!req.isMultipart()) return reply.code(415).send({ error: "form harus multipart" });

    let name = "";
    let file: { data: Buffer; filename: string } | undefined;
    try {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const data = await part.toBuffer();
          if (part.fieldname === "map") file = { data, filename: part.filename };
        } else if (part.fieldname === "name") {
          name = String(part.value).trim();
        }
      }
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "file terlalu besar (maksimal 25 MB)" });
      throw err;
    }
    if (!file) return reply.code(400).send({ error: "file peta wajib diunggah" });

    const map = readMap(file.data);
    if (!map) return reply.code(400).send({ error: "peta harus berupa PNG, JPG, atau WebP" });
    if (map.width > MAX_MAP_SIDE || map.height > MAX_MAP_SIDE)
      return reply.code(400).send({ error: `sisi peta maksimal ${MAX_MAP_SIDE} piksel` });
    if (Math.min(map.width, map.height) < MIN_GRID_PX)
      return reply.code(400).send({ error: "gambar peta terlalu kecil" });

    const mapKey = `${randomUUID()}.${map.ext}`;
    try {
      await storage.put(sceneKey(mapKey), file.data, map.mime);
    } catch (err) {
      req.log.error({ err }, "storage write failed");
      return reply.code(503).send(STORAGE_DOWN);
    }
    const fromFile = file.filename.replace(/\.[^.]+$/, "");
    const [row] = await db.orm
      .insert(scenes)
      .values({
        campaignId: m.campaignId,
        name: (name || fromFile || "Peta baru").slice(0, 100),
        mapKey,
        mapMime: map.mime,
        widthPx: map.width,
        heightPx: map.height,
        gridPx: Math.min(DEFAULT_GRID_PX, map.width, map.height),
      })
      .returning();
    return reply.code(201).send(toScene(row!));
  });

  /** The name and the scale. */
  app.patch("/campaigns/:id/scenes/:sceneId", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const params = sceneParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const parsed = updateSceneRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "ukuran grid tidak valid" });
    const existing = await loadScene(m.campaignId, params.data.sceneId);
    if (!existing) return reply.code(404).send({ error: "not found" });
    if (parsed.data.gridPx > Math.min(existing.widthPx, existing.heightPx))
      return reply.code(400).send({ error: "kotak grid lebih besar dari petanya" });

    const [row] = await db.orm
      .update(scenes)
      .set(parsed.data)
      .where(eq(scenes.id, existing.id))
      .returning();
    if ((await activeSceneId(m.campaignId)) === existing.id) announce(m.campaignId);
    return toScene(row!);
  });

  /** Puts a map on the table for everyone, or takes it off with null. */
  app.put("/campaigns/:id/active-scene", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const parsed = setActiveSceneRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    const { sceneId } = parsed.data;
    if (sceneId && !(await loadScene(m.campaignId, sceneId)))
      return reply.code(404).send({ error: "not found" });
    await db.orm
      .update(campaigns)
      .set({ activeSceneId: sceneId })
      .where(eq(campaigns.id, m.campaignId));
    announce(m.campaignId);
    return { activeSceneId: sceneId };
  });

  app.delete("/campaigns/:id/scenes/:sceneId", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const params = sceneParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const wasActive = (await activeSceneId(m.campaignId)) === params.data.sceneId;
    const [deleted] = await db.orm
      .delete(scenes)
      .where(and(eq(scenes.id, params.data.sceneId), eq(scenes.campaignId, m.campaignId)))
      .returning();
    if (!deleted) return reply.code(404).send({ error: "not found" });
    try {
      await storage?.remove(sceneKey(deleted.mapKey));
    } catch (err) {
      req.log.warn({ err }, "could not delete map image");
    }
    if (wasActive) announce(m.campaignId);
    // A fight on this map went with it.
    io.to(campaignRoom(m.campaignId)).emit("encounter:changed", { campaignId: m.campaignId });
    return { ok: true };
  });

  /** A map the DM hasn't shown yet doesn't exist as far as players can tell. */
  app.get("/campaigns/:id/scenes/:sceneId/image", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const params = sceneParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const row = await loadScene(m.campaignId, params.data.sceneId);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (m.role !== "gm" && (await activeSceneId(m.campaignId)) !== row.id)
      return reply.code(404).send({ error: "not found" });
    if (!storage) return reply.code(503).send(STORAGE_DOWN);

    let image;
    try {
      image = await storage.get(sceneKey(row.mapKey));
    } catch (err) {
      req.log.error({ err }, "storage read failed");
      return reply.code(503).send(STORAGE_DOWN);
    }
    if (!image) return reply.code(404).send({ error: "not found" });
    return reply
      .type(row.mapMime)
      .header("cache-control", "private, max-age=3600")
      .header("x-content-type-options", "nosniff")
      .send(image);
  });
};
