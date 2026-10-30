import { choiceKey } from "@dnd/character";
import {
  armor,
  backgrounds,
  classes,
  gear,
  skills,
  startingEquipment,
  tools,
  weapons,
  type ItemRef,
} from "@dnd/data";
import type { StepProps } from "./Builder";

const ITEMS = { weapon: weapons, armor, gear, tool: tools } as const;

function itemLabel(ref: ItemRef): string {
  if (ref.kind === "custom") return ref.name;
  if (ref.kind === "proficient-tool") return "the tool you're proficient with";
  const name = ITEMS[ref.kind].find((i) => i.id === ref.id)?.name ?? ref.id;
  const detail = ref.variant ?? ref.note ?? (ref.chooseVariant ? "your choice" : undefined);
  return `${ref.quantity > 1 ? `${ref.quantity} × ` : ""}${name}${detail ? ` (${detail})` : ""}`;
}

/** Step 5: name, class skills, starting equipment, notes. */
export function DetailsStep({ build, update }: StepProps) {
  const cls = classes.find((c) => c.id === build.levels[0]?.classId);
  const background = backgrounds.find((b) => b.id === build.backgroundId);
  const key = cls && choiceKey.classSkills(cls.id);
  const picked = key ? ((build.choices[key] as string[] | undefined) ?? []) : [];
  const from = cls?.skillChoices.from.length ? cls.skillChoices.from : skills.map((s) => s.id);
  const fromBackground = new Set(background?.skills ?? []);

  const toggleSkill = (id: string) => {
    if (!key || !cls) return;
    const has = picked.includes(id);
    if (!has && picked.length >= cls.skillChoices.count) return;
    update({
      choices: { ...build.choices, [key]: has ? picked.filter((s) => s !== id) : [...picked, id] },
    });
  };

  const packages = (source: "class" | "background", id?: string) =>
    startingEquipment.find((e) => e.source === source && e.sourceId === id);

  return (
    <div className="stack">
      <h2>Details</h2>
      <label className="field">
        Name{" "}
        <input
          value={build.name}
          maxLength={100}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>

      {cls && (
        <fieldset>
          <legend>
            {cls.name} skills: choose {cls.skillChoices.count} ({picked.length} chosen)
          </legend>
          <div className="chips">
            {from.map((id) => (
              <label key={id} className="chip">
                <input
                  type="checkbox"
                  checked={picked.includes(id)}
                  disabled={
                    fromBackground.has(id) ||
                    (!picked.includes(id) && picked.length >= cls.skillChoices.count)
                  }
                  onChange={() => toggleSkill(id)}
                />
                {skills.find((s) => s.id === id)?.name}
                {fromBackground.has(id) && <span className="muted"> (background)</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {(
        [
          ["class", cls?.id, cls?.name],
          ["background", background?.id, background?.name],
        ] as const
      ).map(([source, id, name]) => {
        const pkg = packages(source, id);
        if (!pkg) return null;
        return (
          <fieldset key={source}>
            <legend>{name} starting equipment</legend>
            {pkg.options.map((o) => (
              <label key={o.id} className="option">
                <input
                  type="radio"
                  name={`equipment-${source}`}
                  checked={build.equipment[source] === o.id}
                  onChange={() => update({ equipment: { ...build.equipment, [source]: o.id } })}
                />
                <span>
                  <strong>{o.id.toUpperCase()}</strong>{" "}
                  {[...o.items.map(itemLabel), `${o.gp} GP`].join(", ")}
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}

      <label className="field column">
        Notes / backstory
        <textarea
          rows={5}
          value={build.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>
    </div>
  );
}
