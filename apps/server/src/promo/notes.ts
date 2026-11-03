import {
  createNoteRequest,
  updateNoteRequest,
  type CampaignNote,
  type NotesResponse,
} from "@dnd/contracts";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db";
import { campaignNotes, users } from "../db/schema";
import { worldForEra } from "./world";

// Shared notes between the DM and co-DMs. Every route here is DM-only, so this is also the one
// place the hidden island may be named: the public world data leaves it out on purpose.

const NOTE_ISLANDS = [
  ...worldForEra("emas").islands.map(({ id, name }) => ({ id, name })),
  { id: "puing", name: "Puing Retakan" },
];
const isNoteIsland = (id: string) => NOTE_ISLANDS.some((island) => island.id === id);

const idParams = z.object({ id: z.uuid() });

type RequireGm = (req: FastifyRequest, reply: FastifyReply) => Promise<{ id: string } | null>;

export function registerNoteRoutes(app: FastifyInstance, db: Db, requireGm: RequireGm) {
  const author = alias(users, "author");
  const editor = alias(users, "editor");

  /** Notes with the names of who wrote and last changed them. */
  const selectNotes = () =>
    db.orm
      .select({
        note: campaignNotes,
        authorName: author.displayName,
        updatedByName: editor.displayName,
      })
      .from(campaignNotes)
      .leftJoin(author, eq(campaignNotes.authorId, author.id))
      .leftJoin(editor, eq(campaignNotes.updatedById, editor.id));

  type Row = Awaited<ReturnType<ReturnType<typeof selectNotes>["execute"]>>[number];

  const toNote = ({ note, authorName, updatedByName }: Row): CampaignNote => ({
    id: note.id,
    islandId: note.islandId,
    sessionNumber: note.sessionNumber,
    title: note.title,
    body: note.body,
    authorName,
    updatedByName,
    version: note.version,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  });

  const loadNote = async (id: string) => {
    const [row] = await selectNotes().where(eq(campaignNotes.id, id));
    return row ? toNote(row) : null;
  };

  app.get("/dm/notes", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const rows = await selectNotes()
      .where(eq(campaignNotes.campaignId, campaign.id))
      .orderBy(desc(campaignNotes.sessionNumber), asc(campaignNotes.createdAt));
    return { islands: NOTE_ISLANDS, notes: rows.map(toNote) } satisfies NotesResponse;
  });

  app.post("/dm/notes", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const parsed = createNoteRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "catatan belum lengkap" });
    if (!isNoteIsland(parsed.data.islandId))
      return reply.code(400).send({ error: "pulau tidak dikenal" });
    const [row] = await db.orm
      .insert(campaignNotes)
      .values({
        ...parsed.data,
        campaignId: campaign.id,
        authorId: req.user!.id,
        updatedById: req.user!.id,
      })
      .returning({ id: campaignNotes.id });
    return reply.code(201).send(await loadNote(row!.id));
  });

  /** Refuses to overwrite a change the writer hasn't seen; several DMs share these notes. */
  app.patch("/dm/notes/:id", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const parsed = updateNoteRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "catatan belum lengkap" });
    const { version, ...changes } = parsed.data;

    const inThisCampaign = and(
      eq(campaignNotes.id, params.data.id),
      eq(campaignNotes.campaignId, campaign.id),
    );
    const [updated] = await db.orm
      .update(campaignNotes)
      .set({
        ...changes,
        updatedById: req.user!.id,
        updatedAt: sql`now()`,
        version: sql`${campaignNotes.version} + 1`,
      })
      .where(and(inThisCampaign, eq(campaignNotes.version, version)))
      .returning({ id: campaignNotes.id });
    if (updated) return loadNote(updated.id);

    const [exists] = await db.orm
      .select({ id: campaignNotes.id })
      .from(campaignNotes)
      .where(inThisCampaign);
    if (!exists) return reply.code(404).send({ error: "catatan sudah dihapus" });
    return reply.code(409).send({
      error: "catatan ini baru saja diubah DM lain, salin tulisanmu lalu muat ulang halaman",
    });
  });

  app.delete("/dm/notes/:id", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const [deleted] = await db.orm
      .delete(campaignNotes)
      .where(and(eq(campaignNotes.id, params.data.id), eq(campaignNotes.campaignId, campaign.id)))
      .returning({ id: campaignNotes.id });
    if (!deleted) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });
}
