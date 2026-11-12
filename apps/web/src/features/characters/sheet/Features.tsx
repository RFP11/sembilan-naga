import { classChoices, featById, type DerivedCharacter } from "@dnd/character";
import { classes, weapons } from "@dnd/data";
import { useState } from "react";
import type { CharacterWithIssues } from "../api";
import { className, skillName } from "../labels";
import type { SheetActions } from "./actions";
import { LevelUp } from "./LevelUp";

const many = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Feats and class choices the character has made, and the way to gain a level. */
export function Features({
  character,
  derived,
  actions,
}: {
  character: CharacterWithIssues;
  derived: DerivedCharacter;
  actions: SheetActions;
}) {
  const [levelling, setLevelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const build = character.build;
  const option = (classId: string, list: string, id: string) =>
    classes
      .find((c) => c.id === classId)
      ?.options.find((o) => o.id === list)
      ?.entries.find((e) => e.id === id)?.name ?? id;

  const rows: [string, string][] = [];
  const feats = derived.feats.map((id) => featById(id)?.name ?? id);
  if (feats.length) rows.push(["Feats", feats.join(", ")]);
  for (const c of classChoices(build)) {
    const picked = many(build.choices[c.key]);
    if (!picked.length || c.kind === "feat" || c.kind === "fighting-style") continue;
    const who = className(c.classId);
    if (c.kind === "order") {
      rows.push([
        `${who} ${c.name}`,
        c.options.find((o) => o.id === picked[0])?.name ?? picked[0]!,
      ]);
    } else if (c.kind === "expertise") {
      rows.push([`${who} Expertise`, picked.map(skillName).join(", ")]);
    } else if (c.kind === "weapon-mastery") {
      rows.push([
        `${who} Weapon Mastery`,
        picked
          .map((id) => {
            const w = weapons.find((x) => x.id === id);
            return w ? `${w.name} (${w.mastery})` : id;
          })
          .join(", "),
      ]);
    } else if (c.kind === "invocations") {
      rows.push([
        "Eldritch Invocations",
        picked.map((id) => option(c.classId, "eldritch-invocation", id)).join(", "),
      ]);
    } else if (c.kind === "metamagic") {
      rows.push(["Metamagic", picked.map((id) => option(c.classId, "metamagic", id)).join(", ")]);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="row">
          <h3 className="grow">Features</h3>
          {derived.level < 20 && (
            <button onClick={() => setLevelling((v) => !v)}>
              {levelling ? "Cancel" : "Level up"}
            </button>
          )}
        </div>
        {rows.length === 0 && <p className="muted">No feats or class choices yet.</p>}
        <dl className="features-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {message && <p className="muted">{message}</p>}
      </section>
      {levelling && (
        <LevelUp
          character={character}
          derived={derived}
          actions={actions}
          onDone={(m) => {
            setMessage(m);
            setLevelling(false);
          }}
        />
      )}
    </>
  );
}
