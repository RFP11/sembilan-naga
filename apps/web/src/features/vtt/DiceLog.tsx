import type { DiceRollResult } from "@dnd/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { socket } from "../../lib/socket";

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
      {error && <p className="error">{error}</p>}
      <ul className="log">
        {log.data?.map((r) => (
          <li key={r.id}>
            <strong>{r.total}</strong>{" "}
            <span className="muted">
              {r.by}: {r.label ? `${r.label} · ` : ""}
              {r.expression} [{r.rolls.join(", ")}]
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
