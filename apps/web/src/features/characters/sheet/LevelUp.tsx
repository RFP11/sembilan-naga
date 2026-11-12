import {
  classChoiceProblems,
  classChoices,
  type ClassChoice,
  type DerivedCharacter,
} from "@dnd/character";
import type { CharacterBuild } from "@dnd/contracts";
import { classes } from "@dnd/data";
import { fixedHitPoints, multiclassProblems } from "@dnd/rules";
import { useMemo, useState } from "react";
import type { CharacterWithIssues } from "../api";
import { ClassChoicesEditor, mergeChoices } from "../ClassChoicesEditor";
import type { SheetActions } from "./actions";

/**
 * Gain a level: pick the class (multiclassing checked here and on the server), fixed or rolled
 * Hit Points, and answer what the new level asks for. The server rolls and applies it.
 */
export function LevelUp({
  character,
  derived,
  actions,
  onDone,
}: {
  character: CharacterWithIssues;
  derived: DerivedCharacter;
  actions: SheetActions;
  onDone: (message: string) => void;
}) {
  const build = character.build;
  const current = derived.classes.map((c) => c.classId);
  const [classId, setClassId] = useState(current[0] ?? "fighter");
  const [hp, setHp] = useState<"fixed" | "roll">("fixed");
  const [choices, setChoices] = useState(build.choices);

  const cls = classes.find((c) => c.id === classId)!;
  const classLevel = (derived.classes.find((c) => c.classId === classId)?.level ?? 0) + 1;
  const newLevel = build.levels.length + 1;
  const preview: CharacterBuild = useMemo(
    () => ({
      ...build,
      levels: [
        ...build.levels,
        { classId, ...(classLevel >= 3 && { subclassId: cls.subclass.id }) },
      ],
      choices,
    }),
    [build, classId, classLevel, cls, choices],
  );

  // Show what this level adds (new choices, running totals that grow such as Weapon Mastery),
  // plus older choices never answered: characters made before they existed lack them.
  const before = useMemo(() => new Map(classChoices(build).map((c) => [c.key, c])), [build]);
  const isNew = useMemo(
    () => (c: ClassChoice) => {
      const old = before.get(c.key);
      if (!old || build.choices[c.key] === undefined) return true;
      return "total" in c && "total" in old && c.total > old.total;
    },
    [before, build.choices],
  );
  const problems = useMemo(() => classChoiceProblems(preview), [preview]);
  const blocked = derived.scores ? multiclassProblems(derived.scores, current, classId) : [];
  const conMod = derived.modifiers?.con ?? 0;

  const submit = () =>
    actions.levelUp.mutate(
      { classId, hp, choices },
      {
        onSuccess: (c) =>
          onDone(
            `Level ${newLevel}: +${c.hpGained} HP${c.hpRoll ? ` (rolled ${c.hpRoll} on the d${cls.hitDie})` : ""}.`,
          ),
      },
    );

  return (
    <section className="panel stack">
      <h3>Level up to {newLevel}</h3>
      <label className="field">
        Class
        <select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setChoices(build.choices);
          }}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {current.includes(c.id)
                ? ` ${(derived.classes.find((x) => x.classId === c.id)?.level ?? 0) + 1}`
                : " 1 (multiclass)"}
            </option>
          ))}
        </select>
      </label>
      {blocked.length > 0 && <p className="error">Can't multiclass: {blocked.join("; ")}.</p>}

      <p className="muted">
        {cls.name} {classLevel}:{" "}
        {cls.table.find((r) => r.level === classLevel)?.features.join(", ") || "no new features"}
        {classLevel === 3 && ` (subclass: ${cls.subclass.name})`}
      </p>

      <div className="chips">
        <label className="chip">
          <input type="radio" checked={hp === "fixed"} onChange={() => setHp("fixed")} />
          Fixed: {fixedHitPoints(cls.hitDie)} {conMod >= 0 ? "+" : "−"} {Math.abs(conMod)} HP
        </label>
        <label className="chip">
          <input type="radio" checked={hp === "roll"} onChange={() => setHp("roll")} />
          Roll 1d{cls.hitDie} {conMod >= 0 ? "+" : "−"} {Math.abs(conMod)} (on the server)
        </label>
      </div>

      <ClassChoicesEditor
        build={preview}
        only={isNew}
        onChange={(changes) => setChoices((c) => mergeChoices(c, changes))}
      />

      {problems.length > 0 && (
        <ul className="issues">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {actions.levelUp.error && <p className="error">{actions.levelUp.error.message}</p>}
      <div className="row">
        <button
          className="primary"
          disabled={blocked.length > 0 || problems.length > 0 || actions.levelUp.isPending}
          onClick={submit}
        >
          Gain level {newLevel}
        </button>
      </div>
      <p className="muted">
        New spells: choose them in the Spells section once you've levelled up.
      </p>
    </section>
  );
}
