import { deriveCharacter, equippedDefense } from "@dnd/character";
import {
  addCombatantsRequest,
  TOKEN_CELLS,
  campaignRoom,
  nextTurnRequest,
  setInitiativeRequest,
  startEncounterRequest,
  type Encounter,
  type EncounterResponse,
} from "@dnd/contracts";
import { monsters } from "@dnd/data/monsters";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireUser } from "../auth/plugin";
import { loadCharacter } from "../characters/repo";
import type { Db, Orm } from "../db";
import { characters, combatants, encounters, reactionPrompts, tokens } from "../db/schema";
import type { IO } from "../plugins/socket";
import { sceneAccess } from "./access";
import { combatStats, turnReminders } from "./combat";

const combatantParams = z.object({ id: z.uuid(), combatantId: z.uuid() });

type TokenRow = typeof tokens.$inferSelect;
type EncounterRow = typeof encounters.$inferSelect;

/** Initiative order: highest first, with a fixed tie-break so the order never shuffles. */
const orderedCombatants = (orm: Orm, encounterId: string) =>
  orm
    .select({
      combatant: combatants,
      token: tokens,
      ownerId: characters.ownerId,
    })
    .from(combatants)
    .innerJoin(tokens, eq(combatants.tokenId, tokens.id))
    .leftJoin(characters, eq(tokens.characterId, characters.id))
    .where(eq(combatants.encounterId, encounterId))
    .orderBy(desc(combatants.initiative), asc(combatants.id));

/**
 * Takes a token out of the fight. If it was acting, the turn passes on first; otherwise the
 * next person would lose theirs when the order is read again. The last one out ends the fight.
 */
export async function removeFromEncounter(orm: Orm, tokenId: string) {
  const [row] = await orm
    .select({ combatant: combatants, encounter: encounters })
    .from(combatants)
    .innerJoin(encounters, eq(combatants.encounterId, encounters.id))
    .where(eq(combatants.tokenId, tokenId));
  if (!row) return false;
  const { combatant, encounter } = row;

  const order = await orderedCombatants(orm, encounter.id);
  const rest = order.filter((o) => o.combatant.id !== combatant.id);
  if (rest.length === 0) {
    await orm.delete(encounters).where(eq(encounters.id, encounter.id));
    return true;
  }
  if (encounter.currentCombatantId === combatant.id) {
    const index = order.findIndex((o) => o.combatant.id === combatant.id);
    const wraps = index === order.length - 1;
    await orm
      .update(encounters)
      .set({
        currentCombatantId: order[wraps ? 0 : index + 1]!.combatant.id,
        round: wraps ? encounter.round + 1 : encounter.round,
      })
      .where(eq(encounters.id, encounter.id));
  }
  await orm.delete(combatants).where(eq(combatants.id, combatant.id));
  return true;
}

/** Empty squares between two tokens, whatever their sizes; 0 means touching. */
function gapBetween(
  a: { x: number; y: number; size: TokenRow["size"] },
  b: { x: number; y: number; size: TokenRow["size"] },
) {
  const gap = (from: number, sizeA: number, to: number, sizeB: number) =>
    Math.max(0, Math.max(from, to) - Math.min(from + sizeA, to + sizeB));
  const sizeA = TOKEN_CELLS[a.size];
  const sizeB = TOKEN_CELLS[b.size];
  return Math.max(gap(a.x, sizeA, b.x, sizeB), gap(a.y, sizeA, b.y, sizeB));
}

const areEnemies = (a: TokenRow["kind"], b: TokenRow["kind"]) =>
  (a === "character" && b === "monster") || (a === "monster" && b === "character");

/**
 * After a move: who can now take an opportunity attack on the mover? Those who had it in reach
 * and don't any more, on the mover's own turn, with their reaction still unused. NPCs are left
 * out because nothing says which side they're on. Returns whether anyone was prompted.
 */
export async function noteOpportunities(
  orm: Orm,
  tokenId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const [row] = await orm
    .select({ combatant: combatants, encounter: encounters, token: tokens })
    .from(combatants)
    .innerJoin(encounters, eq(combatants.encounterId, encounters.id))
    .innerJoin(tokens, eq(combatants.tokenId, tokens.id))
    .where(eq(combatants.tokenId, tokenId));
  if (!row || row.encounter.currentCombatantId !== row.combatant.id) return false;
  const mover = row.token;

  const others = await orderedCombatants(orm, row.encounter.id);
  let prompted = false;
  for (const other of others) {
    if (other.token.id === mover.id || other.combatant.reactionUsed) continue;
    if (!areEnemies(mover.kind, other.token.kind)) continue;
    const stats = await combatStats(orm, other.token);
    if (stats.reach === 0) continue;
    // Someone at 0 HP makes no attacks.
    const hp = stats.character ? stats.character.state.hpCurrent : other.token.hpCurrent;
    if (hp === 0) continue;
    const before = gapBetween({ ...from, size: mover.size }, other.token);
    const after = gapBetween({ ...to, size: mover.size }, other.token);
    if (before < stats.reach && after >= stats.reach) {
      await orm
        .insert(reactionPrompts)
        .values({
          encounterId: row.encounter.id,
          reactorTokenId: other.token.id,
          targetTokenId: mover.id,
        })
        .onConflictDoNothing();
      prompted = true;
    }
  }
  return prompted;
}

export const encounterRoutes: FastifyPluginAsync<{ db: Db; io: IO }> = async (app, { db, io }) => {
  app.addHook("preHandler", requireUser);
  const { member, gm, activeSceneId, loadScene } = sceneAccess(db);

  const announce = (campaignId: string) =>
    io.to(campaignRoom(campaignId)).emit("encounter:changed", { campaignId });

  const loadEncounter = async (campaignId: string) => {
    const [row] = await db.orm
      .select()
      .from(encounters)
      .where(eq(encounters.campaignId, campaignId));
    return row ?? null;
  };

  /** 1d20 plus what the stat block or character sheet says. */
  const rollInitiative = async (token: TokenRow) => {
    let bonus = 0;
    if (token.monsterId) {
      bonus = monsters.find((m) => m.id === token.monsterId)?.initiative.bonus ?? 0;
    } else if (token.characterId) {
      const character = await loadCharacter(db.orm, token.characterId);
      if (character) {
        bonus = deriveCharacter(character.build, equippedDefense(character.items)).initiative;
      }
    }
    return randomInt(1, 21) + bonus;
  };

  /** Tokens of this map out of the ones asked for; anything else is ignored. */
  const tokensOnScene = (sceneId: string, ids: string[]) =>
    db.orm
      .select()
      .from(tokens)
      .where(and(eq(tokens.sceneId, sceneId), inArray(tokens.id, ids)));

  /** The encounter as this viewer may see it. */
  const present = async (
    row: EncounterRow,
    viewerId: string,
    isGm: boolean,
  ): Promise<Encounter> => {
    const order = await orderedCombatants(db.orm, row.id);
    const found = order.findIndex((o) => o.combatant.id === row.currentCombatantId);
    const start = Math.max(0, found);
    const rotated = order.map((_, i) => ({
      ...order[(start + i) % order.length]!,
      wrapped: start + i >= order.length,
    }));
    const current = rotated[0];

    const visible = rotated.filter((o) => isGm || !o.token.hidden);
    const firstOfNextRound = visible.find((o) => o.wrapped)?.combatant.id;
    const currentVisible = Boolean(current && (isGm || !current.token.hidden));
    const controlsCurrent = currentVisible && (isGm || current!.ownerId === viewerId);

    const stats = new Map(
      await Promise.all(
        visible.map(async (o) => [o.token.id, await combatStats(db.orm, o.token)] as const),
      ),
    );
    const prompts = await db.orm
      .select()
      .from(reactionPrompts)
      .where(eq(reactionPrompts.encounterId, row.id));
    const nameOf = (id: string) => order.find((o) => o.token.id === id);
    const reactions = prompts.flatMap((p) => {
      const reactor = nameOf(p.reactorTokenId);
      const target = nameOf(p.targetTokenId);
      if (!reactor || !target) return [];
      if (!isGm && reactor.ownerId !== viewerId) return [];
      return [
        {
          id: p.id,
          reactorTokenId: p.reactorTokenId,
          reactorName: reactor.token.name,
          targetTokenId: p.targetTokenId,
          targetName: target.token.name,
        },
      ];
    });

    return {
      id: row.id,
      sceneId: row.sceneId,
      round: row.round,
      currentId: currentVisible ? current!.combatant.id : null,
      canEndTurn: controlsCurrent,
      reactions,
      reminders: controlsCurrent
        ? turnReminders(current!.token, stats.get(current!.token.id)?.character ?? null)
        : [],
      currentCharacterId: controlsCurrent ? current!.token.characterId : null,
      combatants: visible.map((o) => ({
        id: o.combatant.id,
        tokenId: o.token.id,
        name: o.token.name,
        kind: o.token.kind,
        initiative: o.combatant.initiative,
        hidden: isGm && o.token.hidden,
        hpCurrent: isGm ? o.token.hpCurrent : null,
        hpMax: isGm ? o.token.hpMax : null,
        ac: isGm ? (stats.get(o.token.id)?.ac ?? null) : null,
        passivePerception: isGm ? (stats.get(o.token.id)?.passivePerception ?? null) : null,
        reactionUsed: o.combatant.reactionUsed,
        isCurrent: currentVisible && o.combatant.id === current!.combatant.id,
        startsNextRound: o.combatant.id === firstOfNextRound,
      })),
    };
  };

  const send = async (campaignId: string, viewerId: string, isGm: boolean) => {
    const row = await loadEncounter(campaignId);
    if (!row) return { encounter: null } satisfies EncounterResponse;
    return { encounter: await present(row, viewerId, isGm) } satisfies EncounterResponse;
  };

  app.get("/campaigns/:id/encounter", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const isGm = m.role === "gm";
    const row = await loadEncounter(m.campaignId);
    // A fight on a map that isn't on the table is still the DM's secret.
    if (row && !isGm && (await activeSceneId(m.campaignId)) !== row.sceneId) {
      return { encounter: null } satisfies EncounterResponse;
    }
    return send(m.campaignId, req.user!.id, isGm);
  });

  app.post("/campaigns/:id/encounter", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const parsed = startEncounterRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "pilih token dulu" });
    if (await loadEncounter(m.campaignId))
      return reply.code(409).send({ error: "encounter masih berjalan" });
    const sceneId = await activeSceneId(m.campaignId);
    if (!sceneId) return reply.code(409).send({ error: "tayangkan peta dulu" });
    const scene = await loadScene(m.campaignId, sceneId);
    if (!scene) return reply.code(409).send({ error: "tayangkan peta dulu" });
    const chosen = await tokensOnScene(scene.id, parsed.data.tokenIds);
    if (chosen.length === 0) return reply.code(400).send({ error: "token itu tidak ada di peta" });

    const rolled = await Promise.all(
      chosen.map(async (t) => ({ tokenId: t.id, initiative: await rollInitiative(t) })),
    );
    await db.orm.transaction(async (tx) => {
      const [created] = await tx
        .insert(encounters)
        .values({ campaignId: m.campaignId, sceneId: scene.id })
        .returning();
      await tx.insert(combatants).values(rolled.map((r) => ({ ...r, encounterId: created!.id })));
      const [first] = await orderedCombatants(tx, created!.id);
      await tx
        .update(encounters)
        .set({ currentCombatantId: first!.combatant.id })
        .where(eq(encounters.id, created!.id));
    });
    announce(m.campaignId);
    return reply.code(201).send(await send(m.campaignId, req.user!.id, true));
  });

  /** Ends the turn: the DM's to do, or the player's whose character is acting. */
  app.post("/campaigns/:id/encounter/next", async (req, reply) => {
    const m = await member(req, reply);
    if (!m) return reply;
    const parsed = nextTurnRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
    const row = await loadEncounter(m.campaignId);
    if (!row) return reply.code(404).send({ error: "tidak ada encounter" });
    const isGm = m.role === "gm";

    const order = await orderedCombatants(db.orm, row.id);
    const index = order.findIndex((o) => o.combatant.id === row.currentCombatantId);
    const current = order[index];
    if (!current || current.combatant.id !== parsed.data.currentId) {
      // Someone else already moved it on; the client catches up by fetching again.
      return reply.code(409).send({ error: "giliran sudah berganti" });
    }
    if (!isGm && current.ownerId !== req.user!.id)
      return reply.code(403).send({ error: "bukan giliranmu" });

    const wraps = index === order.length - 1;
    const [moved] = await db.orm
      .update(encounters)
      .set({
        currentCombatantId: order[wraps ? 0 : index + 1]!.combatant.id,
        round: wraps ? row.round + 1 : row.round,
      })
      .where(
        and(eq(encounters.id, row.id), eq(encounters.currentCombatantId, current.combatant.id)),
      )
      .returning({ id: encounters.id });
    if (!moved) return reply.code(409).send({ error: "giliran sudah berganti" });
    // A reaction comes back at the start of one's own turn; the chance to answer a move is over.
    await db.orm
      .update(combatants)
      .set({ reactionUsed: false })
      .where(eq(combatants.id, order[wraps ? 0 : index + 1]!.combatant.id));
    await db.orm.delete(reactionPrompts).where(eq(reactionPrompts.encounterId, row.id));
    announce(m.campaignId);
    return send(m.campaignId, req.user!.id, isGm);
  });

  app.post("/campaigns/:id/encounter/combatants", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const parsed = addCombatantsRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "pilih token dulu" });
    const row = await loadEncounter(m.campaignId);
    if (!row) return reply.code(404).send({ error: "tidak ada encounter" });
    const chosen = await tokensOnScene(row.sceneId, parsed.data.tokenIds);
    const rolled = await Promise.all(
      chosen.map(async (t) => ({
        encounterId: row.id,
        tokenId: t.id,
        initiative: await rollInitiative(t),
      })),
    );
    if (rolled.length > 0) {
      await db.orm.insert(combatants).values(rolled).onConflictDoNothing();
      announce(m.campaignId);
    }
    return send(m.campaignId, req.user!.id, true);
  });

  const inThisEncounter = async (rawParams: unknown, campaignId: string, reply: FastifyReply) => {
    const params = combatantParams.safeParse(rawParams);
    const row = await loadEncounter(campaignId);
    if (!params.success || !row) {
      reply.code(404).send({ error: "not found" });
      return null;
    }
    const [found] = await db.orm
      .select()
      .from(combatants)
      .where(and(eq(combatants.id, params.data.combatantId), eq(combatants.encounterId, row.id)));
    if (!found) {
      reply.code(404).send({ error: "not found" });
      return null;
    }
    return found;
  };

  app.patch("/campaigns/:id/encounter/combatants/:combatantId", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const found = await inThisEncounter(req.params, m.campaignId, reply);
    if (!found) return reply;
    const parsed = setInitiativeRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "angka inisiatif tidak valid" });
    await db.orm
      .update(combatants)
      .set({ initiative: parsed.data.initiative })
      .where(eq(combatants.id, found.id));
    announce(m.campaignId);
    return send(m.campaignId, req.user!.id, true);
  });

  app.delete("/campaigns/:id/encounter/combatants/:combatantId", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const found = await inThisEncounter(req.params, m.campaignId, reply);
    if (!found) return reply;
    await db.orm.transaction((tx) => removeFromEncounter(tx, found.tokenId));
    announce(m.campaignId);
    return send(m.campaignId, req.user!.id, true);
  });

  app.delete("/campaigns/:id/encounter", async (req, reply) => {
    const m = await gm(req, reply);
    if (!m) return reply;
    const [deleted] = await db.orm
      .delete(encounters)
      .where(eq(encounters.campaignId, m.campaignId))
      .returning({ id: encounters.id });
    if (!deleted) return reply.code(404).send({ error: "tidak ada encounter" });
    announce(m.campaignId);
    return { ok: true };
  });
};
