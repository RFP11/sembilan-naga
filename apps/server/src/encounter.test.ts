import type { EncounterResponse, Encounter, Token } from "@dnd/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { campaigns, combatants, encounters, scenes, tokens } from "./db/schema";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

const CAMPAIGN = SEED.campaign.id;
const BRUNHILD = SEED_CHARACTERS.find((c) => c.build.name === "Brunhild Stonefist")!.id;
const base = `/api/campaigns/${CAMPAIGN}/encounter`;

const gm = await loginAs(app, SEED.gm.id);
const player = await loginAs(app, SEED.player1.id);
const other = await loginAs(app, SEED.player2.id);

let sceneId: string;

beforeEach(async () => {
  await db.orm.delete(encounters);
  const [scene] = await db.orm
    .insert(scenes)
    .values({
      campaignId: CAMPAIGN,
      name: "Uji",
      mapKey: "uji.png",
      mapMime: "image/png",
      widthPx: 600,
      heightPx: 600,
      gridPx: 30,
    })
    .returning();
  sceneId = scene!.id;
  await db.orm.update(campaigns).set({ activeSceneId: sceneId }).where(eq(campaigns.id, CAMPAIGN));
});

const addToken = async (payload: object) => {
  const res = await app.inject({
    method: "POST",
    url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens`,
    headers: { cookie: gm },
    payload,
  });
  return res.json<Token[]>();
};
const start = (cookie: string, tokenIds: string[]) =>
  app.inject({ method: "POST", url: base, headers: { cookie }, payload: { tokenIds } });
const view = async (cookie: string) =>
  (await app.inject({ method: "GET", url: base, headers: { cookie } })).json<EncounterResponse>()
    .encounter;
const next = (cookie: string, currentId: string | null) =>
  app.inject({ method: "POST", url: `${base}/next`, headers: { cookie }, payload: { currentId } });
const setInitiative = (id: string, initiative: number, cookie = gm) =>
  app.inject({
    method: "PATCH",
    url: `${base}/combatants/${id}`,
    headers: { cookie },
    payload: { initiative },
  });

/** Starts a fight with fixed initiatives, so the order is known: Budi 20, Cici 10, Dedi 5. */
async function fight() {
  const [budi] = await addToken({ kind: "npc", name: "Budi", hpMax: 9 });
  const [cici] = await addToken({ kind: "npc", name: "Cici" });
  const [dedi] = await addToken({ kind: "npc", name: "Dedi" });
  const ids = [budi!.id, cici!.id, dedi!.id];
  await start(gm, ids);
  const found = (await view(gm))!;
  const by = (name: string) => found.combatants.find((c) => c.name === name)!.id;
  await setInitiative(by("Budi"), 20);
  await setInitiative(by("Cici"), 10);
  await setInitiative(by("Dedi"), 5);
  // Rolled order may have put someone else first: bring the turn back to the top.
  await db.orm
    .update(encounters)
    .set({ currentCombatantId: by("Budi"), round: 1 })
    .where(eq(encounters.id, found.id));
  return { by, tokens: { budi: budi!, cici: cici!, dedi: dedi! } };
}
const names = (e: Encounter | null) => e!.combatants.map((c) => c.name);

describe("starting an encounter", () => {
  it("is for the DM, and needs tokens on the map on the table", async () => {
    const [t] = await addToken({ kind: "npc", name: "Budi" });
    expect((await start(player, [t!.id])).statusCode).toBe(403);
    expect((await start(gm, [])).statusCode).toBe(400);
    expect((await start(gm, ["00000000-0000-4000-8000-0000000009ff"])).statusCode).toBe(400);

    await db.orm.update(campaigns).set({ activeSceneId: null }).where(eq(campaigns.id, CAMPAIGN));
    expect((await start(gm, [t!.id])).statusCode).toBe(409);
  });

  it("rolls initiative from each token's bonus and starts at the top, round 1", async () => {
    const [goblin] = await addToken({ kind: "monster", monsterId: "goblin-warrior" });
    const [hero] = await addToken({ kind: "character", characterId: BRUNHILD });
    const res = await start(gm, [goblin!.id, hero!.id]);
    expect(res.statusCode).toBe(201);
    const e = res.json<EncounterResponse>().encounter!;

    expect(e.round).toBe(1);
    expect(e.combatants).toHaveLength(2);
    expect(e.combatants[0]!.isCurrent).toBe(true);
    expect(e.combatants[0]!.initiative).toBeGreaterThanOrEqual(e.combatants[1]!.initiative);
    // Goblin +2, Brunhild +2: 1d20 plus 2 is 3 to 22.
    for (const c of e.combatants) {
      expect(c.initiative).toBeGreaterThanOrEqual(3);
      expect(c.initiative).toBeLessThanOrEqual(22);
    }
    expect((await start(gm, [goblin!.id])).statusCode).toBe(409);
  });
});

describe("taking turns", () => {
  it("sends the card that acted to the bottom, and counts rounds", async () => {
    const { by } = await fight();
    expect(names(await view(gm))).toEqual(["Budi", "Cici", "Dedi"]);

    let e = (await next(gm, by("Budi"))).json<EncounterResponse>().encounter!;
    expect(names(e)).toEqual(["Cici", "Dedi", "Budi"]);
    expect(e.combatants[0]!.isCurrent).toBe(true);
    expect(e.combatants[2]!.startsNextRound).toBe(true);
    expect(e.round).toBe(1);

    e = (await next(gm, by("Cici"))).json<EncounterResponse>().encounter!;
    expect(names(e)).toEqual(["Dedi", "Budi", "Cici"]);
    expect(e.round).toBe(1);

    e = (await next(gm, by("Dedi"))).json<EncounterResponse>().encounter!;
    expect(names(e)).toEqual(["Budi", "Cici", "Dedi"]);
    expect(e.round).toBe(2);
    expect(e.combatants.some((c) => c.startsNextRound)).toBe(false);
  });

  it("can't skip anyone with a double click", async () => {
    const { by } = await fight();
    expect((await next(gm, by("Budi"))).statusCode).toBe(200);
    expect((await next(gm, by("Budi"))).statusCode).toBe(409);
    expect(names(await view(gm))[0]).toBe("Cici");
  });

  it("lets a player end only their own character's turn", async () => {
    const [hero] = await addToken({ kind: "character", characterId: BRUNHILD });
    const [goblin] = await addToken({ kind: "npc", name: "Goblin" });
    await start(gm, [hero!.id, goblin!.id]);
    const e = (await view(gm))!;
    const heroId = e.combatants.find((c) => c.tokenId === hero!.id)!.id;
    const goblinId = e.combatants.find((c) => c.tokenId === goblin!.id)!.id;
    await setInitiative(heroId, 20);
    await setInitiative(goblinId, 1);
    await db.orm.update(encounters).set({ currentCombatantId: heroId });

    expect((await view(player))!.canEndTurn).toBe(true);
    expect((await view(other))!.canEndTurn).toBe(false);
    expect((await next(other, heroId)).statusCode).toBe(403);
    expect((await next(player, heroId)).statusCode).toBe(200);

    // The goblin's turn: not the player's to end.
    expect((await view(player))!.canEndTurn).toBe(false);
    expect((await next(player, goblinId)).statusCode).toBe(403);
    expect((await next(gm, goblinId)).statusCode).toBe(200);
  });
});

describe("hidden combatants", () => {
  it("never reach players, and don't give away that it's their turn", async () => {
    const [spy] = await addToken({ kind: "npc", name: "Mata-mata", hidden: true, hpMax: 5 });
    const [ally] = await addToken({ kind: "npc", name: "Sekutu", hpMax: 5 });
    await start(gm, [spy!.id, ally!.id]);
    const e = (await view(gm))!;
    const spyId = e.combatants.find((c) => c.tokenId === spy!.id)!.id;
    await setInitiative(spyId, 20);
    await setInitiative(e.combatants.find((c) => c.tokenId === ally!.id)!.id, 1);
    await db.orm.update(encounters).set({ currentCombatantId: spyId });

    const seen = (await view(player))!;
    expect(names(seen)).toEqual(["Sekutu"]);
    expect(seen.currentId).toBeNull();
    expect(seen.combatants[0]).toMatchObject({ isCurrent: false, hpMax: null, hpCurrent: null });
    expect(JSON.stringify(seen)).not.toContain("Mata-mata");
    expect((await next(player, spyId)).statusCode).toBe(403);

    const dm = (await view(gm))!;
    expect(dm.combatants[0]).toMatchObject({ name: "Mata-mata", hidden: true, isCurrent: true });

    // Revealed: they appear in order.
    await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens/${spy!.id}`,
      headers: { cookie: gm },
      payload: { hidden: false },
    });
    expect(names(await view(player))).toEqual(["Mata-mata", "Sekutu"]);
  });

  it("stays secret when the fight's map isn't on the table", async () => {
    await fight();
    await db.orm.update(campaigns).set({ activeSceneId: null }).where(eq(campaigns.id, CAMPAIGN));
    expect(await view(player)).toBeNull();
    expect(await view(gm)).not.toBeNull();
  });
});

describe("changing the fight", () => {
  it("re-sorts when the DM changes an initiative, keeping whoever is acting", async () => {
    const { by } = await fight();
    await setInitiative(by("Dedi"), 30);
    const e = (await view(gm))!;
    expect(names(e)).toEqual(["Budi", "Cici", "Dedi"]);
    expect(e.combatants[0]!.isCurrent).toBe(true);
    expect(e.combatants.find((c) => c.name === "Dedi")!.startsNextRound).toBe(true);
    expect((await setInitiative(by("Dedi"), 500)).statusCode).toBe(400);
    expect((await setInitiative(by("Dedi"), 5, player)).statusCode).toBe(403);
  });

  it("adds a token mid-fight, and only once", async () => {
    const { by } = await fight();
    const [late] = await addToken({ kind: "npc", name: "Telat" });
    const add = (cookie: string) =>
      app.inject({
        method: "POST",
        url: `${base}/combatants`,
        headers: { cookie },
        payload: { tokenIds: [late!.id] },
      });
    expect((await add(player)).statusCode).toBe(403);
    expect((await add(gm)).statusCode).toBe(200);
    expect((await add(gm)).statusCode).toBe(200);
    const e = (await view(gm))!;
    expect(e.combatants.filter((c) => c.name === "Telat")).toHaveLength(1);
    expect(e.currentId).toBe(by("Budi"));
  });

  it("passes the turn on when the acting one is removed, and ends with the last one", async () => {
    const { by } = await fight();
    const remove = (id: string, cookie = gm) =>
      app.inject({ method: "DELETE", url: `${base}/combatants/${id}`, headers: { cookie } });
    expect((await remove(by("Budi"), player)).statusCode).toBe(403);

    expect((await remove(by("Budi"))).statusCode).toBe(200);
    let e = (await view(gm))!;
    expect(names(e)).toEqual(["Cici", "Dedi"]);
    expect(e.combatants[0]!.isCurrent).toBe(true);
    expect(e.round).toBe(1);

    // The last in the order acting: removing them wraps to a new round.
    await next(gm, by("Cici"));
    await remove(by("Dedi"));
    e = (await view(gm))!;
    expect(names(e)).toEqual(["Cici"]);
    expect(e.round).toBe(2);

    await remove(by("Cici"));
    expect(await view(gm)).toBeNull();
  });

  it("passes the turn on when the acting token is deleted from the map", async () => {
    const { tokens: t } = await fight();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens/${t.budi.id}`,
      headers: { cookie: gm },
    });
    expect(res.statusCode).toBe(200);
    expect(names(await view(gm))).toEqual(["Cici", "Dedi"]);
    expect((await view(gm))!.combatants[0]!.isCurrent).toBe(true);
    const left = await db.orm.select().from(tokens).where(eq(tokens.id, t.budi.id));
    expect(left).toEqual([]);
  });

  it("shows live names and HP from the token", async () => {
    const { tokens: t } = await fight();
    await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens/${t.budi.id}`,
      headers: { cookie: gm },
      payload: { name: "Budi Luka", hpCurrent: 2 },
    });
    expect((await view(gm))!.combatants[0]).toMatchObject({
      name: "Budi Luka",
      hpCurrent: 2,
      hpMax: 9,
    });
  });

  it("ends for the DM only, and goes with its map", async () => {
    await fight();
    const end = (cookie: string) =>
      app.inject({ method: "DELETE", url: base, headers: { cookie } });
    expect((await end(player)).statusCode).toBe(403);
    expect((await end(gm)).statusCode).toBe(200);
    expect(await view(gm)).toBeNull();
    expect((await end(gm)).statusCode).toBe(404);
    expect(await db.orm.select().from(combatants)).toEqual([]);

    await db.orm.delete(tokens).where(eq(tokens.sceneId, sceneId));
    await fight();
    await app.inject({
      method: "DELETE",
      url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}`,
      headers: { cookie: gm },
    });
    expect(await view(gm)).toBeNull();
  });
});
