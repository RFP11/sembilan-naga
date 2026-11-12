import { MIN_GRID_PX, sceneGridSize, type Scene } from "@dnd/contracts";
import { useRef, useState, type PointerEvent } from "react";
import { sceneImageUrl, useUpdateScene } from "./api";

type Zoom = "fit" | 1 | 2;
const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "fit", label: "Muat layar" },
  { value: 1, label: "100%" },
  { value: 2, label: "200%" },
];

const round = (n: number) => Math.round(n * 100) / 100;
/** A value in 0..size: shifting the grid by a whole square lands on the same lines. */
const wrap = (n: number, size: number) => round(((n % size) + size) % size);

interface Box {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * Sets a map's scale: how many image pixels one grid square spans, which is the space a Medium
 * token takes. The DM can draw a box around one square of the map, or adjust the numbers.
 */
export function MapCalibrator({
  campaignId,
  scene,
  onClose,
}: {
  campaignId: string;
  scene: Scene;
  onClose: () => void;
}) {
  const update = useUpdateScene(campaignId);
  const [name, setName] = useState(scene.name);
  const [gridPx, setGridPx] = useState(scene.gridPx);
  const [offsetX, setOffsetX] = useState(scene.offsetX);
  const [offsetY, setOffsetY] = useState(scene.offsetY);
  const [gridVisible, setGridVisible] = useState(scene.gridVisible);
  const [columns, setColumns] = useState("");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [box, setBox] = useState<Box | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { widthPx, heightPx } = scene;
  const maxGrid = Math.min(widthPx, heightPx);
  const { cols, rows } = sceneGridSize({ widthPx, heightPx, gridPx, offsetX, offsetY });

  const applyGrid = (next: number) => {
    if (!Number.isFinite(next)) return;
    const size = round(Math.max(MIN_GRID_PX, Math.min(maxGrid, next)));
    setGridPx(size);
    setOffsetX((x) => wrap(x, size));
    setOffsetY((y) => wrap(y, size));
  };

  /** Pointer position in the image's own pixels, whatever the zoom. */
  const toImage = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(widthPx, ((e.clientX - rect.left) / rect.width) * widthPx)),
      y: Math.max(0, Math.min(heightPx, ((e.clientY - rect.top) / rect.height) * heightPx)),
    };
  };
  const startBox = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = toImage(e);
    setBox({ fromX: x, fromY: y, toX: x, toY: y });
  };
  const moveBox = (e: PointerEvent<SVGSVGElement>) => {
    if (!box) return;
    const { x, y } = toImage(e);
    setBox({ ...box, toX: x, toY: y });
  };
  const endBox = () => {
    if (!box) return;
    setBox(null);
    const width = Math.abs(box.toX - box.fromX);
    const height = Math.abs(box.toY - box.fromY);
    // Squares are square: the average evens out a slightly uneven drag.
    const size = round((width + height) / 2);
    // A stray click shouldn't throw the scale away.
    if (size < MIN_GRID_PX) return;
    setGridPx(Math.min(size, maxGrid));
    setOffsetX(wrap(Math.min(box.fromX, box.toX), size));
    setOffsetY(wrap(Math.min(box.fromY, box.toY), size));
  };
  const applyColumns = () => {
    const count = Number(columns);
    if (count >= 1) {
      setOffsetX(0);
      setOffsetY(0);
      setGridPx(round(Math.max(MIN_GRID_PX, Math.min(maxGrid, widthPx / count))));
    }
  };

  const save = () =>
    update.mutate(
      { id: scene.id, name, gridPx, offsetX, offsetY, gridVisible },
      { onSuccess: onClose },
    );

  // A sample token near the middle of the map, on a whole square.
  const tokenX = offsetX + (Math.floor(cols / 2) + 0.5) * gridPx;
  const tokenY = offsetY + (Math.floor(rows / 2) + 0.5) * gridPx;
  const stageWidth = zoom === "fit" ? "100%" : `${widthPx * zoom}px`;

  return (
    <div className="calibrator">
      <div className="calib-stage-col">
        <div className="calib-zoom" role="group" aria-label="Perbesaran">
          {ZOOMS.map((z) => (
            <button
              key={z.label}
              type="button"
              aria-pressed={zoom === z.value}
              onClick={() => setZoom(z.value)}
            >
              {z.label}
            </button>
          ))}
        </div>
        <div className="wood-frame">
          <div className="calib-scroll">
            <div className="calib-stage" style={{ width: stageWidth }}>
              <img src={sceneImageUrl(campaignId, scene.id)} alt={scene.name} draggable={false} />
              <svg
                ref={svgRef}
                viewBox={`0 0 ${widthPx} ${heightPx}`}
                aria-label="Tarik kotak mengelilingi satu kotak grid pada peta"
                onPointerDown={startBox}
                onPointerMove={moveBox}
                onPointerUp={endBox}
                onPointerCancel={() => setBox(null)}
              >
                <defs>
                  <pattern
                    id="calib-grid"
                    patternUnits="userSpaceOnUse"
                    x={offsetX}
                    y={offsetY}
                    width={gridPx}
                    height={gridPx}
                  >
                    <path
                      d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`}
                      fill="none"
                      stroke="#ff2f7e"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </pattern>
                </defs>
                <rect width={widthPx} height={heightPx} fill="url(#calib-grid)" />
                <circle
                  cx={tokenX}
                  cy={tokenY}
                  r={gridPx * 0.4}
                  fill="#1f7a7d"
                  stroke="#f3e6c9"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={tokenX}
                  y={tokenY}
                  fill="#fff"
                  fontSize={gridPx * 0.42}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  M
                </text>
                {box && (
                  <rect
                    x={Math.min(box.fromX, box.toX)}
                    y={Math.min(box.fromY, box.toY)}
                    width={Math.abs(box.toX - box.fromX)}
                    height={Math.abs(box.toY - box.fromY)}
                    fill="rgba(233, 178, 46, 0.25)"
                    stroke="#e9b22e"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="parchment calib-controls">
        <div className="parchment-body">
          <h2>Atur skala peta</h2>
          <p>
            Tarik kotak mengelilingi <b>satu kotak grid</b> pada peta. Token M di peta menunjukkan
            ukuran token Medium, yang harus pas satu kotak.
          </p>
          <div className="reg-form">
            <label>
              Nama peta
              <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Ukuran satu kotak (piksel)
              <span className="calib-stepper">
                <button type="button" onClick={() => applyGrid(gridPx - 1)}>
                  −1
                </button>
                <button type="button" onClick={() => applyGrid(gridPx - 0.1)}>
                  −0,1
                </button>
                <input
                  type="number"
                  step="0.01"
                  min={MIN_GRID_PX}
                  max={maxGrid}
                  value={gridPx}
                  onChange={(e) => applyGrid(e.target.valueAsNumber)}
                />
                <button type="button" onClick={() => applyGrid(gridPx + 0.1)}>
                  +0,1
                </button>
                <button type="button" onClick={() => applyGrid(gridPx + 1)}>
                  +1
                </button>
              </span>
            </label>
            <div className="calib-offsets">
              <label>
                Geser grid X
                <input
                  type="number"
                  step="0.5"
                  value={offsetX}
                  onChange={(e) =>
                    Number.isFinite(e.target.valueAsNumber) &&
                    setOffsetX(wrap(e.target.valueAsNumber, gridPx))
                  }
                />
              </label>
              <label>
                Geser grid Y
                <input
                  type="number"
                  step="0.5"
                  value={offsetY}
                  onChange={(e) =>
                    Number.isFinite(e.target.valueAsNumber) &&
                    setOffsetY(wrap(e.target.valueAsNumber, gridPx))
                  }
                />
              </label>
            </div>
            <label>
              Atau: tahu jumlah kolom petanya?
              <span className="calib-columns">
                <input
                  type="number"
                  min={1}
                  value={columns}
                  onChange={(e) => setColumns(e.target.value)}
                />
                <button type="button" className="btn btn-plain btn-small" onClick={applyColumns}>
                  Hitung
                </button>
              </span>
            </label>
            <label className="calib-check">
              <input
                type="checkbox"
                checked={gridVisible}
                onChange={(e) => setGridVisible(e.target.checked)}
              />
              Tampilkan garis grid di meja
            </label>
            <p className="ink-soft field-hint">
              Matikan kalau gambarnya sudah punya grid sendiri. Token tetap menempel ke kotak.
            </p>
          </div>

          <p className="calib-summary" role="status">
            <b>
              {cols} × {rows} kotak
            </b>{" "}
            · gambar {widthPx} × {heightPx} piksel
          </p>
          {update.error && (
            <p className="form-error" role="alert">
              {update.error.message}
            </p>
          )}
          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-red"
              disabled={update.isPending || !name.trim()}
              onClick={save}
            >
              {update.isPending ? "Menyimpan…" : "Simpan skala"}
            </button>
            <button type="button" className="btn btn-plain" onClick={onClose}>
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
