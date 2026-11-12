import type { ClientToServerEvents, DiceRollResult, ServerToClientEvents } from "@dnd/contracts";
import { eq } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { campaigns, chatMessages, scenes, tokens } from "./db/schema";
import { createTestApp, loginAs } from "./test/setup";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const { app, db } = await createTestApp();
const campaignId = SEED.campaign.id;
let url: string;
const clients: Client[] = [];

/** A connected socket; pass a Cookie header to be logged in. */
async function client(cookie?: string): Promise<Client> {
  const c: Client = connect(url, {
    transports: ["websocket"],
    extraHeaders: cookie ? { cookie } : {},
    reconnection: false,
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.once("connect", resolve);
    c.once("connect_error", reject);
  });
  return c;
}

beforeAll(async () => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.close();
  await app.close();
  await db.close();
});

describe("socket", () => {
  it("refuses anonymous connections", async () => {
    await expect(client()).rejects.toThrow("login required");
  });

  it("refuses to join a campaign the user isn't in", async () => {
    const outsiderCampaign = "00000000-0000-4000-8000-0000000009ff";
    const c = await client(await loginAs(app, SEED.player1.id));
    expect(await c.emitWithAck("campaign:join", { campaignId: outsiderCampaign })).toEqual({
      ok: false,
      error: "not a member of this campaign",
    });
  });

  describe("in a campaign", () => {
    let a: Client;
    let b: Client;

    beforeAll(async () => {
      a = await client(await loginAs(app, SEED.player1.id));
      b = await client(await loginAs(app, SEED.gm.id));
      for (const c of [a, b])
        expect(await c.emitWithAck("campaign:join", { campaignId })).toEqual({ ok: true });
    });

    describe("tokens", () => {
      async function placed(values: { hidden?: boolean; characterId?: string } = {}) {
        const [scene] = await db.orm
          .insert(scenes)
          .values({
            campaignId,
            name: "Uji",
            mapKey: "uji.png",
            mapMime: "image/png",
            widthPx: 300,
            heightPx: 300,
            gridPx: 30,
          })
          .returning();
        await db.orm
          .update(campaigns)
          .set({ activeSceneId: scene!.id })
          .where(eq(campaigns.id, campaignId));
        const [token] = await db.orm
          .insert(tokens)
          .values({
            sceneId: scene!.id,
            kind: values.characterId ? "character" : "npc",
            name: "Uji",
            size: "medium",
            x: 0,
            y: 0,
            ...values,
          })
          .returning();
        return token!;
      }
      const position = async (id: string) => {
        const [row] = await db.orm.select().from(tokens).where(eq(tokens.id, id));
        return { x: row!.x, y: row!.y };
      };
      /** Waits long enough for an event that shouldn't come to have arrived. */
      const silence = () => new Promise((resolve) => setTimeout(resolve, 150));

      it("saves a DM's move and tells the rest of the campaign", async () => {
        const token = await placed();
        const moved = new Promise((resolve) => a.once("token:moved", resolve));
        b.emit("token:move", { campaignId, tokenId: token.id, x: 3, y: 4 });
        expect(await moved).toEqual({ campaignId, tokenId: token.id, x: 3, y: 4 });
        expect(await position(token.id)).toEqual({ x: 3, y: 4 });
      });

      it("keeps a token on the map", async () => {
        const token = await placed();
        const moved = new Promise((resolve) => a.once("token:moved", resolve));
        b.emit("token:move", { campaignId, tokenId: token.id, x: 500, y: -2 });
        expect(await moved).toEqual({ campaignId, tokenId: token.id, x: 9, y: 0 });
      });

      it("lets a player move only their own character", async () => {
        const own = SEED_CHARACTERS.find((c) => c.ownerId === SEED.player1.id && c.campaignId)!.id;
        const mine = await placed({ characterId: own });
        const moved = new Promise((resolve) => b.once("token:moved", resolve));
        a.emit("token:move", { campaignId, tokenId: mine.id, x: 2, y: 2 });
        await moved;
        expect(await position(mine.id)).toEqual({ x: 2, y: 2 });

        const monster = await placed();
        a.emit("token:move", { campaignId, tokenId: monster.id, x: 5, y: 5 });
        await silence();
        expect(await position(monster.id)).toEqual({ x: 0, y: 0 });
      });

      it("tells only other DMs when a hidden token moves", async () => {
        const token = await placed({ hidden: true });
        let playerSaw = false;
        a.once("token:moved", () => {
          playerSaw = true;
        });
        const gm2 = await client(await loginAs(app, SEED.gm.id));
        await gm2.emitWithAck("campaign:join", { campaignId });
        const moved = new Promise((resolve) => gm2.once("token:moved", resolve));
        b.emit("token:move", { campaignId, tokenId: token.id, x: 6, y: 6 });
        await moved;
        await silence();
        expect(playerSaw).toBe(false);
        a.removeAllListeners("token:moved");
      });
    });

    it("shows a DM's secret roll to DMs only, in the moment and in the log", async () => {
      const dm2 = await client(await loginAs(app, SEED.gm.id));
      await dm2.emitWithAck("campaign:join", { campaignId });
      let playerSaw = false;
      const onPlayer = () => {
        playerSaw = true;
      };
      a.on("dice:rolled", onPlayer);
      const seen = new Promise<DiceRollResult>((resolve) => dm2.once("dice:rolled", resolve));
      const ack = await b.emitWithAck("dice:roll", {
        campaignId,
        expression: "1d20+4",
        label: "Rahasia DM",
        secret: true,
      });
      expect(ack).toEqual({ ok: true });
      expect(await seen).toMatchObject({ label: "Rahasia DM", secret: true });
      await new Promise((resolve) => setTimeout(resolve, 150));
      a.off("dice:rolled", onPlayer);
      expect(playerSaw).toBe(false);

      const log = async (cookie: string) =>
        (
          await app.inject({
            method: "GET",
            url: `/api/campaigns/${campaignId}/rolls`,
            headers: { cookie },
          })
        ).json<DiceRollResult[]>();
      const dmLog = await log(await loginAs(app, SEED.gm.id));
      expect(dmLog.some((r) => r.label === "Rahasia DM")).toBe(true);
      const playerLog = await log(await loginAs(app, SEED.player1.id));
      expect(playerLog.some((r) => r.label === "Rahasia DM")).toBe(false);
    });

    it("rolls a player's request for secrecy in the open", async () => {
      const seen = new Promise<DiceRollResult>((resolve) => b.once("dice:rolled", resolve));
      await a.emitWithAck("dice:roll", { campaignId, expression: "1d20", secret: true });
      expect((await seen).secret).toBe(false);
    });

    it("rolls dice on the server and logs them", async () => {
      const rolled = new Promise<DiceRollResult>((resolve) => b.once("dice:rolled", resolve));
      const ack = await a.emitWithAck("dice:roll", {
        campaignId,
        expression: "2d6+1",
        label: "test",
      });
      expect(ack).toEqual({ ok: true });
      const result = await rolled;
      expect(result).toMatchObject({
        by: "Player One",
        userId: SEED.player1.id,
        modifier: 1,
        label: "test",
      });
      expect(result.rolls).toHaveLength(2);
      expect(result.total).toBe(result.rolls[0]! + result.rolls[1]! + 1);

      const [row] = await db.orm.select().from(chatMessages).where(eq(chatMessages.id, result.id));
      expect(row).toMatchObject({ kind: "roll", expression: "2d6+1", total: result.total });
    });

    it("rejects bad dice", async () => {
      const ack = await a.emitWithAck("dice:roll", { campaignId, expression: "lol" });
      expect(ack.ok).toBe(false);
    });
  });
});
