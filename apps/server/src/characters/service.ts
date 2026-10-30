// Character operations shared by the API and the seeder.

import { deriveCharacter, speciesGrants, startingInventory } from "@dnd/character";
import type { Character } from "@dnd/contracts";
import { xpForLevel } from "@dnd/rules";
import { eq } from "drizzle-orm";
import type { Orm } from "../db";
import { characterItems, characters, characterSpells, characterState } from "../db/schema";

/**
 * Draft → ready: sets XP for the level, creates play state at full HP with the starting gold,
 * adds the starting equipment and the species' cantrips / spells for the current level.
 * The caller validates the build first.
 */
export async function finalizeCharacter(orm: Orm, c: Character): Promise<void> {
  const derived = deriveCharacter(c.build);
  const { items, gp } = startingInventory(c.build);
  const spells = speciesGrants(c.build).flatMap((g) =>
    g.type === "cantrip" || (g.type === "spell" && g.minLevel <= derived.level)
      ? [{ spellId: g.spellId, source: "species", prepared: true, alwaysPrepared: true }]
      : [],
  );

  await orm.transaction(async (tx) => {
    await tx
      .update(characters)
      .set({ status: "ready", xp: xpForLevel(derived.level), updatedAt: new Date() })
      .where(eq(characters.id, c.id));
    await tx.insert(characterState).values({
      characterId: c.id,
      hpCurrent: derived.maxHp,
      coins: { cp: 0, sp: 0, ep: 0, gp, pp: 0 },
    });
    if (items.length) {
      await tx.insert(characterItems).values(items.map((i) => ({ ...i, characterId: c.id })));
    }
    if (spells.length) {
      await tx
        .insert(characterSpells)
        .values(spells.map((s) => ({ ...s, characterId: c.id })))
        .onConflictDoNothing();
    }
  });
}
