import type { Monster, MonsterEntry } from "@dnd/data";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Prose } from "../../lib/Prose";
import { useAttackFlow } from "./attackFlow";
import { d20, RollButton, RollResult, useRoller, type Roll } from "./rolls";
import { MonsterSpells } from "./SpellList";

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const titleCase = (s: string) =>
  s.replace(/(^|[-\s])\w/g, (c) => c.toUpperCase()).replace("-", " ");
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

/** The dice of one action: the attack roll, then each damage in the stat block. */
function EntryRolls({
  entry,
  who,
  roll,
  tokenId,
}: {
  entry: MonsterEntry;
  who: string;
  roll: Roll;
  tokenId: string;
}) {
  const flow = useAttackFlow();
  const damage = entry.damage.filter((d) => d.dice);
  if (!entry.attack && !entry.save && damage.length === 0) return null;
  return (
    <div className="roll-row">
      {entry.attack &&
        (flow ? (
          <button
            type="button"
            className="roll-btn roll-attack"
            onClick={() =>
              flow.aim({
                attackerTokenId: tokenId,
                source: { kind: "monster", entry: entry.name },
                name: entry.name,
                toHit: entry.attack!.toHit,
                expression: d20(entry.attack!.toHit),
                label: `${who}: ${entry.name}`,
              })
            }
          >
            Serang {signed(entry.attack.toHit)}
          </button>
        ) : (
          <RollButton
            roll={roll}
            expression={d20(entry.attack.toHit)}
            label={`${who}: ${entry.name}`}
          >
            Serang {signed(entry.attack.toHit)}
          </RollButton>
        ))}
      {entry.save && (
        <span className="roll-save">
          Save {entry.save.ability.toUpperCase()} DC {entry.save.dc}
        </span>
      )}
      {damage.map((d, i) => (
        <RollButton
          key={`${d.dice}-${i}`}
          roll={roll}
          expression={d.dice!}
          label={`${who}: ${entry.name} damage (${d.type})`}
        >
          {d.dice} {d.type}
        </RollButton>
      ))}
    </div>
  );
}

function Entries({
  title,
  intro,
  entries,
  who,
  roll,
  tokenId,
}: {
  title: string;
  intro?: string;
  entries: MonsterEntry[];
  who: string;
  roll: Roll;
  tokenId: string;
}) {
  if (entries.length === 0) return null;
  return (
    <details className="stat-section" open>
      <summary>{title}</summary>
      {intro && <p className="ink-soft">{intro}</p>}
      {entries.map((e) => (
        <div key={e.name} className="stat-entry">
          <b>
            {e.name}
            {e.usage && <span className="ink-soft"> ({e.usage})</span>}
          </b>
          <Prose text={e.description} />
          <EntryRolls entry={e} who={who} roll={roll} tokenId={tokenId} />
        </div>
      ))}
    </details>
  );
}

/** A monster's SRD stat block, so the DM doesn't have to look it up mid-game. */
export function MonsterStatBlock({
  monsterId,
  tokenId,
  campaignId,
  tokenName,
  tokenHidden,
}: {
  monsterId: string;
  tokenId: string;
  campaignId: string;
  tokenName: string;
  tokenHidden: boolean;
}) {
  // Secret by default: rolling in the open tells the table what the DM is holding.
  const [secretChoice, setSecretChoice] = useState(true);
  const secret = secretChoice || tokenHidden;
  const { roll, last, error } = useRoller(campaignId, secret);
  const query = useQuery({
    queryKey: ["monster", monsterId],
    queryFn: () => api<Monster>(`/monsters/${monsterId}`),
    staleTime: Infinity,
  });

  if (query.isPending) return <p className="ink-soft">Memuat stat block…</p>;
  if (query.error) {
    return (
      <p className="form-error" role="alert">
        Stat block gagal dimuat: {query.error.message}
      </p>
    );
  }
  const m = query.data;
  const skills = Object.entries(m.skills);
  const spellText = [...m.traits, ...m.actions, ...m.bonusActions, ...m.reactions]
    .filter((e) => /Spellcasting/.test(e.name))
    .map((e) => e.description)
    .join("\n");
  const facts: [string, string | undefined][] = [
    ["Rentan", m.vulnerabilities],
    ["Tahan", m.resistances],
    ["Kebal", m.immunities],
    ["Perlengkapan", m.gear],
    ["Indra", m.senses],
    ["Bahasa", m.languages],
  ];

  return (
    <div className="stat-block">
      <div className="roll-sticky">
        <label className="roll-secret">
          <input
            type="checkbox"
            checked={secret}
            disabled={tokenHidden}
            onChange={(e) => setSecretChoice(e.target.checked)}
          />
          Lemparan rahasia (hanya DM)
          {tokenHidden && <span className="ink-soft"> · token tersembunyi</span>}
        </label>
        <RollResult last={last} error={error} />
      </div>
      <h2>{m.name}</h2>
      <p className="ink-soft stat-sub">
        {m.size.map(titleCase).join(" atau ")} {m.type}, {m.alignment}
      </p>

      <dl className="stat-numbers">
        <div>
          <dt>AC</dt>
          <dd>{m.ac}</dd>
        </div>
        <div>
          <dt>HP</dt>
          <dd>
            {m.hp.average} <span className="ink-soft">({m.hp.formula})</span>
          </dd>
        </div>
        <div>
          <dt>Inisiatif</dt>
          <dd>
            <RollButton
              roll={roll}
              expression={d20(m.initiative.bonus)}
              label={`${tokenName}: inisiatif`}
            >
              {signed(m.initiative.bonus)}
            </RollButton>
          </dd>
        </div>
        <div>
          <dt>Kecepatan</dt>
          <dd>{m.speed}</dd>
        </div>
        <div>
          <dt>CR</dt>
          <dd>
            {m.cr} <span className="ink-soft">({m.xp} XP)</span>
          </dd>
        </div>
        <div>
          <dt>Prof.</dt>
          <dd>{signed(m.proficiencyBonus)}</dd>
        </div>
      </dl>

      <table className="stat-abilities">
        <thead>
          <tr>
            <th />
            {ABILITIES.map((a) => (
              <th key={a}>{a.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Skor</th>
            {ABILITIES.map((a) => (
              <td key={a}>{m.abilities[a].score}</td>
            ))}
          </tr>
          <tr>
            <th>Mod</th>
            {ABILITIES.map((a) => (
              <td key={a}>
                <RollButton
                  roll={roll}
                  expression={d20(m.abilities[a].mod)}
                  label={`${tokenName}: check ${a.toUpperCase()}`}
                >
                  {signed(m.abilities[a].mod)}
                </RollButton>
              </td>
            ))}
          </tr>
          <tr>
            <th>Save</th>
            {ABILITIES.map((a) => (
              <td key={a}>
                <RollButton
                  roll={roll}
                  expression={d20(m.abilities[a].save)}
                  label={`${tokenName}: save ${a.toUpperCase()}`}
                >
                  {signed(m.abilities[a].save)}
                </RollButton>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <details className="stat-section stat-more">
        <summary>Skill, indra, dan lainnya</summary>
        {skills.length > 0 && (
          <div className="roll-row">
            {skills.map(([id, bonus]) => (
              <RollButton
                key={id}
                roll={roll}
                expression={d20(bonus)}
                label={`${tokenName}: ${titleCase(id)}`}
              >
                {titleCase(id)} {signed(bonus)}
              </RollButton>
            ))}
          </div>
        )}
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
      </details>

      <Entries title="Sifat" entries={m.traits} who={tokenName} roll={roll} tokenId={tokenId} />
      <Entries title="Aksi" entries={m.actions} who={tokenName} roll={roll} tokenId={tokenId} />
      <Entries
        title="Aksi bonus"
        entries={m.bonusActions}
        who={tokenName}
        roll={roll}
        tokenId={tokenId}
      />
      <Entries title="Reaksi" entries={m.reactions} who={tokenName} roll={roll} tokenId={tokenId} />
      <Entries
        title="Aksi legendaris"
        intro={m.legendaryActionUses}
        entries={m.legendaryActions}
        who={tokenName}
        roll={roll}
        tokenId={tokenId}
      />
      {spellText && <MonsterSpells text={spellText} />}
    </div>
  );
}
