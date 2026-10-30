import type { ClientToServerEvents, DiceRollResult, ServerToClientEvents } from "@dnd/contracts";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

const app = await buildApp({ config: { NODE_ENV: "test" } });

describe("http", () => {
  it("GET /api/health", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "not-configured" });
  });

  it("GET /api/spells", async () => {
    const res = await app.inject({ method: "GET", url: "/api/spells" });
    expect(res.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "fire-bolt" })]),
    );
  });
});

describe("socket", () => {
  type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
  let a: Client;
  let b: Client;

  beforeAll(async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;
    a = connect(url, { transports: ["websocket"] });
    b = connect(url, { transports: ["websocket"] });
    for (const c of [a, b]) {
      expect(await c.emitWithAck("campaign:join", { campaignId: "test" })).toEqual({ ok: true });
    }
  });

  afterAll(async () => {
    a.close();
    b.close();
    await app.close();
  });

  it("broadcasts token moves to the rest of the campaign", async () => {
    const moved = new Promise((resolve) => b.once("token:moved", resolve));
    a.emit("token:move", { campaignId: "test", tokenId: "t1", x: 3, y: 4 });
    expect(await moved).toEqual({ campaignId: "test", tokenId: "t1", x: 3, y: 4 });
  });

  it("rolls dice on the server", async () => {
    const rolled = new Promise<DiceRollResult>((resolve) => b.once("dice:rolled", resolve));
    const ack = await a.emitWithAck("dice:roll", { campaignId: "test", expression: "2d6+1" });
    expect(ack).toEqual({ ok: true });
    const result = await rolled;
    expect(result.rolls).toHaveLength(2);
    expect(result.total).toBe(result.rolls[0]! + result.rolls[1]! + 1);
  });

  it("rejects bad dice", async () => {
    const ack = await a.emitWithAck("dice:roll", { campaignId: "test", expression: "lol" });
    expect(ack.ok).toBe(false);
  });
});
