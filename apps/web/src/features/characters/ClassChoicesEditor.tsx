import {
  classChoices,
  deriveCharacter,
  featAbilityIncrease,
  featById,
  featPrerequisite,
  type ClassChoice,
} from "@dnd/character";
import type { CharacterBuild } from "@dnd/contracts";
import { classes, feats, languages, skills, weapons } from "@dnd/data";
import { useMemo } from "react";
import { Prose } from "../../lib/Prose";
import { ABILITY_NAMES, className } from "./labels";

type Answer = string | string[] | undefined;

const many = (v: Answer) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

interface Props {
  build: CharacterBuild;
  /** Change answers in `build.choices` (several at once, so they don't overwrite each other). */
  onChange: (changes: Record<string, Answer>) => void;
  /** Which choices to show (default: all). Level-up shows only what the new level adds. */
  only?: (c: ClassChoice) => boolean;
}

/** Inputs for the class choices a build calls for (Fighting Style, feats, Expertise, ...). */
export function ClassChoicesEditor({ build, onChange, only = () => true }: Props) {
  const list = useMemo(() => classChoices(build).filter(only), [build, only]);
  const derived = useMemo(() => deriveCharacter(build), [build]);
  if (!list.length) return null;

  return (
    <div className="stack">
      {list.map((c) => (
        <fieldset key={c.key}>
          <legend>{legend(c)}</legend>
          <ChoiceInput
            choice={c}
            build={build}
            proficientSkills={derived.skills}
            onChange={onChange}
          />
        </fieldset>
      ))}
    </div>
  );
}

function legend(c: ClassChoice): string {
  const cls = className(c.classId);
  switch (c.kind) {
    case "fighting-style":
      return `${cls}: Fighting Style`;
    case "feat":
      return `Level ${c.characterLevel}: ${c.category === "epic-boon" ? "Epic Boon" : "Ability Score Improvement or feat"}`;
    case "expertise":
      return `${cls}: Expertise in ${c.count} skill${c.count > 1 ? "s" : ""}`;
    case "weapon-mastery":
      return `${cls}: Weapon Mastery (${c.total} kinds of weapons)`;
    case "order":
      return `${cls}: ${c.name}`;
    case "invocations":
      return `${cls}: Eldritch Invocations (${c.total})`;
    case "metamagic":
      return `${cls}: Metamagic (${c.total})`;
    case "languages":
      return `${cls}: ${c.count} languages`;
  }
}

/** Checkboxes that allow at most `max` picks. */
function Picks({
  options,
  value,
  max,
  onChange,
}: {
  options: { id: string; name: string; note?: string; disabled?: boolean }[];
  value: string[];
  max: number;
  onChange: (v: string[]) => void;
}) {
  return (
    <>
      <p className="muted">
        {value.length} / {max} chosen
      </p>
      <div className="chips">
        {options.map((o) => {
          const checked = value.includes(o.id);
          return (
            <label key={o.id} className="chip" title={o.note}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && (o.disabled || value.length >= max)}
                onChange={() =>
                  onChange(checked ? value.filter((v) => v !== o.id) : [...value, o.id])
                }
              />
              {o.name}
              {o.note && <span className="muted"> ({o.note})</span>}
            </label>
          );
        })}
      </div>
    </>
  );
}

function ChoiceInput({
  choice: c,
  build,
  proficientSkills,
  onChange,
}: {
  choice: ClassChoice;
  build: CharacterBuild;
  proficientSkills: string[];
  onChange: Props["onChange"];
}) {
  const value = build.choices[c.key];

  if (c.kind === "fighting-style") {
    return (
      <div className="stack">
        {feats
          .filter((f) => f.category === "fighting-style")
          .map((f) => (
            <label key={f.id} className="option">
              <input
                type="radio"
                name={c.key}
                checked={value === f.id}
                onChange={() => onChange({ [c.key]: f.id })}
              />
              <span>
                <strong>{f.name}.</strong> {f.description}
              </span>
            </label>
          ))}
      </div>
    );
  }

  if (c.kind === "feat") {
    const feat = featById(many(value)[0]);
    const increase = feat && featAbilityIncrease(feat);
    const picked = many(build.choices[c.abilitiesKey]);
    const setAbility = (i: number, a: string) => {
      const next = [...picked];
      next[i] = a;
      onChange({ [c.abilitiesKey]: next.filter(Boolean) });
    };
    return (
      <div className="stack">
        <select
          value={feat?.id ?? ""}
          onChange={(e) =>
            onChange({ [c.key]: e.target.value || undefined, [c.abilitiesKey]: undefined })
          }
        >
          <option value="">Choose…</option>
          {feats
            .filter(
              (f) => f.category === c.category && featPrerequisite(f).level <= c.characterLevel,
            )
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.prerequisite ? ` (${f.prerequisite})` : ""}
              </option>
            ))}
        </select>
        {feat && <Prose text={feat.description} />}
        {increase && (
          <div className="row">
            {Array.from({ length: increase.points }, (_, i) => (
              <label key={i} className="field">
                +1 to
                <select value={picked[i] ?? ""} onChange={(e) => setAbility(i, e.target.value)}>
                  <option value="">Choose…</option>
                  {increase.from.map((a) => (
                    <option key={a} value={a}>
                      {ABILITY_NAMES[a]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {increase.points === 2 && (
              <span className="muted">Pick the same ability twice for +2.</span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (c.kind === "expertise") {
    // Skills already given Expertise by another choice can't be picked again.
    const elsewhere = new Set(
      classChoices(build)
        .filter((x) => x.kind === "expertise" && x.key !== c.key)
        .flatMap((x) => many(build.choices[x.key])),
    );
    return (
      <Picks
        max={c.count}
        value={many(value)}
        onChange={(v) => onChange({ [c.key]: v })}
        options={skills
          .filter((s) => proficientSkills.includes(s.id))
          .map((s) => ({
            id: s.id,
            name: s.name,
            disabled: elsewhere.has(s.id),
            note: elsewhere.has(s.id) ? "already" : undefined,
          }))}
      />
    );
  }

  if (c.kind === "weapon-mastery") {
    return (
      <Picks
        max={c.total}
        value={many(value)}
        onChange={(v) => onChange({ [c.key]: v })}
        options={weapons.map((w) => ({ id: w.id, name: w.name, note: w.mastery }))}
      />
    );
  }

  if (c.kind === "order") {
    return (
      <div className="stack">
        {c.options.map((o) => (
          <label key={o.id} className="option">
            <input
              type="radio"
              name={c.key}
              checked={value === o.id}
              onChange={() => onChange({ [c.key]: o.id })}
            />
            <span>
              <strong>{o.name}.</strong> {o.description}
            </span>
          </label>
        ))}
      </div>
    );
  }

  if (c.kind === "invocations" || c.kind === "metamagic") {
    const list = classes
      .find((x) => x.id === c.classId)
      ?.options.find(
        (o) => o.id === (c.kind === "invocations" ? "eldritch-invocation" : "metamagic"),
      );
    return (
      <Picks
        max={c.total}
        value={many(value)}
        onChange={(v) => onChange({ [c.key]: v })}
        options={(list?.entries ?? []).map((e) => ({
          id: e.id,
          name: e.name,
          note: e.prerequisite?.replace(/^(Prerequisite|Cost): /, ""),
        }))}
      />
    );
  }

  if (c.kind !== "languages") return null;
  const known = new Set(["common", ...build.languages]);
  return (
    <Picks
      max={c.count}
      value={many(value)}
      onChange={(v) => onChange({ [c.key]: v })}
      options={languages.filter((l) => !known.has(l.id)).map((l) => ({ id: l.id, name: l.name }))}
    />
  );
}

/** Applies editor changes to `build.choices`; `undefined` removes an answer. */
export function mergeChoices(
  choices: CharacterBuild["choices"],
  changes: Record<string, Answer>,
): CharacterBuild["choices"] {
  const next = { ...choices };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next;
}
