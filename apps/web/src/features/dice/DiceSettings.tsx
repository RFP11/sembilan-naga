import { DICE_COLORS, type DiceColor } from "@dnd/contracts";
import { useMe, useUpdatePreferences } from "../../lib/auth";
import { setDiceSettings, useDiceSettings } from "./settings";

const COLOR_NAMES: Record<DiceColor, string> = {
  gold: "Emas",
  red: "Merah",
  silver: "Perak",
  tiedye: "Pelangi",
};

/** Your dice colour (everyone sees it), and whether this screen shows and plays the 3D dice. */
export function DiceSettings() {
  const { animate, sound } = useDiceSettings();
  const color = useMe().data?.user?.diceColor ?? "gold";
  const update = useUpdatePreferences();

  return (
    <div className="dice-settings">
      <fieldset className="dice-colors" disabled={update.isPending}>
        <legend>Warna dadumu</legend>
        {DICE_COLORS.map((c) => (
          <label key={c} className={`dice-swatch swatch-${c}`} title={COLOR_NAMES[c]}>
            <input
              type="radio"
              name="dice-color"
              value={c}
              checked={(update.variables?.diceColor ?? color) === c}
              onChange={() => update.mutate({ diceColor: c })}
            />
            <span className="sr-only">{COLOR_NAMES[c]}</span>
          </label>
        ))}
      </fieldset>
      <label className="dice-toggle">
        <input
          type="checkbox"
          checked={animate}
          onChange={(e) => setDiceSettings({ animate: e.target.checked })}
        />
        Dadu 3D
      </label>
      <label className="dice-toggle">
        <input
          type="checkbox"
          checked={sound}
          disabled={!animate}
          onChange={(e) => setDiceSettings({ sound: e.target.checked })}
        />
        Suara
      </label>
      {update.error && (
        <p className="form-error" role="alert">
          {update.error.message}
        </p>
      )}
      <p className="dice-credit ink-soft">
        Model dadu:{" "}
        <a
          href="https://sketchfab.com/3d-models/dnd-dice-set-51a01c6f714944ea95d9a2d24eb24928"
          target="_blank"
          rel="noreferrer"
        >
          DnD Dice Set
        </a>{" "}
        oleh Logan S.,{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
      </p>
    </div>
  );
}
