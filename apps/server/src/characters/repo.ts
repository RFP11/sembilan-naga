// Mapping between the character contract (build + state + items) and the database rows.

import {
  characterBuild,
  type Character,
  type CharacterBuild,
  type CharacterState,
  type CharacterSummary,
} from "@dnd/contracts";
import { classLevels } from "@dnd/character";
import { asc, eq, inArray } from "drizzle-orm";
import type { Orm } from "../db";
import { characterItems, characterLevels, characters, characterState } from "../db/schema";

type CharacterRow = typeof characters.$inferSelect;
type LevelRow = typeof characterLevels.$inferSelect;

/** The JSON part of the build (`characters.build`); the rest has its own columns. */
interface BuildJson {
  abilityMethod?: CharacterBuild["abilityMethod"];
  choices?: CharacterBuild["choices"];
  equipment?: CharacterBuild["equipment"];
  languages?: CharacterBuild["languages"];
  notes?: CharacterBuild["notes"];
}

export function toBuild(row: CharacterRow, levels: LevelRow[]): CharacterBuild {
  const json = row.build as BuildJson;
  const scores = [row.str, row.dex, row.con, row.int, row.wis, row.cha];
  return characterBuild.parse({
    name: row.name,
    speciesId: row.speciesId ?? undefined,
    backgroundId: row.backgroundId ?? undefined,
    alignment: row.alignment ?? undefined,
    abilityMethod: json.abilityMethod,
    baseScores: scores.every((s) => s !== null)
      ? { str: row.str, dex: row.dex, con: row.con, int: row.int, wis: row.wis, cha: row.cha }
      : undefined,
    backgroundBonus: row.backgroundBonus,
    levels: [...levels]
      .sort((a, b) => a.level - b.level)
      .map((l) => ({
        classId: l.classId,
        ...(l.subclassId && { subclassId: l.subclassId }),
        ...(l.hpRoll !== null && { hpRoll: l.hpRoll }),
      })),
    choices: json.choices,
    equipment: json.equipment,
    languages: json.languages,
    notes: json.notes,
  });
}

/** Column values for a build (everything but the levels). */
export function buildColumns(build: CharacterBuild) {
  const json: BuildJson = {
    abilityMethod: build.abilityMethod,
    choices: build.choices,
    equipment: build.equipment,
    languages: build.languages,
    notes: build.notes,
  };
  const s = build.baseScores;
  return {
    name: build.name,
    speciesId: build.speciesId ?? null,
    backgroundId: build.backgroundId ?? null,
    alignment: build.alignment ?? null,
    str: s?.str ?? null,
    dex: s?.dex ?? null,
    con: s?.con ?? null,
    int: s?.int ?? null,
    wis: s?.wis ?? null,
    cha: s?.cha ?? null,
    backgroundBonus: build.backgroundBonus,
    build: json,
    updatedAt: new Date(),
  };
}

export async function replaceLevels(orm: Orm, characterId: string, build: CharacterBuild) {
  await orm.delete(characterLevels).where(eq(characterLevels.characterId, characterId));
  if (build.levels.length) {
    await orm.insert(characterLevels).values(
      build.levels.map((l, i) => ({
        characterId,
        level: i + 1,
        classId: l.classId,
        subclassId: l.subclassId ?? null,
        hpRoll: l.hpRoll ?? null,
      })),
    );
  }
}

function toState(row: typeof characterState.$inferSelect): CharacterState {
  return {
    hpCurrent: row.hpCurrent,
    hpTemp: row.hpTemp,
    hitDiceSpent: row.hitDiceSpent as Record<string, number>,
    deathSaves: { success: row.deathSaveSuccess, fail: row.deathSaveFail },
    exhaustion: row.exhaustion,
    heroicInspiration: row.heroicInspiration,
    spellSlotsUsed: row.spellSlotsUsed as Record<string, number>,
    pactSlotsUsed: row.pactSlotsUsed,
    featureUses: row.featureUses as Record<string, number>,
    conditions: row.conditions,
    concentratingOn: row.concentratingOn,
    coins: row.coins as CharacterState["coins"],
    version: row.version,
  };
}

/** The full character, or undefined. Access checks are the caller's job. */
export async function loadCharacter(orm: Orm, id: string): Promise<Character | undefined> {
  const [row] = await orm.select().from(characters).where(eq(characters.id, id));
  if (!row) return undefined;
  const [levels, [state], items] = await Promise.all([
    orm.select().from(characterLevels).where(eq(characterLevels.characterId, id)),
    orm.select().from(characterState).where(eq(characterState.characterId, id)),
    orm
      .select()
      .from(characterItems)
      .where(eq(characterItems.characterId, id))
      .orderBy(asc(characterItems.createdAt), asc(characterItems.id)),
  ]);
  return {
    id: row.id,
    ownerId: row.ownerId,
    campaignId: row.campaignId,
    status: row.status,
    builderStep: row.builderStep,
    xp: row.xp,
    build: toBuild(row, levels),
    state: state ? toState(state) : null,
    items: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      itemId: i.itemId,
      name: i.name,
      variant: i.variant,
      quantity: i.quantity,
      equipped: i.equipped,
      attuned: i.attuned,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function summaries(orm: Orm, rows: CharacterRow[]): Promise<CharacterSummary[]> {
  const ids = rows.map((r) => r.id);
  const levels = ids.length
    ? await orm.select().from(characterLevels).where(inArray(characterLevels.characterId, ids))
    : [];
  return rows.map((r) => {
    const mine = levels.filter((l) => l.characterId === r.id).sort((a, b) => a.level - b.level);
    return {
      id: r.id,
      ownerId: r.ownerId,
      campaignId: r.campaignId,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
      name: r.name,
      speciesId: r.speciesId,
      classes: classLevels({ levels: mine.map((l) => ({ classId: l.classId })) }).map(
        ({ classId, level }) => ({ classId, level }),
      ),
      level: mine.length,
    };
  });
}
