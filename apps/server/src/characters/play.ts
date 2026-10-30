// Character sheet actions during play: HP, death saves, rests, state edits, inventory.
// The owner and the campaign's GM may use them; dice are rolled here and logged.

import { deriveCharacter, equippedDefense } from "@dnd/character";
import {
  addItemRequest,
  campaignRoom,
  hpChangeRequest,
  shortRestRequest,
  statePatchRequest,
  updateItemRequest,
  type Character,
  type User,
} from "@dnd/contracts";
import { armor, classes, gear, magicItems, tools, weapons } from "@dnd/data";
import {
  applyDamage,
  applyHealing,
  deathSave,
  grantTempHp,
  hitDicePool,
  type HitPointState,
} from "@dnd/rules";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireUser } from "../auth/plugin";
import { memberRole } from "../campaigns/membership";
import { recordRoll } from "../campaigns/rolls";
import type { Db } from "../db";
import { characterItems, characterState } from "../db/schema";
import type { IO } from "../plugins/socket";
import { loadCharacter } from "./repo";

const idParams = z.object({ id: z.uuid() });
const itemParams = z.object({ id: z.uuid(), itemId: z.uuid() });
const die = (sides: number) => randomInt(1, sides + 1);
const CATALOG = { weapon: weapons, armor, gear, tool: tools, "magic-item": magicItems } as const;

export const playRoutes: FastifyPluginAsync<{ db: Db; io: IO }> = async (app, { db, io }) => {
  app.addHook("preHandler", requireUser);

  /** A ready character the user may play: its owner or the GM of its campaign. */
  async function playable(user: User, rawParams: unknown, reply: FastifyReply) {
    const params = idParams.safeParse(rawParams);
    const c = params.success ? await loadCharacter(db.orm, params.data.id) : undefined;
    const allowed =
      c &&
      (c.ownerId === user.id ||
        (c.campaignId !== null && (await memberRole(db.orm, c.campaignId, user.id)) === "gm"));
    if (!allowed) {
      reply.code(404).send({ error: "not found" });
      return undefined;
    }
    if (!c.state) {
      reply.code(409).send({ error: "finish the character first" });
      return undefined;
    }
    return c as Character & { state: NonNullable<Character["state"]> };
  }

  const maxHp = (c: Character) => deriveCharacter(c.build, equippedDefense(c.items)).maxHp;

  const hpState = (c: Character & { state: NonNullable<Character["state"]> }): HitPointState => ({
    current: c.state.hpCurrent,
    temp: c.state.hpTemp,
    max: maxHp(c),
    deathSaves: c.state.deathSaves,
  });

  /** Writes HP fields, bumps the version, tells the campaign and returns the fresh character. */
  async function saveHp(
    c: Character,
    hp: HitPointState,
    extra: Partial<typeof characterState.$inferInsert> = {},
  ) {
    await db.orm
      .update(characterState)
      .set({
        hpCurrent: hp.current,
        hpTemp: hp.temp,
        deathSaveSuccess: hp.deathSaves.success,
        deathSaveFail: hp.deathSaves.fail,
        ...extra,
        version: sql`${characterState.version} + 1`,
      })
      .where(eq(characterState.characterId, c.id));
    return changed(c);
  }

  async function changed(c: Character) {
    if (c.campaignId)
      io.to(campaignRoom(c.campaignId)).emit("character:updated", {
        campaignId: c.campaignId,
        characterId: c.id,
      });
    return loadCharacter(db.orm, c.id);
  }

  app.post("/characters/:id/hp", async (req, reply) => {
    const c = await playable(req.user!, req.params, reply);
    if (!c) return;
    const parsed = hpChangeRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    const { type, amount, critical } = parsed.data;
    const hp = hpState(c);
    if (type === "damage") {
      const result = applyDamage(hp, amount, { critical });
      const character = await saveHp(c, result);
      return { ...character, dead: result.dead };
    }
    return saveHp(c, type === "heal" ? applyHealing(hp, amount) : grantTempHp(hp, amount));
  });

  /** Rolls a Death Saving Throw on the server (only at 0 HP) and logs it. */
  app.post("/characters/:id/death-save", async (req, reply) => {
    const c = await playable(req.user!, req.params, reply);
    if (!c) return;
    if (c.state.hpCurrent > 0) return reply.code(409).send({ error: "only at 0 Hit Points" });
    const d20 = die(20);
    const result = deathSave(hpState(c), d20);
    if (c.campaignId) {
      await recordRoll(db.orm, io, {
        campaignId: c.campaignId,
        user: req.user!,
        expression: "1d20",
        label: `${c.build.name}: Death Saving Throw`,
        rolls: [d20],
        total: d20,
      });
    }
    const character = await saveHp(c, result);
    return { ...character, roll: d20, stable: result.stable, dead: result.dead };
  });

  app.patch("/characters/:id/state", async (req, reply) => {
    const c = await playable(req.user!, req.params, reply);
    if (!c) return;
    const parsed = statePatchRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    const { version, deathSaves, ...rest } = parsed.data;
    const updated = await db.orm
      .update(characterState)
      .set({
        ...rest,
        ...(deathSaves && { deathSaveSuccess: deathSaves.success, deathSaveFail: deathSaves.fail }),
        version: sql`${characterState.version} + 1`,
      })
      .where(and(eq(characterState.characterId, c.id), eq(characterState.version, version)))
      .returning({ version: characterState.version });
    if (!updated.length) {
      return reply
        .code(409)
        .send({ error: "the sheet changed meanwhile; reload it", character: c });
    }
    return changed(c);
  });

  /** Spends Hit Point Dice: each heals its roll + Con modifier (minimum 1). Recharges Pact Magic. */
  app.post("/characters/:id/short-rest", async (req, reply) => {
    const c = await playable(req.user!, req.params, reply);
    if (!c) return;
    const parsed = shortRestRequest.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    if (c.state.hpCurrent < 1)
      return reply.code(409).send({ error: "you need at least 1 Hit Point to rest" });

    const derived = deriveCharacter(c.build, equippedDefense(c.items));
    const pool = hitDicePool(
      c.build.levels.map((l) => ({ hitDie: classes.find((x) => x.id === l.classId)?.hitDie ?? 8 })),
    );
    const spent = { ...(c.state.hitDiceSpent as Record<string, number>) };
    const rolls: number[] = [];
    for (const [size, count] of Object.entries(parsed.data.hitDice)) {
      const available = (pool[Number(size)] ?? 0) - (spent[size] ?? 0);
      if (count > available)
        return reply.code(400).send({ error: `only ${available} d${size} left` });
      for (let i = 0; i < count; i++) rolls.push(die(Number(size)));
      spent[size] = (spent[size] ?? 0) + count;
    }
    const conMod = derived.modifiers?.con ?? 0;
    const healed = rolls.reduce((sum, r) => sum + Math.max(1, r + conMod), 0);

    if (rolls.length && c.campaignId) {
      const dice = Object.entries(parsed.data.hitDice)
        .filter(([, n]) => n > 0)
        .map(([size, n]) => `${n}d${size}`)
        .join("+");
      await recordRoll(db.orm, io, {
        campaignId: c.campaignId,
        user: req.user!,
        expression: conMod ? `${dice}${conMod > 0 ? "+" : ""}${conMod * rolls.length}` : dice,
        label: `${c.build.name}: Short Rest (healed ${healed})`,
        rolls,
        total: healed,
      });
    }
    const character = await saveHp(c, applyHealing(hpState(c), healed), {
      hitDiceSpent: spent,
      pactSlotsUsed: 0,
    });
    return { ...character, healed };
  });

  /** Regain all HP and Hit Point Dice, recover spell slots, reduce Exhaustion by 1. */
  app.post("/characters/:id/long-rest", async (req, reply) => {
    const c = await playable(req.user!, req.params, reply);
    if (!c) return;
    if (c.state.hpCurrent < 1)
      return reply.code(409).send({ error: "you need at least 1 Hit Point to rest" });
    return saveHp(
      c,
      { current: maxHp(c), temp: 0, max: maxHp(c), deathSaves: { success: 0, fail: 0 } },
      {
        hitDiceSpent: {},
        spellSlotsUsed: {},
        pactSlotsUsed: 0,
        featureUses: {},
        exhaustion: Math.max(0, c.state.exhaustion - 1),
      },
    );
  });

  // ── Inventory ──

  app.post("/characters/:id/items", async (req, reply) => {
    const c = await playable(req.user!, req.params, reply);
    if (!c) return;
    const parsed = addItemRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    const item = parsed.data;
    if (item.kind !== "custom" && !CATALOG[item.kind].some((i) => i.id === item.itemId)) {
      return reply.code(400).send({ error: `unknown ${item.kind} "${item.itemId}"` });
    }
    await db.orm.insert(characterItems).values({
      characterId: c.id,
      kind: item.kind,
      quantity: item.quantity,
      ...(item.kind === "custom"
        ? { name: item.name }
        : { itemId: item.itemId, variant: item.variant }),
    });
    return reply.code(201).send(await changed(c));
  });

  app.patch("/characters/:id/items/:itemId", async (req, reply) => {
    const params = itemParams.safeParse(req.params);
    const c = await playable(req.user!, req.params, reply);
    if (!c || !params.success)
      return params.success ? undefined : reply.code(404).send({ error: "not found" });
    const parsed = updateItemRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    if (parsed.data.attuned) {
      const attuned = c.items.filter((i) => i.attuned && i.id !== params.data.itemId).length;
      if (attuned >= 3)
        return reply.code(409).send({ error: "you can attune to at most 3 magic items" });
    }
    const updated = await db.orm
      .update(characterItems)
      .set(parsed.data)
      .where(and(eq(characterItems.id, params.data.itemId), eq(characterItems.characterId, c.id)))
      .returning({ id: characterItems.id });
    if (!updated.length) return reply.code(404).send({ error: "no such item" });
    return changed(c);
  });

  app.delete("/characters/:id/items/:itemId", async (req, reply) => {
    const params = itemParams.safeParse(req.params);
    const c = await playable(req.user!, req.params, reply);
    if (!c || !params.success)
      return params.success ? undefined : reply.code(404).send({ error: "not found" });
    await db.orm
      .delete(characterItems)
      .where(and(eq(characterItems.id, params.data.itemId), eq(characterItems.characterId, c.id)));
    return changed(c);
  });
};
