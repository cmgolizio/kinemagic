/**
 * Shared intersection helpers. Every solver in the engine reduces to these,
 * so their edge cases (tangency, containment, coincidence) are handled here
 * once, with typed results — never NaN.
 */

import { add, dist, isFiniteVec, perp, scale, sub, vec, type Vec2 } from "./vec";

/** Relative tolerance used to absorb floating-point noise at tangency. */
const EPS = 1e-9;

export type CircleCircleResult =
  /** Circles don't intersect: either apart or one contained in the other. */
  | { kind: "none"; separation: "apart" | "contained" }
  /** Same center and radius — infinitely many intersections. */
  | { kind: "coincident" }
  /** Externally or internally tangent — a single intersection point. */
  | { kind: "tangent"; p: Vec2 }
  /**
   * Two intersections. `p1` lies on the counter-clockwise (left) side of the
   * center line c1→c2, `p2` on the clockwise (right) side.
   */
  | { kind: "two"; p1: Vec2; p2: Vec2 };

export function circleCircleIntersection(
  c1: Vec2,
  r1: number,
  c2: Vec2,
  r2: number,
): CircleCircleResult {
  const d = dist(c1, c2);
  const tol = EPS * Math.max(1, r1, r2, d);

  if (d <= tol && Math.abs(r1 - r2) <= tol) {
    return { kind: "coincident" };
  }
  if (d > r1 + r2 + tol) {
    return { kind: "none", separation: "apart" };
  }
  if (d < Math.abs(r1 - r2) - tol) {
    return { kind: "none", separation: "contained" };
  }

  // a = distance from c1 to the chord's foot along the center line
  const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const u = scale(sub(c2, c1), 1 / d);
  const foot = add(c1, scale(u, a));

  if (h2 <= tol * Math.max(1, r1 * r1)) {
    return { kind: "tangent", p: foot };
  }

  const h = Math.sqrt(h2);
  const n = perp(u);
  return {
    kind: "two",
    p1: add(foot, scale(n, h)),
    p2: add(foot, scale(n, -h)),
  };
}

export type LineCircleResult =
  | { kind: "none" }
  /** `t` is the parameter along the (not necessarily unit) direction vector. */
  | { kind: "tangent"; p: Vec2; t: number }
  /** Ordered t1 < t2. */
  | { kind: "two"; p1: Vec2; t1: number; p2: Vec2; t2: number };

/**
 * Intersect the parametric line p(t) = origin + t·dir with a circle.
 * `dir` need not be unit length; t is in units of |dir|.
 */
export function lineCircleIntersection(
  origin: Vec2,
  dir: Vec2,
  center: Vec2,
  r: number,
): LineCircleResult {
  const f = sub(origin, center);
  const a = dir.x * dir.x + dir.y * dir.y;
  if (a <= EPS) return { kind: "none" }; // zero direction: not a line
  const b = 2 * (f.x * dir.x + f.y * dir.y);
  const c = f.x * f.x + f.y * f.y - r * r;
  const disc = b * b - 4 * a * c;
  const tol = EPS * Math.max(1, r * r, a);

  if (disc < -tol) return { kind: "none" };

  const at = (t: number): Vec2 => vec(origin.x + t * dir.x, origin.y + t * dir.y);

  if (disc <= tol) {
    const t = -b / (2 * a);
    return { kind: "tangent", p: at(t), t };
  }

  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  return { kind: "two", p1: at(t1), t1, p2: at(t2), t2 };
}

/** Guard for solver outputs: true when every coordinate is a finite number. */
export const allFinite = (...points: Vec2[]): boolean => points.every(isFiniteVec);