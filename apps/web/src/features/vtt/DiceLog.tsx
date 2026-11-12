import type { DiceRollResult } from "@dnd/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { socket } from "../../lib/socket";
import { DiceSettings } from "../dice/DiceSettings";

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

export function DiceLog({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const log = useQuery({
    queryKey: ["rolls", campaignId],
    queryFn: () => api<DiceRollResult[]>(`/campaigns/${campaignId}/rolls`),
  });
  const [expression, setExpression] = useState("1d20");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onRolled = (r: DiceRollResult) => {
      if (r.campaignId !== campaignId) return;
      qc.setQueryData<DiceRollResult[]>(["rolls", campaignId], (prev = []) =>
        [r, ...prev].slice(0, 50),
      );
    };
    socket.on("dice:rolled", onRolled);
    return () => {
      socket.off("dice:rolled", onRolled);
    };
  }, [campaignId, qc]);

  const roll = async (toRoll: string) => {
    const res = await socket.emitWithAck("dice:roll", { campaignId, expression: toRoll });
    setError(res.ok ? null : res.error);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void roll(expression);
  };

  return (
    <div className="parchment dice-tray">
      <div className="parchment-body">
        <h2>Dadu</h2>
        <div className="dice-quick" role="group" aria-label="Lempar satu dadu">
          {QUICK_DICE.map((die) => (
            <button
              key={die}
              type="button"
              className="die"
              aria-label={`Lempar 1${die}`}
              onClick={() => void roll(`1${die}`)}
            >
              {die}
            </button>
          ))}
        </div>
        <form className="dice-form" onSubmit={onSubmit}>
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            aria-label="Rumus dadu, misalnya 2d6+3"
            size={10}
          />
          <button type="submit" className="btn btn-red btn-small">
            Lempar
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <ul className="log" aria-label="Riwayat lemparan">
          {log.data?.map((r) => (
            <li key={r.id}>
              <span className="hex roll-total">{r.total}</span>
              <span className="roll-detail">
                <b>
                  {r.by}
                  {r.secret && <span className="roll-secret-tag"> rahasia</span>}
                </b>
                <span className="ink-soft">
                  {r.label ? `${r.label} · ` : ""}
                  {r.expression} [{r.rolls.join(", ")}]
                </span>
              </span>
            </li>
          ))}
          {log.data?.length === 0 && <li className="ink-soft">Belum ada lemparan.</li>}
        </ul>
        <DiceSettings />
      </div>
    </div>
  );
}
