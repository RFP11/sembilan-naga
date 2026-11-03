import type { CastResult, Character, CharacterSpell } from "@dnd/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { characterSpells, characterState } from "./db/schema";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

const ELARIA = SEED_CHARACTERS.find((c) => c.build.name === "Elaria Moonwhisper")!.id;
const BRUNHILD = SEED_CHARACTERS.find((c) => c.build.name === "Brunhild Stonefist")!.id;
const gm = await loginAs(app, SEED.gm.id);
const owner = await loginAs(app, SEED.player2.id);
const stranger = await loginAs(app, SEED.player1.id);

const set = (cookie: string, spellIds: string[], id = ELARIA, classId = "wizard") =>
  app.inject({
    method: "PUT",
    url: `/api/characters/${id}/spells/${classId}`,
    headers: { cookie },
    payload: { spellIds },
  });
const list = async (cookie = owner) =>
  (
    await app.inject({
      method: "GET",
      url: `/api/characters/${ELARIA}/spells`,
      headers: { cookie },
    })
  ).json<CharacterSpell[]>();
const cast = (cookie: string, spellId: string, slotLevel?: number) =>
  app.inject({
    method: "POST",
    url: `/api/characters/${ELARIA}/cast`,
    headers: { cookie },
    payload: { spellId, ...(slotLevel && { slotLevel }) },
  });
const state = async () =>
  (
    await app.inject({
      method: "GET",
      url: `/api/characters/${ELARIA}`,
      headers: { cookie: owner },
    })
  ).json<Character>().state!;

beforeEach(async () => {
  await db.orm
    .update(characterState)
    .set({ spellSlotsUsed: {}, concentratingOn: null })
    .where(eq(characterState.characterId, ELARIA));
});

describe("choosing spells", () => {
  it("saves a choice for the owner and the DM, and replaces the last one", async () => {
    expect((await set(owner, ["fireball", "light"])).statusCode).toBe(200);
    let spells = await list();
    expect(
      spells
        .filter((s) => s.source === "wizard")
        .map((s) => s.spellId)
        .sort(),
    ).toEqual(["fireball", "light"]);

    expect((await set(gm, ["shield"])).statusCode).toBe(200);
    spells = await list();
    expect(spells.filter((s) => s.source === "wizard").map((s) => s.spellId)).toEqual(["shield"]);
  });

  it("keeps spells granted by the character's species", async () => {
    const before = (await list()).filter((s) => s.source === "species");
    expect(before.length).toBeGreaterThan(0);
    await set(owner, []);
    expect((await list()).filter((s) => s.source === "species")).toEqual(before);
  });

  it("refuses others, wrong classes, and choices past the limits", async () => {
    expect((await set(stranger, ["light"])).statusCode).toBe(404);
    expect((await set(owner, ["wish"])).statusCode).toBe(400);
    expect((await set(owner, ["cure-wounds"])).statusCode).toBe(400);
    expect((await set(owner, ["light"], ELARIA, "cleric")).statusCode).toBe(400);
    const cantrips = ["light", "mage-hand", "prestidigitation", "ray-of-frost", "fire-bolt"];
    const res = await set(owner, cantrips);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "cantrip maksimal 4" });
  });

  it("has nothing to choose for a class without spells", async () => {
    const fighter = await loginAs(app, SEED.player1.id);
    expect((await set(fighter, ["light"], BRUNHILD, "fighter")).statusCode).toBe(400);
  });
});

describe("casting", () => {
  it("spends the lowest slot that works, and the sheet shows it", async () => {
    await set(owner, ["magic-missile", "light", "fireball"]);
    const res = await cast(owner, "magic-missile");
    expect(res.statusCode).toBe(200);
    expect(res.json<CastResult>()).toMatchObject({ slotLevel: 1, pact: false });
    expect((await state()).spellSlotsUsed).toEqual({ "1": 1 });
  });

  it("costs nothing for a cantrip", async () => {
    await set(owner, ["light"]);
    const res = await cast(owner, "light");
    expect(res.json<CastResult>().slotLevel).toBeNull();
    expect((await state()).spellSlotsUsed).toEqual({});
  });

  it("uses a higher slot on request, and refuses a lower one", async () => {
    await set(owner, ["magic-missile", "fireball"]);
    expect((await cast(owner, "magic-missile", 3)).json<CastResult>().slotLevel).toBe(3);
    expect((await state()).spellSlotsUsed).toEqual({ "3": 1 });
    expect((await cast(owner, "fireball", 1)).statusCode).toBe(409);
  });

  it("stops when the slots run out", async () => {
    await set(owner, ["fireball"]);
    await db.orm
      .update(characterState)
      .set({ spellSlotsUsed: { "3": 2 } })
      .where(eq(characterState.characterId, ELARIA));
    const res = await cast(owner, "fireball");
    expect(res.statusCode).toBe(409);
    expect((await state()).spellSlotsUsed).toEqual({ "3": 2 });
  });

  it("starts concentrating, and says what the new spell ended", async () => {
    await set(owner, ["blur", "fly", "magic-missile"]);
    let result = (await cast(owner, "blur")).json<CastResult>();
    expect(result).toMatchObject({ concentrating: "Blur", endedConcentration: null });
    expect((await state()).concentratingOn).toBe("Blur");

    result = (await cast(owner, "fly")).json<CastResult>();
    expect(result).toMatchObject({ concentrating: "Fly", endedConcentration: "Blur" });

    // A spell without concentration leaves it alone.
    result = (await cast(owner, "magic-missile")).json<CastResult>();
    expect(result).toMatchObject({ concentrating: null, endedConcentration: null });
    expect((await state()).concentratingOn).toBe("Fly");
  });

  it("is only for spells the character has, and for the right people", async () => {
    await set(owner, ["fireball"]);
    await db.orm.delete(characterSpells).where(eq(characterSpells.spellId, "shield"));
    expect((await cast(owner, "shield")).statusCode).toBe(400);
    expect((await cast(stranger, "fireball")).statusCode).toBe(404);
    expect((await cast(gm, "fireball")).statusCode).toBe(200);
  });
});
