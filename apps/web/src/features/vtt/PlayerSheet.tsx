import { lazy, Suspense, useState } from "react";
import { useMyCharacters } from "../characters/api";

// Needs the whole SRD data set, so the table itself stays light until it's shown.
const CharacterStatBlock = lazy(() =>
  import("./CharacterStatBlock").then((m) => ({ default: m.CharacterStatBlock })),
);

/**
 * A player's own character beside the map, always in view: stats, abilities and inventory.
 * With several characters in the campaign, selecting one's token also brings up its sheet.
 */
export function PlayerSheet({
  campaignId,
  focusCharacterId,
}: {
  campaignId: string;
  focusCharacterId: string | null;
}) {
  const characters = useMyCharacters();
  const [chosen, setChosen] = useState<string | null>(null);

  const mine = (characters.data ?? []).filter(
    (c) => c.campaignId === campaignId && c.status === "ready",
  );
  const current =
    mine.find((c) => c.id === focusCharacterId) ?? mine.find((c) => c.id === chosen) ?? mine[0];

  let content;
  if (characters.isPending) {
    content = <p className="ink-soft">Memuat karakter…</p>;
  } else if (characters.error) {
    content = (
      <p className="form-error" role="alert">
        Karakter gagal dimuat: {characters.error.message}
      </p>
    );
  } else if (!current) {
    content = (
      <p className="ink-soft">
        Kamu belum punya karakter di campaign ini. Buat atau pindahkan karakter lewat tab Karakter,
        dan lembarnya akan tampil di sini.
      </p>
    );
  } else {
    content = (
      <>
        {mine.length > 1 && (
          <div className="calib-zoom sheet-picker" role="group" aria-label="Pilih karakter">
            {mine.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === current.id}
                onClick={() => setChosen(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <Suspense fallback={<p className="ink-soft">Memuat karakter…</p>}>
          <CharacterStatBlock key={current.id} characterId={current.id} campaignId={campaignId} />
        </Suspense>
      </>
    );
  }

  return (
    <div className="parchment stat-panel player-sheet">
      <div className="parchment-body">{content}</div>
    </div>
  );
}
