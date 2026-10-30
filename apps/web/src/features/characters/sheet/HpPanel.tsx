import { useState } from "react";
import type { CharacterWithIssues } from "../api";
import type { SheetActions } from "./actions";

interface Props {
  character: CharacterWithIssues;
  maxHp: number;
  hitDice: Record<number, number>;
  actions: SheetActions;
}

/** HP with damage / heal / temp, death saves at 0 HP, and rests. */
export function HpPanel({ character, maxHp, hitDice, actions }: Props) {
  const state = character.state!;
  const [amount, setAmount] = useState("");
  const [critical, setCritical] = useState(false);
  const [restDice, setRestDice] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const n = Math.max(0, Math.floor(Number(amount)) || 0);

  const change = (type: "damage" | "heal" | "temp") =>
    actions.hp.mutate(
      { type, amount: n, critical: type === "damage" && critical },
      {
        onSuccess: (c) => {
          setAmount("");
          setMessage("dead" in c && c.dead ? "Massive damage: the character dies." : null);
        },
      },
    );

  const spent = state.hitDiceSpent as Record<string, number>;
  const available = Object.entries(hitDice).map(([size, total]) => ({
    size,
    left: total - (spent[size] ?? 0),
    total,
  }));
  const pending = Object.values(actions).some((a) => a.isPending);
  const error = Object.values(actions).find((a) => a.error)?.error;

  return (
    <section className="panel">
      <h3>Hit Points</h3>
      <p className="hp">
        <strong>{state.hpCurrent}</strong> / {maxHp}
        {state.hpTemp > 0 && <span className="muted"> +{state.hpTemp} temp</span>}
      </p>
      <div className="hp-bar">
        <span
          style={{ width: `${Math.min(100, (state.hpCurrent / Math.max(1, maxHp)) * 100)}%` }}
        />
      </div>

      <div className="row">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount"
          style={{ width: "6rem" }}
        />
        <button disabled={!n || pending} onClick={() => change("damage")}>
          Damage
        </button>
        <button disabled={!n || pending} onClick={() => change("heal")}>
          Heal
        </button>
        <button disabled={!n || pending} onClick={() => change("temp")}>
          Temp HP
        </button>
      </div>
      {state.hpCurrent === 0 && (
        <label className="chip">
          <input
            type="checkbox"
            checked={critical}
            onChange={(e) => setCritical(e.target.checked)}
          />
          Damage is a Critical Hit (two failures)
        </label>
      )}

      {state.hpCurrent === 0 && (
        <div className="stack">
          <p>
            <strong>Death saves:</strong> {"●".repeat(state.deathSaves.success)}
            {"○".repeat(3 - state.deathSaves.success)} successes ·{" "}
            {"●".repeat(state.deathSaves.fail)}
            {"○".repeat(3 - state.deathSaves.fail)} failures
          </p>
          {state.deathSaves.fail >= 3 ? (
            <p className="error">Dead.</p>
          ) : (
            <button
              disabled={pending}
              onClick={() =>
                actions.deathSave.mutate(undefined, {
                  onSuccess: (c) => setMessage(`Death save: rolled ${c.roll}.`),
                })
              }
            >
              Roll death save
            </button>
          )}
        </div>
      )}

      <h4>Rest</h4>
      <p className="muted">
        Hit Point Dice: {available.map((d) => `${d.left}/${d.total} d${d.size}`).join(", ")}
      </p>
      <div className="row">
        {available.map((d) => (
          <label key={d.size} className="field">
            d{d.size}
            <input
              type="number"
              min={0}
              max={d.left}
              value={restDice[d.size] ?? 0}
              onChange={(e) =>
                setRestDice({
                  ...restDice,
                  [d.size]: Math.min(d.left, Math.max(0, Number(e.target.value) || 0)),
                })
              }
              style={{ width: "4rem" }}
            />
          </label>
        ))}
        <button
          disabled={pending || state.hpCurrent < 1}
          onClick={() =>
            actions.shortRest.mutate(
              { hitDice: restDice },
              {
                onSuccess: (c) => {
                  setRestDice({});
                  setMessage(c.healed ? `Short Rest: healed ${c.healed}.` : "Short Rest done.");
                },
              },
            )
          }
        >
          Short Rest
        </button>
        <button
          disabled={pending || state.hpCurrent < 1}
          onClick={() =>
            actions.longRest.mutate(undefined, { onSuccess: () => setMessage("Long Rest done.") })
          }
        >
          Long Rest
        </button>
      </div>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error.message}</p>}
    </section>
  );
}
