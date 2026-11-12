import type {
  AttackMode,
  AttackResult,
  DamageResult,
  ReactionPrompt,
  StartAttackRequest,
} from "@dnd/contracts";
import { useMutation } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { api } from "../../lib/api";
import { useRoller } from "./rolls";

export interface AttackPlan {
  attackerTokenId: string;
  source: StartAttackRequest["source"];
  name: string;
  toHit: number;
  /** For rolling without a target. */
  expression: string;
  label: string;
}

interface AttackFlow {
  /** Whether a click on the map picks a target right now. */
  aiming: AttackPlan | null;
  mode: AttackMode;
  setMode: (mode: AttackMode) => void;
  /** Starts an attack: asks for a target, unless it's answering a reaction. */
  aim: (plan: AttackPlan) => void;
  cancel: () => void;
  /** A target was clicked. */
  pickTarget: (targetTokenId: string) => void;
  /** The opportunity attack being answered; its target is already known. */
  reaction: ReactionPrompt | null;
  answerReaction: (reaction: ReactionPrompt | null) => void;
  rollWithoutTarget: () => void;
  result: AttackResult | null;
  error: string | null;
  busy: boolean;
  closeResult: () => void;
  /** The token standing for a character on this map, if any. */
  tokenOfCharacter: (characterId: string) => string | null;
  campaignId: string;
}

const Context = createContext<AttackFlow | null>(null);
export const useAttackFlow = () => useContext(Context);

export function AttackFlowProvider({
  campaignId,
  tokenOfCharacter,
  children,
}: {
  campaignId: string;
  tokenOfCharacter: (characterId: string) => string | null;
  children: React.ReactNode;
}) {
  const [aiming, setAiming] = useState<AttackPlan | null>(null);
  const [mode, setMode] = useState<AttackMode>("normal");
  const [reaction, setReaction] = useState<ReactionPrompt | null>(null);
  const { roll } = useRoller(campaignId);

  const launch = useMutation({
    mutationFn: (body: StartAttackRequest) =>
      api<AttackResult>(`/campaigns/${campaignId}/attacks`, { body }),
  });

  const fire = (plan: AttackPlan, targetTokenId: string, reactionId?: string) => {
    setAiming(null);
    setReaction(null);
    launch.mutate({
      attackerTokenId: plan.attackerTokenId,
      targetTokenId,
      source: plan.source,
      mode,
      ...(reactionId && { reactionId }),
    });
    setMode("normal");
  };

  const flow: AttackFlow = {
    aiming,
    mode,
    setMode,
    reaction,
    answerReaction: setReaction,
    aim: (plan) => {
      launch.reset();
      if (reaction && reaction.reactorTokenId === plan.attackerTokenId) {
        fire(plan, reaction.targetTokenId, reaction.id);
      } else {
        setAiming(plan);
      }
    },
    cancel: () => {
      setAiming(null);
      setMode("normal");
    },
    pickTarget: (targetTokenId) => {
      if (aiming && targetTokenId !== aiming.attackerTokenId) fire(aiming, targetTokenId);
    },
    rollWithoutTarget: () => {
      if (aiming) roll(aiming.expression, aiming.label);
      setAiming(null);
      setMode("normal");
    },
    result: launch.data ?? null,
    error: launch.error?.message ?? null,
    busy: launch.isPending,
    closeResult: () => launch.reset(),
    tokenOfCharacter,
    campaignId,
  };

  return <Context.Provider value={flow}>{children}</Context.Provider>;
}

const MODES: { value: AttackMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "advantage", label: "Advantage" },
  { value: "disadvantage", label: "Disadvantage" },
];

/** Above the map while choosing a target. */
export function AttackBar() {
  const flow = useAttackFlow();
  if (!flow) return null;
  if (flow.reaction && !flow.aiming) {
    return (
      <div className="attack-bar" role="status">
        <b>
          Opportunity attack: pilih serangan {flow.reaction.reactorName} ke{" "}
          {flow.reaction.targetName}.
        </b>
        <button
          type="button"
          className="btn btn-plain btn-small"
          onClick={() => flow.answerReaction(null)}
        >
          Batal
        </button>
      </div>
    );
  }
  if (!flow.aiming) return null;
  return (
    <div className="attack-bar" role="status">
      <b>
        Klik target untuk {flow.aiming.name} ({flow.aiming.toHit >= 0 ? "+" : ""}
        {flow.aiming.toHit})
      </b>
      <span className="calib-zoom" role="group" aria-label="Jenis lemparan">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={flow.mode === m.value}
            onClick={() => flow.setMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </span>
      <button type="button" className="btn btn-plain btn-small" onClick={flow.rollWithoutTarget}>
        Lempar tanpa target
      </button>
      <button type="button" className="btn btn-plain btn-small" onClick={flow.cancel}>
        Batal
      </button>
    </div>
  );
}

/** The attack's outcome, and on a hit the step that applies its damage. */
export function AttackPanel() {
  const flow = useAttackFlow();
  if (!flow || (!flow.result && !flow.error)) return null;
  return (
    <div className="parchment attack-panel">
      <div className="parchment-body">
        {flow.error && (
          <p className="form-error" role="alert">
            {flow.error}
          </p>
        )}
        {flow.result && (
          <AttackOutcome key={`${flow.result.id}-${flow.result.total}`} result={flow.result} />
        )}
        <button type="button" className="btn btn-plain btn-small" onClick={flow.closeResult}>
          Tutup
        </button>
      </div>
    </div>
  );
}

function AttackOutcome({ result }: { result: AttackResult }) {
  const flow = useAttackFlow()!;
  const [picked, setPicked] = useState(() => result.damage.map((d) => d.selected));
  const [extra, setExtra] = useState("");

  const damage = useMutation({
    mutationFn: () =>
      api<DamageResult>(`/campaigns/${flow.campaignId}/attacks/${result.id}/damage`, {
        body: {
          include: picked.flatMap((on, i) => (on ? [i] : [])),
          ...(extra.trim() && { extraDice: extra.trim() }),
        },
      }),
  });

  const natural =
    result.mode === "disadvantage" ? Math.min(...result.rolls) : Math.max(...result.rolls);
  const verdict = result.critical ? "KRITIS!" : result.hit ? "KENA" : "MELESET";

  return (
    <>
      <p className="ink-soft attack-who">
        {result.attackerName} → {result.targetName}: {result.name}
      </p>
      <div className={`attack-verdict ${result.hit ? "hit" : "miss"}`} role="status">
        <span className="hex roll-total">{result.total}</span>
        <span>
          <b>{verdict}</b>
          <span className="ink-soft attack-math">
            {result.mode !== "normal" && `[${result.rolls.join(", ")}] `}
            {natural}
            {result.toHit >= 0 ? " + " : " − "}
            {Math.abs(result.toHit)}
            {result.targetAc !== null && ` vs AC ${result.targetAc}`}
          </span>
        </span>
      </div>

      {result.hit && !damage.data && (
        <div className="attack-damage">
          {result.critical && <p className="attack-crit">Dadu damage dilempar dua kali.</p>}
          {result.damage.map((d, i) => (
            <label key={`${d.dice}-${i}`} className="calib-check">
              <input
                type="checkbox"
                checked={picked[i] ?? false}
                onChange={(e) =>
                  setPicked((all) => all.map((on, n) => (n === i ? e.target.checked : on)))
                }
              />
              {d.dice} {d.type}
              {d.conditional && <span className="ink-soft"> (bersyarat)</span>}
            </label>
          ))}
          <label className="attack-extra">
            Dadu tambahan (Sneak Attack, Smite…)
            <input
              value={extra}
              placeholder="misalnya 2d6"
              onChange={(e) => setExtra(e.target.value)}
            />
          </label>
          {damage.error && (
            <p className="form-error" role="alert">
              {damage.error.message}
            </p>
          )}
          <button
            type="button"
            className="btn btn-red btn-small"
            disabled={damage.isPending || (!picked.some(Boolean) && !extra.trim())}
            onClick={() => damage.mutate()}
          >
            {damage.isPending ? "Melempar…" : "Lempar damage"}
          </button>
        </div>
      )}

      {damage.data && (
        <div className="attack-applied" role="status">
          <p className="attack-total">
            <b>{damage.data.applied} damage</b> ke {damage.data.targetName}
            {damage.data.critical && " (kritis)"}
          </p>
          <ul>
            {damage.data.parts.map((p, i) => (
              <li key={`${p.dice}-${i}`}>
                {p.dice} {p.type}: {p.rolled}
                {p.note && (
                  <b>
                    {" "}
                    → {p.applied} ({p.note})
                  </b>
                )}
              </li>
            ))}
          </ul>
          {damage.data.targetDown && (
            <p className="attack-warn">{damage.data.targetName} jatuh ke 0 HP.</p>
          )}
          {damage.data.concentrationDc !== null && (
            <p className="attack-warn">
              {damage.data.targetName} harus save CON DC {damage.data.concentrationDc} agar
              concentration pada {damage.data.concentratingOn} tidak putus.
            </p>
          )}
        </div>
      )}
    </>
  );
}
