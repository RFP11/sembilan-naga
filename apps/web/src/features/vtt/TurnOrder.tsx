import type { Combatant, Encounter, Token } from "@dnd/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReactionPrompts, TurnReminders } from "./TurnHelpers";
import {
  useAddCombatants,
  useEndEncounter,
  useNextTurn,
  useRemoveCombatant,
  useSetInitiative,
  useStartEncounter,
} from "./api";

const KIND_CLASS: Record<Token["kind"], string> = {
  monster: "kind-monster",
  npc: "kind-npc",
  character: "kind-character",
  object: "kind-object",
};

/**
 * Slides each card from where it was to where it is now, so the one that just acted can be seen
 * travelling to the bottom instead of the list simply changing.
 */
function useCardMotion(order: string) {
  const cards = useRef(new Map<string, HTMLElement>());
  const previous = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = new Map<string, number>();
    for (const [id, el] of cards.current) {
      const top = el.offsetTop;
      now.set(id, top);
      const before = previous.current.get(id);
      if (before === undefined || before === top || reduced) continue;
      el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], {
        duration: 420,
        easing: "cubic-bezier(.3,.8,.3,1)",
      });
    }
    previous.current = now;
  }, [order]);

  return (id: string) => (el: HTMLElement | null) => {
    if (el) cards.current.set(id, el);
    else cards.current.delete(id);
  };
}

/** The turn order, as cards down the left of the table. */
export function TurnOrder({
  campaignId,
  encounter,
  tokens,
  isDm,
  selectedTokenId,
  onSelectToken,
}: {
  campaignId: string;
  encounter: Encounter | null;
  tokens: Token[];
  isDm: boolean;
  selectedTokenId: string | null;
  onSelectToken: (id: string) => void;
}) {
  if (!encounter) {
    return isDm ? <EncounterSetup campaignId={campaignId} tokens={tokens} /> : null;
  }
  return (
    <RunningEncounter
      campaignId={campaignId}
      encounter={encounter}
      tokens={tokens}
      isDm={isDm}
      selectedTokenId={selectedTokenId}
      onSelectToken={onSelectToken}
    />
  );
}

function TokenChecklist({
  tokens,
  initiallyChecked,
  action,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  tokens: Token[];
  initiallyChecked: (t: Token) => boolean;
  action: string;
  busy: boolean;
  error: Error | null;
  onSubmit: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(
    () => new Set(tokens.filter(initiallyChecked).map((t) => t.id)),
  );
  const toggle = (id: string) =>
    setChecked((all) => {
      const next = new Set(all);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const picked = tokens.filter((t) => checked.has(t.id)).map((t) => t.id);

  return (
    <div className="turn-pick">
      <ul>
        {tokens.map((t) => (
          <li key={t.id}>
            <label>
              <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggle(t.id)} />
              <span>
                {t.name}
                {t.hidden && <span className="muted"> (tersembunyi)</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p className="map-error" role="alert">
          {error.message}
        </p>
      )}
      <button
        type="button"
        className="btn btn-red btn-small"
        disabled={busy || picked.length === 0}
        onClick={() => onSubmit(picked)}
      >
        {busy ? "Melempar…" : `${action} (${picked.length})`}
      </button>
      <button type="button" className="btn btn-plain btn-small" onClick={onCancel}>
        Batal
      </button>
    </div>
  );
}

function EncounterSetup({ campaignId, tokens }: { campaignId: string; tokens: Token[] }) {
  const [picking, setPicking] = useState(false);
  const start = useStartEncounter(campaignId);

  return (
    <div className="turn-rail">
      <h2>Encounter</h2>
      {tokens.length === 0 ? (
        <p className="muted">Tambahkan token ke peta untuk memulai.</p>
      ) : picking ? (
        <TokenChecklist
          tokens={tokens}
          initiallyChecked={(t) => t.kind !== "object"}
          action="Lempar inisiatif"
          busy={start.isPending}
          error={start.error}
          onSubmit={(tokenIds) => start.mutate(tokenIds, { onSuccess: () => setPicking(false) })}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <button type="button" className="btn btn-red btn-small" onClick={() => setPicking(true)}>
          Mulai encounter
        </button>
      )}
    </div>
  );
}

function RunningEncounter({
  campaignId,
  encounter,
  tokens,
  isDm,
  selectedTokenId,
  onSelectToken,
}: {
  campaignId: string;
  encounter: Encounter;
  tokens: Token[];
  isDm: boolean;
  selectedTokenId: string | null;
  onSelectToken: (id: string) => void;
}) {
  const next = useNextTurn(campaignId);
  const end = useEndEncounter(campaignId);
  const add = useAddCombatants(campaignId);
  const [adding, setAdding] = useState(false);
  const cardRef = useCardMotion(encounter.combatants.map((c) => c.id).join());

  const inFight = new Set(encounter.combatants.map((c) => c.tokenId));
  const outside = tokens.filter((t) => !inFight.has(t.id));
  const error = next.error ?? end.error;

  return (
    <div className="turn-rail">
      <div className="turn-head">
        <h2>Ronde {encounter.round}</h2>
        {!encounter.currentId && <span className="muted">Menunggu…</span>}
      </div>

      {encounter.canEndTurn && encounter.currentId && (
        <button
          type="button"
          className="btn btn-red btn-small turn-end"
          disabled={next.isPending}
          onClick={() => next.mutate(encounter.currentId!)}
        >
          Akhiri giliran
        </button>
      )}
      {error && (
        <p className="map-error" role="alert">
          {error.message}
        </p>
      )}

      <ReactionPrompts
        campaignId={campaignId}
        encounter={encounter}
        onSelectToken={onSelectToken}
      />
      <TurnReminders campaignId={campaignId} encounter={encounter} isDm={isDm} />

      <ol className="turn-cards" aria-label="Urutan giliran">
        {encounter.combatants.map((c) => (
          <li key={c.id} ref={cardRef(c.id)}>
            {c.startsNextRound && <p className="turn-divider">Ronde {encounter.round + 1}</p>}
            <TurnCard
              campaignId={campaignId}
              combatant={c}
              isDm={isDm}
              selected={c.tokenId === selectedTokenId}
              onSelect={() => onSelectToken(c.tokenId)}
            />
          </li>
        ))}
      </ol>

      {isDm && (
        <div className="turn-tools">
          {adding ? (
            <TokenChecklist
              tokens={outside}
              initiallyChecked={() => false}
              action="Tambahkan"
              busy={add.isPending}
              error={add.error}
              onSubmit={(tokenIds) => add.mutate(tokenIds, { onSuccess: () => setAdding(false) })}
              onCancel={() => setAdding(false)}
            />
          ) : (
            outside.length > 0 && (
              <button
                type="button"
                className="btn btn-plain btn-small"
                onClick={() => setAdding(true)}
              >
                Tambah token
              </button>
            )
          )}
          <button
            type="button"
            className="btn btn-plain btn-small"
            disabled={end.isPending}
            onClick={() => {
              if (window.confirm("Akhiri encounter ini?")) end.mutate();
            }}
          >
            Akhiri encounter
          </button>
        </div>
      )}
    </div>
  );
}

function TurnCard({
  campaignId,
  combatant: c,
  isDm,
  selected,
  onSelect,
}: {
  campaignId: string;
  combatant: Combatant;
  isDm: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const setInitiative = useSetInitiative(campaignId);
  const remove = useRemoveCombatant(campaignId);
  const [value, setValue] = useState(String(c.initiative));
  useEffect(() => setValue(String(c.initiative)), [c.initiative]);

  const save = () => {
    const number = Number(value);
    if (value.trim() === "" || !Number.isInteger(number)) setValue(String(c.initiative));
    else if (number !== c.initiative) setInitiative.mutate({ id: c.id, initiative: number });
  };

  const share = c.hpMax ? Math.max(0, Math.min(1, (c.hpCurrent ?? 0) / c.hpMax)) : null;
  const classes = [
    "turn-card",
    KIND_CLASS[c.kind],
    c.isCurrent && "current",
    selected && "selected",
    c.hidden && "hidden-token",
    share === 0 && "down",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-current={c.isCurrent ? "step" : undefined}>
      {c.isCurrent && <span className="turn-flag">Giliran</span>}
      <button type="button" className="turn-main" onClick={onSelect}>
        <span className="turn-name">{c.name}</span>
        {c.hidden && <span className="turn-note">tersembunyi</span>}
        {c.ac !== null && (
          <span className="turn-note">
            AC {c.ac}
            {c.passivePerception !== null && ` · PP ${c.passivePerception}`}
          </span>
        )}
        {c.reactionUsed && <span className="turn-note">reaksi terpakai</span>}
        {share !== null && (
          <span className="turn-hp" aria-label={`HP ${c.hpCurrent} dari ${c.hpMax}`}>
            <span
              style={{ width: `${share * 100}%` }}
              className={share > 0.5 ? "good" : share > 0.25 ? "warn" : "bad"}
            />
          </span>
        )}
      </button>
      {isDm ? (
        <input
          className="turn-init"
          type="number"
          aria-label={`Inisiatif ${c.name}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      ) : (
        <span className="turn-init" aria-label={`Inisiatif ${c.initiative}`}>
          {c.initiative}
        </span>
      )}
      {isDm && (
        <button
          type="button"
          className="turn-remove"
          aria-label={`Keluarkan ${c.name} dari encounter`}
          title="Keluarkan dari encounter"
          disabled={remove.isPending}
          onClick={() => remove.mutate(c.id)}
        >
          ×
        </button>
      )}
    </div>
  );
}
