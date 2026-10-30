// Development data. Idempotent: fixed ids + upserts, so `pnpm db:seed` can run any time.
// Grows with each phase (characters in Fase 2, scenes/tokens in Fase 3, ...).

import { sql } from "drizzle-orm";
import type { Orm } from "./index";
import { campaignMembers, campaigns, chatMessages, users } from "./schema";

export const SEED = {
  gm: { id: "00000000-0000-4000-8000-000000000001", email: "gm@dev.local", displayName: "Dev GM" },
  player1: {
    id: "00000000-0000-4000-8000-000000000002",
    email: "player1@dev.local",
    displayName: "Player One",
  },
  player2: {
    id: "00000000-0000-4000-8000-000000000003",
    email: "player2@dev.local",
    displayName: "Player Two",
  },
  campaign: {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Dev Campaign",
    inviteCode: "DEVCAMP",
  },
} as const;

export async function seed(orm: Orm): Promise<void> {
  await orm.transaction(async (tx) => {
    for (const u of [SEED.gm, SEED.player1, SEED.player2]) {
      await tx
        .insert(users)
        .values(u)
        .onConflictDoUpdate({
          target: users.id,
          set: { email: u.email, displayName: u.displayName },
        });
    }

    await tx
      .insert(campaigns)
      .values({
        ...SEED.campaign,
        description: "Sample campaign created by the seeder.",
        ownerId: SEED.gm.id,
      })
      .onConflictDoUpdate({
        target: campaigns.id,
        set: { name: SEED.campaign.name, inviteCode: SEED.campaign.inviteCode },
      });

    const members = [
      { userId: SEED.gm.id, role: "gm" as const },
      { userId: SEED.player1.id, role: "player" as const },
      { userId: SEED.player2.id, role: "player" as const },
    ];
    for (const m of members) {
      await tx
        .insert(campaignMembers)
        .values({ campaignId: SEED.campaign.id, ...m })
        .onConflictDoUpdate({
          target: [campaignMembers.campaignId, campaignMembers.userId],
          set: { role: m.role },
        });
    }

    const rolls = [
      {
        id: "00000000-0000-4000-8000-000000000201",
        userId: SEED.player1.id,
        expression: "1d20+5",
        rolls: [14],
        total: 19,
        label: "Longsword attack",
      },
      {
        id: "00000000-0000-4000-8000-000000000202",
        userId: SEED.player1.id,
        expression: "1d8+3",
        rolls: [6],
        total: 9,
        label: "Longsword damage",
      },
      {
        id: "00000000-0000-4000-8000-000000000203",
        userId: SEED.gm.id,
        expression: "1d20+2",
        rolls: [7],
        total: 9,
        label: "Goblin initiative",
      },
    ];
    for (const r of rolls) {
      await tx
        .insert(chatMessages)
        .values({ ...r, campaignId: SEED.campaign.id, kind: "roll" })
        .onConflictDoNothing({ target: chatMessages.id });
    }

    // Keep the seeded log ordered as listed, a few minutes in the past.
    await tx.execute(sql`
      update ${chatMessages} set created_at = now() - (interval '1 minute' * (4 - right(id::text, 1)::int))
      where id in (${sql.join(
        rolls.map((r) => sql`${r.id}::uuid`),
        sql`, `,
      )})
    `);
  });
}
