import type {
  BoardPinged,
  ClientToServerEvents,
  Scene,
  ServerToClientEvents,
  Token,
} from "@dnd/contracts";
import { eq } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { campaigns, scenes, tokens } from "./db/schema";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const { app, db } = await createTestApp();
const CAMPAIGN = SEED.campaign.id;
const BRUNHILD = SEED_CHARACTERS.find((c) => c.build.name === "Brunhild Stonefist")!.id;
const gm = await loginAs(app, SEED.gm.id);
const player = await loginAs(app, SEED.player1.id);
const clients: Client[] = [];

afterAll(async () => {
  for (const c of clients) c.close();
  await app.close();
  await db.close();
});

// A 10 × 10 map on the table, with a goblin at (8,8), an orc at (1,1) and Brunhild at (8,1).
const [map] = await db.orm
  .insert(scenes)
  .values({
    campaignId: CAMPAIGN,
    name: "Gua",
    mapKey: "gua.png",
    mapMime: "image/png",
    widthPx: 300,
    heightPx: 300,
    gridPx: 30,
  })
  .returning();
const sceneId = map!.id;
await db.orm.update(campaigns).set({ activeSceneId: sceneId }).where(eq(campaigns.id, CAMPAIGN));

const base = `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}`;
const call = (cookie: string, method: "GET" | "POST" | "PATCH", url: string, payload?: object) =>
  app.inject({ method, url: `${base}${url}`, headers: { cookie }, payload });
const place = async (payload: object, x: number, y: number) => {
  const [t] = (await call(gm, "POST", "/tokens", payload)).json<Token[]>();
  await db.orm.update(tokens).set({ x, y }).where(eq(tokens.id, t!.id));
  return t!.id;
};
const goblin = await place({ kind: "monster", monsterId: "goblin-warrior" }, 8, 8);
const orc = await place({ kind: "npc", name: "Orc" }, 1, 1);
await place({ kind: "character", characterId: BRUNHILD }, 8, 1);
const names = async (cookie: string) =>
  (await call(cookie, "GET", "/tokens"))
    .json<Token[]>()
    .map((t) => t.name)
    .sort();

describe("fog of war", () => {
  it("is for the DM to change", async () => {
    expect((await call(player, "PATCH", "/fog", { enabled: true })).statusCode).toBe(403);
  });

  it("hides tokens in the dark from players, never the party's own", async () => {
    const on = (await call(gm, "PATCH", "/fog", { enabled: true })).json<Scene>();
    expect(on).toMatchObject({ fogEnabled: true, fogRevealed: [] });
    expect(await names(player)).toEqual(["Brunhild Stonefist"]);
    expect(await names(gm)).toEqual(["Brunhild Stonefist", "Goblin Warrior", "Orc"]);

    const opened = (
      await call(gm, "PATCH", "/fog", { reveal: { x1: 0, y1: 0, x2: 2, y2: 2 } })
    ).json<Scene>();
    expect(opened.fogRevealed).toHaveLength(9);
    expect(await names(player)).toEqual(["Brunhild Stonefist", "Orc"]);

    await call(gm, "PATCH", "/fog", { hide: { x1: 1, y1: 1, x2: 1, y2: 1 } });
    expect(await names(player)).toEqual(["Brunhild Stonefist"]);
    await call(gm, "PATCH", "/fog", { all: "reveal" });
    expect(await names(player)).toHaveLength(3);
    await call(gm, "PATCH", "/fog", { all: "hide" });
  });

  it("tells players the revealed squares with the map", async () => {
    await call(gm, "PATCH", "/fog", { reveal: { x1: 0, y1: 0, x2: 0, y2: 0 } });
    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/${CAMPAIGN}/scenes`,
      headers: { cookie: player },
    });
    expect(res.json<{ scenes: Scene[] }>().scenes[0]).toMatchObject({
      fogEnabled: true,
      fogRevealed: [[0, 0]],
    });
  });
});

describe("over the socket", () => {
  let dm: Client;
  let p1: Client;

  beforeAll(async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const open = async (cookie: string) => {
      const c: Client = connect(url, {
        transports: ["websocket"],
        extraHeaders: { cookie },
        reconnection: false,
      });
      clients.push(c);
      await new Promise((r) => c.once("connect", () => r(null)));
      expect(await c.emitWithAck("campaign:join", { campaignId: CAMPAIGN })).toEqual({ ok: true });
      return c;
    };
    dm = await open(gm);
    p1 = await open(player);
  });

  /** Collects what a client receives for a moment. */
  const listen = (c: Client, ms = 300) => {
    const got: string[] = [];
    c.onAny((event) => got.push(event));
    return new Promise<string[]>((resolve) =>
      setTimeout(() => {
        c.offAny();
        resolve(got);
      }, ms),
    );
  };

  it("keeps moves inside the fog between the DM's screens", async () => {
    const heard = listen(p1);
    dm.emit("token:move", { campaignId: CAMPAIGN, tokenId: goblin, x: 7, y: 7 });
    expect(await heard).toEqual([]);
  });

  it("makes players fetch tokens when one walks out of the fog", async () => {
    const heard = listen(p1);
    dm.emit("token:move", { campaignId: CAMPAIGN, tokenId: orc, x: 0, y: 0 }); // (0,0) is revealed
    expect(await heard).toEqual(expect.arrayContaining(["tokens:changed"]));
    expect(await names(player)).toContain("Orc");
  });

  it("shows a ping to everyone at the table, but not a flood of them", async () => {
    const pings: BoardPinged[] = [];
    dm.on("board:pinged", (p) => pings.push(p));
    p1.emit("board:ping", { campaignId: CAMPAIGN, x: 2.5, y: 3 });
    p1.emit("board:ping", { campaignId: CAMPAIGN, x: 4, y: 4 }); // too soon after the first
    await new Promise((r) => setTimeout(r, 300));
    expect(pings).toEqual([
      { campaignId: CAMPAIGN, x: 2.5, y: 3, by: "Player One", userId: SEED.player1.id },
    ]);
  });
});
