import type { ClientToServerEvents, DiceRollResult, ServerToClientEvents } from "@dnd/contracts";
import { eq } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "./db/seed";
import { chatMessages } from "./db/schema";
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

    it("broadcasts token moves to the rest of the campaign", async () => {
      const moved = new Promise((resolve) => b.once("token:moved", resolve));
      a.emit("token:move", { campaignId, tokenId: "t1", x: 3, y: 4 });
      expect(await moved).toEqual({ campaignId, tokenId: "t1", x: 3, y: 4 });
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
