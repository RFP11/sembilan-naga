import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DIE_FACES, faceOf, fitCentre, polyhedron, restingFace, symmetryRotation } from "./faces";
import { SIDES, dieThrows } from "./throws";

describe("dice faces", () => {
  it.each(SIDES)("d%i has every number once, on a unit normal", (sides) => {
    const { normals, values } = DIE_FACES[sides];
    expect(normals).toHaveLength(sides);
    expect([...values].sort((a, b) => a - b)).toEqual(
      Array.from({ length: sides }, (_, i) => i + 1),
    );
    for (const [x, y, z] of normals) expect(Math.hypot(x, y, z)).toBeCloseTo(1, 2);
  });

  it.each(SIDES)("d%i can be turned to show any number on the face that landed up", (sides) => {
    // Land with a random orientation, then ask for every number in turn.
    const landed = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.234);
    const rest = restingFace(sides, landed);
    for (let value = 1; value <= sides; value++) {
      const turn = symmetryRotation(sides, faceOf(sides, value), rest);
      const shown = restingFace(sides, landed.clone().multiply(turn));
      expect(DIE_FACES[sides].values[shown]).toBe(value);
    }
  });

  it.each(SIDES)("d%i is a closed solid for the physics", (sides) => {
    const { vertices, faces } = polyhedron(sides, 1);
    const expected = { 4: 4, 6: 8, 8: 6, 10: 12, 12: 20, 20: 12 }[sides];
    expect(vertices).toHaveLength(expected);
    // Euler: V - E + F = 2, where every edge is shared by two faces.
    const edges = faces.reduce((s, f) => s + f.length, 0) / 2;
    expect(vertices.length - edges + faces.length).toBe(2);
    for (const f of faces) expect(f.length).toBeGreaterThanOrEqual(3);
  });

  it.each(SIDES)("d%i finds its centre from off-centre face planes", (sides) => {
    const off = new Vector3(0.1, -0.05, 0.2);
    const planes = DIE_FACES[sides].normals.map(
      ([x, y, z]) => 0.8 + x * off.x + y * off.y + z * off.z,
    );
    const { centre, distance } = fitCentre(sides, planes);
    expect(distance).toBeCloseTo(0.8, 3);
    expect(centre.distanceTo(off)).toBeLessThan(1e-3);
  });

  it("reads the d4 from the face on the table", () => {
    // Turn face 1 (the model's -z) to point at the table.
    const lying = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(0, -1, 0));
    expect(restingFace(4, lying)).toBe(1);
    expect(DIE_FACES[4].values[1]).toBe(2);
  });
});

describe("dieThrows", () => {
  it("throws one model per die rolled", () => {
    expect(dieThrows("2d6+3", [4, 1])).toEqual([
      { sides: 6, value: 4 },
      { sides: 6, value: 1 },
    ]);
  });

  it("throws a d100 as tens and units d10s, where 10 is 0", () => {
    expect(dieThrows("1d100", [37])).toEqual([
      { sides: 10, value: 3 },
      { sides: 10, value: 7 },
    ]);
    expect(dieThrows("d100", [100])).toEqual([
      { sides: 10, value: 10 },
      { sides: 10, value: 10 },
    ]);
    expect(dieThrows("d100", [5])).toEqual([
      { sides: 10, value: 10 },
      { sides: 10, value: 5 },
    ]);
  });

  it("leaves dice without a model to the log", () => {
    expect(dieThrows("1d3", [2])).toBeNull();
    expect(dieThrows("nonsense", [1])).toBeNull();
    expect(dieThrows("1d6", [9])).toBeNull();
  });

  it("caps how many dice tumble at once", () => {
    expect(dieThrows("30d6", Array(30).fill(1))).toHaveLength(12);
  });
});
