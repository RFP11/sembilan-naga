import type { Encounter } from "@dnd/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAttackFlow } from "./attackFlow";
import { RollButton, RollResult, useRoller } from "./rolls";

/** Opportunity attacks this viewer can take right now. */
export function ReactionPrompts({
  campaignId,
  encounter,
  onSelectToken,
}: {
  campaignId: string;
  encounter: Encounter;
  onSelectToken: (id: string) => void;
}) {
  const flow = useAttackFlow();
  const qc = useQueryClient();
  const letGo = useMutation({
    mutationFn: (id: string) =>
      api(`/campaigns/${campaignId}/reactions/${id}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["encounter", campaignId] }),
  });
  if (encounter.reactions.length === 0) return null;

  return (
    <div className="turn-reactions">
      {encounter.reactions.map((r) => (
        <div key={r.id} className="turn-reaction" role="status">
          <p>
            <b>{r.targetName}</b> keluar dari jangkauan <b>{r.reactorName}</b>. Opportunity attack?
          </p>
          <button
            type="button"
            className="btn btn-red btn-small"
            onClick={() => {
              flow?.answerReaction(r);
              onSelectToken(r.reactorTokenId);
            }}
          >
            Serang
          </button>
          <button
            type="button"
            className="btn btn-plain btn-small"
            disabled={letGo.isPending}
            onClick={() => letGo.mutate(r.id)}
          >
            Abaikan
          </button>
        </div>
      ))}
    </div>
  );
}

/** What's easy to forget on this turn, for whoever controls the acting token. */
export function TurnReminders({
  campaignId,
  encounter,
  isDm,
}: {
  campaignId: string;
  encounter: Encounter;
  isDm: boolean;
}) {
  const { roll, last, error } = useRoller(campaignId, isDm);
  const qc = useQueryClient();
  const deathSave = useMutation({
    mutationFn: (characterId: string) =>
      api(`/characters/${characterId}/death-save`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["encounter", campaignId] }),
  });
  if (encounter.reminders.length === 0) return null;
  const acting = encounter.combatants.find((c) => c.isCurrent)?.name ?? "";

  return (
    <details className="turn-reminders" open>
      <summary>Jangan lupa ({encounter.reminders.length})</summary>
      <RollResult last={last} error={error} />
      {encounter.reminders.map((r) => (
        <div key={`${r.type}-${r.title}`} className={`turn-reminder reminder-${r.type}`}>
          {r.type === "trait" || r.type === "feature" ? (
            <details>
              <summary>{r.title}</summary>
              <p>{r.detail}</p>
            </details>
          ) : (
            <>
              <b>{r.title}</b>
              <p>{r.detail}</p>
            </>
          )}
          {r.type === "recharge" && (
            <RollButton roll={roll} expression="1d6" label={`${acting}: recharge ${r.title}`}>
              Lempar 1d6
            </RollButton>
          )}
          {r.type === "deathSave" && encounter.currentCharacterId && (
            <button
              type="button"
              className="btn btn-red btn-small"
              disabled={deathSave.isPending}
              onClick={() => deathSave.mutate(encounter.currentCharacterId!)}
            >
              Lempar death save
            </button>
          )}
        </div>
      ))}
      {deathSave.error && (
        <p className="map-error" role="alert">
          {deathSave.error.message}
        </p>
      )}
    </details>
  );
}
