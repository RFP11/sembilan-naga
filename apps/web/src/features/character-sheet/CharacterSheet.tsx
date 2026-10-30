import { ABILITIES, abilityModifier, proficiencyBonus, type AbilityScores } from "@dnd/rules";
import { useState } from "react";

// Placeholder sheet showing the shared rules package in the UI.
export function CharacterSheet() {
  const [level, setLevel] = useState(1);
  const [scores, setScores] = useState<AbilityScores>({
    str: 15,
    dex: 14,
    con: 13,
    int: 12,
    wis: 10,
    cha: 8,
  });

  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <div>
      <label>
        Level{" "}
        <input
          type="number"
          min={1}
          max={20}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value) || 1)}
        />
      </label>{" "}
      <span className="muted">Proficiency {fmt(proficiencyBonus(level))}</span>
      <table style={{ marginTop: "1rem" }}>
        <tbody>
          {ABILITIES.map((a) => (
            <tr key={a}>
              <th style={{ textAlign: "left", paddingRight: "1rem" }}>{a.toUpperCase()}</th>
              <td>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={scores[a]}
                  onChange={(e) => setScores({ ...scores, [a]: Number(e.target.value) || 10 })}
                />
              </td>
              <td style={{ paddingLeft: "1rem" }}>{fmt(abilityModifier(scores[a]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
