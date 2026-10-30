// Starting equipment packages chosen in the builder → inventory rows and gold.

import type { CharacterBuild } from "@dnd/contracts";
import { startingEquipment } from "@dnd/data";

export interface StartingItem {
  kind: "weapon" | "armor" | "gear" | "tool" | "custom";
  itemId: string | null;
  name: string | null;
  variant: string | null;
  quantity: number;
  equipped: boolean;
}

/**
 * Items and GP from the chosen class (first class) and background packages, with weapons
 * and armor equipped. A
 * "proficient-tool" entry becomes the tool picked in `choices["tool-proficiency"]`, or a
 * placeholder the player can edit later.
 */
export function startingInventory(build: CharacterBuild): { items: StartingItem[]; gp: number } {
  const items: StartingItem[] = [];
  let gp = 0;
  const sources = [
    { source: "class", id: build.levels[0]?.classId, pick: build.equipment.class },
    { source: "background", id: build.backgroundId, pick: build.equipment.background },
  ] as const;
  for (const { source, id, pick } of sources) {
    const pkg = startingEquipment.find((e) => e.source === source && e.sourceId === id);
    const option = pkg?.options.find((o) => o.id === pick);
    if (!option) continue;
    gp += option.gp;
    for (const ref of option.items) {
      if (ref.kind === "custom") {
        items.push({
          kind: "custom",
          itemId: null,
          name: ref.name,
          variant: null,
          quantity: 1,
          equipped: false,
        });
      } else if (ref.kind === "proficient-tool") {
        const toolId = build.choices["tool-proficiency"];
        items.push(
          typeof toolId === "string"
            ? {
                kind: "tool",
                itemId: toolId,
                name: null,
                variant: null,
                quantity: 1,
                equipped: false,
              }
            : {
                kind: "custom",
                itemId: null,
                name: "Tool (your proficiency)",
                variant: null,
                quantity: 1,
                equipped: false,
              },
        );
      } else {
        items.push({
          kind: ref.kind,
          itemId: ref.id,
          name: null,
          variant: ref.variant ?? ref.note ?? null,
          quantity: ref.quantity,
          // Starting weapons and armor are ready to use; the sheet can unequip them.
          equipped: ref.kind === "weapon" || ref.kind === "armor",
        });
      }
    }
  }
  return { items, gp };
}
