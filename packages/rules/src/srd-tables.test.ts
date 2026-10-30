// Cross-checks the rules' tables against the class tables extracted from the SRD, so a typo
// on either side fails CI. @dnd/data is a dev dependency only; the rules stay data-free.

import { classes } from "@dnd/data";
import { describe, expect, it } from "vitest";
import { proficiencyBonus } from "./abilities";
import { CASTER_PROGRESSION, pactMagic, spellSlots } from "./spellcasting";

describe("rules match the SRD class tables", () => {
  it.each(classes.map((c) => [c.id, c] as const))("%s", (id, c) => {
    for (const row of c.table) {
      expect(proficiencyBonus(row.level), `PB at ${row.level}`).toBe(row.proficiencyBonus);

      const progression = CASTER_PROGRESSION[id];
      if (progression === "full" || progression === "half") {
        const fromTable = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
          .map((k) => row.columns[k])
          .filter((v) => v !== undefined)
          .map((v) => (v === "—" ? 0 : Number(v)));
        const slots = spellSlots([{ classId: id, level: row.level }]);
        const padded = fromTable.map((_, i) => slots[i] ?? 0);
        expect(padded, `slots at ${row.level}`).toEqual(fromTable);
      } else if (progression === "pact") {
        expect(pactMagic(row.level), `pact magic at ${row.level}`).toEqual({
          slots: Number(row.columns["Spell Slots"]),
          slotLevel: Number(row.columns["Slot Level"]),
        });
      } else {
        expect(row.columns["1"], `${id} has no spell slots`).toBeUndefined();
      }
    }
  });
});
