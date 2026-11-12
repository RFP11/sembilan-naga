import {
  campaignRoom,
  rollDamageRequest,
  startAttackRequest,
  type AttackResult,
  type DamageResult,
  type DamageOption,
} from "@dnd/contracts";
import { parseDice } from "@dnd/rules";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireUser } from "../auth/plugin";
import { recordRoll } from "../campaigns/rolls";
import type { Db } from "../db";
import {
  characters,
  combatants,
  encounters,
  pendingAttacks,
  reactionPrompts,
  scenes,
  tokens,
} from "../db/schema";
import type { IO } from "../plugins/socket";
import { sceneAccess } from "./access";
import {
  characterAttack,
  combatStats,
  damageAfterDefenses,
  damageCharacter,
  damageOptions,
  monsterAttack,
} from "./combat";

const attackParams = z.object({ id: z.uuid(), attackId: z.uuid() });
const d20 = () => randomInt(1, 21);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export const attackRoutes: FastifyPluginAsync<{ db: Db; io: IO }> = async (app, { db, io }) => {
  app.addHook("preHandler", requireUser);
  const { member, activeSceneId } = sceneAccess(db);

  const tokenInCampaign = async (campaignId: string, tokenId: string) => {
    const [row] = await db.orm
      .select({ token: tokens, ownerId: characters.ownerId })
      .from(tokens)
      .innerJoin(scenes, eq(tokens.sceneId, scenes.id))
      .leftJoin(characters, eq(tokens.characterId, characters.id))
      .where(and(eq(tokens.id, tokenId), eq(scenes.campaignId, campaignId)));
    return row ?? null;
  };

  const announce = (campaignId: string) => {
    const room = io.to(campaignRoom(campaignId));
    room.emit("tokens:changed", { campaignId });
    room.emit("encounter:changed", { campaignId });
  };

  /** Rolls against the target's AC. Damage can only follow from a hit. */
  app.post("/campaigns/:id/attacks", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const parsed = startAttackRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "data serangan tidak lengkap" });
    const body = parsed.data;
    const isGm = m.role === "gm";

    const attacker = await tokenInCampaign(m.campaignId, body.attackerTokenId);
    const target = await tokenInCampaign(m.campaignId, body.targetTokenId);
    if (!attacker || !target) return reply.code(404).send({ error: "token tidak ditemukan" });
    if (attacker.token.sceneId !== target.token.sceneId)
      return reply.code(400).send({ error: "target ada di peta lain" });
    if (attacker.token.id === target.token.id)
      return reply.code(400).send({ error: "tidak bisa menyerang diri sendiri" });
    if (!isGm) {
      // As far as a player can tell, a hidden token doesn't exist: same answer as a wrong id.
      if (target.token.hidden) return reply.code(404).send({ error: "token tidak ditemukan" });
      if (attacker.ownerId !== req.user!.id)
        return reply.code(403).send({ error: "itu bukan tokenmu" });
      if ((await activeSceneId(m.campaignId)) !== attacker.token.sceneId)
        return reply.code(404).send({ error: "token tidak ditemukan" });
    }

    const advantage = body.mode === "advantage";
    let name: string;
    let toHit: number;
    let damage: DamageOption[];
    let description: string | null = null;
    if (body.source.kind === "monster") {
      const found = monsterAttack(attacker.token, body.source.entry);
      if (!found) return reply.code(400).send({ error: "serangan itu tidak dikenal" });
      name = found.entry.name;
      toHit = found.toHit;
      damage = damageOptions(found.entry, advantage);
      description = found.entry.description;
    } else {
      const found = await characterAttack(
        db.orm,
        attacker.token,
        body.source.itemId,
        body.source.versatile,
      );
      if (!found) return reply.code(400).send({ error: "senjata itu tidak dikenal" });
      name = found.name;
      toHit = found.toHit;
      damage = found.damage;
    }

    if (body.reactionId) {
      const [prompt] = await db.orm
        .delete(reactionPrompts)
        .where(
          and(
            eq(reactionPrompts.id, body.reactionId),
            eq(reactionPrompts.reactorTokenId, attacker.token.id),
          ),
        )
        .returning({ encounterId: reactionPrompts.encounterId });
      if (!prompt) return reply.code(409).send({ error: "reaction itu sudah tidak berlaku" });
      await db.orm
        .update(combatants)
        .set({ reactionUsed: true })
        .where(
          and(
            eq(combatants.encounterId, prompt.encounterId),
            eq(combatants.tokenId, attacker.token.id),
          ),
        );
    }

    const stats = await combatStats(db.orm, target.token);
    const rolls = body.mode === "normal" ? [d20()] : [d20(), d20()];
    const natural = body.mode === "disadvantage" ? Math.min(...rolls) : Math.max(...rolls);
    const total = natural + toHit;
    const critical = natural === 20;
    // A natural 20 always hits and a natural 1 always misses, whatever the numbers say.
    const hit = critical || (natural !== 1 && total >= stats.ac);

    // In the open unless that would give away a hidden token.
    const secret = attacker.token.hidden || target.token.hidden;
    const outcome = critical ? "KRITIS" : hit ? "KENA" : "MELESET";
    await recordRoll(db.orm, io, {
      campaignId: m.campaignId,
      user: req.user!,
      expression: `1d20${signed(toHit)}${body.mode === "normal" ? "" : body.mode === "advantage" ? " adv" : " dis"}`,
      label: `${attacker.token.name} → ${target.token.name}: ${name} · ${outcome}`,
      rolls,
      total,
      secret,
    });
    if (body.reactionId) announce(m.campaignId);

    let id: string | null = null;
    if (hit) {
      await db.orm
        .delete(pendingAttacks)
        .where(eq(pendingAttacks.attackerTokenId, attacker.token.id));
      const [row] = await db.orm
        .insert(pendingAttacks)
        .values({
          attackerTokenId: attacker.token.id,
          targetTokenId: target.token.id,
          userId: req.user!.id,
          name,
          critical,
          secret,
          damage,
        })
        .returning({ id: pendingAttacks.id });
      id = row!.id;
    }

    return reply.code(201).send({
      id,
      attackerName: attacker.token.name,
      targetName: target.token.name,
      name,
      mode: body.mode,
      rolls,
      toHit,
      total,
      hit,
      critical,
      targetAc: isGm ? stats.ac : null,
      description,
      damage,
    } satisfies AttackResult);
  });

  /** Rolls the damage of a hit and takes it off the target. Works once per hit. */
  app.post("/campaigns/:id/attacks/:attackId/damage", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const params = attackParams.safeParse(req.params);
    const parsed = rollDamageRequest.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    if (!parsed.success) return reply.code(400).send({ error: "rumus damage tidak valid" });

    const [pending] = await db.orm
      .select()
      .from(pendingAttacks)
      .where(eq(pendingAttacks.id, params.data.attackId));
    if (!pending) return reply.code(404).send({ error: "serangan ini sudah selesai" });
    if (pending.userId !== req.user!.id && m.role !== "gm")
      return reply.code(403).send({ error: "itu bukan seranganmu" });
    const target = await tokenInCampaign(m.campaignId, pending.targetTokenId);
    if (!target) return reply.code(404).send({ error: "target sudah tidak ada" });

    const options = pending.damage as DamageOption[];
    const chosen = parsed.data.include.flatMap((i) => (options[i] ? [options[i]] : []));
    const firstType = chosen[0]?.type ?? options[0]?.type ?? "bludgeoning";
    const toRoll = [
      ...chosen.map((o) => ({ dice: o.dice, type: o.type })),
      ...(parsed.data.extraDice ? [{ dice: parsed.data.extraDice, type: firstType }] : []),
    ];
    if (toRoll.length === 0) return reply.code(400).send({ error: "pilih damage dulu" });

    const stats = await combatStats(db.orm, target.token);
    const allRolls: number[] = [];
    const parts = toRoll.map(({ dice, type }) => {
      const { count, sides, modifier } = parseDice(dice);
      // A critical hit rolls the damage dice twice; the modifier still counts once.
      const rolled = Array.from({ length: pending.critical ? count * 2 : count }, () =>
        randomInt(1, sides + 1),
      );
      allRolls.push(...rolled);
      const amount = Math.max(0, rolled.reduce((a, b) => a + b, 0) + modifier);
      return { dice, type, rolled: amount, ...damageAfterDefenses(amount, type, stats) };
    });
    const applied = parts.reduce((sum, p) => sum + p.applied, 0);

    // The damage counts once, even if the button is pressed twice.
    const [claimed] = await db.orm
      .delete(pendingAttacks)
      .where(eq(pendingAttacks.id, pending.id))
      .returning({ id: pendingAttacks.id });
    if (!claimed) return reply.code(404).send({ error: "serangan ini sudah selesai" });

    let targetDown = false;
    let concentrationDc: number | null = null;
    let concentratingOn: string | null = null;
    if (stats.character) {
      const result = await damageCharacter(db.orm, io, stats.character, applied, pending.critical);
      targetDown = result.current === 0;
      concentratingOn = stats.character.state.concentratingOn;
      if (concentratingOn && applied > 0) {
        concentrationDc = Math.min(30, Math.max(10, Math.floor(applied / 2)));
      }
    } else if (target.token.hpMax !== null) {
      const hpCurrent = Math.max(0, (target.token.hpCurrent ?? target.token.hpMax) - applied);
      await db.orm.update(tokens).set({ hpCurrent }).where(eq(tokens.id, target.token.id));
      targetDown = hpCurrent === 0;
    }

    await recordRoll(db.orm, io, {
      campaignId: m.campaignId,
      user: req.user!,
      expression: toRoll
        .map((t) => t.dice)
        .join(" + ")
        .slice(0, 50),
      label: `${pending.name} → ${target.token.name}: ${applied} damage${pending.critical ? " (kritis)" : ""}`,
      rolls: allRolls,
      total: applied,
      secret: pending.secret,
    });
    announce(m.campaignId);

    return {
      parts,
      critical: pending.critical,
      applied,
      targetName: target.token.name,
      targetDown,
      concentrationDc,
      concentratingOn,
    } satisfies DamageResult;
  });

  /** Lets a reaction go. */
  app.delete("/campaigns/:id/reactions/:attackId", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const params = attackParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "not found" });
    const [row] = await db.orm
      .select({
        prompt: reactionPrompts,
        ownerId: characters.ownerId,
        campaignId: encounters.campaignId,
      })
      .from(reactionPrompts)
      .innerJoin(encounters, eq(reactionPrompts.encounterId, encounters.id))
      .innerJoin(tokens, eq(reactionPrompts.reactorTokenId, tokens.id))
      .leftJoin(characters, eq(tokens.characterId, characters.id))
      .where(eq(reactionPrompts.id, params.data.attackId));
    if (!row || row.campaignId !== m.campaignId)
      return reply.code(404).send({ error: "not found" });
    if (m.role !== "gm" && row.ownerId !== req.user!.id)
      return reply.code(403).send({ error: "itu bukan reaction-mu" });
    await db.orm.delete(reactionPrompts).where(eq(reactionPrompts.id, row.prompt.id));
    io.to(campaignRoom(m.campaignId)).emit("encounter:changed", { campaignId: m.campaignId });
    return { ok: true };
  });
};
