import { classChoiceKey as key } from "@dnd/character";
import type { Character, DiceRollResult } from "@dnd/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

type Sheet = Character & {
  state: NonNullable<Character["state"]>;
  hpGained: number;
  hpRoll?: number;
};
const call = async <T = Sheet>(
  cookie: string,
  url: string,
  payload?: unknown,
  method: "GET" | "POST" = "POST",
) => {
  const res = await app.inject({
    method,
    url: `/api${url}`,
    headers: { cookie },
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.json() as T };
};
const byName = (name: string) => SEED_CHARACTERS.find((c) => c.build.name === name)!.id;
const brunhild = byName("Brunhild Stonefist"); // Dwarf Fighter 1: 13 HP, Con 14
const kara = byName("Kara Emberveil"); // Fighter 2 / Warlock 1

describe("level-up", () => {
  it("adds a level with fixed Hit Points and raises current HP and XP", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const up = await call(p1, `/characters/${brunhild}/level-up`, { classId: "fighter" });
    expect(up.status).toBe(200);
    // d10 fixed 6 + Con 2 + Dwarven Toughness 1
    expect(up.body).toMatchObject({ hpGained: 9, xp: 300, state: { hpCurrent: 22 } });
    expect(up.body.build.levels).toHaveLength(2);
  });

  it("rolls Hit Points on the server, logs the roll, and takes the subclass at level 3", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const up = await call(p1, `/characters/${brunhild}/level-up`, {
      classId: "fighter",
      hp: "roll",
    });
    expect(up.body.hpRoll).toBeGreaterThanOrEqual(1);
    expect(up.body.hpGained).toBe(Math.max(1, up.body.hpRoll! + 2) + 1);
    expect(up.body.build.levels[2]).toMatchObject({
      classId: "fighter",
      subclassId: "champion",
      hpRoll: up.body.hpRoll,
    });

    const log = await call<DiceRollResult[]>(
      p1,
      `/campaigns/${SEED.campaign.id}/rolls`,
      undefined,
      "GET",
    );
    expect(log.body[0]).toMatchObject({
      label: "Brunhild Stonefist: Hit Points for level 3",
      total: up.body.hpRoll,
    });
  });

  it("requires the Ability Score Improvement at level 4 and applies it", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const missing = await call<{ issues: string[] }>(p1, `/characters/${brunhild}/level-up`, {
      classId: "fighter",
    });
    expect(missing.status).toBe(422);
    expect(missing.body.issues).toContain(
      "Fighter (level 4): choose a feat or Ability Score Improvement.",
    );

    const up = await call(p1, `/characters/${brunhild}/level-up`, {
      classId: "fighter",
      choices: {
        [key.feat(4)]: "ability-score-improvement",
        [key.featAbilities(4)]: ["str", "con"],
        // Fighter 4 knows one more Weapon Mastery.
        [key.weaponMastery("fighter")]: ["greatsword", "flail", "javelin", "longbow"],
        // Not a level-up choice: ignored.
        "class:fighter:skills": ["arcana", "history"],
      },
    });
    expect(up.status).toBe(200);
    expect(up.body.build.choices["class:fighter:skills"]).toEqual(["perception", "survival"]);
    // Con 14 → 15 keeps +2, so HP: 6 + 2 + 1
    expect(up.body.hpGained).toBe(9);
  });

  it("checks multiclassing prerequisites", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const res = await call<{ issues: string[] }>(p1, `/characters/${brunhild}/level-up`, {
      classId: "wizard",
    });
    expect(res.status).toBe(422);
    expect(res.body.issues).toEqual(["wizard needs int 13+"]);
  });

  it("asks a Warlock for the extra Eldritch Invocations of the new level", async () => {
    const p2 = await loginAs(app, SEED.player2.id);
    const missing = await call<{ issues: string[] }>(p2, `/characters/${kara}/level-up`, {
      classId: "warlock",
    });
    expect(missing.body.issues).toContain("Warlock: choose 3 Eldritch Invocations.");
    const up = await call(p2, `/characters/${kara}/level-up`, {
      classId: "warlock",
      choices: {
        [key.invocations("warlock")]: ["pact-of-the-blade", "devils-sight", "armor-of-shadows"],
      },
    });
    expect(up.status).toBe(200);
    expect(up.body.build.levels.map((l) => l.classId)).toEqual([
      "fighter",
      "fighter",
      "warlock",
      "warlock",
    ]);
  });

  it("is only for the owner and the campaign GM", async () => {
    const p2 = await loginAs(app, SEED.player2.id);
    expect(
      (await call(p2, `/characters/${brunhild}/level-up`, { classId: "fighter" })).status,
    ).toBe(404);
  });
});
