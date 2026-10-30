import { checkBonuses, deriveCharacter, equippedDefense, weaponAttacks } from "@dnd/character";
import { classes, conditions } from "@dnd/data";
import { hitDicePool } from "@dnd/rules";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { socket } from "../../../lib/socket";
import { useCampaign } from "../../../lib/useCampaign";
import { DiceLog } from "../../vtt/DiceLog";
import type { CharacterWithIssues } from "../api";
import { ABILITY_SHORT, classSummary, signed, speciesName } from "../labels";
import { useSheetActions } from "./actions";
import { HpPanel } from "./HpPanel";
import { Inventory } from "./Inventory";

/** The character sheet for a ready character, opened inside campaign `campaignId`. */
export function Sheet({
  character,
  campaignId,
}: {
  character: CharacterWithIssues;
  campaignId: string;
}) {
  const state = character.state!;
  const actions = useSheetActions(character.id);
  const qc = useQueryClient();
  const joined = useCampaign(campaignId);
  const [rollError, setRollError] = useState<string | null>(null);

  // Refetch when someone else (e.g. the GM) changes this sheet.
  useEffect(() => {
    const onUpdated = ({ characterId }: { characterId: string }) => {
      if (characterId === character.id)
        void qc.invalidateQueries({ queryKey: ["character", character.id] });
    };
    socket.on("character:updated", onUpdated);
    return () => {
      socket.off("character:updated", onUpdated);
    };
  }, [character.id, qc]);

  const d = useMemo(
    () => deriveCharacter(character.build, equippedDefense(character.items)),
    [character.build, character.items],
  );
  const bonuses = useMemo(() => checkBonuses(d), [d]);
  const attacks = useMemo(() => weaponAttacks(d, character.items), [d, character.items]);
  const hitDice = hitDicePool(
    character.build.levels.map((l) => ({
      hitDie: classes.find((c) => c.id === l.classId)?.hitDie ?? 8,
    })),
  );

  // Rolls go to the campaign's dice log, so the character must be in this campaign.
  const canRoll = joined && character.campaignId === campaignId;
  const roll = async (expression: string, label: string) => {
    const res = await socket.emitWithAck("dice:roll", {
      campaignId,
      expression,
      label: `${character.build.name}: ${label}`,
    });
    setRollError(res.ok ? null : res.error);
  };
  const d20 = (bonus: number) => `1d20${bonus ? signed(bonus) : ""}`;
  const RollButton = ({ bonus, label }: { bonus: number; label: string }) => (
    <button
      className="roll"
      disabled={!canRoll}
      title={`Roll ${label}`}
      onClick={() => void roll(d20(bonus), label)}
    >
      {signed(bonus)}
    </button>
  );

  const patch = (body: Omit<Parameters<typeof actions.patchState.mutate>[0], "version">) =>
    actions.patchState.mutate({ version: state.version, ...body });
  const slotsUsed = state.spellSlotsUsed as Record<string, number>;

  return (
    <div className="sheet">
      <header className="sheet-head">
        <h2>{character.build.name}</h2>
        <p className="muted">
          {speciesName(character.build.speciesId)} · {classSummary(d.classes)} · Level {d.level} ·
          XP {character.xp}
        </p>
        {!canRoll && (
          <p className="muted">
            {character.campaignId === campaignId
              ? "Connecting…"
              : "Move this character to this campaign to roll from the sheet."}
          </p>
        )}
        {rollError && <p className="error">{rollError}</p>}
      </header>

      <div className="sheet-grid">
        <div className="stack">
          <dl className="stats">
            <div>
              <dt>AC</dt>
              <dd>{d.ac}</dd>
            </div>
            <div>
              <dt>Initiative</dt>
              <dd>
                <RollButton bonus={d.initiative} label="Initiative" />
              </dd>
            </div>
            <div>
              <dt>Speed</dt>
              <dd>{Math.max(0, d.speed - 5 * state.exhaustion)} ft</dd>
            </div>
            <div>
              <dt>Prof.</dt>
              <dd>{signed(d.proficiencyBonus)}</dd>
            </div>
          </dl>

          <HpPanel character={character} maxHp={d.maxHp} hitDice={hitDice} actions={actions} />

          <section className="panel">
            <h3>Abilities</h3>
            <table className="scores">
              <thead>
                <tr>
                  <th />
                  <th>Score</th>
                  <th>Check</th>
                  <th>Save</th>
                </tr>
              </thead>
              <tbody>
                {bonuses.abilities.map((a) => {
                  const save = bonuses.saves.find((s) => s.ability === a.ability)!;
                  return (
                    <tr key={a.ability}>
                      <th>{ABILITY_SHORT[a.ability]}</th>
                      <td>{d.scores?.[a.ability]}</td>
                      <td>
                        <RollButton bonus={a.bonus} label={`${ABILITY_SHORT[a.ability]} check`} />
                      </td>
                      <td>
                        <RollButton bonus={save.bonus} label={`${ABILITY_SHORT[a.ability]} save`} />
                        {save.proficient && <span className="muted"> ●</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h3>Skills</h3>
            <ul className="skills">
              {bonuses.skills.map((s) => (
                <li key={s.id}>
                  <RollButton bonus={s.bonus} label={s.name} />{" "}
                  <span className={s.proficient ? "" : "muted"}>
                    {s.name} <span className="muted">({ABILITY_SHORT[s.ability]})</span>
                    {s.proficient && " ●"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted">
              Passive Perception {d.passivePerception}
              {d.darkvision ? ` · Darkvision ${d.darkvision} ft` : ""}
              {d.resistances.length ? ` · Resistance: ${d.resistances.join(", ")}` : ""}
            </p>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <h3>Attacks</h3>
            {attacks.length === 0 && <p className="muted">No weapons in the inventory.</p>}
            <table className="attacks">
              <tbody>
                {attacks.map((a) => (
                  <tr key={a.itemId} className={a.equipped ? "" : "muted"}>
                    <td>
                      {a.name}
                      {!a.proficient && <span className="muted"> (not proficient)</span>}
                      {a.range && <span className="muted"> · {a.range}</span>}
                    </td>
                    <td>
                      <RollButton bonus={a.toHit} label={`${a.name} attack`} />
                    </td>
                    <td>
                      <button
                        className="roll"
                        disabled={!canRoll}
                        onClick={() => void roll(a.damage, `${a.name} damage`)}
                      >
                        {a.damage} {a.damageType}
                      </button>
                      {a.versatileDamage && (
                        <button
                          className="roll"
                          disabled={!canRoll}
                          title="Two-handed"
                          onClick={() =>
                            void roll(a.versatileDamage!, `${a.name} damage (two-handed)`)
                          }
                        >
                          {a.versatileDamage}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {(d.spellSlots.length > 0 || d.pactMagic) && (
            <section className="panel">
              <h3>Spell slots</h3>
              {d.spellcasting.map((s) => (
                <p key={s.classId} className="muted">
                  {s.classId}: save DC {s.saveDc}, attack{" "}
                  <RollButton bonus={s.attackBonus} label="Spell attack" />
                </p>
              ))}
              {d.spellSlots.map((total, i) => {
                const level = String(i + 1);
                const used = slotsUsed[level] ?? 0;
                return (
                  <div key={level} className="slots">
                    <span>Level {level}</span>
                    {Array.from({ length: total }, (_, n) => (
                      <input
                        key={n}
                        type="checkbox"
                        aria-label={`Level ${level} slot ${n + 1} used`}
                        checked={n < used}
                        onChange={() =>
                          patch({ spellSlotsUsed: { ...slotsUsed, [level]: n < used ? n : n + 1 } })
                        }
                      />
                    ))}
                  </div>
                );
              })}
              {d.pactMagic && (
                <div className="slots">
                  <span>Pact (level {d.pactMagic.slotLevel})</span>
                  {Array.from({ length: d.pactMagic.slots }, (_, n) => (
                    <input
                      key={n}
                      type="checkbox"
                      aria-label={`Pact slot ${n + 1} used`}
                      checked={n < state.pactSlotsUsed}
                      onChange={() => patch({ pactSlotsUsed: n < state.pactSlotsUsed ? n : n + 1 })}
                    />
                  ))}
                </div>
              )}
              <p className="muted">
                Slots come back on a Long Rest (Pact Magic also on a Short Rest).
              </p>
            </section>
          )}

          <section className="panel">
            <h3>Status</h3>
            <div className="row">
              <label className="field">
                Exhaustion
                <select
                  value={state.exhaustion}
                  onChange={(e) => patch({ exhaustion: Number(e.target.value) })}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="chip">
                <input
                  type="checkbox"
                  checked={state.heroicInspiration}
                  onChange={(e) => patch({ heroicInspiration: e.target.checked })}
                />
                Heroic Inspiration
              </label>
            </div>
            {state.exhaustion > 0 && (
              <p className="muted">
                D20 Tests −{2 * state.exhaustion}, Speed −{5 * state.exhaustion} ft
              </p>
            )}
            <div className="chips">
              {conditions
                .filter((c) => c.id !== "exhaustion")
                .map((c) => (
                  <label key={c.id} className="chip">
                    <input
                      type="checkbox"
                      checked={state.conditions.includes(c.id)}
                      onChange={(e) =>
                        patch({
                          conditions: e.target.checked
                            ? [...state.conditions, c.id]
                            : state.conditions.filter((x) => x !== c.id),
                        })
                      }
                    />
                    {c.name}
                  </label>
                ))}
            </div>
          </section>

          <Inventory character={character} actions={actions} />

          <section className="panel">
            <h3>Coins</h3>
            <div className="row">
              {(["cp", "sp", "ep", "gp", "pp"] as const).map((k) => (
                <label key={`${k}-${state.version}`} className="field">
                  {k.toUpperCase()}
                  <input
                    type="number"
                    min={0}
                    defaultValue={state.coins[k]}
                    style={{ width: "5rem" }}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.floor(Number(e.target.value)) || 0);
                      if (v !== state.coins[k]) patch({ coins: { ...state.coins, [k]: v } });
                    }}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="panel">
          <h3>Dice log</h3>
          <DiceLog campaignId={campaignId} />
        </aside>
      </div>
    </div>
  );
}
