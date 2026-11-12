import {
  acceptCoDmRequest,
  campaignSettings,
  inviteCoDmRequest,
  MAX_SHEET_BYTES,
  mapEra,
  registrationFields,
  reviewRegistrationRequest,
  setEraRequest,
  setRegistrationOpenRequest,
  type CampaignSettings,
  type CoDmInvite,
  type DmResponse,
  type InviteCoDmResponse,
  type MapEra,
  type MyRegistrationResponse,
  type PromoResponse,
  type Registration,
} from "@dnd/contracts";
import multipart from "@fastify/multipart";
import { validateBuild } from "@dnd/character";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { memberRole } from "../campaigns/membership";
import { buildColumns, replaceLevels } from "../characters/repo";
import type { Config } from "../config";
import type { Db } from "../db";
import {
  campaignMembers,
  campaignRegistrations,
  campaigns,
  characters,
  coDmInvites,
  users,
} from "../db/schema";
import { MAP_FILE, mapKey, sheetKey, type Storage } from "../storage";
import { registerNoteRoutes } from "./notes";
import { buildFromSheet, readSheetFields, streamToBuffer } from "./sheet";
import { canStartOn, worldForEra } from "./world";

export type PromoConfig = Pick<Config, "PROMO_CAMPAIGN_ID" | "PUBLIC_URL">;

type RegistrationRow = typeof campaignRegistrations.$inferSelect;

const STORAGE_DOWN = { error: "penyimpanan file sedang bermasalah, coba lagi nanti" };
const INVITE_INVALID = { error: "undangan ini tidak berlaku lagi, minta undangan baru ke DM" };

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;

const idParams = z.object({ id: z.uuid() });
const userIdParams = z.object({ userId: z.uuid() });

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const toInvite = (row: typeof coDmInvites.$inferSelect): CoDmInvite => ({
  id: row.id,
  email: row.email,
  expiresAt: row.expiresAt.toISOString(),
});

/** Decides the type from the file's first bytes; the browser's claim isn't trusted. */
function sniffSheet(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-")
    return { mime: "application/pdf", ext: "pdf" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return { mime: "image/jpeg", ext: "jpg" };
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return { mime: "image/webp", ext: "webp" };
  return null;
}

function toRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    playerName: row.playerName,
    characterName: row.characterName,
    startIsland: row.startIsland,
    sheetName: row.sheetName,
    sheetBytes: row.sheetBytes,
    characterId: row.characterId ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const promoRoutes: FastifyPluginAsync<{
  db: Db;
  config: PromoConfig;
  storage: Storage | null;
}> = async (app, { db, config, storage }) => {
  await app.register(multipart, {
    limits: { fileSize: MAX_SHEET_BYTES, files: 1, fields: 5, fieldSize: 1024 },
  });

  const loadCampaign = async () => {
    if (!config.PROMO_CAMPAIGN_ID) return null;
    const [row] = await db.orm
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, config.PROMO_CAMPAIGN_ID));
    return row ?? null;
  };
  type CampaignRow = NonNullable<Awaited<ReturnType<typeof loadCampaign>>>;

  const activeEra = (campaign: CampaignRow | null): MapEra =>
    campaignSettings.parse(campaign?.settings ?? {}).mapEra;

  const isGm = async (campaign: CampaignRow | null, req: FastifyRequest) =>
    Boolean(campaign && req.user) &&
    (await memberRole(db.orm, campaign!.id, req.user!.id)) === "gm";

  /** The promo campaign if the requester is its GM; otherwise answers 401/403 and returns null. */
  const requireGm = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      reply.code(401).send({ error: "login required" });
      return null;
    }
    const campaign = await loadCampaign();
    if (!(await isGm(campaign, req))) {
      reply.code(403).send({ error: "khusus DM campaign ini" });
      return null;
    }
    return campaign;
  };

  registerNoteRoutes(app, db, requireGm);

  /** Like requireGm, for what only the owner may do: deciding who else runs the campaign. */
  const requireOwner = async (req: FastifyRequest, reply: FastifyReply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return null;
    if (campaign.ownerId !== req.user!.id) {
      reply.code(403).send({ error: "khusus pemilik campaign" });
      return null;
    }
    return campaign;
  };

  const settingsOf = (campaign: CampaignRow | null) =>
    campaignSettings.parse(campaign?.settings ?? {});

  const canRegister = (campaign: CampaignRow | null) =>
    Boolean(campaign && storage) && settingsOf(campaign).registrationOpen;

  /** Changes only the given settings, so a concurrent change to another one isn't lost. */
  const updateSettings = (campaign: CampaignRow, patch: Partial<CampaignSettings>) =>
    db.orm
      .update(campaigns)
      .set({ settings: sql`${campaigns.settings} || ${JSON.stringify(patch)}::jsonb` })
      .where(eq(campaigns.id, campaign.id));

  /** Cleaning up an old file isn't worth failing the request over. */
  const removeSheet = async (name: string) => {
    try {
      await storage?.remove(sheetKey(name));
    } catch (err) {
      app.log.warn({ err, name }, "could not delete character sheet");
    }
  };

  /** Sends a stored file back, or 404 when it's gone and 503 when storage can't be reached. */
  const sendObject = async (req: FastifyRequest, reply: FastifyReply, key: string) => {
    if (!storage) return null;
    try {
      return await storage.get(key);
    } catch (err) {
      req.log.error({ err, key }, "storage read failed");
      reply.code(503).send(STORAGE_DOWN);
      return undefined;
    }
  };

  const STEP_ORDER = ["class", "origin", "abilities", "alignment", "details"] as const;

  /**
   * Turns the sheet a player uploaded into a draft in the campaign. Best-effort: a sheet that
   * can't be read still gives an empty draft, and a failure here never rejects the sign-up.
   */
  const importCharacter = async (
    registration: RegistrationRow,
    campaign: CampaignRow,
  ): Promise<string | null> => {
    if (!storage) return null;
    const [existing] = await db.orm
      .select({ id: characters.id })
      .from(characters)
      .where(
        and(eq(characters.ownerId, registration.userId), eq(characters.campaignId, campaign.id)),
      )
      .limit(1);
    if (existing) return null;

    let fields: Record<string, string> = {};
    if (registration.sheetMime === "application/pdf") {
      try {
        const file = await storage.get(sheetKey(registration.sheetKey));
        if (file) fields = await readSheetFields(await streamToBuffer(file));
      } catch (err) {
        app.log.warn({ err, registrationId: registration.id }, "could not read character sheet");
      }
    }

    const build = buildFromSheet(fields, registration.characterName);
    const firstIssue = validateBuild(build)[0];
    const builderStep = firstIssue ? STEP_ORDER.indexOf(firstIssue.step) : STEP_ORDER.length;
    try {
      return await db.orm.transaction(async (tx) => {
        const [row] = await tx
          .insert(characters)
          .values({
            ownerId: registration.userId,
            campaignId: campaign.id,
            ...buildColumns(build),
            builderStep,
          })
          .returning({ id: characters.id });
        await replaceLevels(tx, row!.id, build);
        return row!.id;
      });
    } catch (err) {
      app.log.warn({ err, registrationId: registration.id }, "could not create character");
      return null;
    }
  };

  // ── Public ───────────────────────────────────────────────────────────────────────

  app.get("/", async (req): Promise<PromoResponse> => {
    const campaign = await loadCampaign();
    return {
      ...worldForEra(activeEra(campaign)),
      registrationOpen: canRegister(campaign),
      viewerIsGm: await isGm(campaign, req),
    };
  });

  // Later eras stay private until the DM switches them on; the DM can always preview them.
  app.get<{ Params: { file: string } }>("/map/:file", async (req, reply) => {
    const match = MAP_FILE.exec(req.params.file);
    if (!match) return reply.code(404).send({ error: "not found" });
    const campaign = await loadCampaign();
    if (match[1] !== activeEra(campaign) && !(await isGm(campaign, req)))
      return reply.code(404).send({ error: "not found" });
    const image = await sendObject(req, reply, mapKey(req.params.file));
    if (image === undefined) return reply;
    if (!image) return reply.code(404).send({ error: "not found" });
    return reply.type("image/webp").header("cache-control", "private, max-age=300").send(image);
  });

  // ── Player's registration ────────────────────────────────────────────────────────

  app.get("/registration", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "login required" });
    if (!config.PROMO_CAMPAIGN_ID) return { registration: null } satisfies MyRegistrationResponse;
    const [row] = await db.orm
      .select()
      .from(campaignRegistrations)
      .where(
        and(
          eq(campaignRegistrations.campaignId, config.PROMO_CAMPAIGN_ID),
          eq(campaignRegistrations.userId, req.user.id),
        ),
      );
    return { registration: row ? toRegistration(row) : null } satisfies MyRegistrationResponse;
  });

  /** Create the registration, or update it while it hasn't been accepted. */
  app.post("/registration", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "login required" });
    const campaign = await loadCampaign();
    if (!campaign || !storage || !canRegister(campaign))
      return reply.code(409).send({ error: "pendaftaran sedang ditutup" });
    if (!req.isMultipart()) return reply.code(415).send({ error: "form harus multipart" });

    const fields: Record<string, string> = {};
    let sheet: { data: Buffer; filename: string } | undefined;
    try {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const data = await part.toBuffer();
          // A browser sends an empty, nameless file when the input was left blank.
          if (part.fieldname === "sheet" && (data.length > 0 || part.filename))
            sheet = { data, filename: part.filename };
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "file terlalu besar (maksimal 10 MB)" });
      throw err;
    }

    const parsed = registrationFields.safeParse(fields);
    if (!parsed.success) return reply.code(400).send({ error: "data form belum lengkap" });
    if (!canStartOn(activeEra(campaign), parsed.data.startIsland))
      return reply.code(400).send({ error: "pulau itu tidak bisa dipilih sebagai pulau awal" });

    const [existing] = await db.orm
      .select()
      .from(campaignRegistrations)
      .where(
        and(
          eq(campaignRegistrations.campaignId, campaign.id),
          eq(campaignRegistrations.userId, req.user.id),
        ),
      );
    if (existing?.status === "accepted")
      return reply.code(409).send({ error: "pendaftaranmu sudah diterima" });

    let file = existing && {
      sheetKey: existing.sheetKey,
      sheetName: existing.sheetName,
      sheetMime: existing.sheetMime,
      sheetBytes: existing.sheetBytes,
    };
    if (sheet) {
      const type = sniffSheet(sheet.data);
      if (!type)
        return reply.code(400).send({ error: "character sheet harus PDF, PNG, JPG, atau WebP" });
      const name = `${randomUUID()}.${type.ext}`;
      try {
        await storage.put(sheetKey(name), sheet.data, type.mime);
      } catch (err) {
        req.log.error({ err }, "storage write failed");
        return reply.code(503).send(STORAGE_DOWN);
      }
      file = {
        sheetKey: name,
        sheetName: sheet.filename.slice(0, 200) || `sheet.${type.ext}`,
        sheetMime: type.mime,
        sheetBytes: sheet.data.length,
      };
    }
    if (!file) return reply.code(400).send({ error: "character sheet wajib diunggah" });

    const values = { ...parsed.data, ...file, status: "pending" as const };
    const [row] = await db.orm
      .insert(campaignRegistrations)
      .values({ ...values, campaignId: campaign.id, userId: req.user.id })
      .onConflictDoUpdate({
        target: [campaignRegistrations.campaignId, campaignRegistrations.userId],
        set: { ...values, updatedAt: sql`now()` },
        // The DM may have accepted it since the check above.
        where: ne(campaignRegistrations.status, "accepted"),
      })
      .returning();
    if (!row) {
      if (sheet) await removeSheet(file.sheetKey);
      return reply.code(409).send({ error: "pendaftaranmu sudah diterima" });
    }
    if (existing && existing.sheetKey !== row.sheetKey) await removeSheet(existing.sheetKey);
    return reply.code(existing ? 200 : 201).send(toRegistration(row));
  });

  /** Only the player who uploaded it and the DM can open a character sheet. */
  app.get("/registrations/:id/sheet", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "login required" });
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const [row] = await db.orm
      .select()
      .from(campaignRegistrations)
      .where(eq(campaignRegistrations.id, params.data.id));
    if (!row) return reply.code(404).send({ error: "not found" });
    const allowed =
      row.userId === req.user.id ||
      (await memberRole(db.orm, row.campaignId, req.user.id)) === "gm";
    if (!allowed) return reply.code(404).send({ error: "not found" });

    const file = await sendObject(req, reply, sheetKey(row.sheetKey));
    if (file === undefined) return reply;
    if (!file) return reply.code(404).send({ error: "file tidak ditemukan" });
    return reply
      .type(row.sheetMime)
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", `attachment; filename="${row.sheetKey}"`)
      .send(file);
  });

  // ── DM page ──────────────────────────────────────────────────────────────────────

  app.get("/dm", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const rows = await db.orm
      .select({ row: campaignRegistrations, accountName: users.displayName, email: users.email })
      .from(campaignRegistrations)
      .innerJoin(users, eq(campaignRegistrations.userId, users.id))
      .where(eq(campaignRegistrations.campaignId, campaign.id))
      .orderBy(desc(campaignRegistrations.createdAt));
    const dms = await db.orm
      .select({ userId: users.id, displayName: users.displayName, email: users.email })
      .from(campaignMembers)
      .innerJoin(users, eq(campaignMembers.userId, users.id))
      .where(and(eq(campaignMembers.campaignId, campaign.id), eq(campaignMembers.role, "gm")))
      .orderBy(asc(campaignMembers.joinedAt));
    const invites = await db.orm
      .select()
      .from(coDmInvites)
      .where(
        and(
          eq(coDmInvites.campaignId, campaign.id),
          isNull(coDmInvites.acceptedAt),
          gt(coDmInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(coDmInvites.createdAt));
    const era = activeEra(campaign);
    const { islands } = worldForEra(era);
    return {
      era,
      registrationOpen: settingsOf(campaign).registrationOpen,
      viewerIsOwner: campaign.ownerId === req.user!.id,
      dms: dms.map((dm) => ({ ...dm, isOwner: dm.userId === campaign.ownerId })),
      invites: invites.map(toInvite),
      registrations: rows.map((r) => {
        const island = islands.find((i) => i.id === r.row.startIsland);
        return {
          ...toRegistration(r.row),
          accountName: r.accountName,
          email: r.email,
          islandName: island?.name ?? r.row.startIsland,
          factionName: island?.faction ?? "",
        };
      }),
    } satisfies DmResponse;
  });

  // ── Co-DMs ───────────────────────────────────────────────────────────────────────
  // A co-DM is a member with the gm role: same powers as the owner, except for this section.

  /** A new invite for the same address replaces the old one, so only the latest link works. */
  app.post("/dm/co-dms/invites", async (req, reply) => {
    const campaign = await requireOwner(req, reply);
    if (!campaign) return reply;
    const parsed = inviteCoDmRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "alamat email tidak valid" });
    const { email } = parsed.data;

    const [alreadyDm] = await db.orm
      .select({ userId: users.id })
      .from(campaignMembers)
      .innerJoin(users, eq(campaignMembers.userId, users.id))
      .where(
        and(
          eq(campaignMembers.campaignId, campaign.id),
          eq(campaignMembers.role, "gm"),
          eq(users.email, email),
        ),
      );
    if (alreadyDm) return reply.code(409).send({ error: "akun itu sudah menjadi DM" });

    const token = randomBytes(32).toString("base64url");
    const invite = await db.orm.transaction(async (tx) => {
      await tx
        .delete(coDmInvites)
        .where(
          and(
            eq(coDmInvites.campaignId, campaign.id),
            eq(coDmInvites.email, email),
            isNull(coDmInvites.acceptedAt),
          ),
        );
      const [row] = await tx
        .insert(coDmInvites)
        .values({
          campaignId: campaign.id,
          email,
          tokenHash: hashToken(token),
          invitedBy: req.user!.id,
          expiresAt: new Date(Date.now() + INVITE_TTL),
        })
        .returning();
      return row!;
    });
    // In the fragment, which browsers don't send: the token stays out of server and proxy logs.
    const link = new URL(`/undang-dm#${token}`, config.PUBLIC_URL).toString();
    return reply.code(201).send({ invite: toInvite(invite), link } satisfies InviteCoDmResponse);
  });

  app.delete("/dm/co-dms/invites/:id", async (req, reply) => {
    const campaign = await requireOwner(req, reply);
    if (!campaign) return reply;
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const [deleted] = await db.orm
      .delete(coDmInvites)
      .where(
        and(
          eq(coDmInvites.id, params.data.id),
          eq(coDmInvites.campaignId, campaign.id),
          isNull(coDmInvites.acceptedAt),
        ),
      )
      .returning({ id: coDmInvites.id });
    if (!deleted) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });

  /** Back to being a player if they signed up and were accepted; otherwise out of the campaign. */
  app.delete("/dm/co-dms/:userId", async (req, reply) => {
    const campaign = await requireOwner(req, reply);
    if (!campaign) return reply;
    const params = userIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const { userId } = params.data;
    if (userId === campaign.ownerId)
      return reply.code(400).send({ error: "pemilik campaign tidak bisa dicabut" });

    const removed = await db.orm.transaction(async (tx) => {
      const isThisCoDm = and(
        eq(campaignMembers.campaignId, campaign.id),
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.role, "gm"),
      );
      const [accepted] = await tx
        .select({ id: campaignRegistrations.id })
        .from(campaignRegistrations)
        .where(
          and(
            eq(campaignRegistrations.campaignId, campaign.id),
            eq(campaignRegistrations.userId, userId),
            eq(campaignRegistrations.status, "accepted"),
          ),
        );
      const rows = accepted
        ? await tx
            .update(campaignMembers)
            .set({ role: "player" })
            .where(isThisCoDm)
            .returning({ userId: campaignMembers.userId })
        : await tx
            .delete(campaignMembers)
            .where(isThisCoDm)
            .returning({ userId: campaignMembers.userId });
      return rows.length > 0;
    });
    if (!removed) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });

  app.post("/co-dm/accept", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "login required" });
    const parsed = acceptCoDmRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(410).send(INVITE_INVALID);

    const [invite] = await db.orm
      .select()
      .from(coDmInvites)
      .where(eq(coDmInvites.tokenHash, hashToken(parsed.data.token)));
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date())
      return reply.code(410).send(INVITE_INVALID);
    if (invite.email !== req.user.email.toLowerCase())
      return reply.code(403).send({ error: "undangan ini untuk akun Google yang lain" });

    const accepted = await db.orm.transaction(async (tx) => {
      // Guards against the same link being used twice at once.
      const [used] = await tx
        .update(coDmInvites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(coDmInvites.id, invite.id), isNull(coDmInvites.acceptedAt)))
        .returning({ id: coDmInvites.id });
      if (!used) return false;
      await tx
        .insert(campaignMembers)
        .values({ campaignId: invite.campaignId, userId: req.user!.id, role: "gm" })
        .onConflictDoUpdate({
          target: [campaignMembers.campaignId, campaignMembers.userId],
          set: { role: "gm" },
        });
      return true;
    });
    if (!accepted) return reply.code(410).send(INVITE_INVALID);
    return { ok: true };
  });

  /** Lets the DM look at an era before showing it to everyone. */
  app.get("/dm/preview/:era", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const era = mapEra.safeParse((req.params as { era: string }).era);
    if (!era.success) return reply.code(404).send({ error: "not found" });
    return {
      ...worldForEra(era.data),
      registrationOpen: canRegister(campaign),
      viewerIsGm: true,
    } satisfies PromoResponse;
  });

  app.put("/dm/era", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const parsed = setEraRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "era tidak dikenal" });
    await updateSettings(campaign, { mapEra: parsed.data.era });
    return { era: parsed.data.era };
  });

  app.put("/dm/registration", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const parsed = setRegistrationOpenRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "nilai tidak dikenal" });
    await updateSettings(campaign, { registrationOpen: parsed.data.open });
    return { open: parsed.data.open };
  });

  /** Accepting makes the player a campaign member; rejecting takes that back. */
  app.patch("/dm/registrations/:id", async (req, reply) => {
    const campaign = await requireGm(req, reply);
    if (!campaign) return reply;
    const params = idParams.safeParse(req.params);
    const parsed = reviewRegistrationRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    if (!parsed.success) return reply.code(400).send({ error: "status tidak dikenal" });

    const row = await db.orm.transaction(async (tx) => {
      const [updated] = await tx
        .update(campaignRegistrations)
        .set({ status: parsed.data.status, updatedAt: sql`now()` })
        .where(
          and(
            eq(campaignRegistrations.id, params.data.id),
            eq(campaignRegistrations.campaignId, campaign.id),
          ),
        )
        .returning();
      if (!updated) return null;
      if (parsed.data.status === "accepted") {
        await tx
          .insert(campaignMembers)
          .values({ campaignId: campaign.id, userId: updated.userId, role: "player" })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(campaignMembers)
          .where(
            and(
              eq(campaignMembers.campaignId, campaign.id),
              eq(campaignMembers.userId, updated.userId),
              eq(campaignMembers.role, "player"),
            ),
          );
      }
      return updated;
    });
    if (!row) return reply.code(404).send({ error: "not found" });

    if (parsed.data.status === "rejected") {
      // The character stays the player's; it just leaves the campaign until they're accepted
      // again. Deleting it would throw away anything they'd already edited.
      if (row.characterId)
        await db.orm
          .update(characters)
          .set({ campaignId: null, updatedAt: new Date() })
          .where(
            and(
              eq(characters.id, row.characterId),
              eq(characters.ownerId, row.userId),
              eq(characters.campaignId, campaign.id),
            ),
          );
      return toRegistration(row);
    }

    if (row.characterId) {
      // Accepted again after a rejection: put the imported character back in the campaign.
      await db.orm
        .update(characters)
        .set({ campaignId: campaign.id, updatedAt: new Date() })
        .where(
          and(
            eq(characters.id, row.characterId),
            eq(characters.ownerId, row.userId),
            isNull(characters.campaignId),
          ),
        );
      return toRegistration(row);
    }

    const created = await importCharacter(row, campaign);
    if (!created) return toRegistration(row);
    const [linked] = await db.orm
      .update(campaignRegistrations)
      .set({ characterId: created })
      .where(eq(campaignRegistrations.id, row.id))
      .returning();
    return toRegistration(linked ?? row);
  });
};
