import { choiceKey } from "@dnd/character";
import type { BuildIssue, Character, CharacterBuildInput, CharacterSummary } from "@dnd/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { SEED, SEED_CHARACTERS } from "./db/seed";
import { createTestApp, loginAs } from "./test/setup";

const { app, db } = await createTestApp();
afterAll(async () => {
  await app.close();
  await db.close();
});

const call = async <T>(
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

const complete: CharacterBuildInput = {
  name: "Test Hero",
  speciesId: "orc",
  backgroundId: "soldier",
  alignment: "cg",
  abilityMethod: "point-buy",
  baseScores: { str: 15, dex: 13, con: 14, int: 8, wis: 10, cha: 10 },
  backgroundBonus: { str: 1, dex: 1, con: 1 },
  levels: [{ classId: "barbarian" }],
  choices: { [choiceKey.classSkills("barbarian")]: ["animal-handling", "survival"] },
  equipment: { class: "a", background: "b" },
  languages: ["orc", "giant"],
};

describe("characters", () => {
  it("lists the user's seed characters", async () => {
    const p1 = await loginAs(app, SEED.player1.id);
    const { body } = await call<CharacterSummary[]>(p1, "GET", "/characters");
    expect(body.map((c) => c.name).sort()).toEqual(["Brunhild Stonefist", "Pip", "Tobin Ashgrove"]);
    expect(body.find((c) => c.name === "Pip")).toMatchObject({ status: "draft", level: 1 });
  });

  it("builds a draft step by step, then finalizes it", async () => {
    const p2 = await loginAs(app, SEED.player2.id);
    const created = await call<Character>(p2, "POST", "/characters", {
      campaignId: SEED.campaign.id,
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    // Partial edits keep the rest of the build.
    await call(p2, "PATCH", `/characters/${id}`, {
      build: { name: "Test Hero", speciesId: "orc" },
      builderStep: 1,
    });
    const half = await call<Character & { issues: BuildIssue[] }>(
      p2,
      "PATCH",
      `/characters/${id}`,
      {
        build: { levels: [{ classId: "barbarian" }] },
      },
    );
    expect(half.body.build).toMatchObject({
      name: "Test Hero",
      speciesId: "orc",
      levels: [{ classId: "barbarian" }],
    });
    expect(half.body.builderStep).toBe(1);
    expect(half.body.issues.map((i) => i.step)).toContain("abilities");

    const early = await call<{ issues: BuildIssue[] }>(p2, "POST", `/characters/${id}/finalize`);
    expect(early.status).toBe(422);
    expect(early.body.issues.length).toBeGreaterThan(0);

    await call(p2, "PATCH", `/characters/${id}`, { build: complete });
    const done = await call<Character>(p2, "POST", `/characters/${id}/finalize`);
    expect(done.status).toBe(200);
    // Barbarian d12 + Con 15 (+2) = 14; Soldier package B is 50 GP; Barbarian A has 15 GP.
    expect(done.body).toMatchObject({
      status: "ready",
      xp: 0,
      state: { hpCurrent: 14, coins: { gp: 65 } },
    });
    expect(done.body.items.map((i) => [i.itemId, i.quantity])).toEqual(
      expect.arrayContaining([
        ["greataxe", 1],
        ["handaxe", 4],
      ]),
    );

    const again = await call(p2, "PATCH", `/characters/${id}`, { build: { name: "Renamed" } });
    expect(again.status).toBe(409);
  });

  it("lets the campaign GM read characters but not edit them; others get 404", async () => {
    const brunhild = SEED_CHARACTERS[0]!.id;
    const gm = await loginAs(app, SEED.gm.id);
    const p2 = await loginAs(app, SEED.player2.id);

    const asGm = await call<Character>(gm, "GET", `/characters/${brunhild}`);
    expect(asGm.body).toMatchObject({ status: "ready", state: { hpCurrent: 13 } });
    expect((await call(gm, "PATCH", `/characters/${brunhild}`, { builderStep: 2 })).status).toBe(
      403,
    );
    expect((await call(p2, "GET", `/characters/${brunhild}`)).status).toBe(404);
  });

  it("moves a character between campaigns the owner belongs to", async () => {
    const tobin = SEED_CHARACTERS[2]!.id;
    const p1 = await loginAs(app, SEED.player1.id);

    const roster = async () =>
      (
        await call<CharacterSummary[]>(p1, "GET", `/campaigns/${SEED.campaign.id}/characters`)
      ).body.map((c) => c.name);
    expect(await roster()).not.toContain("Tobin Ashgrove");

    const moved = await call<Character>(p1, "PATCH", `/characters/${tobin}`, {
      campaignId: SEED.campaign.id,
    });
    expect(moved.body.campaignId).toBe(SEED.campaign.id);
    expect(await roster()).toContain("Tobin Ashgrove");

    const other = await call<{ id: string }>(await loginAs(app, SEED.gm.id), "POST", "/campaigns", {
      name: "Elsewhere",
    });
    const refused = await call(p1, "PATCH", `/characters/${tobin}`, { campaignId: other.body.id });
    expect(refused.status).toBe(400);
  });

  it("rolls ability scores on the server and only accepts assignments of those rolls", async () => {
    const p2 = await loginAs(app, SEED.player2.id);
    const { body: draft } = await call<Character>(p2, "POST", "/characters", {});
    const rolled = await call<Character & { issues: BuildIssue[] }>(
      p2,
      "POST",
      `/characters/${draft.id}/roll-abilities`,
    );
    const rolls = rolled.body.build.abilityRolls!;
    expect(rolls).toHaveLength(6);
    expect(rolls.every((r) => r >= 3 && r <= 18)).toBe(true);
    expect(rolled.body.issues.map((i) => i.message)).not.toContain("Roll your ability scores.");

    // Clients can't overwrite the rolls; they're not part of the editable build.
    await call(p2, "PATCH", `/characters/${draft.id}`, {
      build: { abilityRolls: [18, 18, 18, 18, 18, 18] },
    });
    const fake = { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 };
    const cheated = await call<Character & { issues: BuildIssue[] }>(
      p2,
      "PATCH",
      `/characters/${draft.id}`,
      {
        build: { baseScores: fake },
      },
    );
    expect(cheated.body.build.abilityRolls).toEqual(rolls);
    if (rolls.some((r) => r !== 18)) {
      expect(cheated.body.issues.map((i) => i.message)).toContain(
        "Assign each rolled score to one ability.",
      );
    }

    const [str, dex, con, int, wis, cha] = rolls;
    const honest = await call<Character & { issues: BuildIssue[] }>(
      p2,
      "PATCH",
      `/characters/${draft.id}`,
      {
        build: { baseScores: { str, dex, con, int, wis, cha } },
      },
    );
    expect(honest.body.issues.filter((i) => i.step === "abilities")).toEqual([]);
  });

  it("deletes only the owner's characters", async () => {
    const pip = SEED_CHARACTERS[4]!.id;
    expect(
      (await call(await loginAs(app, SEED.player2.id), "DELETE", `/characters/${pip}`)).status,
    ).toBe(404);
    const p1 = await loginAs(app, SEED.player1.id);
    expect((await call(p1, "DELETE", `/characters/${pip}`)).status).toBe(204);
    expect((await call(p1, "GET", `/characters/${pip}`)).status).toBe(404);
  });
});
