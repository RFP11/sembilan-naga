import { z } from "zod";
import { mapEra } from "./api";

// Public campaign page, registration form and the DM's page.

/** Character sheet upload limit; the server enforces it, the form checks it for a quick error. */
export const MAX_SHEET_BYTES = 10 * 1024 * 1024;

export const promoIsland = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  layer: z.string(),
  vibe: z.string(),
  folk: z.array(z.string()),
  faction: z.string(),
  hook: z.string(),
  /** What this island is like in the era being shown. */
  now: z.string(),
  /** Can be picked as a starting island in the era being shown. */
  start: z.boolean(),
  /** How far the island has sunk on the map, in map pixels. */
  offset: z.number(),
  /** Lost to the mist in the era being shown. */
  gone: z.boolean(),
});
export type PromoIsland = z.infer<typeof promoIsland>;

export const promoFaction = z.object({
  name: z.string(),
  island: z.string(),
  blurb: z.string(),
  rival: z.string(),
  /** One side of the main conflict. */
  feud: z.boolean(),
});
export type PromoFaction = z.infer<typeof promoFaction>;

export const promoResponse = z.object({
  era: mapEra,
  eraInfo: z.object({
    name: z.string(),
    tag: z.string(),
    items: z.array(z.string()),
    summary: z.string(),
  }),
  islands: z.array(promoIsland),
  routes: z.array(z.tuple([z.string(), z.string()])),
  factions: z.array(promoFaction),
  /** False when the DM closed sign-ups, or while the campaign or file storage isn't set up. */
  registrationOpen: z.boolean(),
  viewerIsGm: z.boolean(),
});
export type PromoResponse = z.infer<typeof promoResponse>;

export const registrationStatus = z.enum(["pending", "accepted", "rejected"]);
export type RegistrationStatus = z.infer<typeof registrationStatus>;

/** The text fields of the multipart registration form; the file arrives as `sheet`. */
export const registrationFields = z.object({
  playerName: z.string().trim().min(1).max(80),
  characterName: z.string().trim().min(1).max(80),
  startIsland: z.string().max(40),
});
export type RegistrationFields = z.infer<typeof registrationFields>;

export const registration = z.object({
  id: z.uuid(),
  playerName: z.string(),
  characterName: z.string(),
  startIsland: z.string(),
  sheetName: z.string(),
  sheetBytes: z.number(),
  /** The draft character made from the sheet when the DM accepted this registration. */
  characterId: z.uuid().nullable(),
  status: registrationStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Registration = z.infer<typeof registration>;

export const myRegistrationResponse = z.object({ registration: registration.nullable() });
export type MyRegistrationResponse = z.infer<typeof myRegistrationResponse>;

export const dmRegistration = registration.extend({
  accountName: z.string(),
  email: z.string(),
  islandName: z.string(),
  factionName: z.string(),
});
export type DmRegistration = z.infer<typeof dmRegistration>;

/** Someone who runs the campaign: its owner, or a co-DM. */
export const campaignDm = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  isOwner: z.boolean(),
});
export type CampaignDm = z.infer<typeof campaignDm>;

export const coDmInvite = z.object({
  id: z.uuid(),
  email: z.string(),
  expiresAt: z.string(),
});
export type CoDmInvite = z.infer<typeof coDmInvite>;

export const dmResponse = z.object({
  era: mapEra,
  registrationOpen: z.boolean(),
  registrations: z.array(dmRegistration),
  /** Only the owner can invite and remove co-DMs. */
  viewerIsOwner: z.boolean(),
  dms: z.array(campaignDm),
  invites: z.array(coDmInvite),
});
export type DmResponse = z.infer<typeof dmResponse>;

export const setEraRequest = z.object({ era: mapEra });
export type SetEraRequest = z.infer<typeof setEraRequest>;

export const setRegistrationOpenRequest = z.object({ open: z.boolean() });
export type SetRegistrationOpenRequest = z.infer<typeof setRegistrationOpenRequest>;

export const inviteCoDmRequest = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
export type InviteCoDmRequest = z.input<typeof inviteCoDmRequest>;

/** The link holds the only copy of the token, so it can only be shown this once. */
export const inviteCoDmResponse = z.object({ invite: coDmInvite, link: z.string() });
export type InviteCoDmResponse = z.infer<typeof inviteCoDmResponse>;

export const acceptCoDmRequest = z.object({ token: z.string().min(20).max(100) });
export type AcceptCoDmRequest = z.infer<typeof acceptCoDmRequest>;

const noteFields = {
  sessionNumber: z.number().int().min(1).max(9999),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(20000),
};

export const campaignNote = z.object({
  id: z.uuid(),
  islandId: z.string(),
  ...noteFields,
  authorName: z.string().nullable(),
  updatedByName: z.string().nullable(),
  /** Send it back when editing; a stale one means someone else changed the note first. */
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignNote = z.infer<typeof campaignNote>;

export const notesResponse = z.object({
  islands: z.array(z.object({ id: z.string(), name: z.string() })),
  notes: z.array(campaignNote),
});
export type NotesResponse = z.infer<typeof notesResponse>;

export const createNoteRequest = z.object({ islandId: z.string().max(40), ...noteFields });
export type CreateNoteRequest = z.input<typeof createNoteRequest>;

export const updateNoteRequest = z.object({ ...noteFields, version: z.number().int().min(0) });
export type UpdateNoteRequest = z.input<typeof updateNoteRequest>;

export const reviewRegistrationRequest = z.object({
  status: z.enum(["accepted", "rejected"]),
});
export type ReviewRegistrationRequest = z.infer<typeof reviewRegistrationRequest>;
