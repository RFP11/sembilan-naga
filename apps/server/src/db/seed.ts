// Development data. Idempotent: fixed ids + upserts, so `pnpm db:seed` can run any time.
// Grows with each phase (characters in Fase 2, scenes/tokens in Fase 3, ...).

import { choiceKey, validateBuild } from "@dnd/character";
import { characterBuild, type CharacterBuildInput } from "@dnd/contracts";
import { inArray, sql } from "drizzle-orm";
import { buildColumns, loadCharacter, replaceLevels } from "../characters/repo";
import { finalizeCharacter } from "../characters/service";
import type { Orm } from "./index";
import { campaignMembers, campaigns, characters, chatMessages, users } from "./schema";

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

    await seedCharacters(tx);
  });
}

interface SeedCharacter {
  id: string;
  ownerId: string;
  campaignId: string | null;
  build: CharacterBuildInput;
  /** Finalize (play state, items); false leaves a draft at `builderStep`. */
  ready: boolean;
  builderStep?: number;
}

const fixed = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sub = (classId: string, subclassId: string, total: number) =>
  Array.from({ length: total }, (_, i) => ({ classId, ...(i >= 2 && { subclassId }) }));

/** Built and finalized through the same code as the app, so a bad seed fails loudly. */
export const SEED_CHARACTERS: SeedCharacter[] = [
  {
    id: fixed(301),
    ownerId: SEED.player1.id,
    campaignId: SEED.campaign.id,
    ready: true,
    build: {
      name: "Brunhild Stonefist",
      speciesId: "dwarf",
      backgroundId: "soldier",
      alignment: "lg",
      abilityMethod: "standard",
      baseScores: { str: 15, dex: 14, con: 13, int: 8, wis: 10, cha: 12 },
      backgroundBonus: { str: 2, con: 1 },
      levels: [{ classId: "fighter" }],
      choices: { [choiceKey.classSkills("fighter")]: ["perception", "survival"] },
      equipment: { class: "a", background: "a" },
      languages: ["dwarvish", "giant"],
    },
  },
  {
    id: fixed(302),
    ownerId: SEED.player2.id,
    campaignId: SEED.campaign.id,
    ready: true,
    build: {
      name: "Elaria Moonwhisper",
      speciesId: "elf",
      backgroundId: "sage",
      alignment: "ng",
      abilityMethod: "standard",
      baseScores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
      backgroundBonus: { int: 2, con: 1 },
      levels: sub("wizard", "evoker", 5),
      choices: {
        [choiceKey.species("elven-lineage")]: "high-elf",
        [choiceKey.species("spellcasting-ability")]: "int",
        [choiceKey.species("keen-senses")]: "perception",
        [choiceKey.classSkills("wizard")]: ["investigation", "medicine"],
      },
      equipment: { class: "a", background: "a" },
      languages: ["elvish", "draconic"],
    },
  },
  {
    // Not in any campaign: for trying "move to campaign".
    id: fixed(303),
    ownerId: SEED.player1.id,
    campaignId: null,
    ready: true,
    build: {
      name: "Tobin Ashgrove",
      speciesId: "human",
      backgroundId: "acolyte",
      alignment: "lg",
      abilityMethod: "standard",
      baseScores: { str: 14, dex: 8, con: 13, int: 10, wis: 15, cha: 12 },
      backgroundBonus: { wis: 2, cha: 1 },
      levels: sub("cleric", "life-domain", 5),
      choices: {
        [choiceKey.species("size")]: "medium",
        [choiceKey.species("skills")]: "perception",
        [choiceKey.species("feat")]: "alert",
        [choiceKey.classSkills("cleric")]: ["history", "medicine"],
      },
      equipment: { class: "a", background: "b" },
      languages: ["halfling", "dwarvish"],
    },
  },
  {
    // Multiclass: Fighter 2 / Warlock 1.
    id: fixed(304),
    ownerId: SEED.player2.id,
    campaignId: SEED.campaign.id,
    ready: true,
    build: {
      name: "Kara Emberveil",
      speciesId: "tiefling",
      backgroundId: "criminal",
      alignment: "cn",
      abilityMethod: "standard",
      baseScores: { str: 8, dex: 15, con: 13, int: 10, wis: 12, cha: 14 },
      backgroundBonus: { dex: 2, con: 1 },
      levels: [
        { classId: "fighter" },
        { classId: "fighter", hpRoll: 7 },
        { classId: "warlock", hpRoll: 5 },
      ],
      choices: {
        [choiceKey.species("fiendish-legacy")]: "infernal",
        [choiceKey.species("spellcasting-ability")]: "cha",
        [choiceKey.species("size")]: "medium",
        [choiceKey.classSkills("fighter")]: ["acrobatics", "perception"],
      },
      equipment: { class: "b", background: "a" },
      languages: ["goblin", "orc"],
    },
  },
  {
    // A draft left in the middle of the builder.
    id: fixed(305),
    ownerId: SEED.player1.id,
    campaignId: SEED.campaign.id,
    ready: false,
    builderStep: 2,
    build: { name: "Pip", speciesId: "gnome", levels: [{ classId: "rogue" }] },
  },
];

async function seedCharacters(tx: Orm) {
  // Recreate from scratch so edits made while testing don't linger.
  await tx.delete(characters).where(
    inArray(
      characters.id,
      SEED_CHARACTERS.map((c) => c.id),
    ),
  );
  for (const seed of SEED_CHARACTERS) {
    const build = characterBuild.parse(seed.build);
    if (seed.ready) {
      const issues = validateBuild(build);
      if (issues.length) {
        throw new Error(`seed character ${build.name}: ${issues.map((i) => i.message).join("; ")}`);
      }
    }
    await tx.insert(characters).values({
      id: seed.id,
      ownerId: seed.ownerId,
      campaignId: seed.campaignId,
      builderStep: seed.builderStep ?? 0,
      ...buildColumns(build),
    });
    await replaceLevels(tx, seed.id, build);
    if (seed.ready) await finalizeCharacter(tx, (await loadCharacter(tx, seed.id))!);
  }
}
