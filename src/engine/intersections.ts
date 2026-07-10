/**
 * Circle-circle and line-circle intersection helpers.
 *
 * These are the geometric core of every linkage solve: a revolute joint
 * constrained by two link lengths is a circle-circle intersection, a slider
 * on a rail is a line-circle intersection. Both return well-typed results
 * for every degenerate case — callers never see NaN.
 */

import { add, dist, dot, perp, scale, sub, type Vec2 } from "./vec2";

/**
 * Tolerance for "touching" classification, relative to the geometry scale.
 * Kept small: the solvers treat tangency as a valid (single-point) solution.
 */
const EPS = 1e-9;

export type CircleCircleResult =
  | {
      /**
       * Circles intersect at one or two points.
       *
       * Ordering is deterministic: `points[0]` lies on the counter-clockwise
       * side of the direction from center `a` to center `b` (positive
       * perpendicular), `points[1]` on the clockwise side. Tangent circles
       * yield two identical points, so `points[0]`/`points[1]` are always
       * safe to index — check `tangent` to distinguish.
       */
      type: "intersecting";
      points: [Vec2, Vec2];
      tangent: boolean;
    }
  | { type: "separate" } // too far apart to touch
  | { type: "contained" } // one circle strictly inside the other
  | { type: "coincident" }; // same center & radius: infinite solutions

/**
 * Intersect circle (centerA, radiusA) with circle (centerB, radiusB).
 * Radii must be >= 0; negative radii are treated as their absolute value.
 */
export function circleCircleIntersection(
  centerA: Vec2,
  radiusA: number,
  centerB: Vec2,
  radiusB: number,
): CircleCircleResult {
  const rA = Math.abs(radiusA);
  const rB = Math.abs(radiusB);
  const d = dist(centerA, centerB);

  if (d < EPS) {
    // Concentric: either the same circle (coincident) or nested (contained).
    return Math.abs(rA - rB) < EPS ? { type: "coincident" } : { type: "contained" };
  }

  const scaleRef = Math.max(d, rA, rB);
  const tol = scaleRef * 1e-12 + EPS;

  if (d > rA + rB + tol) return { type: "separate" };
  if (d < Math.abs(rA - rB) - tol) return { type: "contained" };

  // a = distance from centerA to the chord midpoint along the center line.
  const a = (rA * rA - rB * rB + d * d) / (2 * d);
  const hSq = rA * rA - a * a;
  // Clamp tiny negatives from floating point when tangent.
  const h = Math.sqrt(Math.max(0, hSq));
  const tangent = hSq <= tol * scaleRef;

  const dir = scale(sub(centerB, centerA), 1 / d);
  const mid = add(centerA, scale(dir, a));
  const offset = scale(perp(dir), h);

  return {
    type: "intersecting",
    points: [add(mid, offset), sub(mid, offset)],
    tangent,
  };
}

export type LineCircleResult =
  | {
      /**
       * Line crosses (or touches) the circle. Points are ordered by their
       * signed parameter `t` along the line direction: `points[0]` has the
       * smaller `t` (`p = origin + t * direction`). `ts` are the matching
       * parameters. Tangency duplicates the single point.
       */
      type: "intersecting";
      points: [Vec2, Vec2];
      ts: [number, number];
      tangent: boolean;
    }
  | { type: "miss" } // line does not reach the circle
  | { type: "degenerate" }; // zero-length direction vector

/**
 * Intersect an infinite line (origin + t * direction) with a circle.
 * `direction` need not be normalized; `ts` are in units of |direction|.
 */
export function lineCircleIntersection(
  origin: Vec2,
  direction: Vec2,
  center: Vec2,
  radius: number,
): LineCircleResult {
  const r = Math.abs(radius);
  const dLenSq = dot(direction, direction);
  if (dLenSq < EPS * EPS) return { type: "degenerate" };

  // Solve |origin + t*direction - center|^2 = r^2 as a quadratic in t.
  const oc = sub(origin, center);
  const b = dot(oc, direction);
  const c = dot(oc, oc) - r * r;
  const disc = b * b - dLenSq * c;

  const tol = (dLenSq + Math.abs(c)) * 1e-12;
  if (disc < -tol) return { type: "miss" };

  const sqrtDisc = Math.sqrt(Math.max(0, disc));
  const t1 = (-b - sqrtDisc) / dLenSq;
  const t2 = (-b + sqrtDisc) / dLenSq;

  return {
    type: "intersecting",
    points: [add(origin, scale(direction, t1)), add(origin, scale(direction, t2))],
    ts: [t1, t2],
    tangent: sqrtDisc * sqrtDisc <= tol,
  };
}