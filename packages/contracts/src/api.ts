import { z } from "zod";

// REST contract. The server validates with these schemas; the web imports the types.

export const healthResponse = z.object({
  status: z.literal("ok"),
  db: z.enum(["up", "down"]),
});
export type HealthResponse = z.infer<typeof healthResponse>;

// ── Auth ───────────────────────────────────────────────────────────────────────

export const user = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type User = z.infer<typeof user>;

export const meResponse = z.object({ user: user.nullable() });
export type MeResponse = z.infer<typeof meResponse>;

/** Which login methods the server offers; dev users only when DEV_LOGIN is on. */
export const authProvidersResponse = z.object({
  google: z.boolean(),
  devUsers: z.array(user.pick({ id: true, displayName: true, email: true })).optional(),
});
export type AuthProvidersResponse = z.infer<typeof authProvidersResponse>;

export const devLoginRequest = z.object({ userId: z.uuid() });
export type DevLoginRequest = z.infer<typeof devLoginRequest>;

// ── Campaigns ──────────────────────────────────────────────────────────────────

export const memberRole = z.enum(["gm", "player", "spectator"]);
export type MemberRole = z.infer<typeof memberRole>;

/** campaigns.settings; every field has a default so old rows stay valid. */
export const campaignSettings = z.object({
  allowMulticlass: z.boolean().default(true),
  /** Players may create homebrew visible to the whole campaign. */
  playersCanShareHomebrew: z.boolean().default(false),
});
export type CampaignSettings = z.infer<typeof campaignSettings>;

export const campaign = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(2000),
  ownerId: z.uuid(),
  /** Only sent to the GM. */
  inviteCode: z.string().optional(),
  settings: campaignSettings,
  createdAt: z.string(),
  /** The requesting user's role in this campaign. */
  role: memberRole,
});
export type Campaign = z.infer<typeof campaign>;

export const campaignMember = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: memberRole,
});
export type CampaignMember = z.infer<typeof campaignMember>;

export const campaignDetail = campaign.extend({ members: z.array(campaignMember) });
export type CampaignDetail = z.infer<typeof campaignDetail>;

export const createCampaignRequest = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).default(""),
});
export type CreateCampaignRequest = z.input<typeof createCampaignRequest>;

export const joinCampaignRequest = z.object({
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,12}$/),
});
export type JoinCampaignRequest = z.input<typeof joinCampaignRequest>;

export const apiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiError>;
