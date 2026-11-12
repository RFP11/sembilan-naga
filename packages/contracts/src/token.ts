import { z } from "zod";

// Tokens on a map. Positions are grid cells, for the token's top-left corner.

export const tokenKind = z.enum(["monster", "npc", "character", "object"]);
export type TokenKind = z.infer<typeof tokenKind>;

export const tokenSize = z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
export type TokenSize = z.infer<typeof tokenSize>;

/** Squares a token covers per side. Tiny still takes a whole square, drawn at half size. */
export const TOKEN_CELLS: Record<TokenSize, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export const MAX_TOKENS_AT_ONCE = 20;

export const token = z.object({
  id: z.uuid(),
  sceneId: z.uuid(),
  kind: tokenKind,
  name: z.string(),
  size: tokenSize,
  x: z.number().int(),
  y: z.number().int(),
  /** Only ever true for the DM: players aren't sent hidden tokens at all. */
  hidden: z.boolean(),
  monsterId: z.string().nullable(),
  characterId: z.uuid().nullable(),
  /** Null for players: a monster's or NPC's health is the DM's to reveal. */
  hpCurrent: z.number().int().nullable(),
  hpMax: z.number().int().nullable(),
  /** An NPC or object's own AC; monsters and characters have theirs elsewhere. Null for players. */
  ac: z.number().int().nullable(),
  /** Whether the requesting user may drag it: the DM, or the character's owner. */
  canMove: z.boolean(),
});
export type Token = z.infer<typeof token>;

const tokenName = z.string().trim().min(1).max(60);
const placement = {
  count: z.number().int().min(1).max(MAX_TOKENS_AT_ONCE).default(1),
  hidden: z.boolean().default(false),
};

export const createTokenRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("monster"),
    monsterId: z.string().max(100),
    /** Defaults to the stat block's size. */
    size: tokenSize.optional(),
    ...placement,
  }),
  z.object({
    kind: z.enum(["npc", "object"]),
    name: tokenName,
    size: tokenSize.default("medium"),
    hpMax: z.number().int().min(1).max(99999).optional(),
    ac: z.number().int().min(0).max(50).optional(),
    ...placement,
  }),
  z.object({
    kind: z.literal("character"),
    characterId: z.uuid(),
    size: tokenSize.default("medium"),
    hidden: z.boolean().default(false),
  }),
]);
export type CreateTokenRequest = z.input<typeof createTokenRequest>;

export const updateTokenRequest = z.object({
  name: tokenName.optional(),
  size: tokenSize.optional(),
  hidden: z.boolean().optional(),
  hpCurrent: z.number().int().min(0).max(99999).nullable().optional(),
  hpMax: z.number().int().min(1).max(99999).nullable().optional(),
  ac: z.number().int().min(0).max(50).nullable().optional(),
});
export type UpdateTokenRequest = z.input<typeof updateTokenRequest>;

/** The little a token picker needs from a stat block. */
export const monsterSummary = z.object({
  id: z.string(),
  name: z.string(),
  size: z.array(tokenSize),
  type: z.string(),
  ac: z.number().int(),
  hp: z.number().int(),
});
export type MonsterSummary = z.infer<typeof monsterSummary>;
