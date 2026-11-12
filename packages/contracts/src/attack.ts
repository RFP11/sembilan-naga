import { z } from "zod";

// An attack from start to finish: pick a target, roll against its AC, and only on a hit roll
// damage, which is taken off the target right away. All rolled and checked on the server.

export const attackMode = z.enum(["normal", "advantage", "disadvantage"]);
export type AttackMode = z.infer<typeof attackMode>;

const attackSource = z.discriminatedUnion("kind", [
  /** An action in a monster's stat block. */
  z.object({ kind: z.literal("monster"), entry: z.string().max(100) }),
  /** A weapon in a character's inventory. */
  z.object({
    kind: z.literal("weapon"),
    itemId: z.uuid(),
    versatile: z.boolean().default(false),
  }),
]);

export const startAttackRequest = z.object({
  attackerTokenId: z.uuid(),
  targetTokenId: z.uuid(),
  source: attackSource,
  mode: attackMode.default("normal"),
  /** Answering an opportunity attack prompt: this uses the attacker's reaction. */
  reactionId: z.uuid().optional(),
});
export type StartAttackRequest = z.input<typeof startAttackRequest>;

export const damageOption = z.object({
  dice: z.string(),
  type: z.string(),
  /** Some damage only applies "if the attack roll had Advantage" and the like. */
  conditional: z.boolean(),
  selected: z.boolean(),
});
export type DamageOption = z.infer<typeof damageOption>;

export const attackResult = z.object({
  /** Null on a miss: there's no damage to roll. */
  id: z.uuid().nullable(),
  attackerName: z.string(),
  targetName: z.string(),
  name: z.string(),
  mode: attackMode,
  rolls: z.array(z.number().int()),
  toHit: z.number().int(),
  total: z.number().int(),
  hit: z.boolean(),
  critical: z.boolean(),
  /** Null for players: a target's AC is the DM's to reveal. */
  targetAc: z.number().int().nullable(),
  description: z.string().nullable(),
  damage: z.array(damageOption),
});
export type AttackResult = z.infer<typeof attackResult>;

export const rollDamageRequest = z.object({
  /** Positions in the attack's damage list. */
  include: z.array(z.number().int().min(0)).max(20),
  /** Dice from elsewhere that are easy to forget, such as Sneak Attack: "2d6". */
  extraDice: z
    .string()
    .trim()
    .regex(/^\d{1,2}d\d{1,3}([+-]\d{1,3})?$/)
    .optional(),
});
export type RollDamageRequest = z.infer<typeof rollDamageRequest>;

export const damageResult = z.object({
  parts: z.array(
    z.object({
      dice: z.string(),
      type: z.string(),
      rolled: z.number().int(),
      applied: z.number().int(),
      /** "kebal", "tahan" or "rentan" when it changed the amount. */
      note: z.string().nullable(),
    }),
  ),
  critical: z.boolean(),
  applied: z.number().int(),
  targetName: z.string(),
  targetDown: z.boolean(),
  /** The Constitution save the target now has to make to keep concentrating. */
  concentrationDc: z.number().int().nullable(),
  concentratingOn: z.string().nullable(),
});
export type DamageResult = z.infer<typeof damageResult>;
