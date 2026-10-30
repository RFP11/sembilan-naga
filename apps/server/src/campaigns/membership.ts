import type { MemberRole } from "@dnd/contracts";
import { and, eq } from "drizzle-orm";
import type { Orm } from "../db";
import { campaignMembers } from "../db/schema";

/** The user's role in the campaign, or null when they're not a member. */
export async function memberRole(
  orm: Orm,
  campaignId: string,
  userId: string,
): Promise<MemberRole | null> {
  const [row] = await orm
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  return row?.role ?? null;
}
