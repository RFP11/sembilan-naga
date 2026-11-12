import type { Scene, UpdateFogRequest } from "@dnd/contracts";
import type { BoardTool } from "./Board";

const TOOLS: { value: BoardTool; label: string; hint: string }[] = [
  { value: "select", label: "Pilih", hint: "Pilih dan geser token" },
  { value: "measure", label: "Ukur", hint: "Seret dari kotak ke kotak untuk mengukur jarak" },
  { value: "ping", label: "Ping", hint: "Klik peta: semua orang di meja melihat titik itu" },
];

const FOG_TOOLS: { value: BoardTool; label: string; hint: string }[] = [
  { value: "reveal", label: "Buka area", hint: "Seret kotak untuk membuka kabut" },
  { value: "hide", label: "Tutup area", hint: "Seret kotak untuk menutup lagi" },
];

/** Board tools for everyone, plus the DM's fog of war controls when a map is on the table. */
export function BoardTools({
  tool,
  onTool,
  isDm,
  scene,
  onFog,
  fogPending,
}: {
  tool: BoardTool;
  onTool: (tool: BoardTool) => void;
  isDm: boolean;
  scene: Scene | null;
  onFog: (change: UpdateFogRequest) => void;
  fogPending: boolean;
}) {
  const fogOn = scene?.fogEnabled ?? false;
  return (
    <div className="board-tools">
      <span className="calib-zoom" role="group" aria-label="Alat papan">
        {TOOLS.map((t) => (
          <button
            key={t.value}
            type="button"
            title={t.hint}
            aria-pressed={tool === t.value}
            onClick={() => onTool(t.value)}
          >
            {t.label}
          </button>
        ))}
      </span>
      {isDm && scene && (
        <span className="calib-zoom" role="group" aria-label="Kontrol kabut">
          <label className="fog-toggle">
            <input
              type="checkbox"
              checked={fogOn}
              disabled={fogPending}
              onChange={(e) => {
                onFog({ enabled: e.target.checked });
                if (!e.target.checked && (tool === "reveal" || tool === "hide")) onTool("select");
              }}
            />
            Kabut perang
          </label>
          {fogOn && (
            <>
              {FOG_TOOLS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  title={t.hint}
                  aria-pressed={tool === t.value}
                  onClick={() => onTool(t.value)}
                >
                  {t.label}
                </button>
              ))}
              <button type="button" disabled={fogPending} onClick={() => onFog({ all: "reveal" })}>
                Buka semua
              </button>
              <button type="button" disabled={fogPending} onClick={() => onFog({ all: "hide" })}>
                Tutup semua
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
