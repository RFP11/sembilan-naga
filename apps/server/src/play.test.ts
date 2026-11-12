import type { Character, DiceRollResult } from "@dnd/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

type Sheet = Character & { state: NonNullable<Character["state"]> };
const call = async <T = Sheet>(
  cookie: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
) => {
  const res = await app.inject({
    method,
    url: `/api${url}`,
    headers: { cookie },
    payload: payload as object,
  });
  return { status: res.statusCode, body: (res.body ? res.json() : undefined) as T };
};

// Brunhild: Dwarf Fighter 1, 13 max HP, one d10 Hit Die, Con +2.
const brunhild = SEED_CHARACTERS[0]!.id;
// Elaria: Elf Wizard 5, 32 max HP, five d6, Con +2.
const elaria = SEED_CHARACTERS[1]!.id;

describe("hit points", () => {
  it("applies damage through temporary HP, then heals up to the maximum", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    await call(p1, "POST", `/characters/${brunhild}/hp`, { type: "temp", amount: 4 });
    const hurt = await call(p1, "POST", `/characters/${brunhild}/hp`, {
      type: "damage",
      amount: 7,
    });
    expect(hurt.body.state).toMatchObject({ hpCurrent: 10, hpTemp: 0 });
    const healed = await call(p1, "POST", `/characters/${brunhild}/hp`, {
      type: "heal",
      amount: 50,
    });
    expect(healed.body.state.hpCurrent).toBe(13);
  });

  it("lets the campaign GM deal damage but hides the character from other players", async () => {
    const gm = await loginAs(app, SEED.gm.id);
    const res = await call(gm, "POST", `/characters/${brunhild}/hp`, {
      type: "damage",
      amount: 13,
    });
    expect(res.body.state.hpCurrent).toBe(0);
    const p2 = await loginAs(app, SEED.player2.id);
    expect(
      (await call(p2, "POST", `/characters/${brunhild}/hp`, { type: "heal", amount: 1 })).status,
    ).toBe(404);
  });

  it("sets HP by hand, within the limits, for the owner and the DM", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const set = async (amount: number, who = p1) =>
      call<Sheet>(who, "POST", `/characters/${brunhild}/hp`, { type: "set", amount });

    expect((await set(5)).body.state.hpCurrent).toBe(5);
    expect((await set(999)).body.state.hpCurrent).toBe(13);
    const dm = await loginAs(app, SEED.gm.id);
    expect((await set(7, dm)).body.state.hpCurrent).toBe(7);
    const stranger = await loginAs(app, SEED.player2.id);
    expect((await set(1, stranger)).status).toBe(404);
    await set(0);
  });

  it("stops at three successes: stable at 0 HP, and it stays that way", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const path = `/characters/${brunhild}/death-save`;
    const hpPath = `/characters/${brunhild}/hp`;
    const save = () => call<Sheet & { stable: boolean; roll: number }>(p1, "POST", path);
    const restart = async () => {
      await call(p1, "POST", hpPath, { type: "set", amount: 5 });
      await call(p1, "POST", hpPath, { type: "set", amount: 0 });
    };
    await restart();

    let last = await save();
    for (let i = 0; i < 300 && !last.body.stable; i++) {
      // A 20 brings them back and three failures end it: start over.
      if (last.body.state.hpCurrent > 0 || last.body.state.deathSaves.fail >= 3) await restart();
      last = await save();
    }
    expect(last.body.stable).toBe(true);
    expect(last.body.state.hpCurrent).toBe(0);
    expect(last.body.state.deathSaves.success).toBe(3);

    // The character sheet remembers, and there's nothing more to roll.
    const sheet = await call<Sheet>(p1, "GET", `/characters/${brunhild}`);
    expect(sheet.body.state.deathSaves.success).toBe(3);
    expect((await save()).status).toBe(409);

    // Damage starts the saves over.
    const hurt = await call<Sheet>(p1, "POST", hpPath, { type: "damage", amount: 1 });
    expect(hurt.body.state.deathSaves).toMatchObject({ success: 0 });
    expect((await save()).status).toBe(200);
    await restart();
  });

  it("rolls death saves on the server at 0 HP and logs them", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const save = await call<Sheet & { roll: number }>(
      p1,
      "POST",
      `/characters/${brunhild}/death-save`,
    );
    expect(save.body.roll).toBeGreaterThanOrEqual(1);
    const { success, fail } = save.body.state.deathSaves;
    if (save.body.roll === 20) expect(save.body.state.hpCurrent).toBe(1);
    else expect(success + fail).toBeGreaterThan(0);

    const log = await call<DiceRollResult[]>(p1, "GET", `/campaigns/${SEED.campaign.id}/rolls`);
    expect(log.body[0]).toMatchObject({
      label: "Brunhild Stonefist: Death Saving Throw",
      total: save.body.roll,
    });

    await call(p1, "POST", `/characters/${brunhild}/hp`, { type: "heal", amount: 13 });
    expect((await call(p1, "POST", `/characters/${brunhild}/death-save`)).status).toBe(409);
  });
});

describe("rests", () => {
  it("spends Hit Point Dice on a Short Rest and restores everything on a Long Rest", async () => {
    const p2 = await loginAs(app, SEED.player2.id);
    await call(p2, "POST", `/characters/${elaria}/hp`, { type: "damage", amount: 30 }); // 32 → 2
    const rest = await call<Sheet & { healed: number }>(
      p2,
      "POST",
      `/characters/${elaria}/short-rest`,
      {
        hitDice: { "6": 2 },
      },
    );
    // Each d6 heals 1-6 + 2 (Con).
    expect(rest.body.healed).toBeGreaterThanOrEqual(6);
    expect(rest.body.healed).toBeLessThanOrEqual(16);
    expect(rest.body.state).toMatchObject({
      hpCurrent: 2 + rest.body.healed,
      hitDiceSpent: { "6": 2 },
    });

    const tooMany = await call(p2, "POST", `/characters/${elaria}/short-rest`, {
      hitDice: { "6": 4 },
    });
    expect(tooMany.status).toBe(400);

    await call(p2, "PATCH", `/characters/${elaria}/state`, {
      version: rest.body.state.version,
      exhaustion: 2,
      spellSlotsUsed: { "1": 3 },
    });
    const long = await call(p2, "POST", `/characters/${elaria}/long-rest`);
    expect(long.body.state).toMatchObject({
      hpCurrent: 32,
      hitDiceSpent: {},
      spellSlotsUsed: {},
      exhaustion: 1,
    });
  });
});

describe("state edits", () => {
  it("rejects edits made against an old version", async () => {
    const p2 = await loginAs(app, SEED.player2.id);
    const { body } = await call(p2, "GET", `/characters/${elaria}`);
    const v = body.state.version;
    expect(
      (
        await call(p2, "PATCH", `/characters/${elaria}/state`, {
          version: v,
          heroicInspiration: true,
        })
      ).status,
    ).toBe(200);
    const stale = await call(p2, "PATCH", `/characters/${elaria}/state`, {
      version: v,
      conditions: ["prone"],
    });
    expect(stale.status).toBe(409);
  });
});

describe("inventory", () => {
  it("adds, equips and removes items; attunement caps at three", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const added = await call(p1, "POST", `/characters/${brunhild}/items`, {
      kind: "weapon",
      itemId: "longsword",
    });
    expect(added.status).toBe(201);
    const sword = added.body.items.find((i) => i.itemId === "longsword")!;
    const bogus = await call(p1, "POST", `/characters/${brunhild}/items`, {
      kind: "weapon",
      itemId: "lightsaber",
    });
    expect(bogus.status).toBe(400);

    const equipped = await call(p1, "PATCH", `/characters/${brunhild}/items/${sword.id}`, {
      equipped: true,
    });
    expect(equipped.body.items.find((i) => i.id === sword.id)!.equipped).toBe(true);

    const magic: string[] = [];
    for (const itemId of [
      "ring-of-protection",
      "cloak-of-protection",
      "amulet-of-health",
      "boots-of-speed",
    ]) {
      const r = await call(p1, "POST", `/characters/${brunhild}/items`, {
        kind: "magic-item",
        itemId,
      });
      magic.push(r.body.items.find((i) => i.itemId === itemId)!.id);
    }
    for (const id of magic.slice(0, 3)) {
      expect(
        (await call(p1, "PATCH", `/characters/${brunhild}/items/${id}`, { attuned: true })).status,
      ).toBe(200);
    }
    expect(
      (await call(p1, "PATCH", `/characters/${brunhild}/items/${magic[3]}`, { attuned: true }))
        .status,
    ).toBe(409);

    const removed = await call(p1, "DELETE", `/characters/${brunhild}/items/${sword.id}`);
    expect(removed.body.items.some((i) => i.id === sword.id)).toBe(false);
  });
});
