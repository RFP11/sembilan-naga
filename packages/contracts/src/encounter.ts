import { z } from "zod";
import { tokenKind } from "./token";

// An encounter: the tokens in a fight and whose turn it is. One at a time per campaign.

export const combatant = z.object({
  id: z.uuid(),
  tokenId: z.uuid(),
  name: z.string(),
  kind: tokenKind,
  initiative: z.number().int(),
  /** Only ever true for the DM: players aren't sent hidden combatants at all. */
  hidden: z.boolean(),
  /** Null for players, as on the token. */
  hpCurrent: z.number().int().nullable(),
  hpMax: z.number().int().nullable(),
  isCurrent: z.boolean(),
  /** Null for players: the DM's numbers at a glance. */
  ac: z.number().int().nullable(),
  passivePerception: z.number().int().nullable(),
  /** One reaction per round, back at the start of its own turn. */
  reactionUsed: z.boolean(),
  /** The first card past the end of this round. */
  startsNextRound: z.boolean(),
});
export type Combatant = z.infer<typeof combatant>;

/** Someone just left an enemy's reach; that enemy's controller may answer. */
export const reactionPrompt = z.object({
  id: z.uuid(),
  reactorTokenId: z.uuid(),
  reactorName: z.string(),
  targetTokenId: z.uuid(),
  targetName: z.string(),
});
export type ReactionPrompt = z.infer<typeof reactionPrompt>;

/** What's easy to forget on this turn; only for whoever controls the acting token. */
export const turnReminder = z.object({
  type: z.enum(["recharge", "trait", "feature", "concentration", "deathSave"]),
  title: z.string(),
  detail: z.string(),
});
export type TurnReminder = z.infer<typeof turnReminder>;

export const encounter = z.object({
  id: z.uuid(),
  sceneId: z.uuid(),
  round: z.number().int(),
  /** In turn order, starting from whoever acts now. */
  combatants: z.array(combatant),
  /** The DM, or the player whose character is acting. */
  canEndTurn: z.boolean(),
  /** Whose turn it is, which the client sends back when ending it. Null when hidden from you. */
  currentId: z.uuid().nullable(),
  /** Only those this viewer can answer. */
  reactions: z.array(reactionPrompt),
  reminders: z.array(turnReminder),
  /** For a death save reminder's button. */
  currentCharacterId: z.uuid().nullable(),
});
export type Encounter = z.infer<typeof encounter>;

export const encounterResponse = z.object({ encounter: encounter.nullable() });
export type EncounterResponse = z.infer<typeof encounterResponse>;

const tokenIds = z.array(z.uuid()).min(1).max(100);

export const startEncounterRequest = z.object({ tokenIds });
export type StartEncounterRequest = z.infer<typeof startEncounterRequest>;

export const addCombatantsRequest = z.object({ tokenIds });
export type AddCombatantsRequest = z.infer<typeof addCombatantsRequest>;

/** Names the turn being ended, so a double click or two people at once can't skip someone. */
export const nextTurnRequest = z.object({ currentId: z.uuid() });
export type NextTurnRequest = z.infer<typeof nextTurnRequest>;

export const setInitiativeRequest = z.object({ initiative: z.number().int().min(-20).max(99) });
export type SetInitiativeRequest = z.infer<typeof setInitiativeRequest>;
