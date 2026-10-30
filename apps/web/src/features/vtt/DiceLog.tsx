import type { DiceRollResult } from "@dnd/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { socket } from "../../lib/socket";

export function DiceLog({ campaignId }: { campaignId: string }) {
  const [log, setLog] = useState<DiceRollResult[]>([]);
  const [expression, setExpression] = useState("1d20");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onRolled = (r: DiceRollResult) => setLog((prev) => [r, ...prev].slice(0, 50));
    socket.on("dice:rolled", onRolled);
    return () => {
      socket.off("dice:rolled", onRolled);
    };
  }, []);

  const roll = async (e: FormEvent) => {
    e.preventDefault();
    const res = await socket.emitWithAck("dice:roll", { campaignId, expression });
    setError(res.ok ? null : res.error);
  };

  return (
    <div>
      <form onSubmit={roll} style={{ display: "flex", gap: "0.5rem" }}>
        <input value={expression} onChange={(e) => setExpression(e.target.value)} size={10} />
        <button type="submit">Roll</button>
      </form>
      {error && <p style={{ color: "var(--accent)" }}>{error}</p>}
      <ul className="log">
        {log.map((r, i) => (
          <li key={log.length - i}>
            <strong>{r.total}</strong>{" "}
            <span className="muted">
              {r.by}: {r.expression} [{r.rolls.join(", ")}]
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
