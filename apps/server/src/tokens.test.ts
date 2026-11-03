import type { MonsterSummary, Scene, Token } from "@dnd/contracts";
import type { Monster } from "@dnd/data";
import { monsters } from "@dnd/data/monsters";
import { rollDice } from "@dnd/rules";
import { afterAll, describe, expect, it } from "vitest";
import { campaigns, scenes } from "./db/schema";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

const CAMPAIGN = SEED.campaign.id;
const BRUNHILD = SEED_CHARACTERS.find((c) => c.build.name === "Brunhild Stonefist")!.id;
const ELARIA = SEED_CHARACTERS.find((c) => c.build.name === "Elaria Moonwhisper")!.id;

async function newScene(active = true) {
  const [row] = await db.orm
    .insert(scenes)
    .values({
      campaignId: CAMPAIGN,
      name: "Uji",
      mapKey: "uji.png",
      mapMime: "image/png",
      widthPx: 300,
      heightPx: 300,
      gridPx: 30,
    })
    .returning();
  if (active) await db.orm.update(campaigns).set({ activeSceneId: row!.id });
  return row! as unknown as Pick<Scene, "id">;
}

const url = (sceneId: string, tokenId?: string) =>
  `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens${tokenId ? `/${tokenId}` : ""}`;
const add = (cookie: string, sceneId: string, payload: object) =>
  app.inject({ method: "POST", url: url(sceneId), headers: { cookie }, payload });
const list = async (cookie: string, sceneId: string) =>
  (await app.inject({ method: "GET", url: url(sceneId), headers: { cookie } })).json<Token[]>();
const patch = (cookie: string, sceneId: string, tokenId: string, payload: object) =>
  app.inject({ method: "PATCH", url: url(sceneId, tokenId), headers: { cookie }, payload });

const gm = await loginAs(app, SEED.gm.id);
const player = await loginAs(app, SEED.player1.id);

describe("monster list", () => {
  it("gives what the picker needs, with SRD sizes and health", async () => {
    const res = await app.inject({ method: "GET", url: "/api/monsters" });
    const aboleth = res.json<MonsterSummary[]>().find((m) => m.id === "aboleth");
    expect(aboleth).toEqual({
      id: "aboleth",
      name: "Aboleth",
      size: ["large"],
      type: "Aberration",
      ac: 17,
      hp: 150,
    });
  });
});

describe("monster stat block", () => {
  it("has the actions a DM needs at the table", async () => {
    const res = await app.inject({ method: "GET", url: "/api/monsters/goblin-warrior" });
    expect(res.json<Monster>()).toMatchObject({
      name: "Goblin Warrior",
      ac: 15,
      actions: expect.arrayContaining([expect.objectContaining({ name: "Scimitar" })]),
      bonusActions: [expect.objectContaining({ name: "Nimble Escape" })],
    });
    const missing = await app.inject({ method: "GET", url: "/api/monsters/pikachu" });
    expect(missing.statusCode).toBe(404);
  });
});

describe("stat block dice", () => {
  it("can all be rolled, so no button in any stat block fails", () => {
    const dice = monsters.flatMap((m) =>
      [...m.traits, ...m.actions, ...m.bonusActions, ...m.reactions, ...m.legendaryActions].flatMap(
        (e) => e.damage.flatMap((d) => (d.dice ? [d.dice] : [])),
      ),
    );
    expect(dice.length).toBeGreaterThan(600);
    for (const expression of dice) expect(() => rollDice(expression)).not.toThrow();
  });
});

describe("adding tokens", () => {
  it("is for the DM only", async () => {
    const { id } = await newScene();
    expect((await add(player, id, { kind: "npc", name: "Budi" })).statusCode).toBe(403);
    const anon = await app.inject({ method: "GET", url: url(id) });
    expect(anon.statusCode).toBe(401);
  });

  it("takes a monster's name, size and HP from its stat block, and numbers a group", async () => {
    const { id } = await newScene();
    const made = await add(gm, id, { kind: "monster", monsterId: "aboleth", count: 2 });
    expect(made.statusCode).toBe(201);
    expect(made.json<Token[]>()).toEqual([
      expect.objectContaining({ name: "Aboleth 1", size: "large", hpCurrent: 150, hpMax: 150 }),
      expect.objectContaining({ name: "Aboleth 2", size: "large", monsterId: "aboleth" }),
    ]);

    const more = await add(gm, id, { kind: "monster", monsterId: "aboleth" });
    expect(more.json<Token[]>()[0]!.name).toBe("Aboleth 3");
    const bad = await add(gm, id, { kind: "monster", monsterId: "pikachu" });
    expect(bad.statusCode).toBe(400);
    const tooMany = await add(gm, id, { kind: "monster", monsterId: "aboleth", count: 21 });
    expect(tooMany.statusCode).toBe(400);
  });

  it("adds NPCs and objects with their own name, size and optional HP", async () => {
    const { id } = await newScene();
    const npc = await add(gm, id, { kind: "npc", name: "Kapten Rana", size: "small", hpMax: 30 });
    expect(npc.json<Token[]>()[0]).toMatchObject({
      kind: "npc",
      name: "Kapten Rana",
      size: "small",
      hpCurrent: 30,
    });
    const crate = await add(gm, id, { kind: "object", name: "Peti" });
    expect(crate.json<Token[]>()[0]).toMatchObject({ kind: "object", size: "medium", hpMax: null });
    expect((await add(gm, id, { kind: "npc", name: "  " })).statusCode).toBe(400);
  });

  it("doesn't stack tokens, and keeps big ones on the map", async () => {
    const { id } = await newScene();
    await add(gm, id, { kind: "npc", name: "A", count: 5 });
    const big = await add(gm, id, { kind: "npc", name: "Naga", size: "gargantuan" });
    const all = await list(gm, id);
    const cells = new Set<string>();
    for (const t of all) {
      const side = t.size === "gargantuan" ? 4 : 1;
      expect(t.x + side).toBeLessThanOrEqual(10);
      expect(t.y + side).toBeLessThanOrEqual(10);
      for (let dx = 0; dx < side; dx++) {
        for (let dy = 0; dy < side; dy++) {
          const key = `${t.x + dx},${t.y + dy}`;
          expect(cells.has(key)).toBe(false);
          cells.add(key);
        }
      }
    }
    expect(big.statusCode).toBe(201);
  });

  it("adds a character from this campaign once, and lets only its owner and the DM move it", async () => {
    const { id } = await newScene();
    const mine = await add(gm, id, { kind: "character", characterId: BRUNHILD });
    expect(mine.statusCode).toBe(201);
    expect(mine.json<Token[]>()[0]).toMatchObject({
      kind: "character",
      name: "Brunhild Stonefist",
    });
    expect((await add(gm, id, { kind: "character", characterId: BRUNHILD })).statusCode).toBe(409);
    const elsewhere = SEED_CHARACTERS.find((c) => c.campaignId === null)!.id;
    expect((await add(gm, id, { kind: "character", characterId: elsewhere })).statusCode).toBe(400);
    await add(gm, id, { kind: "character", characterId: ELARIA });
    await add(gm, id, { kind: "monster", monsterId: "aboleth" });

    const view = await list(player, id);
    const can = Object.fromEntries(view.map((t) => [t.name, t.canMove]));
    expect(can).toEqual({
      "Brunhild Stonefist": true,
      "Elaria Moonwhisper": false,
      Aboleth: false,
    });
    expect((await list(gm, id)).every((t) => t.canMove)).toBe(true);
  });
});

describe("what players see", () => {
  it("never sends hidden tokens, or anyone's HP", async () => {
    const { id } = await newScene();
    await add(gm, id, { kind: "npc", name: "Mata-mata", hidden: true, hpMax: 10 });
    await add(gm, id, { kind: "npc", name: "Pedagang", hpMax: 10 });

    const seen = await list(player, id);
    expect(seen.map((t) => t.name)).toEqual(["Pedagang"]);
    expect(seen[0]).toMatchObject({ hidden: false, hpCurrent: null, hpMax: null, canMove: false });
    expect((await list(gm, id)).map((t) => t.name)).toEqual(["Mata-mata", "Pedagang"]);

    const spy = (await list(gm, id)).find((t) => t.name === "Mata-mata")!;
    await patch(gm, id, spy.id, { hidden: false });
    expect((await list(player, id)).map((t) => t.name)).toContain("Mata-mata");
  });

  it("hides the tokens of a map that isn't on the table", async () => {
    const hidden = await newScene(false);
    await add(gm, hidden.id, { kind: "npc", name: "Rahasia" });
    const res = await app.inject({
      method: "GET",
      url: url(hidden.id),
      headers: { cookie: player },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("changing a token", () => {
  it("is for the DM only, and keeps the token valid", async () => {
    const { id } = await newScene();
    const [t] = (await add(gm, id, { kind: "npc", name: "Budi", hpMax: 20 })).json<Token[]>();
    const tokenId = t!.id;
    expect((await patch(player, id, tokenId, { name: "x" })).statusCode).toBe(403);

    const hurt = await patch(gm, id, tokenId, { hpCurrent: 5, name: "Budi Luka" });
    expect(hurt.json<Token>()).toMatchObject({ hpCurrent: 5, hpMax: 20, name: "Budi Luka" });
    const healed = await patch(gm, id, tokenId, { hpCurrent: 500 });
    expect(healed.json<Token>().hpCurrent).toBe(20);
    const lowered = await patch(gm, id, tokenId, { hpMax: 3 });
    expect(lowered.json<Token>()).toMatchObject({ hpCurrent: 3, hpMax: 3 });
    const none = await patch(gm, id, tokenId, { hpMax: null });
    expect(none.json<Token>()).toMatchObject({ hpCurrent: null, hpMax: null });

    const big = await patch(gm, id, tokenId, { size: "gargantuan" });
    expect(big.json<Token>().x + 4).toBeLessThanOrEqual(10);
  });

  it("deletes for the DM only, and goes with its map", async () => {
    const { id } = await newScene();
    const [t] = (await add(gm, id, { kind: "npc", name: "Budi" })).json<Token[]>();
    const remove = (cookie: string) =>
      app.inject({ method: "DELETE", url: url(id, t!.id), headers: { cookie } });
    expect((await remove(player)).statusCode).toBe(403);
    expect((await remove(gm)).statusCode).toBe(200);
    expect((await remove(gm)).statusCode).toBe(404);
  });
});
