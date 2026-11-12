import { z } from "zod";
import { TOKEN_CELLS, type TokenSize } from "./token";

// Fog of war. A map with fog on hides every square the DM hasn't revealed. Players get the
// revealed squares (to draw the fog) but never the tokens standing in the dark: the server
// leaves those out, so hiding is real, not just paint over the map.

/** A revealed square: [x, y] in grid cells. */
export const fogCell = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
export type FogCell = z.infer<typeof fogCell>;

/** A rectangle of squares, inclusive of both corners, in grid cells. */
export const cellRect = z.object({
  x1: z.number().int().min(0),
  y1: z.number().int().min(0),
  x2: z.number().int().min(0),
  y2: z.number().int().min(0),
});
export type CellRect = z.infer<typeof cellRect>;

export const updateFogRequest = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ reveal: cellRect }),
  z.object({ hide: cellRect }),
  z.object({ all: z.enum(["reveal", "hide"]) }),
]);
export type UpdateFogRequest = z.infer<typeof updateFogRequest>;

const cellKey = (x: number, y: number) => `${x},${y}`;

export const revealedSet = (revealed: readonly FogCell[]) =>
  new Set(revealed.map(([x, y]) => cellKey(x, y)));

/** True when fog is on and none of the token's squares has been revealed. */
export function isFogged(
  fog: { fogEnabled: boolean; fogRevealed: readonly FogCell[] },
  token: { x: number; y: number; size: TokenSize },
  revealed = revealedSet(fog.fogRevealed),
): boolean {
  if (!fog.fogEnabled) return false;
  const cells = TOKEN_CELLS[token.size];
  for (let dx = 0; dx < cells; dx++) {
    for (let dy = 0; dy < cells; dy++) {
      if (revealed.has(cellKey(token.x + dx, token.y + dy))) return false;
    }
  }
  return true;
}

/** The squares of a rectangle, clipped to the map, with its corners in any order. */
function rectCells(rect: CellRect, cols: number, rows: number): FogCell[] {
  const out: FogCell[] = [];
  const [x1, x2] = [Math.min(rect.x1, rect.x2), Math.min(cols - 1, Math.max(rect.x1, rect.x2))];
  const [y1, y2] = [Math.min(rect.y1, rect.y2), Math.min(rows - 1, Math.max(rect.y1, rect.y2))];
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) out.push([x, y]);
  return out;
}

/** The revealed squares after a change, sorted so equal fog compares equal. */
export function applyFog(
  revealed: readonly FogCell[],
  change: { reveal: CellRect } | { hide: CellRect } | { all: "reveal" | "hide" },
  cols: number,
  rows: number,
): FogCell[] {
  let set: Set<string>;
  if ("all" in change) {
    set = new Set(
      change.all === "reveal"
        ? rectCells({ x1: 0, y1: 0, x2: cols - 1, y2: rows - 1 }, cols, rows).map(([x, y]) =>
            cellKey(x, y),
          )
        : [],
    );
  } else {
    set = revealedSet(revealed);
    const cells = rectCells("reveal" in change ? change.reveal : change.hide, cols, rows);
    for (const [x, y] of cells) {
      if ("reveal" in change) set.add(cellKey(x, y));
      else set.delete(cellKey(x, y));
    }
  }
  return [...set]
    .map((k) => k.split(",").map(Number) as FogCell)
    .filter(([x, y]) => x < cols && y < rows)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
