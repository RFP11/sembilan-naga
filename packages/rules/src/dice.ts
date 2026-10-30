// Dice notation like "1d20+5", "2d6", "d8-1".
// Randomness is injected, so tests are deterministic and the server can own the RNG.

export type Rng = () => number; // [0, 1), like Math.random

export interface DiceExpression {
  count: number;
  sides: number;
  modifier: number;
}

export interface DiceRoll extends DiceExpression {
  rolls: number[];
  total: number;
}

const DICE_RE = /^\s*(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;

export function parseDice(expression: string): DiceExpression {
  const m = DICE_RE.exec(expression);
  if (!m) throw new Error(`invalid dice expression: "${expression}"`);
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const modifier = m[4] ? Number(m[4]) * (m[3] === "-" ? -1 : 1) : 0;
  if (count < 1 || count > 100) throw new Error("dice count must be 1-100");
  if (sides < 2 || sides > 1000) throw new Error("dice sides must be 2-1000");
  return { count, sides, modifier };
}

export function rollDice(expression: string, rng: Rng = Math.random): DiceRoll {
  const parsed = parseDice(expression);
  const rolls = Array.from({ length: parsed.count }, () => Math.floor(rng() * parsed.sides) + 1);
  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier;
  return { ...parsed, rolls, total };
}
