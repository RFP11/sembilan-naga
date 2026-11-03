import { checkBonuses, deriveCharacter, equippedDefense, weaponAttacks } from "@dnd/character";
import { backgrounds, classes, feats, languages, species } from "@dnd/data";
import type { Character } from "@dnd/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Prose } from "../../lib/Prose";
import { socket } from "../../lib/socket";
import { useCharacter } from "../characters/api";
import { ABILITY_SHORT, ALIGNMENTS, classSummary, signed, speciesName } from "../characters/labels";
import { CharacterSpells } from "../characters/sheet/CharacterSpells";
import { itemName } from "../characters/sheet/Inventory";
import { useAttackFlow } from "./attackFlow";
import { d20, RollButton, RollResult, useRoller } from "./rolls";

const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

interface Feature {
  key: string;
  name: string;
  source: string;
  description: string;
}

const isBonusAction = (f: Feature) => /\bBonus Action\b/.test(f.description);
const isReaction = (f: Feature) => /\bReaction\b/.test(f.description);

function FeatureItems({ features }: { features: Feature[] }) {
  return (
    <>
      {features.map((f) => (
        <details key={f.key} className="stat-feature">
          <summary>
            {f.name} <span className="ink-soft">· {f.source}</span>
          </summary>
          <Prose text={f.description} />
        </details>
      ))}
    </>
  );
}

/** Fixing HP by hand, and death saves at 0 HP, right on the sheet at the table. */
function HpControls({ character }: { character: Character }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["character", character.id] });
  const setHp = useMutation({
    mutationFn: (amount: number) =>
      api(`/characters/${character.id}/hp`, { body: { type: "set", amount } }),
    onSuccess: () => setValue(""),
    onSettled: refresh,
  });
  const deathSave = useMutation({
    mutationFn: () => api(`/characters/${character.id}/death-save`, { method: "POST" }),
    onSettled: refresh,
  });
  const stabilize = useMutation({
    mutationFn: () =>
      api(`/characters/${character.id}/state`, {
        method: "PATCH",
        body: { version: character.state!.version, deathSaves: { success: 3, fail: 0 } },
      }),
    onSettled: refresh,
  });
  const state = character.state;
  if (!state) return null;
  const { success, fail } = state.deathSaves;
  const error = setHp.error ?? deathSave.error ?? stabilize.error;

  return (
    <>
      {state.hpCurrent === 0 && (
        <div className="death-saves">
          <p>
            <b>Death save:</b> sukses {success}/3 · gagal {fail}/3
          </p>
          {fail >= 3 ? (
            <p className="death-dead">
              <b>Mati.</b>
            </p>
          ) : success >= 3 ? (
            <p className="death-stable">
              <b>Stabil.</b> Tidak perlu death save lagi. HP tetap 0 sampai pulih 1 HP setelah 1d4
              jam, atau disembuhkan.
            </p>
          ) : (
            <span className="death-actions">
              <button
                type="button"
                className="btn btn-red btn-small"
                disabled={deathSave.isPending}
                onClick={() => deathSave.mutate()}
              >
                Lempar death save
              </button>
              <button
                type="button"
                className="btn btn-plain btn-small"
                title="Berhasil distabilkan dengan Help dan Medicine DC 10"
                disabled={stabilize.isPending}
                onClick={() => stabilize.mutate()}
              >
                Stabilkan
              </button>
            </span>
          )}
        </div>
      )}
      <form
        className="hp-controls"
        onSubmit={(e) => {
          e.preventDefault();
          if (value !== "") setHp.mutate(Number(value));
        }}
      >
        <input
          type="number"
          min={0}
          aria-label="HP baru"
          placeholder="HP"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="roll-btn" disabled={value === "" || setHp.isPending}>
          Set HP
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
    </>
  );
}

function RollSticky(props: Parameters<typeof RollResult>[0]) {
  if (!props.last && !props.error) return null;
  return (
    <div className="roll-sticky">
      <RollResult {...props} />
    </div>
  );
}

/**
 * A character at a glance, for its owner and the DM. Loaded only when a character's token is
 * selected, because it needs the SRD data.
 */
export function CharacterStatBlock({
  characterId,
  campaignId,
}: {
  characterId: string;
  campaignId: string;
}) {
  const query = useCharacter(characterId);
  const { roll, last, error } = useRoller(campaignId);
  const flow = useAttackFlow();
  const qc = useQueryClient();
  const character = query.data;

  useEffect(() => {
    const onUpdated = (e: { characterId: string }) => {
      if (e.characterId === characterId)
        void qc.invalidateQueries({ queryKey: ["character", characterId] });
    };
    socket.on("character:updated", onUpdated);
    return () => {
      socket.off("character:updated", onUpdated);
    };
  }, [characterId, qc]);

  const derived = useMemo(
    () => (character ? deriveCharacter(character.build, equippedDefense(character.items)) : null),
    [character],
  );
  const bonuses = useMemo(() => (derived ? checkBonuses(derived) : null), [derived]);
  const attacks = useMemo(
    () => (derived && character ? weaponAttacks(derived, character.items) : []),
    [derived, character],
  );

  const features = useMemo<Feature[]>(() => {
    if (!character || !derived) return [];
    const list: Feature[] = [];
    for (const { classId, level } of derived.classes) {
      const cls = classes.find((c) => c.id === classId);
      if (!cls) continue;
      for (const f of cls.features) {
        if (f.level <= level) {
          list.push({
            key: `${classId}:${f.level}:${f.name}`,
            name: f.name,
            source: `${cls.name} ${f.level}`,
            description: f.description,
          });
        }
      }
      const hasSubclass = character.build.levels.some(
        (l) => l.classId === classId && l.subclassId === cls.subclass.id,
      );
      if (hasSubclass) {
        for (const f of cls.subclass.features) {
          if (f.level <= level) {
            list.push({
              key: `${cls.subclass.id}:${f.level}:${f.name}`,
              name: f.name,
              source: `${cls.subclass.name} ${f.level}`,
              description: f.description,
            });
          }
        }
      }
    }
    const race = species.find((s) => s.id === character.build.speciesId);
    for (const t of race?.traits ?? []) {
      list.push({
        key: `species:${t.name}`,
        name: t.name,
        source: race!.name,
        description: t.description,
      });
    }
    const background = backgrounds.find((b) => b.id === character.build.backgroundId);
    const featIds = [background?.feat, character.build.choices["species:feat"]];
    for (const id of featIds) {
      const feat = typeof id === "string" ? feats.find((x) => x.id === id) : undefined;
      if (feat) {
        list.push({
          key: `feat:${feat.id}`,
          name: feat.name,
          source: "Feat",
          description: feat.description,
        });
      }
    }
    return list;
  }, [character, derived]);

  if (query.isPending) return <p className="ink-soft">Memuat karakter…</p>;
  if (query.error || !character || !derived || !bonuses) {
    return (
      <p className="form-error" role="alert">
        Data karakter gagal dimuat{query.error ? `: ${query.error.message}` : "."}
      </p>
    );
  }

  const state = character.state;
  const who = character.build.name;
  const tokenId = flow?.tokenOfCharacter(characterId) ?? null;
  const bonusActions = features.filter(isBonusAction);
  const reactions = features.filter(isReaction);
  const otherFeatures = features.filter((f) => !isBonusAction(f) && !isReaction(f));
  const skillBonus = (id: string) => bonuses.skills.find((x) => x.id === id)?.bonus ?? 0;
  const facts: [string, string | undefined][] = [
    ["Background", backgrounds.find((b) => b.id === character.build.backgroundId)?.name],
    ["Alignment", ALIGNMENTS.find((a) => a.id === character.build.alignment)?.name],
    [
      "Bahasa",
      character.build.languages
        .map((id) => languages.find((l) => l.id === id)?.name ?? id)
        .join(", "),
    ],
    ["Tahan", derived.resistances.join(", ")],
    ["Darkvision", derived.darkvision ? `${derived.darkvision} ft.` : undefined],
    ["Passive Insight", String(10 + skillBonus("insight"))],
    ["Passive Investigation", String(10 + skillBonus("investigation"))],
  ];
  return (
    <div className="stat-block">
      <RollSticky last={last} error={error} />
      <h2>{character.build.name}</h2>
      <p className="ink-soft stat-sub">
        {speciesName(character.build.speciesId)} · {classSummary(derived.classes)} · Level{" "}
        {derived.level}
      </p>

      <dl className="stat-numbers">
        <div>
          <dt>AC</dt>
          <dd>{derived.ac}</dd>
        </div>
        <div>
          <dt>HP</dt>
          <dd>
            {state ? `${state.hpCurrent} / ` : ""}
            {derived.maxHp}
            {state && state.hpTemp > 0 ? ` (+${state.hpTemp})` : ""}
          </dd>
        </div>
        <div>
          <dt>Inisiatif</dt>
          <dd>
            <RollButton
              roll={roll}
              expression={d20(derived.initiative)}
              label={`${who}: inisiatif`}
            >
              {signed(derived.initiative)}
            </RollButton>
          </dd>
        </div>
        <div>
          <dt>Kecepatan</dt>
          <dd>{derived.speed} ft.</dd>
        </div>
        <div>
          <dt>Passive Perc.</dt>
          <dd>{derived.passivePerception}</dd>
        </div>
        <div>
          <dt>Prof.</dt>
          <dd>{signed(derived.proficiencyBonus)}</dd>
        </div>
      </dl>

      <HpControls character={character} />

      <table className="stat-abilities">
        <thead>
          <tr>
            <th />
            {bonuses.abilities.map((a) => (
              <th key={a.ability}>{ABILITY_SHORT[a.ability]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Skor</th>
            {bonuses.abilities.map((a) => (
              <td key={a.ability}>{derived.scores?.[a.ability]}</td>
            ))}
          </tr>
          <tr>
            <th>Mod</th>
            {bonuses.abilities.map((a) => (
              <td key={a.ability}>
                <RollButton
                  roll={roll}
                  expression={d20(a.bonus)}
                  label={`${who}: check ${ABILITY_SHORT[a.ability]}`}
                >
                  {signed(a.bonus)}
                </RollButton>
              </td>
            ))}
          </tr>
          <tr>
            <th>Save</th>
            {bonuses.abilities.map((a) => (
              <td key={a.ability}>
                <RollButton
                  roll={roll}
                  expression={d20(bonuses.saves.find((s) => s.ability === a.ability)!.bonus)}
                  label={`${who}: save ${ABILITY_SHORT[a.ability]}`}
                >
                  {signed(bonuses.saves.find((s) => s.ability === a.ability)!.bonus)}
                </RollButton>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {state && state.conditions.length > 0 && (
        <p>
          <b>Kondisi:</b> {state.conditions.join(", ")}
        </p>
      )}

      <details className="stat-section" open>
        <summary>Serangan</summary>
        {attacks.length === 0 && <p className="ink-soft">Tidak ada senjata di inventaris.</p>}
        {attacks.map((a) => (
          <div key={a.itemId} className="stat-entry">
            <b>
              {a.name}
              {!a.equipped && <span className="ink-soft"> (tidak dipakai)</span>}
              {!a.proficient && <span className="ink-soft"> (tidak mahir)</span>}
            </b>
            {a.range && <p className="ink-soft">{a.range}</p>}
            <div className="roll-row">
              {tokenId && flow ? (
                <>
                  <button
                    type="button"
                    className="roll-btn roll-attack"
                    onClick={() =>
                      flow.aim({
                        attackerTokenId: tokenId,
                        source: { kind: "weapon", itemId: a.itemId, versatile: false },
                        name: a.name,
                        toHit: a.toHit,
                        expression: d20(a.toHit),
                        label: `${who}: ${a.name}`,
                      })
                    }
                  >
                    Serang {signed(a.toHit)}
                  </button>
                  {a.versatileDamage && (
                    <button
                      type="button"
                      className="roll-btn roll-attack"
                      onClick={() =>
                        flow.aim({
                          attackerTokenId: tokenId,
                          source: { kind: "weapon", itemId: a.itemId, versatile: true },
                          name: `${a.name} (dua tangan)`,
                          toHit: a.toHit,
                          expression: d20(a.toHit),
                          label: `${who}: ${a.name}`,
                        })
                      }
                    >
                      Serang dua tangan
                    </button>
                  )}
                </>
              ) : (
                <RollButton roll={roll} expression={d20(a.toHit)} label={`${who}: ${a.name}`}>
                  Lempar {signed(a.toHit)}
                </RollButton>
              )}
              <RollButton
                roll={roll}
                expression={a.damage}
                label={`${who}: ${a.name} damage (${a.damageType})`}
              >
                {a.damage} {a.damageType}
              </RollButton>
              {a.versatileDamage && (
                <RollButton
                  roll={roll}
                  expression={a.versatileDamage}
                  label={`${who}: ${a.name} damage dua tangan (${a.damageType})`}
                >
                  {a.versatileDamage} dua tangan
                </RollButton>
              )}
            </div>
          </div>
        ))}
      </details>

      <details className="stat-section" open>
        <summary>Aksi bonus ({bonusActions.length})</summary>
        {bonusActions.length === 0 && (
          <p className="ink-soft">Belum ada aksi bonus dari fitur karakter ini.</p>
        )}
        <FeatureItems features={bonusActions} />
      </details>

      <details className="stat-section" open>
        <summary>Reaksi ({reactions.length + 1})</summary>
        <div className="stat-entry">
          <b>Opportunity Attack</b>
          <p className="ink-soft">
            Saat musuh keluar dari jangkauanmu, serang sekali dengan senjata melee. Satu reaksi per
            ronde.
          </p>
        </div>
        <FeatureItems features={reactions} />
      </details>

      {derived.spellcasting.length > 0 && (
        <details className="stat-section" open>
          <summary>Sihir</summary>
          {derived.spellcasting.map((s) => (
            <p key={s.classId}>
              <b>{classes.find((c) => c.id === s.classId)?.name ?? s.classId}:</b> save DC{" "}
              {s.saveDc}{" "}
              <RollButton
                roll={roll}
                expression={d20(s.attackBonus)}
                label={`${who}: serangan sihir`}
              >
                Serang {signed(s.attackBonus)}
              </RollButton>
            </p>
          ))}
        </details>
      )}

      <details className="stat-section" open>
        <summary>Spell</summary>
        <CharacterSpells character={character} derived={derived} />
      </details>

      <details className="stat-section" open>
        <summary>Inventaris ({character.items.length})</summary>
        {character.items.length === 0 && <p className="ink-soft">Inventaris kosong.</p>}
        <ul className="stat-items">
          {character.items.map((i) => (
            <li key={i.id}>
              <span>
                {itemName(i)}
                {i.variant && <span className="ink-soft"> ({i.variant})</span>}
                {i.quantity > 1 && <b> × {i.quantity}</b>}
              </span>
              {(i.equipped || i.attuned) && (
                <span className="ink-soft">{i.attuned ? "attuned" : "dipakai"}</span>
              )}
            </li>
          ))}
        </ul>
        {state && (
          <p className="stat-coins">
            {COINS.filter((k) => state.coins[k] > 0)
              .map((k) => `${state.coins[k]} ${k.toUpperCase()}`)
              .join(" · ") || "Tidak ada koin"}
          </p>
        )}
        <p className="ink-soft stat-hint">Ubah inventaris lewat tab Karakter.</p>
      </details>

      <details className="stat-section">
        <summary>Skill</summary>
        <ul className="stat-skills">
          {bonuses.skills.map((s) => (
            <li key={s.id} className={s.proficient ? "proficient" : undefined}>
              <RollButton roll={roll} expression={d20(s.bonus)} label={`${who}: ${s.name}`}>
                {signed(s.bonus)}
              </RollButton>{" "}
              {s.name}
            </li>
          ))}
        </ul>
      </details>

      <details className="stat-section" open>
        <summary>Fitur lain ({otherFeatures.length})</summary>
        <FeatureItems features={otherFeatures} />
      </details>

      <details className="stat-section">
        <summary>Info lain</summary>
        <dl className="stat-facts">
          {facts.map(
            ([label, value]) =>
              value && (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ),
          )}
        </dl>
        {character.build.notes && (
          <>
            <p className="stat-facts-title">Catatan</p>
            <Prose text={character.build.notes} />
          </>
        )}
      </details>
    </div>
  );
}
