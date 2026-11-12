import { Matrix4, Quaternion, Vector3 } from "three";
import type { Sides } from "./throws";

// Which number each face of the dice models shows. Normals are in the model's own geometry
// space (centred on its bounding box), found by clustering the mesh's triangles and read
// off renders of each face, one by one.

type V3 = readonly [number, number, number];

interface DieFaces {
  normals: readonly V3[];
  /** The number shown when that face is on top; for the d4, when it lies on the table. */
  values: readonly number[];
  /** The d4 is read from its top point: the face on the table decides the number. */
  readsDown?: boolean;
}

export const DIE_FACES: Record<Sides, DieFaces> = {
  4: {
    normals: [
      [0.4714, 0.8165, 0.3333],
      [0, 0, -1],
      [-0.9428, 0, 0.3333],
      [0.4714, -0.8165, 0.3333],
    ],
    values: [3, 2, 4, 1],
    readsDown: true,
  },
  6: {
    normals: [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ],
    values: [1, 3, 5, 4, 6, 2],
  },
  8: {
    normals: [
      [0.5774, -0.5774, -0.5774],
      [-0.5774, 0.5774, -0.5774],
      [-0.5774, -0.5774, -0.5774],
      [0.5774, 0.5774, 0.5774],
      [-0.5774, -0.5774, 0.5774],
      [-0.5774, 0.5774, 0.5774],
      [0.5774, 0.5774, -0.5774],
      [0.5774, -0.5774, 0.5774],
    ],
    values: [4, 8, 2, 7, 3, 5, 6, 1],
  },
  10: {
    // A pentagonal trapezohedron; the measured normals, tidied to be exactly symmetric.
    normals: [
      [0, 0.7071, 0.7071],
      [-0.4156, -0.5721, 0.7071],
      [0.4156, -0.5721, 0.7071],
      [0.6725, 0.2185, 0.7071],
      [-0.6725, 0.2185, 0.7071],
      [0, -0.7071, -0.7071],
      [0.4156, 0.5721, -0.7071],
      [-0.4156, 0.5721, -0.7071],
      [-0.6725, -0.2185, -0.7071],
      [0.6725, -0.2185, -0.7071],
    ],
    values: [5, 3, 1, 7, 9, 2, 4, 10, 8, 6],
  },
  12: {
    normals: [
      [0.8507, 0.5257, 0],
      [0.5257, 0, -0.8507],
      [0, 0.8507, 0.5257],
      [0, -0.8507, 0.5257],
      [0, -0.8507, -0.5257],
      [-0.5257, 0, -0.8507],
      [-0.5257, 0, 0.8507],
      [0.8507, -0.5257, 0],
      [0, 0.8507, -0.5257],
      [-0.8507, -0.5257, 0],
      [-0.8507, 0.5257, 0],
      [0.5257, 0, 0.8507],
    ],
    values: [7, 8, 11, 5, 4, 2, 9, 1, 12, 10, 3, 6],
  },
  20: {
    normals: [
      [0.7946, -0.5774, 0.1876],
      [-0.7946, -0.5774, -0.1876],
      [-0.7946, 0.5774, -0.1876],
      [0.7946, 0.5774, 0.1876],
      [-0.3035, 0.9342, 0.1876],
      [0.3035, 0.9342, -0.1876],
      [0.3035, -0.9342, -0.1876],
      [-0.3035, -0.9342, 0.1876],
      [0.4911, 0.3568, 0.7947],
      [-0.4911, -0.3568, -0.7947],
      [-0.4911, 0.3568, -0.7947],
      [0.4911, -0.3568, 0.7947],
      [0.9822, 0, -0.1876],
      [-0.9822, 0, 0.1876],
      [-0.1876, 0.5774, 0.7947],
      [-0.1876, -0.5774, 0.7947],
      [0.1876, 0.5774, -0.7947],
      [0.1876, -0.5774, -0.7947],
      [0.6071, 0, -0.7947],
      [-0.6071, 0, 0.7947],
    ],
    values: [8, 15, 13, 6, 11, 9, 10, 12, 14, 7, 1, 20, 16, 5, 4, 2, 19, 17, 3, 18],
  },
};

const normalsOf = (sides: Sides) =>
  DIE_FACES[sides].normals.map(([x, y, z]) => new Vector3(x, y, z).normalize());

/** The face that is up in world space (down for the d4), for a body turned by `q`. */
export function restingFace(sides: Sides, q: Quaternion): number {
  const down = DIE_FACES[sides].readsDown;
  let best = 0;
  let bestY = -Infinity;
  normalsOf(sides).forEach((n, i) => {
    const y = n.applyQuaternion(q).y * (down ? -1 : 1);
    if (y > bestY) {
      bestY = y;
      best = i;
    }
  });
  return best;
}

/** Any unit vector at right angles to `v`. */
const perpendicular = (v: Vector3) =>
  (Math.abs(v.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).cross(v).normalize();

/** The rotation taking the frame (a, b) onto (c, d), where a·b = c·d. */
function rotationBetween(a: Vector3, b: Vector3, c: Vector3, d: Vector3): Quaternion {
  const frame = (u: Vector3, v: Vector3) => {
    const x = u.clone().normalize();
    const z = x.clone().cross(v).normalize();
    const y = z.clone().cross(x);
    return new Matrix4().makeBasis(x, y, z);
  };
  const m = frame(c, d).multiply(frame(a, b).transpose());
  return new Quaternion().setFromRotationMatrix(m);
}

/**
 * A rotation of the die onto itself (its shape looks the same afterwards) that brings face
 * `from` to where face `to` is. Turning only the painted mesh by it, while the physics body
 * keeps its path, makes a die land showing any number we like without changing how it rolls.
 */
export function symmetryRotation(sides: Sides, from: number, to: number): Quaternion {
  const normals = normalsOf(sides);
  const a = normals[from]!;
  const c = normals[to]!;
  // A neighbour of `from` must go to a face at the same angle from `to`.
  const b = normals.find((n, i) => i !== from && Math.abs(n.dot(a)) < 0.99) ?? perpendicular(a);
  const angle = a.dot(b);
  for (const d of normals) {
    if (Math.abs(d.dot(c) - angle) > 0.02) continue;
    const q = rotationBetween(a, b, c, d);
    const permutes = normals.every((n) => {
      const turned = n.clone().applyQuaternion(q);
      return normals.some((m) => m.dot(turned) > 0.995);
    });
    if (permutes) return q;
  }
  // Every die here is face-transitive, so this is never reached; fall back to a plain turn.
  return new Quaternion().setFromUnitVectors(a, c);
}

/** The face showing a number. */
export const faceOf = (sides: Sides, value: number) => DIE_FACES[sides].values.indexOf(value);

/**
 * The die as a solid bounded by its face planes (all at `distance` from the centre), for the
 * physics: corners from every three planes that meet inside all the others, and each face's
 * corners in counter-clockwise order seen from outside.
 */
export function polyhedron(
  sides: Sides,
  distance: number,
): { vertices: Vector3[]; faces: number[][] } {
  const normals = normalsOf(sides);
  const vertices: Vector3[] = [];
  const eps = 1e-3 * distance;
  const n = normals.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const p = intersect(normals[i]!, distance, normals[j]!, distance, normals[k]!, distance);
        if (!p) continue;
        if (normals.some((m) => m.dot(p) > distance + eps)) continue;
        if (!vertices.some((v) => v.distanceTo(p) < eps * 10)) vertices.push(p);
      }
    }
  }
  const faces = normals.map((m) => {
    const on = vertices.flatMap((v, i) => (Math.abs(m.dot(v) - distance) < eps * 10 ? [i] : []));
    const centre = on.reduce((s, i) => s.add(vertices[i]!), new Vector3()).divideScalar(on.length);
    const u = perpendicular(m);
    const w = m.clone().cross(u);
    const angle = (i: number) => {
      const r = vertices[i]!.clone().sub(centre);
      return Math.atan2(r.dot(w), r.dot(u));
    };
    return on.sort((x, y) => angle(x) - angle(y));
  });
  return { vertices, faces };
}

/** Where three planes n·x = d meet, or null when two are parallel. */
function intersect(
  n1: Vector3,
  d1: number,
  n2: Vector3,
  d2: number,
  n3: Vector3,
  d3: number,
): Vector3 | null {
  const c23 = n2.clone().cross(n3);
  const det = n1.dot(c23);
  if (Math.abs(det) < 1e-6) return null;
  return c23
    .multiplyScalar(d1)
    .add(n3.clone().cross(n1).multiplyScalar(d2))
    .add(n1.clone().cross(n2).multiplyScalar(d3))
    .divideScalar(det);
}

/**
 * The die's true centre and face distance, from how far out each face plane sits (`planes[i]`,
 * measured from wherever the mesh happens to be centred): solves n·c + d = planes[i] in the
 * least-squares sense. A d4's bounding box centre, for one, is not its centre.
 */
export function fitCentre(
  sides: Sides,
  planes: readonly number[],
): { centre: Vector3; distance: number } {
  const rows = normalsOf(sides).map((n, i) => [n.x, n.y, n.z, 1, planes[i]!]);
  // Normal equations AᵀA x = Aᵀb, solved by Gaussian elimination (4 × 4).
  const m = Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => rows.reduce((s, row) => s + row[r]! * row[c]!, 0)),
  );
  for (let col = 0; col < 4; col++) {
    const pivot = m
      .slice(col)
      .reduce(
        (best, row, i) => (Math.abs(row[col]!) > Math.abs(m[best]![col]!) ? i + col : best),
        col,
      );
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < 4; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c < 5; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const x = m.map((row, i) => row[4]! / row[i]!);
  return { centre: new Vector3(x[0], x[1], x[2]), distance: x[3]! };
}
