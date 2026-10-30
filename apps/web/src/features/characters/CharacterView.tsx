import type { Character } from "@dnd/contracts";
import { armor, gear, tools, weapons } from "@dnd/data";
import { Preview } from "./builder/Preview";

const ITEMS = { weapon: weapons, armor, gear, tool: tools } as const;

/** Read-only summary of a ready character. The full sheet (play state, rolls) comes next. */
export function CharacterView({ character }: { character: Character }) {
  const { state, items } = character;
  const itemName = (i: Character["items"][number]) =>
    i.name ??
    (i.kind in ITEMS
      ? ITEMS[i.kind as keyof typeof ITEMS].find((x) => x.id === i.itemId)?.name
      : i.itemId);

  return (
    <div className="builder">
      <section className="builder-main stack">
        {state && (
          <p>
            HP {state.hpCurrent}
            {state.hpTemp ? ` (+${state.hpTemp} temp)` : ""} · {state.coins.gp} GP · XP{" "}
            {character.xp}
          </p>
        )}
        <h3>Inventory</h3>
        <ul className="features">
          {items.map((i) => (
            <li key={i.id}>
              {i.quantity > 1 ? `${i.quantity} × ` : ""}
              {itemName(i)}
              {i.variant && <span className="muted"> ({i.variant})</span>}
            </li>
          ))}
        </ul>
        {character.build.notes && (
          <>
            <h3>Notes</h3>
            <p className="prose">{character.build.notes}</p>
          </>
        )}
      </section>
      <aside>
        <Preview build={character.build} />
      </aside>
    </div>
  );
}
