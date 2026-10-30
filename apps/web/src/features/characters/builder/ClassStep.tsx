import { choiceKey } from "@dnd/character";
import { classes } from "@dnd/data";
import { Prose } from "../../../lib/Prose";
import type { StepProps } from "./Builder";

/** Step 1: class, starting level and (from level 3) subclass. */
export function ClassStep({ build, update }: StepProps) {
  const classId = build.levels[0]?.classId;
  const level = build.levels.length || 1;
  const cls = classes.find((c) => c.id === classId);

  const setClass = (id: string, startLevel: number) => {
    const next = classes.find((c) => c.id === id)!;
    const choices = { ...build.choices };
    if (classId && classId !== id) delete choices[choiceKey.classSkills(classId)];
    update({
      // Levels after the first use the fixed Hit Point value.
      levels: Array.from({ length: startLevel }, (_, i) => ({
        classId: id,
        ...(i >= 2 && { subclassId: next.subclass.id }),
      })),
      choices,
      equipment: { ...build.equipment, class: classId === id ? build.equipment.class : undefined },
    });
  };

  return (
    <div className="stack">
      <h2>Choose a class</h2>
      <div className="cards">
        {classes.map((c) => (
          <button
            key={c.id}
            className="card"
            aria-pressed={c.id === classId}
            onClick={() => setClass(c.id, level)}
          >
            <strong>{c.name}</strong>
            <span className="muted">
              d{c.hitDie} · {c.primaryAbility}
            </span>
            <span className="muted">Saves: {c.savingThrows.join(", ").toUpperCase()}</span>
          </button>
        ))}
      </div>

      {cls && (
        <>
          <label className="field">
            Starting level{" "}
            <select value={level} onChange={(e) => setClass(cls.id, Number(e.target.value))}>
              {Array.from({ length: 20 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          {level >= 3 && (
            <p>
              Subclass: <strong>{cls.subclass.name}</strong>{" "}
              <span className="muted">(the SRD includes one subclass per class)</span>
            </p>
          )}
          {level > 1 && (
            <p className="muted">
              Hit Points after level 1 use the fixed value (d{cls.hitDie} → {cls.hitDie / 2 + 1}).
            </p>
          )}

          <h3>
            {cls.name} features up to level {level}
          </h3>
          <ul className="features">
            {cls.features
              .filter((f) => f.level <= level)
              .map((f) => (
                <li key={f.level + f.name}>
                  <details>
                    <summary>
                      <span className="muted">Level {f.level}</span> {f.name}
                    </summary>
                    <Prose text={f.description} />
                  </details>
                </li>
              ))}
          </ul>
          <p className="muted">
            Proficiencies: {cls.weaponProficiencies}; armor: {cls.armorTraining}
            {cls.toolProficiencies && `; tools: ${cls.toolProficiencies}`}.
          </p>
        </>
      )}
    </div>
  );
}
