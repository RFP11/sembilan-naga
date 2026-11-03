import type { DiceRollResult } from "@dnd/contracts";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { socket } from "../../lib/socket";

export const signedBonus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
/** "1d20+4", without a "+0" for no bonus. */
export const d20 = (bonus: number) => `1d20${bonus ? signedBonus(bonus) : ""}`;

export type Roll = (expression: string, label: string) => void;

/**
 * Rolls on the server, into the campaign's dice log. The last result is kept so it can be shown
 * right where the button is: the log may be scrolled out of view.
 */
export function useRoller(campaignId: string, secret = false) {
  const [last, setLast] = useState<DiceRollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waitingFor = useRef<string | null>(null);

  useEffect(() => {
    const onRolled = (r: DiceRollResult) => {
      if (r.campaignId === campaignId && r.label === waitingFor.current) {
        waitingFor.current = null;
        setLast(r);
      }
    };
    socket.on("dice:rolled", onRolled);
    return () => {
      socket.off("dice:rolled", onRolled);
    };
  }, [campaignId]);

  const roll = useCallback<Roll>(
    (expression, label) => {
      waitingFor.current = label;
      void socket
        .emitWithAck("dice:roll", { campaignId, expression, label, secret })
        .then((res) => setError(res.ok ? null : res.error));
    },
    [campaignId, secret],
  );

  return { roll, last, error };
}

export function RollButton({
  roll,
  expression,
  label,
  disabled,
  children,
}: {
  roll: Roll;
  expression: string;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="roll-btn"
      disabled={disabled}
      title={`Lempar ${expression}: ${label}`}
      onClick={() => roll(expression, label)}
    >
      {children}
    </button>
  );
}

/** The latest result, kept in view at the top of the panel. */
export function RollResult({ last, error }: { last: DiceRollResult | null; error: string | null }) {
  if (error) {
    return (
      <p className="form-error roll-result" role="alert">
        {error}
      </p>
    );
  }
  if (!last) return null;
  const natural = last.expression.startsWith("1d20") ? last.rolls[0] : undefined;
  return (
    <div className="roll-result" role="status">
      <span className="hex roll-total">{last.total}</span>
      <span className="roll-detail">
        <b>{last.label}</b>
        <span className="ink-soft">
          {last.expression} [{last.rolls.join(", ")}]{natural === 20 && " · natural 20!"}
          {natural === 1 && " · natural 1"}
          {last.secret && " · rahasia"}
        </span>
      </span>
    </div>
  );
}
