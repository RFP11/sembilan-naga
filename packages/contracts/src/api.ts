import { z } from "zod";

// REST contract. The server validates with these schemas; the web imports the types.

export const healthResponse = z.object({
  status: z.literal("ok"),
  db: z.enum(["up", "down", "not-configured"]),
});
export type HealthResponse = z.infer<typeof healthResponse>;

export const campaign = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  createdAt: z.string(),
});
export type Campaign = z.infer<typeof campaign>;

export const createCampaignRequest = campaign.pick({ name: true });
export type CreateCampaignRequest = z.infer<typeof createCampaignRequest>;
