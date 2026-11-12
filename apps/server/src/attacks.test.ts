import type {
  AttackResult,
  Character,
  DamageResult,
  EncounterResponse,
  Token,
} from "@dnd/contracts";
import { monsters } from "@dnd/data/monsters";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { campaigns, characterState, encounters, scenes, tokens as tokensTable } from "./db/schema";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { damageAfterDefenses, damageOptions } from "./scenes/combat";
import { noteOpportunities } from "./scenes/encounter";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

const CAMPAIGN = SEED.campaign.id;
const BRUNHILD = SEED_CHARACTERS.find((c) => c.build.name === "Brunhild Stonefist")!.id;
const ELARIA = SEED_CHARACTERS.find((c) => c.build.name === "Elaria Moonwhisper")!.id;
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
  await db.orm
    .update(characterState)
    .set({ hpCurrent: 13, hpTemp: 0, concentratingOn: null, deathSaveFail: 0 })
    .where(eq(characterState.characterId, BRUNHILD));
});

const add = async (payload: object) =>
  (
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens`,
      headers: { cookie: gm },
      payload,
    })
  ).json<Token[]>()[0]!;
const attack = (cookie: string, payload: object) =>
  app.inject({
    method: "POST",
    url: `/api/campaigns/${CAMPAIGN}/attacks`,
    headers: { cookie },
    payload,
  });
const damage = (cookie: string, id: string, payload: object) =>
  app.inject({
    method: "POST",
    url: `/api/campaigns/${CAMPAIGN}/attacks/${id}/damage`,
    headers: { cookie },
    payload,
  });
const tokenList = async (cookie = gm) =>
  (
    await app.inject({
      method: "GET",
      url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens`,
      headers: { cookie },
    })
  ).json<Token[]>();
const sheet = async () =>
  (
    await app.inject({ method: "GET", url: `/api/characters/${BRUNHILD}`, headers: { cookie: gm } })
  ).json<Character>();

/** Attacks until the wanted result comes up; dice are rolled on the server. */
async function attackUntil(
  want: (r: AttackResult) => boolean,
  cookie: string,
  payload: object,
): Promise<AttackResult> {
  for (let i = 0; i < 2000; i++) {
    const r = (await attack(cookie, payload)).json<AttackResult>();
    if (want(r)) return r;
  }
  throw new Error("never got that result");
}

const scimitar = (attackerTokenId: string, targetTokenId: string, mode = "normal") => ({
  attackerTokenId,
  targetTokenId,
  mode,
  source: { kind: "monster", entry: "Scimitar" },
});

describe("working out damage", () => {
  const scim = monsters
    .find((m) => m.id === "goblin-warrior")!
    .actions.find((a) => a.name === "Scimitar")!;

  it("leaves out damage that only counts with Advantage, unless there was Advantage", () => {
    expect(damageOptions(scim, false)).toEqual([
      { dice: "1d6+2", type: "slashing", conditional: false, selected: true },
      { dice: "1d4", type: "slashing", conditional: true, selected: false },
    ]);
    expect(damageOptions(scim, true).map((o) => o.selected)).toEqual([true, true]);
  });

  it("swaps in the larger damage instead of adding both", () => {
    const entry = monsters
      .flatMap((m) => m.actions)
      .find((a) => /, or 18 \(4d6 \+ 4\)/.test(a.description))!;
    expect(damageOptions(entry, false).map((o) => o.selected)).toEqual([true, false]);
    expect(damageOptions(entry, true).map((o) => o.selected)).toEqual([false, true]);
  });

  it("always adds plain extra damage", () => {
    const entry = monsters
      .flatMap((m) => m.actions)
      .find(
        (a) => a.damage.length === 2 && / plus \d+ \(\d+d\d+\) \w+ damage\.$/.test(a.description),
      )!;
    expect(damageOptions(entry, false).map((o) => o.selected)).toEqual([true, true]);
  });

  it("applies immunity, resistance and vulnerability", () => {
    const stats = { immune: ["poison"], resist: ["fire"], vulnerable: ["cold"] };
    expect(damageAfterDefenses(9, "poison", stats)).toEqual({ applied: 0, note: "kebal" });
    expect(damageAfterDefenses(9, "fire", stats)).toEqual({ applied: 4, note: "tahan" });
    expect(damageAfterDefenses(9, "cold", stats)).toEqual({ applied: 18, note: "rentan" });
    expect(damageAfterDefenses(9, "acid", stats)).toEqual({ applied: 9, note: null });
  });
});

describe("an attack", () => {
  it("hits on AC, misses below it, and gives no damage to roll on a miss", async () => {
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const target = await add({ kind: "npc", name: "Target", ac: 15, hpMax: 50 });
    const payload = scimitar(goblin.id, target.id);

    const hit = await attackUntil((r) => r.hit && !r.critical, gm, payload);
    expect(hit.total).toBeGreaterThanOrEqual(15);
    expect(hit.id).not.toBeNull();
    expect(hit.targetAc).toBe(15);

    const miss = await attackUntil((r) => !r.hit && r.rolls[0] !== 1, gm, payload);
    expect(miss.total).toBeLessThan(15);
    expect(miss.id).toBeNull();
  });

  it("treats 20 as a critical hit and 1 as a miss, whatever the AC", async () => {
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const wall = await add({ kind: "npc", name: "Tembok", ac: 40, hpMax: 900 });
    const paper = await add({ kind: "npc", name: "Kertas", ac: 1, hpMax: 900 });

    const crit = await attackUntil((r) => r.rolls[0] === 20, gm, scimitar(goblin.id, wall.id));
    expect(crit).toMatchObject({ hit: true, critical: true });
    const fumble = await attackUntil((r) => r.rolls[0] === 1, gm, scimitar(goblin.id, paper.id));
    expect(fumble).toMatchObject({ hit: false, id: null });
  });

  it("rolls two dice with Advantage or Disadvantage and takes the right one", async () => {
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const target = await add({ kind: "npc", name: "Target", ac: 10 });
    const adv = (
      await attack(gm, scimitar(goblin.id, target.id, "advantage"))
    ).json<AttackResult>();
    expect(adv.rolls).toHaveLength(2);
    expect(adv.total).toBe(Math.max(...adv.rolls) + 4);
    const dis = (
      await attack(gm, scimitar(goblin.id, target.id, "disadvantage"))
    ).json<AttackResult>();
    expect(dis.total).toBe(Math.min(...dis.rolls) + 4);
  });

  it("uses a character's weapon, and the armor they wear as their AC", async () => {
    const hero = await add({ kind: "character", characterId: BRUNHILD });
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const items = (await sheet()).items;
    const greatsword = items.find((i) => i.itemId === "greatsword")!;

    const r = (
      await attack(player, {
        attackerTokenId: hero.id,
        targetTokenId: goblin.id,
        source: { kind: "weapon", itemId: greatsword.id },
      })
    ).json<AttackResult>();
    expect(r.toHit).toBe(5);
    expect(r.name).toBe("Greatsword");
    // A player isn't told the monster's AC.
    expect(r.targetAc).toBeNull();
    expect(r.damage[0]).toMatchObject({ dice: "2d6+3", type: "slashing" });

    const back = await attackUntil(() => true, gm, scimitar(goblin.id, hero.id));
    expect(back.targetAc).toBe(16);
  });

  it("can't be made by or against the wrong token", async () => {
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const hero = await add({ kind: "character", characterId: BRUNHILD });
    const spy = await add({ kind: "npc", name: "Mata-mata", hidden: true });
    const items = (await sheet()).items;
    const weapon = items.find((i) => i.kind === "weapon")!;
    const swing = (targetTokenId: string) => ({
      attackerTokenId: hero.id,
      targetTokenId,
      source: { kind: "weapon", itemId: weapon.id },
    });

    expect((await attack(other, swing(goblin.id))).statusCode).toBe(403);
    expect((await attack(player, scimitar(goblin.id, hero.id))).statusCode).toBe(403);
    expect((await attack(player, swing(spy.id))).statusCode).toBe(404);
    expect((await attack(gm, scimitar(goblin.id, goblin.id))).statusCode).toBe(400);
    const made = { ...scimitar(goblin.id, hero.id), source: { kind: "monster", entry: "Hug" } };
    expect((await attack(gm, made)).statusCode).toBe(400);
  });
});

describe("damage from a hit", () => {
  const setup = async () => {
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const target = await add({ kind: "npc", name: "Target", ac: 1, hpMax: 500 });
    const hit = await attackUntil((r) => r.hit && !r.critical, gm, scimitar(goblin.id, target.id));
    return { goblin, target, hit };
  };

  it("comes off the target right away, and only once", async () => {
    const { target, hit } = await setup();
    const res = await damage(gm, hit.id!, { include: [0] });
    expect(res.statusCode).toBe(200);
    const result = res.json<DamageResult>();
    expect(result.applied).toBeGreaterThanOrEqual(3);
    expect(result.applied).toBeLessThanOrEqual(8);
    const after = (await tokenList()).find((t) => t.id === target.id)!;
    expect(after.hpCurrent).toBe(500 - result.applied);
    expect((await damage(gm, hit.id!, { include: [0] })).statusCode).toBe(404);
  });

  it("adds optional damage and extra dice, like Sneak Attack", async () => {
    const { hit } = await setup();
    const res = await damage(gm, hit.id!, { include: [0, 1], extraDice: "3d6" });
    const result = res.json<DamageResult>();
    expect(result.parts.map((p) => p.dice)).toEqual(["1d6+2", "1d4", "3d6"]);
    expect(result.applied).toBeGreaterThanOrEqual(3 + 1 + 3);
    const { hit: second } = await setup();
    expect((await damage(gm, second.id!, { include: [0], extraDice: "evil" })).statusCode).toBe(
      400,
    );
    expect((await damage(gm, second.id!, { include: [] })).statusCode).toBe(400);
  });

  it("rolls the dice twice on a critical, but the modifier once", async () => {
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const target = await add({ kind: "npc", name: "Target", ac: 1, hpMax: 900 });
    const seen: number[] = [];
    for (let i = 0; i < 40; i++) {
      const crit = await attackUntil((r) => r.critical, gm, scimitar(goblin.id, target.id));
      seen.push((await damage(gm, crit.id!, { include: [0] })).json<DamageResult>().applied);
    }
    // 2d6 + 2: from 4 to 14, which one 1d6 + 2 could never reach.
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...seen)).toBeLessThanOrEqual(14);
    expect(Math.max(...seen)).toBeGreaterThan(8);
  }, 60_000);

  it("isn't for anyone else to roll", async () => {
    const hero = await add({ kind: "character", characterId: BRUNHILD });
    const target = await add({ kind: "npc", name: "Target", ac: 1, hpMax: 50 });
    const weapon = (await sheet()).items.find((i) => i.kind === "weapon")!;
    const hit = await attackUntil((r) => r.hit, player, {
      attackerTokenId: hero.id,
      targetTokenId: target.id,
      source: { kind: "weapon", itemId: weapon.id },
    });
    expect((await damage(other, hit.id!, { include: [0] })).statusCode).toBe(403);
    expect((await damage(player, hit.id!, { include: [0] })).statusCode).toBe(200);
  });

  it("reaches a character's sheet, and asks for a concentration save", async () => {
    const hero = await add({ kind: "character", characterId: BRUNHILD });
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    await db.orm
      .update(characterState)
      .set({ concentratingOn: "Bless" })
      .where(eq(characterState.characterId, BRUNHILD));
    const hit = await attackUntil((r) => r.hit, gm, scimitar(goblin.id, hero.id));
    const result = (await damage(gm, hit.id!, { include: [0] })).json<DamageResult>();
    expect((await sheet()).state!.hpCurrent).toBe(13 - result.applied);
    expect(result.concentratingOn).toBe("Bless");
    expect(result.concentrationDc).toBe(10);
  });

  it("marks a token that drops to 0, without going below", async () => {
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    const target = await add({ kind: "npc", name: "Lemah", ac: 1, hpMax: 1 });
    const hit = await attackUntil((r) => r.hit, gm, scimitar(goblin.id, target.id));
    const result = (await damage(gm, hit.id!, { include: [0] })).json<DamageResult>();
    expect(result.targetDown).toBe(true);
    expect((await tokenList()).find((t) => t.id === target.id)!.hpCurrent).toBe(0);
  });

  it("logs a hidden token's attack secretly", async () => {
    const spy = await add({ kind: "monster", monsterId: "goblin-warrior", hidden: true });
    const target = await add({ kind: "npc", name: "Target", ac: 1, hpMax: 90 });
    await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${CAMPAIGN}/scenes/${sceneId}/tokens/${spy.id}`,
      headers: { cookie: gm },
      payload: { name: "Bayangan" },
    });
    const hit = await attackUntil((r) => r.hit, gm, scimitar(spy.id, target.id));
    await damage(gm, hit.id!, { include: [0] });
    const log = (cookie: string) =>
      app.inject({
        method: "GET",
        url: `/api/campaigns/${CAMPAIGN}/rolls`,
        headers: { cookie },
      });
    expect((await log(gm)).body).toContain("Bayangan");
    expect((await log(player)).body).not.toContain("Bayangan");
  });
});

describe("opportunity attacks", () => {
  /** Hero next to a goblin, in a fight, on the hero's turn. */
  const standoff = async () => {
    const hero = await add({ kind: "character", characterId: BRUNHILD });
    const goblin = await add({ kind: "monster", monsterId: "goblin-warrior" });
    await db.orm.update(tokensTable).set({ x: 5, y: 5 }).where(eq(tokensTable.id, hero.id));
    await db.orm.update(tokensTable).set({ x: 6, y: 5 }).where(eq(tokensTable.id, goblin.id));
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${CAMPAIGN}/encounter`,
      headers: { cookie: gm },
      payload: { tokenIds: [hero.id, goblin.id] },
    });
    const e = await view(gm);
    const heroC = e!.combatants.find((c) => c.tokenId === hero.id)!;
    await db.orm.update(encounters).set({ currentCombatantId: heroC.id });
    return { hero, goblin };
  };
  const view = async (cookie: string) =>
    (
      await app.inject({
        method: "GET",
        url: `/api/campaigns/${CAMPAIGN}/encounter`,
        headers: { cookie },
      })
    ).json<EncounterResponse>().encounter;

  it("prompts the enemy left behind, only its controller sees it, and uses the reaction", async () => {
    const { hero, goblin } = await standoff();
    const out = await noteOpportunities(db.orm, hero.id, { x: 5, y: 5 }, { x: 1, y: 5 });
    expect(out).toBe(true);

    const dm = await view(gm);
    expect(dm!.reactions).toEqual([
      expect.objectContaining({ reactorTokenId: goblin.id, targetName: "Brunhild Stonefist" }),
    ]);
    expect((await view(player))!.reactions).toEqual([]);

    const res = await attack(gm, {
      ...scimitar(goblin.id, hero.id),
      reactionId: dm!.reactions[0]!.id,
    });
    expect(res.statusCode).toBe(201);
    const after = (await view(gm))!;
    expect(after.reactions).toEqual([]);
    expect(after.combatants.find((c) => c.tokenId === goblin.id)!.reactionUsed).toBe(true);

    // Used up: leaving its reach again gives nothing.
    expect(await noteOpportunities(db.orm, hero.id, { x: 5, y: 5 }, { x: 1, y: 5 })).toBe(false);
  });

  it("doesn't trigger when staying in reach, or starting out of reach", async () => {
    const { hero } = await standoff();
    expect(await noteOpportunities(db.orm, hero.id, { x: 5, y: 5 }, { x: 5, y: 4 })).toBe(false);
    expect(await noteOpportunities(db.orm, hero.id, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  });

  it("doesn't trigger off someone's turn, or between allies", async () => {
    const { hero, goblin } = await standoff();
    // Not the goblin's turn: the DM is just rearranging.
    expect(await noteOpportunities(db.orm, goblin.id, { x: 6, y: 5 }, { x: 10, y: 5 })).toBe(false);

    const ally = await add({ kind: "character", characterId: ELARIA });
    await db.orm.update(tokensTable).set({ x: 4, y: 5 }).where(eq(tokensTable.id, ally.id));
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${CAMPAIGN}/encounter/combatants`,
      headers: { cookie: gm },
      payload: { tokenIds: [ally.id] },
    });
    await noteOpportunities(db.orm, hero.id, { x: 5, y: 5 }, { x: 1, y: 5 });
    const reactors = (await view(gm))!.reactions.map((r) => r.reactorTokenId);
    expect(reactors).not.toContain(ally.id);
  });

  it("can be let go, and clears when the turn moves on", async () => {
    const { hero } = await standoff();
    await noteOpportunities(db.orm, hero.id, { x: 5, y: 5 }, { x: 1, y: 5 });
    const prompt = (await view(gm))!.reactions[0]!;
    const drop = (cookie: string) =>
      app.inject({
        method: "DELETE",
        url: `/api/campaigns/${CAMPAIGN}/reactions/${prompt.id}`,
        headers: { cookie },
      });
    expect((await drop(player)).statusCode).toBe(403);
    expect((await drop(gm)).statusCode).toBe(200);
    expect((await view(gm))!.reactions).toEqual([]);

    await noteOpportunities(db.orm, hero.id, { x: 5, y: 5 }, { x: 1, y: 5 });
    const e = (await view(gm))!;
    expect(e.reactions).toHaveLength(1);
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${CAMPAIGN}/encounter/next`,
      headers: { cookie: gm },
      payload: { currentId: e.currentId },
    });
    expect((await view(gm))!.reactions).toEqual([]);
  });
});

describe("a character's granted spells", () => {
  it("are there for its owner and the DM only", async () => {
    const get = (cookie: string) =>
      app.inject({ method: "GET", url: `/api/characters/${ELARIA}/spells`, headers: { cookie } });
    const own = await get(other);
    expect(own.statusCode).toBe(200);
    expect(own.json<{ spellId: string }[]>().length).toBeGreaterThan(0);
    expect((await get(gm)).statusCode).toBe(200);
    expect((await get(player)).statusCode).toBe(404);
  });
});

describe("reminders and numbers for the DM", () => {
  it("shows a monster's recharge and traits to the DM on its turn, not to players", async () => {
    const dragon = await add({ kind: "monster", monsterId: "adult-red-dragon" });
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${CAMPAIGN}/encounter`,
      headers: { cookie: gm },
      payload: { tokenIds: [dragon.id] },
    });
    const get = async (cookie: string) =>
      (
        await app.inject({
          method: "GET",
          url: `/api/campaigns/${CAMPAIGN}/encounter`,
          headers: { cookie },
        })
      ).json<EncounterResponse>().encounter!;
    const dm = await get(gm);
    expect(dm.reminders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "recharge", title: "Fire Breath" }),
        expect.objectContaining({ type: "trait" }),
      ]),
    );
    expect(dm.combatants[0]).toMatchObject({ ac: 19, passivePerception: 23 });

    const seen = await get(player);
    expect(seen.reminders).toEqual([]);
    expect(seen.combatants[0]).toMatchObject({ ac: null, passivePerception: null });
  });

  it("reminds a player of their features, and of a death save at 0 HP", async () => {
    const hero = await add({ kind: "character", characterId: BRUNHILD });
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${CAMPAIGN}/encounter`,
      headers: { cookie: gm },
      payload: { tokenIds: [hero.id] },
    });
    await db.orm
      .update(characterState)
      .set({ hpCurrent: 0 })
      .where(eq(characterState.characterId, BRUNHILD));
    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/${CAMPAIGN}/encounter`,
      headers: { cookie: player },
    });
    const { reminders } = res.json<EncounterResponse>().encounter!;
    expect(reminders.map((r) => r.title)).toEqual(
      expect.arrayContaining(["Death Saving Throw", "Second Wind"]),
    );
    const otherView = await app.inject({
      method: "GET",
      url: `/api/campaigns/${CAMPAIGN}/encounter`,
      headers: { cookie: other },
    });
    expect(otherView.json<EncounterResponse>().encounter!.reminders).toEqual([]);
  });
});
