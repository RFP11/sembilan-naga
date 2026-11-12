import { parseDice } from "@dnd/rules";

// Which dice a roll throws. Kept apart from the 3D code so the table can decide without
// loading three.js.

export const SIDES = [4, 6, 8, 10, 12, 20] as const;
export type Sides = (typeof SIDES)[number];

export const isSides = (n: number): n is Sides => (SIDES as readonly number[]).includes(n);

/** One die to throw: which model, and the number it must land on. */
export interface DieThrow {
  sides: Sides;
  value: number;
}

/**
 * The dice to animate for a roll the server made. A d100 is thrown as two d10s, tens and units,
 * where a 10 reads as 0 (00 + 0 is 100). Rolls the models can't show (d2, d3, mixed groups)
 * give null and stay in the log only.
 */
export function dieThrows(
  expression: string,
  rolls: readonly number[],
  max = 12,
): DieThrow[] | null {
  let sides: number;
  try {
    sides = parseDice(expression).sides;
  } catch {
    return null;
  }
  let out: DieThrow[];
  if (sides === 100) {
    out = rolls.flatMap((r) => [
      { sides: 10 as const, value: Math.floor(r / 10) % 10 || 10 },
      { sides: 10 as const, value: r % 10 || 10 },
    ]);
  } else if (isSides(sides)) {
    out = rolls.map((value) => ({ sides, value }));
  } else {
    return null;
  }
  if (out.some((d) => d.value < 1 || d.value > d.sides)) return null;
  return out.slice(0, max);
}
