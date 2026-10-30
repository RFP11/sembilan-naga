import type { CharacterItem } from "@dnd/contracts";
import { armor, gear, magicItems, tools, weapons } from "@dnd/data";
import { useMemo, useState } from "react";
import type { CharacterWithIssues } from "../api";
import type { SheetActions } from "./actions";

const CATALOG = [
  ...weapons.map((i) => ({ kind: "weapon" as const, id: i.id, name: i.name })),
  ...armor.map((i) => ({ kind: "armor" as const, id: i.id, name: i.name })),
  ...gear.map((i) => ({ kind: "gear" as const, id: i.id, name: i.name })),
  ...tools.map((i) => ({ kind: "tool" as const, id: i.id, name: i.name })),
  ...magicItems.map((i) => ({ kind: "magic-item" as const, id: i.id, name: i.name })),
];

export function itemName(i: CharacterItem): string {
  return (
    i.name ?? CATALOG.find((c) => c.kind === i.kind && c.id === i.itemId)?.name ?? i.itemId ?? "?"
  );
}

const needsAttunement = (i: CharacterItem) =>
  i.kind === "magic-item" && magicItems.find((m) => m.id === i.itemId)?.attunement;

/** Items with quantity, equip and attune toggles; add from the SRD lists or by name. */
export function Inventory({
  character,
  actions,
}: {
  character: CharacterWithIssues;
  actions: SheetActions;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length < 2 ? [] : CATALOG.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);
  const error = actions.addItem.error ?? actions.updateItem.error ?? actions.removeItem.error;

  return (
    <section className="panel">
      <h3>Inventory</h3>
      <table className="inventory">
        <tbody>
          {character.items.map((i) => (
            <tr key={i.id}>
              <td>
                {itemName(i)}
                {i.variant && <span className="muted"> ({i.variant})</span>}
              </td>
              <td className="qty">
                <button
                  aria-label="Fewer"
                  onClick={() =>
                    i.quantity <= 1
                      ? actions.removeItem.mutate(i.id)
                      : actions.updateItem.mutate({ itemId: i.id, quantity: i.quantity - 1 })
                  }
                >
                  −
                </button>
                {i.quantity}
                <button
                  aria-label="More"
                  onClick={() =>
                    actions.updateItem.mutate({ itemId: i.id, quantity: i.quantity + 1 })
                  }
                >
                  +
                </button>
              </td>
              <td>
                {(i.kind === "weapon" || i.kind === "armor" || i.kind === "magic-item") && (
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={i.equipped}
                      onChange={(e) =>
                        actions.updateItem.mutate({ itemId: i.id, equipped: e.target.checked })
                      }
                    />
                    equipped
                  </label>
                )}
              </td>
              <td>
                {needsAttunement(i) && (
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={i.attuned}
                      onChange={(e) =>
                        actions.updateItem.mutate({ itemId: i.id, attuned: e.target.checked })
                      }
                    />
                    attuned
                  </label>
                )}
              </td>
              <td>
                <button
                  aria-label={`Remove ${itemName(i)}`}
                  onClick={() => actions.removeItem.mutate(i.id)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="add-item">
        <input
          placeholder="Add item: search the SRD or type a name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Add item"
        />
        {query.trim().length >= 2 && (
          <ul className="suggestions">
            {matches.map((m) => (
              <li key={m.kind + m.id}>
                <button
                  onClick={() =>
                    actions.addItem.mutate(
                      { kind: m.kind, itemId: m.id },
                      { onSuccess: () => setQuery("") },
                    )
                  }
                >
                  {m.name} <span className="muted">{m.kind.replace("-", " ")}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                onClick={() =>
                  actions.addItem.mutate(
                    { kind: "custom", name: query.trim() },
                    { onSuccess: () => setQuery("") },
                  )
                }
              >
                Add “{query.trim()}” as a custom item
              </button>
            </li>
          </ul>
        )}
      </div>
      {error && <p className="error">{error.message}</p>}
    </section>
  );
}
