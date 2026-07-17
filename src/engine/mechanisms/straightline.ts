/**
 * Straight-line linkages.
 *
 * - **Watt's linkage**: a non-Grashof four-bar whose coupler midpoint traces
 *   a lemniscate with a long, nearly straight central segment. Reuses the
 *   four-bar solver; this module supplies the tuned geometry and the
 *   straightness metric.
 * - **Peaucellier–Lipkin**: the first exact straight-line mechanism (1864).
 *   An inversor cell: two arms of length L from the fixed pole O to the side
 *   corners of a rhombus of side s; the near corner P and far corner Q obey
 *   |OP|·|OQ| = L² − s² (inversion about O). Driving P on a circle that
 *   passes through O (crank pivot at distance = crank length from O) inverts
 *   that circle into an exact straight line traced by Q.
 */

import {
  add,
  dist,
  fromPolar,
  normalizeAngle,
  perp,
  scale,
  sub,
  vec,
  type Vec2,
} from "../vec";
import { circleCircleIntersection } from "../geometry";
import type { CouplerCurve, FourBarConfig, InputRange } from "./fourbar";

export type StraightLineVariant = "watt" | "peaucellier";

// ---------------------------------------------------------------------------
// Watt's linkage — tuned four-bar + straightness metric
// ---------------------------------------------------------------------------

/**
 * Two equal 87.5 mm rockers anchored at diagonally opposite pivots with a
 * short 49 mm coupler between them; the coupler midpoint rides the straight
 * part of the lemniscate through the origin (a > 62 mm run stays within
 * 0.5 mm of a true line). Non-Grashof, so the drive sways between limits —
 * that sway IS the straight stroke.
 */
export const defaultWatt = (): FourBarConfig => ({
  O2: vec(-84, -49),
  O4: vec(84, 49),
  crankLen: 87.5,
  couplerLen: 49,
  rockerLen: 87.5,
  couplerPoint: { u: 24.5, v: 0 },
});

export interface LineFit {
  centroid: Vec2;
  /** unit direction of the best-fit line */
  dir: Vec2;
  /** largest perpendicular deviation of any point from the line */
  maxDev: number;
  /** extent of the points along the line */
  length: number;
}

/** Total-least-squares line through a point set (principal axis). */
export function fitLine(points: Vec2[]): LineFit | null {
  if (points.length < 2) return null;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // Principal eigenvector of the 2×2 covariance matrix.
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = vec(Math.cos(angle), Math.sin(angle));
  const n = perp(dir);

  let maxDev = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    const rel = vec(p.x - cx, p.y - cy);
    const dev = Math.abs(rel.x * n.x + rel.y * n.y);
    if (dev > maxDev) maxDev = dev;
    const t = rel.x * dir.x + rel.y * dir.y;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return { centroid: vec(cx, cy), dir, maxDev, length: hi - lo };
}

// ---------------------------------------------------------------------------
// Peaucellier–Lipkin inversor
// ---------------------------------------------------------------------------

export interface PeaucellierConfig {
  /** fixed pole (inversion center), world mm */
  O: Vec2;
  /** crank length r; the crank pivot sits exactly r from O so the driven
   * point's circle passes through O — the condition for an exact line */
  crankLen: number;
  /** long-arm length L (O to each rhombus side corner) */
  armLen: number;
  /** rhombus side s (< L) */
  cellSide: number;
  /** direction from O to the crank pivot, radians */
  axisAngle: number;
}

export const peaucellierCrankPivot = (c: PeaucellierConfig): Vec2 =>
  add(c.O, fromPolar(c.crankLen, c.axisAngle));

/** The inversion constant k = L² − s². */
export const peaucellierK = (c: PeaucellierConfig): number =>
  c.armLen * c.armLen - c.cellSide * c.cellSide;

export function validatePeaucellier(c: PeaucellierConfig): string | null {
  if (!Number.isFinite(c.O.x + c.O.y)) return "pole must be finite";
  if (!(Number.isFinite(c.crankLen) && c.crankLen > 0)) return "crank length must be positive";
  if (!(Number.isFinite(c.armLen) && c.armLen > 0)) return "arm length must be positive";
  if (!(Number.isFinite(c.cellSide) && c.cellSide > 0)) return "cell side must be positive";
  if (c.cellSide >= c.armLen) return "cell side must be shorter than the arms";
  if (!Number.isFinite(c.axisAngle)) return "axis angle must be finite";
  if (c.armLen - c.cellSide >= 2 * c.crankLen)
    return "crank too short — the cell can never open (needs L − s < 2·crank)";
  return null;
}

export interface PeaucellierPose {
  ok: true;
  theta: number;
  /** crank pivot (fixed) */
  C: Vec2;
  /** driven rhombus corner (on the crank circle through O) */
  P: Vec2;
  /** output rhombus corner — traces the exact straight line */
  Q: Vec2;
  /** rhombus side corners (arm ends), CCW and CW of the O→P ray */
  armA: Vec2;
  armB: Vec2;
}

export interface PeaucellierFailure {
  ok: false;
  theta: number;
  reason: "unreachable" | "degenerate";
  /** crank tip, still defined when the cell can't close */
  P: Vec2 | null;
  detail: string;
}

export type PeaucellierResult = PeaucellierPose | PeaucellierFailure;

export function solvePeaucellier(
  c: PeaucellierConfig,
  theta: number,
): PeaucellierResult {
  const invalid = validatePeaucellier(c);
  if (invalid) return { ok: false, theta, reason: "degenerate", P: null, detail: invalid };

  const C = peaucellierCrankPivot(c);
  const P = add(C, fromPolar(c.crankLen, theta));
  const d = dist(c.O, P);

  // The cell closes iff the arm circles about O and the side circles about P
  // intersect: |L − s| ≤ |OP| ≤ L + s.
  const hit = circleCircleIntersection(c.O, c.armLen, P, c.cellSide);
  if (hit.kind === "none" || hit.kind === "coincident") {
    return {
      ok: false,
      theta,
      reason: "unreachable",
      P,
      detail:
        d < c.armLen - c.cellSide
          ? "cell folded shut — P too close to the pole"
          : "cell torn open — P too far from the pole",
    };
  }

  const armA = hit.kind === "tangent" ? hit.p : hit.p1;
  const armB = hit.kind === "tangent" ? hit.p : hit.p2;

  // Inversion: Q on the ray O→P with |OP|·|OQ| = L² − s².
  const Q = add(c.O, scale(sub(P, c.O), peaucellierK(c) / (d * d)));

  return { ok: true, theta, C, P, Q, armA, armB };
}

/** The exact output line: passes through `point`, along unit `dir`. */
export function peaucellierLine(c: PeaucellierConfig): { point: Vec2; dir: Vec2 } {
  const axis = fromPolar(1, c.axisAngle);
  return {
    point: add(c.O, scale(axis, peaucellierK(c) / (2 * c.crankLen))),
    dir: perp(axis),
  };
}

/**
 * Reachable crank angles. |OP|² = 2r²(1 + cos Δ) with Δ the crank angle off
 * the O→C axis, so both closure bounds are single acos evaluations.
 */
export function peaucellierInputRange(c: PeaucellierConfig): InputRange {
  if (validatePeaucellier(c)) return { full: false, arcs: [] };
  const r = c.crankLen;
  const cosBound = (reach: number): number => (reach * reach) / (2 * r * r) - 1;

  const lo = c.armLen - c.cellSide; // d must be ≥ lo (cell folds shut)
  const hi = c.armLen + c.cellSide; // d must be ≤ hi (cell tears open)

  const cosMax = cosBound(lo); // cos Δ ≥ cosMax
  const cosMin = cosBound(hi); // cos Δ ≤ cosMin

  const dMax = 2 * r;
  const deltaMax = cosMax <= -1 ? Math.PI : Math.acos(Math.min(1, cosMax));
  const deltaMin = dMax <= hi ? 0 : Math.acos(Math.min(1, Math.max(-1, cosMin)));

  if (deltaMax <= deltaMin) return { full: false, arcs: [] };
  if (deltaMin <= 0 && deltaMax >= Math.PI) return { full: true };

  if (deltaMin <= 0) {
    return {
      full: false,
      arcs: [
        {
          start: normalizeAngle(c.axisAngle - deltaMax),
          end: normalizeAngle(c.axisAngle + deltaMax),
        },
      ],
    };
  }
  return {
    full: false,
    arcs: [
      {
        start: normalizeAngle(c.axisAngle + deltaMin),
        end: normalizeAngle(c.axisAngle + deltaMax),
      },
      {
        start: normalizeAngle(c.axisAngle - deltaMax),
        end: normalizeAngle(c.axisAngle - deltaMin),
      },
    ],
  };
}

/** Sweep the reachable range and collect the output point's path. */
export function tracePeaucellier(
  c: PeaucellierConfig,
  steps = 240,
): CouplerCurve {
  const range = peaucellierInputRange(c);
  const points: Vec2[] = [];
  if (!range.full && range.arcs.length === 0) return { points, closed: false };

  // Stay a hair inside the fold limits — Q runs off to very large radii
  // near them, which is numerically fine but useless for display.
  const inset = 1e-3;
  const arcs = range.full
    ? [{ start: c.axisAngle - Math.PI + inset, end: c.axisAngle + Math.PI - inset }]
    : range.arcs;

  for (const arc of arcs) {
    let span = arc.end - arc.start;
    if (span < 0) span += Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
      const res = solvePeaucellier(c, arc.start + inset + (i / steps) * (span - 2 * inset));
      if (res.ok) points.push(res.Q);
    }
  }
  return { points, closed: false };
}

/** Sensible default: a tall, clean exact-line stroke. */
export const defaultPeaucellier = (): PeaucellierConfig => ({
  O: vec(-65, 0),
  crankLen: 45,
  armLen: 110,
  cellSide: 55,
  axisAngle: 0,
});