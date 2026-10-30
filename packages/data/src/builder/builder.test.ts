// The builder data is hand-written; these checks tie it to the generated SRD data so a typo
// (wrong spell id, missing variant, GP that doesn't match the book) fails CI.

import { describe, expect, it } from "vitest";
import * as srd from "../index";

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const spells = byId(srd.spells);
const skills = byId(srd.skills);
const items = {
  weapon: byId(srd.weapons),
  armor: byId(srd.armor),
  gear: byId(srd.gear),
  tool: byId(srd.tools),
};

describe("species builder data", () => {
  it("covers every species exactly once", () => {
    expect(srd.speciesBuilders.map((b) => b.speciesId).sort()).toEqual(
      srd.species.map((s) => s.id).sort(),
    );
  });

  it.each(srd.speciesBuilders.map((b) => [b.speciesId, b] as const))(
    "%s references real data",
    (id, b) => {
      const species = srd.species.find((s) => s.id === id)!;
      const grants = [...b.grants, ...b.choices.flatMap((c) => c.options.flatMap((o) => o.grants))];

      for (const c of b.choices) {
        if (c.id === "size") expect(species.size, "size choice needs two sizes").toHaveLength(2);
        else
          expect(
            species.traits.map((t) => t.name),
            c.id,
          ).toContain(c.trait);
      }
      for (const g of grants) {
        if (g.type === "cantrip") expect(spells.get(g.spellId)?.level, g.spellId).toBe(0);
        if (g.type === "spell") {
          // Lineage spells: level 1 spell at character level 3, level 2 spell at level 5.
          const expected = g.minLevel === 5 ? 2 : 1;
          expect(spells.get(g.spellId)?.level, g.spellId).toBe(expected);
        }
        if (g.type === "skill") expect(skills.has(g.skillId), g.skillId).toBe(true);
        if (g.type === "feature") {
          const options = species.traits.flatMap((t) => t.options ?? []).map((o) => o.name);
          expect(options, g.name).toContain(g.name);
        }
      }
    },
  );

  it("matches the trait options the SRD nests (Gnomish Lineage, Giant Ancestry)", () => {
    for (const b of srd.speciesBuilders) {
      const species = srd.species.find((s) => s.id === b.speciesId)!;
      for (const trait of species.traits.filter((t) => t.options)) {
        const choice = b.choices.find((c) => c.trait === trait.name);
        expect(choice?.options.length, `${b.speciesId} ${trait.name}`).toBe(trait.options!.length);
      }
    }
  });
});

describe("starting equipment", () => {
  it("covers every class and background", () => {
    const ids = (source: string) =>
      srd.startingEquipment
        .filter((e) => e.source === source)
        .map((e) => e.sourceId)
        .sort();
    expect(ids("class")).toEqual(srd.classes.map((c) => c.id).sort());
    expect(ids("background")).toEqual(srd.backgrounds.map((b) => b.id).sort());
  });

  it.each(srd.startingEquipment.map((e) => [`${e.source} ${e.sourceId}`, e] as const))(
    "%s matches the SRD text",
    (_, e) => {
      const text =
        e.source === "class"
          ? srd.classes.find((c) => c.id === e.sourceId)!.startingEquipment
          : srd.backgrounds.find((b) => b.id === e.sourceId)!.equipment;

      // Same options and gold as the book: "(A) ..., and 15 GP; or (B) 75 GP"
      const options = [...text.matchAll(/\(([A-C])\)([^;]*)/g)];
      expect(e.options.map((o) => o.id)).toEqual(options.map((m) => m[1]!.toLowerCase()));
      expect(e.options.map((o) => o.gp)).toEqual(
        options.map((m) => Number(/(\d+) GP\s*$/.exec(m[2]!.trim())![1])),
      );

      for (const option of e.options) {
        for (const ref of option.items) {
          if (ref.kind === "custom" || ref.kind === "proficient-tool") continue;
          const item = items[ref.kind].get(ref.id);
          expect(item, `${ref.kind} ${ref.id}`).toBeDefined();
          if (ref.variant) {
            const description = "description" in item! ? item.description : "";
            expect(description, `${ref.id} has variant "${ref.variant}"`).toContain(ref.variant);
          }
        }
      }
    },
  );
});
