import { z } from "zod";

// Socket.IO contract. Every client -> server payload has a schema, because the
// server must never trust the client (positions, dice, etc.).

export const campaignJoin = z.object({ campaignId: z.uuid() });
export type CampaignJoin = z.infer<typeof campaignJoin>;

export const tokenMove = z.object({
  campaignId: z.uuid(),
  tokenId: z.string().min(1),
  x: z.number().int(),
  y: z.number().int(),
});
export type TokenMove = z.infer<typeof tokenMove>;

export const diceRollRequest = z.object({
  campaignId: z.uuid(),
  expression: z.string().max(50),
  label: z.string().max(100).optional(),
});
export type DiceRollRequest = z.infer<typeof diceRollRequest>;

export const diceRollResult = diceRollRequest.extend({
  id: z.uuid(),
  rolls: z.array(z.number().int()),
  modifier: z.number().int(),
  total: z.number().int(),
  /** Display name of the roller. */
  by: z.string(),
  userId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type DiceRollResult = z.infer<typeof diceRollResult>;

export type Ack = { ok: true } | { ok: false; error: string };

export interface ClientToServerEvents {
  "campaign:join": (payload: CampaignJoin, ack: (res: Ack) => void) => void;
  "token:move": (payload: TokenMove) => void;
  "dice:roll": (payload: DiceRollRequest, ack: (res: Ack) => void) => void;
}

/** A character's sheet changed (HP, items, rests...); clients refetch it. */
export const characterUpdated = z.object({ campaignId: z.uuid(), characterId: z.uuid() });
export type CharacterUpdated = z.infer<typeof characterUpdated>;

export interface ServerToClientEvents {
  "token:moved": (payload: TokenMove) => void;
  "dice:rolled": (payload: DiceRollResult) => void;
  "character:updated": (payload: CharacterUpdated) => void;
}

/** Socket.IO room name for a campaign. */
export const campaignRoom = (campaignId: string) => `campaign:${campaignId}`;
