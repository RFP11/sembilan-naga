import { deriveCharacter } from "@dnd/character";
import type { CharacterBuild } from "@dnd/contracts";
import { ABILITIES } from "@dnd/rules";
import { useMemo } from "react";
import { ABILITY_SHORT, classSummary, signed, skillName, speciesName } from "../labels";

/** Live numbers for the build so far, computed in the browser by @dnd/character. */
export function Preview({ build }: { build: CharacterBuild }) {
  const d = useMemo(() => deriveCharacter(build), [build]);

  return (
    <div className="preview">
      <h3>{build.name || "Unnamed"}</h3>
      <p className="muted">
        {[speciesName(build.speciesId), classSummary(d.classes)].filter(Boolean).join(" · ") ||
          "No class yet"}
      </p>

      <dl className="stats">
        <div>
          <dt>HP</dt>
          <dd>{d.maxHp || "—"}</dd>
        </div>
        <div>
          <dt>AC</dt>
          <dd>{d.ac}</dd>
        </div>
        <div>
          <dt>Prof.</dt>
          <dd>{signed(d.proficiencyBonus)}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{d.speed} ft</dd>
        </div>
      </dl>

      {d.scores && d.modifiers && (
        <table className="scores">
          <tbody>
            {ABILITIES.map((a) => (
              <tr key={a}>
                <th>{ABILITY_SHORT[a]}</th>
                <td>{d.scores![a]}</td>
                <td>{signed(d.modifiers![a]!)}</td>
                <td className="muted">{d.savingThrows.includes(a) ? "save ✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {d.skills.length > 0 && (
        <p>
          <strong>Skills:</strong> {d.skills.map(skillName).sort().join(", ")}
        </p>
      )}
      <p className="muted">
        Initiative {signed(d.initiative)} · Passive Perception {d.passivePerception}
        {d.darkvision ? ` · Darkvision ${d.darkvision} ft` : ""}
      </p>
      {d.resistances.length > 0 && <p>Resistance: {d.resistances.join(", ")}</p>}
      {d.spellcasting.map((s) => (
        <p key={s.classId}>
          Spell save DC {s.saveDc} · attack {signed(s.attackBonus)}
          {d.spellSlots.length > 0 && ` · slots ${d.spellSlots.join("/")}`}
          {d.pactMagic && ` · pact ${d.pactMagic.slots}×L${d.pactMagic.slotLevel}`}
        </p>
      ))}
    </div>
  );
}
