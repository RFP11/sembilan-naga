import type { Scene, ScenesResponse } from "@dnd/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { SEED } from "./db/seed";
import { createTestApp, loginAs, TEST_CONFIG } from "./test/setup";

const { app, db, objects } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

const CAMPAIGN = SEED.campaign.id;
const BOUNDARY = "----scenetest";

/** Just a PNG's header: enough for its type and size to be read. */
function png(width: number, height: number) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
}

const upload = (cookie: string, file: Buffer, name = "camp.png", target = app) =>
  target.inject({
    method: "POST",
    url: `/api/campaigns/${CAMPAIGN}/scenes`,
    headers: { cookie, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="map"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]),
  });
const list = (cookie: string, campaign: string = CAMPAIGN) =>
  app.inject({ method: "GET", url: `/api/campaigns/${campaign}/scenes`, headers: { cookie } });
const image = (cookie: string, id: string) =>
  app.inject({
    method: "GET",
    url: `/api/campaigns/${CAMPAIGN}/scenes/${id}/image`,
    headers: { cookie },
  });
const activate = (cookie: string, sceneId: string | null) =>
  app.inject({
    method: "PUT",
    url: `/api/campaigns/${CAMPAIGN}/active-scene`,
    headers: { cookie },
    payload: { sceneId },
  });
const scale = (cookie: string, id: string, payload: object) =>
  app.inject({
    method: "PATCH",
    url: `/api/campaigns/${CAMPAIGN}/scenes/${id}`,
    headers: { cookie },
    payload,
  });
const SCALE = { name: "Perkemahan", gridPx: 31.5, offsetX: 4, offsetY: 2.5, gridVisible: false };

describe("uploading a map", () => {
  it("is for the campaign's DM only and takes only real images", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const player = await loginAs(app, SEED.player1.id);

    expect((await upload(player, png(600, 400))).statusCode).toBe(403);
    const anon = await app.inject({ method: "GET", url: `/api/campaigns/${CAMPAIGN}/scenes` });
    expect(anon.statusCode).toBe(401);

    expect((await upload(gm, Buffer.from("not an image"))).statusCode).toBe(400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>');
    expect((await upload(gm, svg, "peta.svg")).statusCode).toBe(400);
    expect((await upload(gm, png(9000, 400))).statusCode).toBe(400);
    expect((await upload(gm, png(4, 4))).statusCode).toBe(400);
    const big = Buffer.concat([png(600, 400), Buffer.alloc(25 * 1024 * 1024)]);
    expect((await upload(gm, big)).statusCode).toBe(413);

    const closed = await buildApp({ config: TEST_CONFIG, db, storage: null });
    const noStorage = await upload(
      await loginAs(closed, SEED.gm.id),
      png(600, 400),
      "a.png",
      closed,
    );
    expect(noStorage.statusCode).toBe(503);
    await closed.close();

    expect([...objects.keys()].filter((k) => k.startsWith("scenes/"))).toEqual([]);
  });
});

describe("a map at the table", () => {
  it("stays hidden from players until the DM shows it", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const player = await loginAs(app, SEED.player1.id);

    const created = await upload(gm, png(600, 400));
    expect(created.statusCode).toBe(201);
    const scene = created.json<Scene>();
    expect(scene).toMatchObject({ name: "camp", widthPx: 600, heightPx: 400, gridVisible: true });

    expect((await list(gm)).json<ScenesResponse>().scenes.map((s) => s.id)).toEqual([scene.id]);
    expect((await list(player)).json<ScenesResponse>()).toEqual({
      activeSceneId: null,
      scenes: [],
    });
    expect((await image(gm, scene.id)).statusCode).toBe(200);
    expect((await image(player, scene.id)).statusCode).toBe(404);

    expect((await activate(player, scene.id)).statusCode).toBe(403);
    expect((await activate(gm, scene.id)).statusCode).toBe(200);

    expect((await list(player)).json<ScenesResponse>().activeSceneId).toBe(scene.id);
    const shown = await image(player, scene.id);
    expect(shown.statusCode).toBe(200);
    expect(shown.headers["content-type"]).toBe("image/png");
    expect(shown.headers["x-content-type-options"]).toBe("nosniff");

    // A second map isn't revealed by the first being shown.
    const second = (await upload(gm, png(300, 300), "rahasia.png")).json<Scene>();
    expect((await list(player)).json<ScenesResponse>().scenes.map((s) => s.id)).toEqual([scene.id]);
    expect((await image(player, second.id)).statusCode).toBe(404);

    expect((await activate(gm, null)).statusCode).toBe(200);
    expect((await image(player, scene.id)).statusCode).toBe(404);
  });

  it("is closed to people outside the campaign", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const scene = (await upload(gm, png(600, 400))).json<Scene>();
    const outsider = await app.inject({
      method: "POST",
      url: "/api/auth/dev-login",
      payload: { userId: SEED.player1.id },
    });
    const cookie = `session=${outsider.cookies.find((c) => c.name === "session")!.value}`;
    // Player One isn't a member of the promo campaign.
    expect((await list(cookie, SEED.promoCampaign.id)).statusCode).toBe(404);
    const other = await app.inject({
      method: "GET",
      url: `/api/campaigns/${SEED.promoCampaign.id}/scenes/${scene.id}/image`,
      headers: { cookie: gm },
    });
    expect(other.statusCode).toBe(404);
  });

  it("saves the scale the DM sets, and rejects one that can't work", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const player = await loginAs(app, SEED.player1.id);
    const scene = (await upload(gm, png(600, 400))).json<Scene>();

    expect(scene.gridPx).toBe(70);
    expect((await scale(player, scene.id, SCALE)).statusCode).toBe(403);
    expect((await scale(gm, scene.id, { ...SCALE, gridPx: 2 })).statusCode).toBe(400);
    expect((await scale(gm, scene.id, { ...SCALE, gridPx: 500 })).statusCode).toBe(400);
    expect((await scale(gm, scene.id, { ...SCALE, offsetX: 40 })).statusCode).toBe(400);
    expect((await scale(gm, scene.id, { ...SCALE, offsetY: -1 })).statusCode).toBe(400);

    const saved = await scale(gm, scene.id, SCALE);
    expect(saved.statusCode).toBe(200);
    expect(saved.json<Scene>()).toMatchObject(SCALE);
  });

  it("takes the image with it when deleted, and leaves the table empty", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const player = await loginAs(app, SEED.player1.id);
    const scene = (await upload(gm, png(600, 400))).json<Scene>();
    await activate(gm, scene.id);
    const before = objects.size;

    const remove = (cookie: string) =>
      app.inject({
        method: "DELETE",
        url: `/api/campaigns/${CAMPAIGN}/scenes/${scene.id}`,
        headers: { cookie },
      });
    expect((await remove(player)).statusCode).toBe(403);
    expect((await remove(gm)).statusCode).toBe(200);
    expect(objects.size).toBe(before - 1);
    expect((await remove(gm)).statusCode).toBe(404);
    expect((await list(player)).json<ScenesResponse>()).toEqual({
      activeSceneId: null,
      scenes: [],
    });
  });
});
