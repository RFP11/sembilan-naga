import { expect, it } from "vitest";
import { spells } from "./index";

it("loads valid SRD spells with unique ids", () => {
  expect(spells.length).toBeGreaterThan(0);
  expect(new Set(spells.map((s) => s.id)).size).toBe(spells.length);
});
