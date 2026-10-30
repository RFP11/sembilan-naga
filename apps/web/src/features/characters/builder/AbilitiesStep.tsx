import { finalScores } from "@dnd/character";
import type { CharacterBuild } from "@dnd/contracts";
import { backgrounds, type AbilityId } from "@dnd/data";
import {
  ABILITIES,
  abilityModifier,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  pointBuyCost,
  STANDARD_ARRAY,
  type AbilityScores,
} from "@dnd/rules";
import { useRollAbilities } from "../api";
import { ABILITY_NAMES, signed } from "../labels";
import type { StepProps } from "./Builder";

type Method = NonNullable<CharacterBuild["abilityMethod"]>;

const fromList = (values: readonly number[]): AbilityScores =>
  Object.fromEntries(ABILITIES.map((a, i) => [a, values[i]])) as AbilityScores;

/** Step 3: generate scores, then apply the background's +2/+1 or +1/+1/+1. */
export function AbilitiesStep({ characterId, build, update }: StepProps) {
  const roll = useRollAbilities(characterId);
  const background = backgrounds.find((b) => b.id === build.backgroundId);
  const method = build.abilityMethod;
  const base = build.baseScores;

  const choose = (m: Method) => {
    if (m === method) return;
    if (m === "standard") update({ abilityMethod: m, baseScores: fromList(STANDARD_ARRAY) });
    else if (m === "point-buy")
      update({ abilityMethod: m, baseScores: fromList([8, 8, 8, 8, 8, 8]) });
    else
      update({ abilityMethod: m, baseScores: build.abilityRolls && fromList(build.abilityRolls) });
  };

  /** Assigning a value another ability holds swaps the two, so the set stays intact. */
  const assign = (ability: AbilityId, value: number) => {
    if (!base) return;
    const next = { ...base };
    const holder = ABILITIES.find((a) => a !== ability && base[a] === value);
    if (holder) next[holder] = base[ability];
    next[ability] = value;
    update({ baseScores: next });
  };

  let final: AbilityScores | undefined;
  try {
    final = finalScores(build);
  } catch {
    final = undefined;
  }
  const spent = base ? pointBuyCost(base) : undefined;
  const pool = method === "standard" ? [...STANDARD_ARRAY] : (build.abilityRolls ?? []);

  return (
    <div className="stack">
      <h2>Ability scores</h2>
      <div className="chips">
        {(
          [
            ["standard", "Standard array"],
            ["point-buy", "Point buy"],
            ["roll", "Roll 4d6"],
          ] as const
        ).map(([m, label]) => (
          <label key={m} className="chip">
            <input type="radio" name="method" checked={method === m} onChange={() => choose(m)} />
            {label}
          </label>
        ))}
      </div>

      {method === "point-buy" && (
        <p className={spent !== undefined && spent > POINT_BUY_BUDGET ? "error" : "muted"}>
          Points spent: {spent ?? "?"} / {POINT_BUY_BUDGET}
        </p>
      )}
      {method === "roll" && (
        <div className="row">
          <button onClick={() => roll.mutate()} disabled={roll.isPending}>
            {build.abilityRolls ? "Roll again" : "Roll on the server"}
          </button>
          {build.abilityRolls && (
            <span className="muted">Rolled: {build.abilityRolls.join(", ")}</span>
          )}
          {roll.error && <span className="error">{roll.error.message}</span>}
        </div>
      )}

      {base && (
        <table className="scores editable">
          <thead>
            <tr>
              <th />
              <th>Base</th>
              <th>Bonus</th>
              <th>Score</th>
              <th>Mod</th>
            </tr>
          </thead>
          <tbody>
            {ABILITIES.map((a) => (
              <tr key={a}>
                <th>{ABILITY_NAMES[a]}</th>
                <td>
                  {method === "point-buy" ? (
                    <span className="stepper">
                      <button
                        disabled={base[a] <= 8}
                        onClick={() => update({ baseScores: { ...base, [a]: base[a] - 1 } })}
                      >
                        −
                      </button>
                      {base[a]}
                      <button
                        disabled={base[a] >= 15}
                        onClick={() => update({ baseScores: { ...base, [a]: base[a] + 1 } })}
                      >
                        +
                      </button>
                      <span className="muted">({POINT_BUY_COST[base[a]]})</span>
                    </span>
                  ) : (
                    <select value={base[a]} onChange={(e) => assign(a, Number(e.target.value))}>
                      {[...new Set(pool)]
                        .sort((x, y) => y - x)
                        .map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                    </select>
                  )}
                </td>
                <td>{build.backgroundBonus[a] ? `+${build.backgroundBonus[a]}` : ""}</td>
                <td>{final?.[a] ?? "—"}</td>
                <td>{final ? signed(abilityModifier(final[a])) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Background bonus</h3>
      {background ? (
        <BackgroundBonus abilities={background.abilities} build={build} update={update} />
      ) : (
        <p className="muted">Choose a background first (step 2).</p>
      )}
    </div>
  );
}

function BackgroundBonus({
  abilities,
  build,
  update,
}: {
  abilities: AbilityId[];
  build: CharacterBuild;
  update: StepProps["update"];
}) {
  const bonus = build.backgroundBonus;
  const values = Object.values(bonus);
  const mode = values.length === 3 ? "spread" : "split";
  const plus2 = abilities.find((a) => bonus[a] === 2);
  const plus1 = abilities.find((a) => bonus[a] === 1);

  return (
    <div className="stack">
      <div className="chips">
        <label className="chip">
          <input
            type="radio"
            checked={mode === "split"}
            onChange={() => update({ backgroundBonus: {} })}
          />
          +2 and +1
        </label>
        <label className="chip">
          <input
            type="radio"
            checked={mode === "spread"}
            onChange={() =>
              update({ backgroundBonus: Object.fromEntries(abilities.map((a) => [a, 1])) })
            }
          />
          +1 to all three
        </label>
      </div>
      {mode === "split" && (
        <div className="row">
          {([2, 1] as const).map((amount) => (
            <label key={amount} className="field">
              +{amount} to{" "}
              <select
                value={(amount === 2 ? plus2 : plus1) ?? ""}
                onChange={(e) => {
                  const pick = e.target.value as AbilityId;
                  const other = amount === 2 ? plus1 : plus2;
                  update({
                    backgroundBonus: {
                      [pick]: amount,
                      ...(other && other !== pick && { [other]: amount === 2 ? 1 : 2 }),
                    },
                  });
                }}
              >
                <option value="">Choose…</option>
                {abilities.map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
