import type { Campaign, CampaignDetail, DiceRollResult } from "@dnd/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { SEED } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

describe("http", () => {
  it("GET /api/health", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ status: "ok", db: "up" });
  });

  it("GET /api/spells", async () => {
    const res = await app.inject({ method: "GET", url: "/api/spells" });
    expect(res.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "fire-bolt" })]),
    );
  });
});

describe("auth", () => {
  it("is anonymous without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.json()).toEqual({ user: null });
  });

  it("lists dev users and no Google login when it isn't configured", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/providers" });
    expect(res.json()).toMatchObject({
      google: false,
      devUsers: expect.arrayContaining([expect.objectContaining({ email: "gm@dev.local" })]),
    });
  });

  it("logs in, reports the user, and logs out", async () => {
    const cookie = await loginAs(app, SEED.player1.id);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ user: { id: SEED.player1.id, displayName: "Player One" } });

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    const after = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(after.json()).toEqual({ user: null });
  });

  it("rejects dev login for unknown users", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/dev-login",
      payload: { userId: "00000000-0000-4000-8000-0000000000ff" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("campaigns", () => {
  it("requires login", async () => {
    const res = await app.inject({ method: "GET", url: "/api/campaigns" });
    expect(res.statusCode).toBe(401);
  });

  it("lists the seed campaign; only the GM sees the invite code", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const player = await loginAs(app, SEED.player1.id);
    const asGm = (
      await app.inject({ method: "GET", url: "/api/campaigns", headers: { cookie: gm } })
    ).json<Campaign[]>();
    const asPlayer = (
      await app.inject({ method: "GET", url: "/api/campaigns", headers: { cookie: player } })
    ).json<Campaign[]>();
    expect(asGm[0]).toMatchObject({ id: SEED.campaign.id, role: "gm", inviteCode: "DEVCAMP" });
    expect(asPlayer[0]).toMatchObject({ id: SEED.campaign.id, role: "player" });
    expect(asPlayer[0]!.inviteCode).toBeUndefined();
  });

  it("creates a campaign and lets another user join with its invite code", async () => {
    const gm = await loginAs(app, SEED.player1.id);
    const created = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie: gm },
      payload: { name: "  Curse of the Test  " },
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json<Campaign>();
    expect(campaign).toMatchObject({
      name: "Curse of the Test",
      role: "gm",
      settings: { allowMulticlass: true },
    });

    const player = await loginAs(app, SEED.player2.id);
    const joined = await app.inject({
      method: "POST",
      url: "/api/campaigns/join",
      headers: { cookie: player },
      payload: { inviteCode: campaign.inviteCode!.toLowerCase() },
    });
    expect(joined.json()).toMatchObject({ id: campaign.id, role: "player" });

    const detail = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaign.id}`,
      headers: { cookie: player },
    });
    expect(detail.json<CampaignDetail>().members.map((m) => [m.displayName, m.role])).toEqual([
      ["Player One", "gm"],
      ["Player Two", "player"],
    ]);
  });

  it("hides campaigns from non-members", async () => {
    const outsider = await loginAs(app, SEED.player2.id);
    const own = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie: await loginAs(app, SEED.gm.id) },
      payload: { name: "Secret" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/${own.json<Campaign>().id}`,
      headers: { cookie: outsider },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns the seeded roll history newest first", async () => {
    const cookie = await loginAs(app, SEED.player2.id);
    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/${SEED.campaign.id}/rolls`,
      headers: { cookie },
    });
    const rolls = res.json<DiceRollResult[]>();
    expect(rolls.map((r) => r.label)).toEqual([
      "Goblin initiative",
      "Longsword damage",
      "Longsword attack",
    ]);
    expect(rolls[0]).toMatchObject({ by: "Dev GM", total: 9, modifier: 2 });
  });
});
