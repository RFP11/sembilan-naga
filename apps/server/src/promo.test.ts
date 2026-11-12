import type {
  Campaign,
  CampaignNote,
  DmResponse,
  InviteCoDmResponse,
  NotesResponse,
  PromoResponse,
  Registration,
} from "@dnd/contracts";
import { eq, inArray } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { campaignMembers, campaignRegistrations, characters, coDmInvites } from "./db/schema";
import { SEED } from "./db/seed";
import { createTestApp, loginAs, TEST_CONFIG } from "./test/setup";

const { app, db, objects } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

const storedSheets = () => [...objects.keys()].filter((key) => key.startsWith("sheets/"));

describe("storage", () => {
  it("closes registrations while storage isn't configured", async () => {
    const closed = await buildApp({ config: TEST_CONFIG, db, storage: null });
    const promo = await closed.inject({ method: "GET", url: "/api/promo" });
    expect(promo.json<PromoResponse>().registrationOpen).toBe(false);
    const image = await closed.inject({ method: "GET", url: "/api/promo/map/emas-bg.webp" });
    expect(image.statusCode).toBe(404);
    await closed.close();
  });

  it("keeps one file per registration and doesn't store rejected uploads", async () => {
    const player = await loginAs(app, SEED.player2.id);
    expect((await register(player, FIELDS, Buffer.from("not a sheet"))).statusCode).toBe(400);
    expect(storedSheets()).toHaveLength(0);

    expect((await register(player)).statusCode).toBe(201);
    const [first] = storedSheets();
    expect(first).toBeDefined();
    expect((await register(player)).statusCode).toBe(200);
    expect(storedSheets()).toHaveLength(1);
    expect(storedSheets()[0]).not.toBe(first);

    // The registration flow below expects to be the only sign-up.
    await db.orm.delete(campaignRegistrations);
    objects.delete(storedSheets()[0]!);
  });
});

const PDF = Buffer.from("%PDF-1.7 fake sheet");
const BOUNDARY = "----serpihtest";

/** A multipart body by hand; `sheet: null` leaves the file out. */
function form(fields: Record<string, string>, sheet: Buffer | null = PDF) {
  const chunks: Buffer[] = Object.entries(fields).map(([name, value]) =>
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ),
  );
  if (sheet) {
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="sheet"; filename="sheet.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      sheet,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const FIELDS = { playerName: "Budi", characterName: "Kara", startIsland: "pasar" };

const register = (cookie: string, fields: Record<string, string> = FIELDS, sheet?: Buffer | null) =>
  app.inject({
    method: "POST",
    url: "/api/promo/registration",
    headers: { cookie, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: form(fields, sheet === undefined ? PDF : sheet),
  });

const setEra = (cookie: string, era: string) =>
  app.inject({ method: "PUT", url: "/api/promo/dm/era", headers: { cookie }, payload: { era } });

const getPromo = async (cookie?: string) =>
  (
    await app.inject({
      method: "GET",
      url: "/api/promo",
      ...(cookie && { headers: { cookie } }),
    })
  ).json<PromoResponse>();

describe("opening and closing registration", () => {
  const setOpen = (cookie: string, open: unknown) =>
    app.inject({
      method: "PUT",
      url: "/api/promo/dm/registration",
      headers: { cookie },
      payload: { open },
    });

  it("is limited to the campaign's GM", async () => {
    const player = await loginAs(app, SEED.player1.id);
    expect((await setOpen(player, false)).statusCode).toBe(403);
    expect((await getPromo()).registrationOpen).toBe(true);
  });

  it("stops sign-ups and edits, but not status, sheets, or the DM's review", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const registered = await loginAs(app, SEED.player2.id);
    const newcomer = await loginAs(app, SEED.player1.id);
    const reg = (await register(registered)).json<Registration>();

    expect((await setOpen(gm, "nope")).statusCode).toBe(400);
    expect((await setOpen(gm, false)).statusCode).toBe(200);
    expect((await getPromo()).registrationOpen).toBe(false);
    const dm = await app.inject({ method: "GET", url: "/api/promo/dm", headers: { cookie: gm } });
    expect(dm.json<DmResponse>().registrationOpen).toBe(false);

    expect((await register(newcomer)).statusCode).toBe(409);
    expect((await register(registered)).statusCode).toBe(409);

    const mine = await app.inject({
      method: "GET",
      url: "/api/promo/registration",
      headers: { cookie: registered },
    });
    expect(mine.json()).toMatchObject({ registration: { id: reg.id, status: "pending" } });
    const sheet = await app.inject({
      method: "GET",
      url: `/api/promo/registrations/${reg.id}/sheet`,
      headers: { cookie: registered },
    });
    expect(sheet.statusCode).toBe(200);
    const review = await app.inject({
      method: "PATCH",
      url: `/api/promo/dm/registrations/${reg.id}`,
      headers: { cookie: gm },
      payload: { status: "rejected" },
    });
    expect(review.statusCode).toBe(200);

    // Other settings survive, and opening again lets people in.
    await setEra(gm, "pertanda");
    expect((await getPromo()).era).toBe("pertanda");
    expect((await getPromo()).registrationOpen).toBe(false);
    await setEra(gm, "emas");
    expect((await setOpen(gm, true)).statusCode).toBe(200);
    expect((await getPromo()).registrationOpen).toBe(true);
    expect((await register(registered)).statusCode).toBe(200);

    // The registration flow below expects to be the only sign-up.
    await db.orm.delete(campaignRegistrations);
    for (const key of storedSheets()) objects.delete(key);
  });
});

describe("public page", () => {
  it("is open to anonymous visitors and shows Era Emas by default", async () => {
    const promo = await getPromo();
    expect(promo).toMatchObject({ era: "emas", registrationOpen: true, viewerIsGm: false });
    expect(promo.islands.filter((i) => i.start).map((i) => i.id)).toEqual([
      "pasar",
      "karang",
      "rimba",
      "badai",
    ]);
  });

  it("never sends other eras, DM secrets, or hidden places", async () => {
    const res = await app.inject({ method: "GET", url: "/api/promo" });
    for (const secret of [
      "Sang Tempaan",
      "Sang Penjaga",
      "Mata Angin",
      "Puing Retakan",
      "Tarrasque",
      "Era Pertanda",
      "Era Senja",
      "Sudah hilang",
    ]) {
      expect(res.body).not.toContain(secret);
    }
  });

  it("serves only the active era's map images to the public", async () => {
    const get = (file: string, cookie?: string) =>
      app.inject({
        method: "GET",
        url: `/api/promo/map/${file}`,
        ...(cookie && { headers: { cookie } }),
      });
    const active = await get("emas-bg.webp");
    expect(active.statusCode).toBe(200);
    expect(active.headers["content-type"]).toBe("image/webp");
    expect((await get("senja-bg.webp")).statusCode).toBe(404);
    expect((await get("emas-puing.webp")).statusCode).toBe(404);
    expect((await get("..%2F..%2Fpackage.json")).statusCode).toBe(404);

    const player = await loginAs(app, SEED.player1.id);
    expect((await get("senja-bg.webp", player)).statusCode).toBe(404);
    const gm = await loginAs(app, SEED.gm.id);
    expect((await get("senja-bg.webp", gm)).statusCode).toBe(200);
  });
});

describe("DM era setting", () => {
  it("is limited to the campaign's GM", async () => {
    expect((await app.inject({ method: "GET", url: "/api/promo/dm" })).statusCode).toBe(401);
    const player = await loginAs(app, SEED.player1.id);
    expect((await setEra(player, "senja")).statusCode).toBe(403);
    expect((await getPromo()).era).toBe("emas");
    const preview = await app.inject({
      method: "GET",
      url: "/api/promo/dm/preview/senja",
      headers: { cookie: player },
    });
    expect(preview.statusCode).toBe(403);
  });

  it("switches what the public sees, without losing other settings", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const preview = await app.inject({
      method: "GET",
      url: "/api/promo/dm/preview/senja",
      headers: { cookie: gm },
    });
    expect(preview.json<PromoResponse>().era).toBe("senja");
    expect((await getPromo()).era).toBe("emas");

    expect((await setEra(gm, "nope")).statusCode).toBe(400);
    expect((await setEra(gm, "senja")).statusCode).toBe(200);
    const promo = await getPromo();
    expect(promo.era).toBe("senja");
    expect(promo.islands.find((i) => i.id === "badai")).toMatchObject({ gone: true, start: false });
    const image = await app.inject({ method: "GET", url: "/api/promo/map/senja-bg.webp" });
    expect(image.statusCode).toBe(200);

    const campaigns = await app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: { cookie: gm },
    });
    const campaign = campaigns.json<Campaign[]>().find((c) => c.id === SEED.promoCampaign.id);
    expect(campaign?.settings).toMatchObject({ mapEra: "senja", allowMulticlass: true });

    // Gugus Badai has fallen by now, so nobody can start there.
    const player = await loginAs(app, SEED.player2.id);
    const res = await register(player, { ...FIELDS, startIsland: "badai" });
    expect(res.statusCode).toBe(400);

    await setEra(gm, "emas");
  });
});

describe("registration", () => {
  it("requires login", async () => {
    const res = await app.inject({ method: "GET", url: "/api/promo/registration" });
    expect(res.statusCode).toBe(401);
    expect((await register("session=nope")).statusCode).toBe(401);
  });

  it("rejects bad input", async () => {
    const player = await loginAs(app, SEED.player1.id);
    expect((await register(player, { ...FIELDS, characterName: "  " })).statusCode).toBe(400);
    expect((await register(player, { ...FIELDS, startIsland: "solmara" })).statusCode).toBe(400);
    expect((await register(player, FIELDS, null)).statusCode).toBe(400);
    // A .pdf name doesn't make it a PDF.
    const fake = await register(player, FIELDS, Buffer.from("<script>alert(1)</script>"));
    expect(fake.statusCode).toBe(400);
    const big = await register(player, FIELDS, Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(big.statusCode).toBe(413);
  });

  it("runs from registering to accepted, with the sheet kept private", async () => {
    const player = await loginAs(app, SEED.player1.id);
    const other = await loginAs(app, SEED.player2.id);
    const gm = await loginAs(app, SEED.gm.id);

    const created = await register(player);
    expect(created.statusCode).toBe(201);
    const reg = created.json<Registration>();
    expect(reg).toMatchObject({ characterName: "Kara", status: "pending", sheetName: "sheet.pdf" });

    // Updating keeps the sheet when no new file is sent.
    const updated = await register(player, { ...FIELDS, characterName: "Kara Baru" }, null);
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Registration>()).toMatchObject({
      id: reg.id,
      characterName: "Kara Baru",
      sheetName: "sheet.pdf",
    });

    const sheet = (cookie: string) =>
      app.inject({
        method: "GET",
        url: `/api/promo/registrations/${reg.id}/sheet`,
        headers: { cookie },
      });
    const own = await sheet(player);
    expect(own.statusCode).toBe(200);
    expect(own.rawPayload.equals(PDF)).toBe(true);
    expect(own.headers["content-disposition"]).toContain("attachment");
    expect((await sheet(gm)).statusCode).toBe(200);
    expect((await sheet(other)).statusCode).toBe(404);

    const review = (cookie: string, status: string) =>
      app.inject({
        method: "PATCH",
        url: `/api/promo/dm/registrations/${reg.id}`,
        headers: { cookie },
        payload: { status },
      });
    expect((await review(player, "accepted")).statusCode).toBe(403);

    const inCampaign = async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/campaigns",
        headers: { cookie: player },
      });
      return res.json<Campaign[]>().some((c) => c.id === SEED.promoCampaign.id);
    };
    expect(await inCampaign()).toBe(false);
    expect((await review(gm, "accepted")).json<Registration>().status).toBe("accepted");
    expect(await inCampaign()).toBe(true);

    expect((await register(player)).statusCode).toBe(409);

    const dm = await app.inject({ method: "GET", url: "/api/promo/dm", headers: { cookie: gm } });
    expect(dm.json<DmResponse>().registrations).toEqual([
      expect.objectContaining({ id: reg.id, email: SEED.player1.email, status: "accepted" }),
    ]);

    expect((await review(gm, "rejected")).json<Registration>().status).toBe("rejected");
    expect(await inCampaign()).toBe(false);
  });
});

describe("co-DMs", () => {
  const invite = (cookie: string, email: string) =>
    app.inject({
      method: "POST",
      url: "/api/promo/dm/co-dms/invites",
      headers: { cookie },
      payload: { email },
    });
  const accept = (cookie: string, token: string) =>
    app.inject({
      method: "POST",
      url: "/api/promo/co-dm/accept",
      headers: { cookie },
      payload: { token },
    });
  const removeDm = (cookie: string, userId: string) =>
    app.inject({ method: "DELETE", url: `/api/promo/dm/co-dms/${userId}`, headers: { cookie } });
  const getDm = (cookie: string) =>
    app.inject({ method: "GET", url: "/api/promo/dm", headers: { cookie } });
  const tokenOf = (res: { json: <T>() => T }) => {
    const { link } = res.json<InviteCoDmResponse>();
    expect(link.startsWith(`${TEST_CONFIG.PUBLIC_URL}/undang-dm#`)).toBe(true);
    return link.split("#")[1]!;
  };

  it("limits inviting to the owner and validates the address", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/promo/dm/co-dms/invites",
      payload: { email: SEED.player1.email },
    });
    expect(res.statusCode).toBe(401);
    const player = await loginAs(app, SEED.player1.id);
    expect((await invite(player, SEED.player2.email)).statusCode).toBe(403);
    const gm = await loginAs(app, SEED.gm.id);
    expect((await invite(gm, "not-an-email")).statusCode).toBe(400);
    expect((await invite(gm, SEED.gm.email)).statusCode).toBe(409);
  });

  it("works once, only for the invited account, and gives DM powers but not the owner's", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const invited = await loginAs(app, SEED.player2.id);
    const stranger = await loginAs(app, SEED.player1.id);

    const created = await invite(gm, `  ${SEED.player2.email.toUpperCase()} `);
    expect(created.statusCode).toBe(201);
    const token = tokenOf(created);

    // The database holds only a hash of the token.
    const stored = await db.orm.select().from(coDmInvites);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toContain(token);
    expect(stored[0]!.email).toBe(SEED.player2.email);

    expect((await getDm(invited)).statusCode).toBe(403);
    const anon = await app.inject({
      method: "POST",
      url: "/api/promo/co-dm/accept",
      payload: { token },
    });
    expect(anon.statusCode).toBe(401);
    expect((await accept(stranger, token)).statusCode).toBe(403);
    expect((await getDm(stranger)).statusCode).toBe(403);
    expect((await accept(invited, "x".repeat(43))).statusCode).toBe(410);

    expect((await accept(invited, token)).statusCode).toBe(200);
    expect((await accept(invited, token)).statusCode).toBe(410);

    const asCoDm = await getDm(invited);
    expect(asCoDm.statusCode).toBe(200);
    const view = asCoDm.json<DmResponse>();
    expect(view.viewerIsOwner).toBe(false);
    expect(view.invites).toEqual([]);
    expect(view.dms).toEqual([
      expect.objectContaining({ userId: SEED.gm.id, isOwner: true }),
      expect.objectContaining({ userId: SEED.player2.id, isOwner: false }),
    ]);
    expect((await getPromo(invited)).viewerIsGm).toBe(true);
    expect((await setEra(invited, "emas")).statusCode).toBe(200);

    expect((await invite(invited, SEED.player1.email)).statusCode).toBe(403);
    expect((await removeDm(invited, SEED.gm.id)).statusCode).toBe(403);
    expect((await invite(gm, SEED.player2.email)).statusCode).toBe(409);
    expect((await removeDm(gm, SEED.gm.id)).statusCode).toBe(400);

    expect((await removeDm(gm, SEED.player2.id)).statusCode).toBe(200);
    expect((await getDm(invited)).statusCode).toBe(403);
    expect((await getPromo(invited)).viewerIsGm).toBe(false);
    expect((await removeDm(gm, SEED.player2.id)).statusCode).toBe(404);
  });

  it("expires, can be cancelled, and is replaced by a newer invite", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const invited = await loginAs(app, SEED.player2.id);

    const old = tokenOf(await invite(gm, SEED.player2.email));
    const latest = await invite(gm, SEED.player2.email);
    expect((await accept(invited, old)).statusCode).toBe(410);

    const { id } = latest.json<InviteCoDmResponse>().invite;
    const pending = (await getDm(gm)).json<DmResponse>().invites;
    expect(pending.map((i) => i.id)).toEqual([id]);

    const cancel = () =>
      app.inject({
        method: "DELETE",
        url: `/api/promo/dm/co-dms/invites/${id}`,
        headers: { cookie: gm },
      });
    expect((await cancel()).statusCode).toBe(200);
    expect((await cancel()).statusCode).toBe(404);
    expect((await accept(invited, tokenOf(latest))).statusCode).toBe(410);

    const expiring = await invite(gm, SEED.player2.email);
    await db.orm.update(coDmInvites).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await accept(invited, tokenOf(expiring))).statusCode).toBe(410);
    expect((await getDm(gm)).json<DmResponse>().invites).toEqual([]);
  });

  it("returns a removed co-DM to player when they were an accepted player", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const player = await loginAs(app, SEED.player1.id);
    await db.orm
      .update(campaignRegistrations)
      .set({ status: "accepted" })
      .where(eq(campaignRegistrations.userId, SEED.player1.id));

    expect((await accept(player, tokenOf(await invite(gm, SEED.player1.email)))).statusCode).toBe(
      200,
    );
    expect((await removeDm(gm, SEED.player1.id)).statusCode).toBe(200);

    const campaigns = await app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: { cookie: player },
    });
    const campaign = campaigns.json<Campaign[]>().find((c) => c.id === SEED.promoCampaign.id);
    expect(campaign?.role).toBe("player");
  });
});

describe("campaign notes", () => {
  const NOTE = {
    islandId: "pasar",
    sessionNumber: 1,
    title: "Kapal hilang",
    body: "Baris 1\nBaris 2",
  };
  const create = (cookie: string, payload: object = NOTE) =>
    app.inject({ method: "POST", url: "/api/promo/dm/notes", headers: { cookie }, payload });
  const list = (cookie: string) =>
    app.inject({ method: "GET", url: "/api/promo/dm/notes", headers: { cookie } });
  const edit = (cookie: string, id: string, payload: object) =>
    app.inject({ method: "PATCH", url: `/api/promo/dm/notes/${id}`, headers: { cookie }, payload });

  it("is closed to visitors and players", async () => {
    expect((await app.inject({ method: "GET", url: "/api/promo/dm/notes" })).statusCode).toBe(401);
    const player = await loginAs(app, SEED.player2.id);
    expect((await list(player)).statusCode).toBe(403);
    expect((await create(player)).statusCode).toBe(403);
  });

  it("is shared between the DM and co-DMs, and keeps concurrent edits from overwriting", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const coDm = await loginAs(app, SEED.player2.id);
    await db.orm
      .insert(campaignMembers)
      .values({ campaignId: SEED.promoCampaign.id, userId: SEED.player2.id, role: "gm" });

    const created = await create(gm);
    expect(created.statusCode).toBe(201);
    const note = created.json<CampaignNote>();
    expect(note).toMatchObject({ ...NOTE, authorName: SEED.gm.displayName, version: 0 });

    const seen = (await list(coDm)).json<NotesResponse>();
    expect(seen.notes.map((n) => n.id)).toEqual([note.id]);
    // The hidden island is available to DMs here, though the public page never names it.
    expect(seen.islands.map((i) => i.id)).toContain("puing");

    const change = { sessionNumber: 2, title: "Judul baru", body: "Isi baru" };
    const updated = await edit(coDm, note.id, { ...change, version: 0 });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<CampaignNote>()).toMatchObject({
      ...change,
      version: 1,
      authorName: SEED.gm.displayName,
      updatedByName: SEED.player2.displayName,
    });

    // The DM still has version 0 open: their edit must not silently replace the co-DM's.
    expect((await edit(gm, note.id, { ...NOTE, version: 0 })).statusCode).toBe(409);
    const after = (await list(gm)).json<NotesResponse>().notes[0]!;
    expect(after.title).toBe("Judul baru");

    const remove = () =>
      app.inject({
        method: "DELETE",
        url: `/api/promo/dm/notes/${note.id}`,
        headers: { cookie: coDm },
      });
    expect((await remove()).statusCode).toBe(200);
    expect((await remove()).statusCode).toBe(404);
    expect((await edit(gm, note.id, { ...change, version: 1 })).statusCode).toBe(404);

    await db.orm.delete(campaignMembers).where(eq(campaignMembers.userId, SEED.player2.id));
  });

  it("rejects bad notes and keeps islands' notes apart", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    expect((await create(gm, { ...NOTE, islandId: "atlantis" })).statusCode).toBe(400);
    expect((await create(gm, { ...NOTE, sessionNumber: 0 })).statusCode).toBe(400);
    expect((await create(gm, { ...NOTE, title: "   " })).statusCode).toBe(400);
    expect((await create(gm, { ...NOTE, body: "x".repeat(20001) })).statusCode).toBe(400);

    await create(gm, { ...NOTE, islandId: "rimba", sessionNumber: 1 });
    await create(gm, { ...NOTE, islandId: "karang", sessionNumber: 3 });
    await create(gm, { ...NOTE, islandId: "karang", sessionNumber: 4 });
    const { notes } = (await list(gm)).json<NotesResponse>();
    expect(notes.filter((n) => n.islandId === "karang").map((n) => n.sessionNumber)).toEqual([
      4, 3,
    ]);
    expect(notes.filter((n) => n.islandId === "rimba")).toHaveLength(1);

    const res = await app.inject({ method: "GET", url: "/api/promo" });
    expect(res.body).not.toContain("Puing");
  });
});

describe("importing the uploaded sheet", () => {
  const FIXTURE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "promo/__fixtures__/rafle-sheet.pdf",
  );

  const review = (cookie: string, id: string, status: string) =>
    app.inject({
      method: "PATCH",
      url: `/api/promo/dm/registrations/${id}`,
      headers: { cookie },
      payload: { status },
    });

  beforeEach(async () => {
    await db.orm.delete(campaignRegistrations);
    await db.orm
      .delete(characters)
      .where(inArray(characters.ownerId, [SEED.player1.id, SEED.player2.id]));
    for (const key of storedSheets()) objects.delete(key);
  });

  it("makes a prefilled draft when the DM accepts a D&D Beyond sheet", async () => {
    const player = await loginAs(app, SEED.player2.id);
    const gm = await loginAs(app, SEED.gm.id);
    const created = (await register(player, FIELDS, await readFile(FIXTURE))).json<Registration>();
    const accepted = (await review(gm, created.id, "accepted")).json<Registration>();
    expect(accepted.characterId).toBeTruthy();

    const [draft] = await db.orm
      .select()
      .from(characters)
      .where(eq(characters.ownerId, SEED.player2.id));
    expect(draft).toMatchObject({
      id: accepted.characterId,
      campaignId: SEED.promoCampaign.id,
      status: "draft",
      name: "Raffle Snapper",
      speciesId: "human",
      backgroundId: "criminal",
      alignment: "cg",
    });

    // Accepting again doesn't make a second one.
    await review(gm, created.id, "accepted");
    expect(
      (await db.orm.select().from(characters).where(eq(characters.ownerId, SEED.player2.id)))
        .length,
    ).toBe(1);

    // Rejecting only takes it out of the campaign; it stays the player's.
    await review(gm, created.id, "rejected");
    expect(
      (await db.orm.select().from(characters).where(eq(characters.id, draft!.id)))[0]!.campaignId,
    ).toBeNull();

    // Accepting again puts the same character back.
    await review(gm, created.id, "accepted");
    expect(
      (await db.orm.select().from(characters).where(eq(characters.id, draft!.id)))[0]!.campaignId,
    ).toBe(SEED.promoCampaign.id);
  });

  it("makes an empty draft for a sheet it can't read", async () => {
    const player = await loginAs(app, SEED.player1.id);
    const gm = await loginAs(app, SEED.gm.id);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    const created = (
      await register(player, { ...FIELDS, characterName: "Tanpa Sheet" }, png)
    ).json<Registration>();
    const accepted = (await review(gm, created.id, "accepted")).json<Registration>();

    const [draft] = await db.orm
      .select()
      .from(characters)
      .where(eq(characters.id, accepted.characterId!));
    expect(draft).toMatchObject({
      campaignId: SEED.promoCampaign.id,
      status: "draft",
      name: "Tanpa Sheet",
      speciesId: null,
    });
  });
});
