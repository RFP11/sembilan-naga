import { choiceKey } from "@dnd/character";
import { backgrounds, feats, languages, skills, species, speciesBuilders } from "@dnd/data";
import { ABILITY_NAMES, skillName } from "../labels";
import { Prose } from "../../../lib/Prose";
import type { StepProps } from "./Builder";

const STANDARD_LANGUAGES = languages.filter((l) => l.rarity === "standard" && l.id !== "common");

/** Step 2: background, species (and its choices), languages. */
export function OriginStep({ build, update }: StepProps) {
  const background = backgrounds.find((b) => b.id === build.backgroundId);
  const sp = species.find((s) => s.id === build.speciesId);
  const builder = speciesBuilders.find((b) => b.speciesId === build.speciesId);

  const setChoice = (key: string, value: string | undefined) => {
    const choices = { ...build.choices };
    if (value === undefined) delete choices[key];
    else choices[key] = value;
    update({ choices });
  };

  const setSpecies = (id: string) => {
    // Drop answers that belonged to the previous species.
    const choices = Object.fromEntries(
      Object.entries(build.choices).filter(([k]) => !k.startsWith("species:")),
    );
    update({ speciesId: id, choices });
  };

  const toggleLanguage = (id: string) => {
    const has = build.languages.includes(id);
    if (!has && build.languages.length >= 2) return;
    update({ languages: has ? build.languages.filter((l) => l !== id) : [...build.languages, id] });
  };

  return (
    <div className="stack">
      <h2>Background</h2>
      <div className="cards">
        {backgrounds.map((b) => (
          <button
            key={b.id}
            className="card"
            aria-pressed={b.id === build.backgroundId}
            onClick={() =>
              update({
                backgroundId: b.id,
                // The bonus depends on the background's abilities, so start it over.
                ...(b.id !== build.backgroundId && {
                  backgroundBonus: {},
                  equipment: { ...build.equipment, background: undefined },
                }),
              })
            }
          >
            <strong>{b.name}</strong>
            <span className="muted">{b.abilities.map((a) => ABILITY_NAMES[a]).join(", ")}</span>
            <span className="muted">
              Feat: {feats.find((f) => f.id === b.feat)?.name}
              {b.featNote && ` (${b.featNote})`}
            </span>
            <span className="muted">Skills: {b.skills.map(skillName).join(", ")}</span>
          </button>
        ))}
      </div>
      {background && <p className="muted">Tool proficiency: {background.tool}</p>}

      <h2>Species</h2>
      <div className="cards">
        {species.map((s) => (
          <button
            key={s.id}
            className="card"
            aria-pressed={s.id === build.speciesId}
            onClick={() => setSpecies(s.id)}
          >
            <strong>{s.name}</strong>
            <span className="muted">
              {s.size.map((z) => z[0]!.toUpperCase() + z.slice(1)).join(" or ")} · {s.speed} ft
            </span>
          </button>
        ))}
      </div>

      {sp && (
        <>
          <ul className="features">
            {sp.traits.map((t) => (
              <li key={t.name}>
                <details>
                  <summary>{t.name}</summary>
                  <Prose text={t.description} />
                  {t.options?.map((o) => (
                    <Prose key={o.name} text={`**${o.name}.** ${o.description}`} />
                  ))}
                </details>
              </li>
            ))}
          </ul>

          {builder?.choices.map((c) => (
            <fieldset key={c.id}>
              <legend>{c.name}</legend>
              <div className="chips">
                {c.options.map((o) => (
                  <label key={o.id} className="chip">
                    <input
                      type="radio"
                      name={c.id}
                      checked={build.choices[choiceKey.species(c.id)] === o.id}
                      onChange={() => setChoice(choiceKey.species(c.id), o.id)}
                    />
                    {o.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          {builder?.grants.map((g) =>
            g.type === "choose-skill" ? (
              <label key="skills" className="field">
                Skillful: one skill{" "}
                <select
                  value={(build.choices[choiceKey.species("skills")] as string) ?? ""}
                  onChange={(e) =>
                    setChoice(choiceKey.species("skills"), e.target.value || undefined)
                  }
                >
                  <option value="">Choose…</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : g.type === "choose-feat" ? (
              <label key="feat" className="field">
                Versatile: {g.category} feat{" "}
                <select
                  value={(build.choices[choiceKey.species("feat")] as string) ?? ""}
                  onChange={(e) =>
                    setChoice(choiceKey.species("feat"), e.target.value || undefined)
                  }
                >
                  <option value="">Choose…</option>
                  {feats
                    .filter((f) => f.category === g.category)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null,
          )}
        </>
      )}

      <h2>Languages</h2>
      <p className="muted">You know Common plus two standard languages.</p>
      <div className="chips">
        {STANDARD_LANGUAGES.map((l) => (
          <label key={l.id} className="chip">
            <input
              type="checkbox"
              checked={build.languages.includes(l.id)}
              disabled={!build.languages.includes(l.id) && build.languages.length >= 2}
              onChange={() => toggleLanguage(l.id)}
            />
            {l.name}
          </label>
        ))}
      </div>
    </div>
  );
}
