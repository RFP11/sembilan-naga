import { z } from "zod";

// Socket.IO contract. Every client -> server payload has a schema, because the
// server must never trust the client (positions, dice, etc.).

export const campaignJoin = z.object({ campaignId: z.string().min(1) });
export type CampaignJoin = z.infer<typeof campaignJoin>;

export const tokenMove = z.object({
  campaignId: z.string().min(1),
  tokenId: z.string().min(1),
  x: z.number().int(),
  y: z.number().int(),
});
export type TokenMove = z.infer<typeof tokenMove>;

export const diceRollRequest = z.object({
  campaignId: z.string().min(1),
  expression: z.string().max(50),
  label: z.string().max(100).optional(),
});
export type DiceRollRequest = z.infer<typeof diceRollRequest>;

export const diceRollResult = diceRollRequest.extend({
  rolls: z.array(z.number().int()),
  modifier: z.number().int(),
  total: z.number().int(),
  by: z.string(),
});
export type DiceRollResult = z.infer<typeof diceRollResult>;

export type Ack = { ok: true } | { ok: false; error: string };

export interface ClientToServerEvents {
  "campaign:join": (payload: CampaignJoin, ack: (res: Ack) => void) => void;
  "token:move": (payload: TokenMove) => void;
  "dice:roll": (payload: DiceRollRequest, ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  "token:moved": (payload: TokenMove) => void;
  "dice:rolled": (payload: DiceRollResult) => void;
}

/** Socket.IO room name for a campaign. */
export const campaignRoom = (campaignId: string) => `campaign:${campaignId}`;
