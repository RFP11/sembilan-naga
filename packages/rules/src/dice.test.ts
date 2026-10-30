import { describe, expect, it } from "vitest";
import { parseDice, rollDice } from "./dice";

describe("parseDice", () => {
  it("parses common notation", () => {
    expect(parseDice("1d20+5")).toEqual({ count: 1, sides: 20, modifier: 5 });
    expect(parseDice("2d6")).toEqual({ count: 2, sides: 6, modifier: 0 });
    expect(parseDice("d8 - 1")).toEqual({ count: 1, sides: 8, modifier: -1 });
  });

  it("rejects garbage and abuse", () => {
    expect(() => parseDice("hello")).toThrow();
    expect(() => parseDice("1000d6")).toThrow();
    expect(() => parseDice("1d1")).toThrow();
  });
});

describe("rollDice", () => {
  it("uses the injected rng", () => {
    const max = () => 0.999;
    const min = () => 0;
    expect(rollDice("2d6+3", max)).toMatchObject({ rolls: [6, 6], total: 15 });
    expect(rollDice("2d6+3", min)).toMatchObject({ rolls: [1, 1], total: 5 });
  });
});
