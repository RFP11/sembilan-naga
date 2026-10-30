import type { TokenMove } from "@dnd/contracts";
import { Application, Container, Graphics, type FederatedPointerEvent } from "pixi.js";
import { useEffect, useRef } from "react";
import { socket } from "../../lib/socket";

const CELL = 48;
const COLS = 16;
const ROWS = 12;

const INITIAL_TOKENS = [
  { id: "fighter", color: 0x3b6ea8, x: 2, y: 2 },
  { id: "wizard", color: 0x7a4bb0, x: 3, y: 2 },
  { id: "goblin", color: 0x4c8a3a, x: 10, y: 7 },
];

/** Grid + draggable tokens. Positions are in grid cells, snapped on drop. */
export function Board({ campaignId }: { campaignId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const app = new Application();
    const tokens = new Map<string, Graphics>();
    let disposed = false;

    const onMoved = (m: TokenMove) => {
      if (m.campaignId !== campaignId) return;
      tokens.get(m.tokenId)?.position.set(m.x * CELL, m.y * CELL);
    };

    void app
      .init({ width: COLS * CELL, height: ROWS * CELL, background: 0x2a2622, antialias: true })
      .then(() => {
        if (disposed) return app.destroy(true);
        hostRef.current?.appendChild(app.canvas);

        const grid = new Graphics();
        for (let c = 0; c <= COLS; c++) grid.moveTo(c * CELL, 0).lineTo(c * CELL, ROWS * CELL);
        for (let r = 0; r <= ROWS; r++) grid.moveTo(0, r * CELL).lineTo(COLS * CELL, r * CELL);
        grid.stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
        app.stage.addChild(grid);

        const layer = new Container();
        app.stage.addChild(layer);
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;

        for (const t of INITIAL_TOKENS) {
          const g = new Graphics()
            .circle(CELL / 2, CELL / 2, CELL * 0.4)
            .fill(t.color)
            .stroke({ width: 2, color: 0xffffff });
          g.position.set(t.x * CELL, t.y * CELL);
          g.eventMode = "static";
          g.cursor = "grab";
          g.label = t.id;
          layer.addChild(g);
          tokens.set(t.id, g);
        }

        let dragging: Graphics | null = null;
        layer.on("pointerdown", (e: FederatedPointerEvent) => {
          dragging = e.target instanceof Graphics ? e.target : null;
        });
        app.stage.on("pointermove", (e: FederatedPointerEvent) => {
          dragging?.position.set(e.global.x - CELL / 2, e.global.y - CELL / 2);
        });
        const drop = () => {
          if (!dragging) return;
          const x = Math.max(0, Math.min(COLS - 1, Math.round(dragging.x / CELL)));
          const y = Math.max(0, Math.min(ROWS - 1, Math.round(dragging.y / CELL)));
          dragging.position.set(x * CELL, y * CELL);
          socket.emit("token:move", { campaignId, tokenId: dragging.label, x, y });
          dragging = null;
        };
        app.stage.on("pointerup", drop);
        app.stage.on("pointerupoutside", drop);

        socket.on("token:moved", onMoved);
      });

    return () => {
      disposed = true;
      socket.off("token:moved", onMoved);
      if (app.renderer) app.destroy(true);
    };
  }, [campaignId]);

  return <div ref={hostRef} className="board" />;
}
