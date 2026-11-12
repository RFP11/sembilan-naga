import { z } from "zod";

// Socket.IO contract. Every client -> server payload has a schema, because the
// server must never trust the client (positions, dice, etc.).

export const campaignJoin = z.object({ campaignId: z.uuid() });
export type CampaignJoin = z.infer<typeof campaignJoin>;

export const tokenMove = z.object({
  campaignId: z.uuid(),
  tokenId: z.uuid(),
  x: z.number().int(),
  y: z.number().int(),
});
export type TokenMove = z.infer<typeof tokenMove>;

export const diceRollRequest = z.object({
  campaignId: z.uuid(),
  expression: z.string().max(50),
  label: z.string().max(100).optional(),
  /** Seen by the DMs only; players asking for it roll in the open. */
  secret: z.boolean().default(false),
});
export type DiceRollRequest = z.input<typeof diceRollRequest>;

export const diceRollResult = diceRollRequest.required({ secret: true }).extend({
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

/** The DM changed what's on the table; clients fetch the map again. */
export const sceneChanged = z.object({ campaignId: z.uuid() });
export type SceneChanged = z.infer<typeof sceneChanged>;

/** Tokens were added, changed or removed; clients fetch them again, each seeing what they may. */
export const tokensChanged = z.object({ campaignId: z.uuid() });
export type TokensChanged = z.infer<typeof tokensChanged>;

/** The fight changed; clients fetch it again, each seeing what they may. */
export const encounterChanged = z.object({ campaignId: z.uuid() });
export type EncounterChanged = z.infer<typeof encounterChanged>;

export interface ServerToClientEvents {
  "token:moved": (payload: TokenMove) => void;
  "dice:rolled": (payload: DiceRollResult) => void;
  "character:updated": (payload: CharacterUpdated) => void;
  "scene:changed": (payload: SceneChanged) => void;
  "tokens:changed": (payload: TokensChanged) => void;
  "encounter:changed": (payload: EncounterChanged) => void;
}

/** Socket.IO room name for a campaign. */
export const campaignRoom = (campaignId: string) => `campaign:${campaignId}`;

/** The campaign's DMs only: for what players mustn't receive, such as hidden tokens moving. */
export const campaignGmRoom = (campaignId: string) => `campaign:${campaignId}:gm`;
