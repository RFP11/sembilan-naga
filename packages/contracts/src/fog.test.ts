import { describe, expect, it } from "vitest";
import { applyFog, isFogged } from "./fog";

describe("fog of war", () => {
  it("reveals and hides rectangles, clipped to the map", () => {
    let revealed = applyFog([], { reveal: { x1: 2, y1: 1, x2: 0, y2: 0 } }, 4, 4);
    expect(revealed).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    revealed = applyFog(revealed, { hide: { x1: 1, y1: 0, x2: 1, y2: 5 } }, 4, 4);
    expect(revealed).toEqual([
      [0, 0],
      [2, 0],
      [0, 1],
      [2, 1],
    ]);
    expect(applyFog(revealed, { reveal: { x1: 3, y1: 3, x2: 9, y2: 9 } }, 4, 4)).toContainEqual([
      3, 3,
    ]);
    expect(applyFog(revealed, { all: "reveal" }, 2, 2)).toHaveLength(4);
    expect(applyFog(revealed, { all: "hide" }, 2, 2)).toEqual([]);
  });

  it("hides a token only when none of its squares is revealed", () => {
    const fog = { fogEnabled: true, fogRevealed: [[3, 3]] as [number, number][] };
    expect(isFogged(fog, { x: 0, y: 0, size: "medium" })).toBe(true);
    expect(isFogged(fog, { x: 3, y: 3, size: "medium" })).toBe(false);
    // A Large token at (2,2) covers (3,3).
    expect(isFogged(fog, { x: 2, y: 2, size: "large" })).toBe(false);
    expect(isFogged({ ...fog, fogEnabled: false }, { x: 0, y: 0, size: "medium" })).toBe(false);
  });
});
