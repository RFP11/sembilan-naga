import { sceneGridSize, TOKEN_CELLS, type Scene, type Token } from "@dnd/contracts";
import { Application, Circle, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { sceneImageUrl } from "./api";

/** One grid square on the board: the space of a Medium token. A map is scaled to fit this. */
const CELL = 48;
const DEFAULT_COLS = 16;
const DEFAULT_ROWS = 12;

const KIND_COLOR: Record<Token["kind"], number> = {
  monster: 0xb5412f,
  npc: 0xc48a12,
  character: 0x1f7a7d,
  object: 0x6b6256,
};

type Zoom = "fit" | 1 | 1.5;
const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "fit", label: "Muat layar" },
  { value: 1, label: "100%" },
  { value: 1.5, label: "150%" },
];

/** The board's size and grid in board pixels, for a map or for the empty table. */
function layoutFor(scene: Scene | null) {
  if (!scene) {
    return {
      width: DEFAULT_COLS * CELL,
      height: DEFAULT_ROWS * CELL,
      originX: 0,
      originY: 0,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    };
  }
  const scale = CELL / scene.gridPx;
  return {
    width: Math.ceil(scene.widthPx * scale),
    height: Math.ceil(scene.heightPx * scale),
    originX: scene.offsetX * scale,
    originY: scene.offsetY * scale,
    ...sceneGridSize(scene),
  };
}

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** "Goblin 3" -> "G3", "Kapten Rana" -> "KR": short enough to read on a token. */
function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  if (words.length > 1 && /^\d+$/.test(last)) return `${words[0]![0]!.toUpperCase()}${last}`;
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const NAME_LABEL = "name";

/** Everything a token's look depends on: it's redrawn only when this changes. */
const lookOf = (t: Token, selected: boolean, acting: boolean) =>
  [t.kind, t.name, t.size, t.hidden, t.hpCurrent, t.hpMax, selected, acting, t.canMove].join("|");

function drawToken(view: Container, t: Token, selected: boolean, acting: boolean) {
  for (const child of view.removeChildren()) child.destroy();
  const cells = TOKEN_CELLS[t.size];
  const box = cells * CELL;
  const radius = t.size === "tiny" ? box * 0.25 : box * 0.4;
  const centre = box / 2;

  const disc = new Graphics();
  // Whose turn it is, visible at a glance on the map.
  if (acting) disc.circle(centre, centre, radius + 6).stroke({ width: 3, color: 0x6fcf97 });
  disc
    .circle(centre, centre + 2, radius)
    .fill({ color: 0x000000, alpha: 0.35 })
    .circle(centre, centre, radius)
    .fill(KIND_COLOR[t.kind])
    .stroke({ width: selected ? 4 : 3, color: selected ? 0xe9b22e : 0xf3e6c9 });
  view.addChild(disc);

  const letters = new Text({
    text: initials(t.name),
    style: {
      fontFamily: "Lilita One, sans-serif",
      fontSize: Math.max(11, Math.min(radius * 0.8, 40)),
      fill: 0xffffff,
    },
  });
  letters.anchor.set(0.5);
  letters.position.set(centre, centre);
  view.addChild(letters);

  if (t.hpMax) {
    const width = radius * 1.5;
    const left = centre - width / 2;
    const top = centre + radius - 5;
    const share = Math.max(0, Math.min(1, (t.hpCurrent ?? 0) / t.hpMax));
    const bar = new Graphics()
      .rect(left - 1, top - 1, width + 2, 6)
      .fill(0x1c130c)
      .rect(left, top, width * share, 4)
      .fill(share > 0.5 ? 0x6fcf97 : share > 0.25 ? 0xe9b22e : 0xe4483b);
    view.addChild(bar);
  }

  const label = new Text({
    text: t.name.length > 18 ? `${t.name.slice(0, 17)}…` : t.name,
    style: {
      fontFamily: "Alegreya Sans, sans-serif",
      fontSize: 12,
      fontWeight: "700",
      fill: 0xffffff,
      stroke: { color: 0x1c130c, width: 3 },
    },
  });
  label.anchor.set(0.5, 0);
  label.position.set(centre, centre + radius + 2);
  // Names of neighbouring tokens would overlap: shown for the selected or pointed-at one.
  label.label = NAME_LABEL;
  label.visible = selected;
  view.addChild(label);

  view.alpha = t.hidden ? 0.55 : 1;
  view.hitArea = new Circle(centre, centre, radius);
  view.cursor = t.canMove ? "grab" : "pointer";
  view.zIndex = selected ? 1000 : -cells;
}

interface Drawn {
  view: Container;
  look: string;
}

/** Map + grid + tokens. Token positions are in grid cells, snapped on drop. */
export function Board({
  campaignId,
  scene,
  tokens,
  selectedId,
  actingId,
  targeting,
  onSelect,
  onMove,
}: {
  campaignId: string;
  scene: Scene | null;
  tokens: Token[];
  selectedId: string | null;
  actingId: string | null;
  /** Clicking a token picks it as a target, so nothing should start dragging. */
  targeting: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [mapFailed, setMapFailed] = useState(false);
  // Bumped when a board has been built, so the tokens get drawn onto it.
  const [boardVersion, setBoardVersion] = useState(0);

  const layerRef = useRef<Container | null>(null);
  const drawnRef = useRef(new Map<string, Drawn>());
  // `half` keeps a big token centred under the pointer.
  const draggingRef = useRef<{ id: string; view: Container; half: number } | null>(null);
  // The pointer handlers live as long as the board; these keep them on current values.
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const handlersRef = useRef({ onSelect, onMove });
  handlersRef.current = { onSelect, onMove };
  const targetingRef = useRef(targeting);
  targetingRef.current = targeting;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const sceneId = scene?.id;
  const widthPx = scene?.widthPx;
  const heightPx = scene?.heightPx;
  const gridPx = scene?.gridPx;
  const offsetX = scene?.offsetX;
  const offsetY = scene?.offsetY;
  const gridVisible = scene?.gridVisible ?? true;
  const layout = layoutFor(scene);
  const { cols, rows } = layout;

  useEffect(() => {
    const app = new Application();
    const drawn = drawnRef.current;
    let disposed = false;
    const { width, height, originX, originY } = layout;

    const build = async () => {
      await app.init({ width, height, background: 0x3a2a1c, antialias: true });
      if (disposed) return app.destroy(true);
      hostRef.current?.appendChild(app.canvas);
      setMapFailed(false);

      if (sceneId) {
        try {
          const image = await loadImage(sceneImageUrl(campaignId, sceneId));
          if (disposed) return;
          const map = new Sprite(Texture.from(image));
          map.width = width;
          map.height = height;
          app.stage.addChild(map);
        } catch {
          if (disposed) return;
          setMapFailed(true);
        }
      }

      // The grid starts at the map's first line, so squares match the ones drawn on the map.
      const board = new Container();
      board.position.set(originX, originY);
      app.stage.addChild(board);

      if (gridVisible) {
        const grid = new Graphics();
        for (let c = 0; c <= cols; c++) grid.moveTo(c * CELL, 0).lineTo(c * CELL, rows * CELL);
        for (let r = 0; r <= rows; r++) grid.moveTo(0, r * CELL).lineTo(cols * CELL, r * CELL);
        grid.stroke({ width: 1, color: 0xf3e6c9, alpha: sceneId ? 0.45 : 0.16 });
        board.addChild(grid);
      }

      const layer = new Container();
      layer.sortableChildren = true;
      board.addChild(layer);
      layerRef.current = layer;

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
        if (e.target === app.stage) handlersRef.current.onSelect(null);
      });
      app.stage.on("pointermove", (e: FederatedPointerEvent) => {
        const dragging = draggingRef.current;
        dragging?.view.position.set(
          e.global.x - originX - dragging.half,
          e.global.y - originY - dragging.half,
        );
      });
      const drop = () => {
        const dragging = draggingRef.current;
        draggingRef.current = null;
        if (!dragging) return;
        const token = tokensRef.current.find((t) => t.id === dragging.id);
        if (!token) return;
        const cells = TOKEN_CELLS[token.size];
        const x = Math.max(0, Math.min(cols - cells, Math.round(dragging.view.x / CELL)));
        const y = Math.max(0, Math.min(rows - cells, Math.round(dragging.view.y / CELL)));
        dragging.view.position.set(x * CELL, y * CELL);
        // A click without moving isn't a move.
        if (x !== token.x || y !== token.y) handlersRef.current.onMove(token.id, x, y);
      };
      app.stage.on("pointerup", drop);
      app.stage.on("pointerupoutside", drop);

      setBoardVersion((v) => v + 1);
    };
    void build();

    return () => {
      disposed = true;
      layerRef.current = null;
      draggingRef.current = null;
      drawn.clear();
      if (app.renderer) app.destroy(true, { children: true, texture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layout` is derived from these
  }, [campaignId, sceneId, widthPx, heightPx, gridPx, offsetX, offsetY, gridVisible]);

  // Bring the drawn tokens in line with the data, without rebuilding the whole board.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const drawn = drawnRef.current;

    for (const [id, entry] of drawn) {
      if (!tokens.some((t) => t.id === id)) {
        entry.view.destroy({ children: true });
        drawn.delete(id);
        if (draggingRef.current?.id === id) draggingRef.current = null;
      }
    }
    for (const t of tokens) {
      let entry = drawn.get(t.id);
      if (!entry) {
        const view = new Container();
        view.eventMode = "static";
        view.label = t.id;
        view.on("pointerdown", () => {
          handlersRef.current.onSelect(t.id);
          const current = tokensRef.current.find((x) => x.id === t.id);
          if (current?.canMove && !targetingRef.current) {
            const half = (TOKEN_CELLS[current.size] * CELL) / 2;
            draggingRef.current = { id: t.id, view, half };
          }
        });
        const showName = (visible: boolean) => {
          const label = view.getChildByLabel(NAME_LABEL);
          if (label) label.visible = visible || selectedRef.current === t.id;
        };
        view.on("pointerover", () => showName(true));
        view.on("pointerout", () => showName(false));
        layer.addChild(view);
        entry = { view, look: "" };
        drawn.set(t.id, entry);
      }
      const look = lookOf(t, t.id === selectedId, t.id === actingId);
      if (entry.look !== look) {
        drawToken(entry.view, t, t.id === selectedId, t.id === actingId);
        entry.look = look;
      }
      if (draggingRef.current?.id !== t.id) entry.view.position.set(t.x * CELL, t.y * CELL);
    }
  }, [tokens, selectedId, actingId, boardVersion]);

  const canvasWidth = zoom === "fit" ? "100%" : `${layout.width * zoom}px`;

  return (
    <div className="board-wrap">
      <div className="board-bar">
        <span className="board-name">
          {scene ? scene.name : "Belum ada peta di meja"}
          <span className="muted"> · 1 kotak = token Medium</span>
        </span>
        <span className="calib-zoom" role="group" aria-label="Perbesaran papan">
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
        </span>
      </div>
      {mapFailed && (
        <p className="map-error" role="alert">
          Gambar peta gagal dimuat. Coba muat ulang halaman.
        </p>
      )}
      <div className="wood-frame">
        <div
          ref={hostRef}
          className="board"
          style={{ "--board-width": canvasWidth } as CSSProperties}
        />
      </div>
    </div>
  );
}
