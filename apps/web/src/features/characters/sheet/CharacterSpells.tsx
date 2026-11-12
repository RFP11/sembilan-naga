import {
  classSpellLimits,
  spellsForClass,
  type ClassSpellLimits,
  type DerivedCharacter,
} from "@dnd/character";
import type { CastResult, CharacterSpell } from "@dnd/contracts";
import { spells as allSpells, type Spell } from "@dnd/data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { Prose } from "../../../lib/Prose";
import type { CharacterWithIssues } from "../api";

const levelName = (level: number) => (level === 0 ? "Cantrip" : `Level ${level}`);

function SpellText({ spell }: { spell: Spell }) {
  return (
    <>
      <p className="ink-soft spell-meta">
        {spell.castingTime} · {spell.range} · {spell.components.join(", ")}
        {spell.material && ` (${spell.material})`} · {spell.duration}
      </p>
      <Prose text={spell.description} />
      {spell.higherLevels && <Prose text={spell.higherLevels} />}
    </>
  );
}

function SpellTags({ spell }: { spell: Spell }) {
  return (
    <>
      {spell.castingTime.includes("Bonus") && <span className="spell-tag"> bonus</span>}
      {spell.castingTime.includes("Reaction") && <span className="spell-tag"> reaksi</span>}
      {spell.concentration && <span className="spell-tag"> C</span>}
      {spell.ritual && <span className="spell-tag"> R</span>}
    </>
  );
}

/** A character's spells: what they have prepared, casting them, and choosing them. */
export function CharacterSpells({
  character,
  derived,
}: {
  character: CharacterWithIssues;
  derived: DerivedCharacter;
}) {
  const qc = useQueryClient();
  const key = ["character-spells", character.id];
  const known = useQuery({
    queryKey: key,
    queryFn: () => api<CharacterSpell[]>(`/characters/${character.id}/spells`),
  });
  const limits = useMemo(() => classSpellLimits(derived.classes), [derived.classes]);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [lastCast, setLastCast] = useState<(CastResult & { name: string }) | null>(null);

  const cast = useMutation({
    mutationFn: ({ spell, slotLevel }: { spell: Spell; slotLevel?: number }) =>
      api<CastResult>(`/characters/${character.id}/cast`, {
        body: { spellId: spell.id, ...(slotLevel && { slotLevel }) },
      }).then((result) => ({ ...result, name: spell.name })),
    onSuccess: (result) => {
      setLastCast(result);
      void qc.invalidateQueries({ queryKey: ["character", character.id] });
    },
  });
  const endConcentration = useMutation({
    mutationFn: () =>
      api(`/characters/${character.id}/state`, {
        method: "PATCH",
        body: { version: character.state!.version, concentratingOn: null },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["character", character.id] }),
  });

  const rows = known.data ?? [];
  const mine = [...new Set(rows.map((r) => r.spellId))].flatMap((id) => {
    const spell = allSpells.find((s) => s.id === id);
    return spell ? [spell] : [];
  });
  const state = character.state;
  const slotsUsed = (state?.spellSlotsUsed ?? {}) as Record<string, number>;
  const slotLevels = derived.spellSlots
    .map((total, i) => ({ level: i + 1, total, left: total - (slotsUsed[String(i + 1)] ?? 0) }))
    .filter((s) => s.total > 0);
  const pact = derived.pactMagic;
  const pactLeft = pact ? pact.slots - (state?.pactSlotsUsed ?? 0) : 0;

  /** The slots a spell of this level could use, for casting it higher. */
  const slotOptions = (level: number) => [
    ...new Set([
      ...slotLevels.filter((s) => s.level >= level && s.left > 0).map((s) => s.level),
      ...(pact && pact.slotLevel >= level && pactLeft > 0 ? [pact.slotLevel] : []),
    ]),
  ];

  if (limits.length === 0 && mine.length === 0) return null;

  const chosenClass = limits.find((l) => l.classId === choosing);
  if (chosenClass) {
    return (
      <SpellPicker
        key={chosenClass.classId}
        characterId={character.id}
        limits={chosenClass}
        chosen={rows.flatMap((r) =>
          r.source === chosenClass.classId && r.spellId ? [r.spellId] : [],
        )}
        onDone={() => setChoosing(null)}
      />
    );
  }

  const levels = [...new Set(mine.map((s) => s.level))].sort((a, b) => a - b);
  const error = cast.error ?? endConcentration.error;

  return (
    <div className="char-spells">
      {(slotLevels.length > 0 || pact) && (
        <p className="spell-slots">
          <b>Slot:</b>{" "}
          {slotLevels.map((s) => (
            <span key={s.level} className={s.left === 0 ? "empty" : undefined}>
              L{s.level} {s.left}/{s.total}
            </span>
          ))}
          {pact && (
            <span className={pactLeft === 0 ? "empty" : undefined}>
              Pact L{pact.slotLevel} {pactLeft}/{pact.slots}
            </span>
          )}
        </p>
      )}

      {state?.concentratingOn && (
        <p className="spell-concentrating">
          <span>
            Concentration: <b>{state.concentratingOn}</b>
          </span>
          <button
            type="button"
            className="roll-btn"
            disabled={endConcentration.isPending}
            onClick={() => endConcentration.mutate()}
          >
            Lepas
          </button>
        </p>
      )}

      {lastCast && (
        <p className="spell-cast-note" role="status">
          <b>{lastCast.name}</b> dirapal
          {lastCast.slotLevel !== null &&
            ` dengan slot ${lastCast.pact ? "Pact " : ""}L${lastCast.slotLevel}`}
          .
          {lastCast.endedConcentration && ` Concentration ${lastCast.endedConcentration} berakhir.`}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}

      {known.isPending && <p className="ink-soft">Memuat spell…</p>}
      {known.error && (
        <p className="form-error" role="alert">
          Spell gagal dimuat: {known.error.message}
        </p>
      )}
      {known.data && mine.length === 0 && (
        <p className="ink-soft">Belum ada spell yang disiapkan. Pilih lewat tombol di bawah.</p>
      )}

      {levels.map((level) => (
        <div key={level} className="spell-level">
          <b>{levelName(level)}</b>
          {mine
            .filter((s) => s.level === level)
            .map((spell) => {
              const options = level === 0 ? [] : slotOptions(level);
              return (
                <div key={spell.id} className="spell-row">
                  <details className="stat-feature">
                    <summary>
                      {spell.name}
                      <SpellTags spell={spell} />
                    </summary>
                    <SpellText spell={spell} />
                  </details>
                  <span className="spell-actions">
                    {options.length > 1 && (
                      <select
                        aria-label={`Slot untuk ${spell.name}`}
                        id={`slot-${spell.id}`}
                        defaultValue={options[0]}
                      >
                        {options.map((o) => (
                          <option key={o} value={o}>
                            L{o}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="roll-btn roll-attack"
                      disabled={cast.isPending || (level > 0 && options.length === 0)}
                      title={
                        level > 0 && options.length === 0 ? "Tidak ada slot tersisa" : undefined
                      }
                      onClick={() => {
                        const select = document.getElementById(
                          `slot-${spell.id}`,
                        ) as HTMLSelectElement | null;
                        cast.mutate({
                          spell,
                          ...(select && { slotLevel: Number(select.value) }),
                        });
                      }}
                    >
                      Cast
                    </button>
                  </span>
                </div>
              );
            })}
        </div>
      ))}

      {limits.map((l) => {
        const picked = rows.filter((r) => r.source === l.classId).length;
        return (
          <button
            key={l.classId}
            type="button"
            className="btn btn-plain btn-small spell-choose"
            onClick={() => setChoosing(l.classId)}
          >
            Atur spell {l.className} ({picked}/{l.cantrips + l.prepared})
          </button>
        );
      })}
    </div>
  );
}

function SpellPicker({
  characterId,
  limits,
  chosen,
  onDone,
}: {
  characterId: string;
  limits: ClassSpellLimits;
  chosen: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState(() => new Set(chosen));
  const [query, setQuery] = useState("");
  const options = useMemo(() => spellsForClass(limits), [limits]);

  const save = useMutation({
    mutationFn: () =>
      api(`/characters/${characterId}/spells/${limits.classId}`, {
        method: "PUT",
        body: { spellIds: [...picked] },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["character-spells", characterId] });
      onDone();
    },
  });

  const isPicked = (s: Spell) => picked.has(s.id);
  const cantrips = options.filter((s) => s.level === 0 && isPicked(s)).length;
  const prepared = options.filter((s) => s.level > 0 && isPicked(s)).length;
  const full = (s: Spell) =>
    s.level === 0 ? cantrips >= limits.cantrips : prepared >= limits.prepared;

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((s) => s.name.toLowerCase().includes(q)) : options;
  const levels = [...new Set(shown.map((s) => s.level))].sort((a, b) => a - b);

  return (
    <div className="spell-picker">
      <p className="spell-counts" role="status">
        <b>{limits.className}</b>
        {limits.cantrips > 0 && (
          <span className={cantrips === limits.cantrips ? "full" : undefined}>
            Cantrip {cantrips}/{limits.cantrips}
          </span>
        )}
        <span className={prepared === limits.prepared ? "full" : undefined}>
          Disiapkan {prepared}/{limits.prepared}
        </span>
      </p>
      <input
        className="spell-search"
        type="search"
        aria-label="Cari spell"
        placeholder="Cari spell…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="spell-options">
        {levels.length === 0 && <p className="ink-soft">Tidak ditemukan.</p>}
        {levels.map((level) => (
          <div key={level} className="spell-level">
            <b>{levelName(level)}</b>
            {shown
              .filter((s) => s.level === level)
              .map((spell) => (
                <div key={spell.id} className="spell-row">
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${spell.name}`}
                    checked={isPicked(spell)}
                    disabled={!isPicked(spell) && full(spell)}
                    onChange={(e) =>
                      setPicked((all) => {
                        const next = new Set(all);
                        if (e.target.checked) next.add(spell.id);
                        else next.delete(spell.id);
                        return next;
                      })
                    }
                  />
                  <details className="stat-feature">
                    <summary>
                      {spell.name}
                      <SpellTags spell={spell} />
                    </summary>
                    <SpellText spell={spell} />
                  </details>
                </div>
              ))}
          </div>
        ))}
      </div>
      {save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="hero-actions">
        <button
          type="button"
          className="btn btn-red btn-small"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" className="btn btn-plain btn-small" onClick={onDone}>
          Batal
        </button>
      </div>
    </div>
  );
}
