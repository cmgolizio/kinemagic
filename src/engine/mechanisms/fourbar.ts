/**
 * Four-bar linkage solver.
 *
 * Conventions:
 * - Ground pivots O2 (crank/input) and O4 (rocker/output) are stored in world
 *   coordinates (mm, Y up) so the mechanism can be positioned freely.
 * - Link lengths: crank r2 (O2→A), coupler r3 (A→B), rocker r4 (O4→B),
 *   ground r1 = |O4 − O2| (derived from the pivots).
 * - The input angle θ2 is the world-frame angle of the crank (O2→A).
 * - The coupler point P is fixed in the coupler's local frame: `u` mm along
 *   A→B and `v` mm perpendicular (counter-clockwise) to it.
 */

import {
  add,
  angleOf,
  cross,
  dist,
  dist2,
  fromPolar,
  norm,
  normalizeAngle,
  perp,
  scale,
  sub,
  TWO_PI,
  type Vec2,
} from "../vec";
import { circleCircleIntersection } from "../geometry";

export type BranchSign = 1 | -1;

export interface CouplerPoint {
  /** mm along the coupler axis A→B */
  u: number;
  /** mm perpendicular (CCW) to A→B */
  v: number;
}

export interface FourBarConfig {
  O2: Vec2;
  O4: Vec2;
  crankLen: number;
  couplerLen: number;
  rockerLen: number;
  couplerPoint: CouplerPoint;
}

export const groundLen = (c: FourBarConfig): number => dist(c.O2, c.O4);

export interface FourBarPose {
  ok: true;
  theta2: number;
  /** crank–coupler joint */
  A: Vec2;
  /** coupler–rocker joint */
  B: Vec2;
  /** coupler point (traces the coupler curve) */
  P: Vec2;
  /** which circle-intersection branch B is on (for continuation) */
  branch: BranchSign;
  /** world angle of the coupler A→B */
  theta3: number;
  /** world angle of the rocker O4→B */
  theta4: number;
  /** interior angle between coupler and rocker at B, in (0, π) */
  transmissionAngle: number;
}

export interface FourBarFailure {
  ok: false;
  theta2: number;
  reason: "unreachable" | "degenerate";
  /** crank tip, still well-defined when the dyad can't close */
  A: Vec2 | null;
  detail: string;
}

export type FourBarResult = FourBarPose | FourBarFailure;

export interface SolveOptions {
  /**
   * Previous B position for branch continuity (nearest-point continuation).
   * Preferred over `branch` when both are given — this is what prevents the
   * assembly from snapping between open/crossed circuits mid-rotation.
   */
  prevB?: Vec2;
  /** Explicit branch when there is no history: +1 = CCW side of A→O4. */
  branch?: BranchSign;
}

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0;

export function validateConfig(c: FourBarConfig): string | null {
  if (!isPositive(c.crankLen)) return "crank length must be positive";
  if (!isPositive(c.couplerLen)) return "coupler length must be positive";
  if (!isPositive(c.rockerLen)) return "rocker length must be positive";
  if (!Number.isFinite(c.O2.x + c.O2.y + c.O4.x + c.O4.y))
    return "ground pivots must be finite";
  if (groundLen(c) <= 0) return "ground pivots are coincident";
  return null;
}

/** Forward-solve the linkage at input angle θ2. Never returns NaN geometry. */
export function solveFourBar(
  config: FourBarConfig,
  theta2: number,
  opts: SolveOptions = {},
): FourBarResult {
  const invalid = validateConfig(config);
  if (invalid) {
    return { ok: false, theta2, reason: "degenerate", A: null, detail: invalid };
  }

  const A = add(config.O2, fromPolar(config.crankLen, theta2));
  const hit = circleCircleIntersection(A, config.couplerLen, config.O4, config.rockerLen);

  if (hit.kind === "none") {
    return {
      ok: false,
      theta2,
      reason: "unreachable",
      A,
      detail:
        hit.separation === "apart"
          ? "coupler and rocker cannot reach each other at this crank angle"
          : "one closure circle is contained in the other at this crank angle",
    };
  }
  if (hit.kind === "coincident") {
    return {
      ok: false,
      theta2,
      reason: "degenerate",
      A,
      detail: "coupler and rocker circles coincide — B is indeterminate",
    };
  }

  let B: Vec2;
  let branch: BranchSign;
  if (hit.kind === "tangent") {
    B = hit.p;
    branch = opts.branch ?? 1;
  } else if (opts.prevB) {
    // Nearest-point continuation: hold the assembly on its current circuit.
    const d1 = dist2(hit.p1, opts.prevB);
    const d2 = dist2(hit.p2, opts.prevB);
    B = d1 <= d2 ? hit.p1 : hit.p2;
    branch = d1 <= d2 ? 1 : -1;
  } else {
    branch = opts.branch ?? 1;
    B = branch === 1 ? hit.p1 : hit.p2;
  }

  // Coupler frame: û along A→B, v̂ = perp(û) (CCW).
  const uHat = norm(sub(B, A));
  const vHat = perp(uHat);
  const P = add(A, add(scale(uHat, config.couplerPoint.u), scale(vHat, config.couplerPoint.v)));

  // Transmission angle: interior angle of triangle A-B-O4 at B.
  const bToA = sub(A, B);
  const bToO4 = sub(config.O4, B);
  const mu = Math.abs(
    Math.atan2(Math.abs(cross(bToA, bToO4)), bToA.x * bToO4.x + bToA.y * bToO4.y),
  );

  return {
    ok: true,
    theta2,
    A,
    B,
    P,
    branch,
    theta3: angleOf(sub(B, A)),
    theta4: angleOf(sub(B, config.O4)),
    transmissionAngle: mu,
  };
}

// ---------------------------------------------------------------------------
// Grashof classification
// ---------------------------------------------------------------------------

export type LinkName = "ground" | "crank" | "coupler" | "rocker";

export type GrashofClass =
  | "crank-rocker"
  | "double-crank"
  | "double-rocker"
  | "change-point"
  | "triple-rocker";

export interface GrashofResult {
  class: GrashofClass;
  /** s + l ≤ p + q */
  grashof: boolean;
  shortest: LinkName;
  /** links that can rotate fully relative to the ground frame */
  fullyRotating: LinkName[];
  /** whether the input crank (r2) is a full 360° driver */
  inputRotatesFully: boolean;
  /** human-readable one-liner for the UI badge */
  description: string;
}

export function classifyGrashof(
  ground: number,
  crank: number,
  coupler: number,
  rocker: number,
): GrashofResult {
  const named: Array<[LinkName, number]> = [
    ["ground", ground],
    ["crank", crank],
    ["coupler", coupler],
    ["rocker", rocker],
  ];
  const sorted = [...named].sort((a, b) => a[1] - b[1]);
  const [shortest, s] = sorted[0];
  const l = sorted[3][1];
  const pq = sorted[1][1] + sorted[2][1];
  const tol = 1e-9 * Math.max(1, l);

  if (s + l > pq + tol) {
    return {
      class: "triple-rocker",
      grashof: false,
      shortest,
      fullyRotating: [],
      inputRotatesFully: false,
      description: "Non-Grashof triple-rocker — no link fully rotates; the input sways between limits",
    };
  }

  const changePoint = Math.abs(s + l - pq) <= tol;
  // In a Grashof chain the shortest link revolves fully relative to all
  // others; relative to ground that means:
  const fullyRotating: LinkName[] =
    shortest === "ground" ? ["crank", "rocker"] : [shortest];
  const inputRotatesFully = fullyRotating.includes("crank");

  if (changePoint) {
    return {
      class: "change-point",
      grashof: true,
      shortest,
      fullyRotating,
      inputRotatesFully,
      description:
        "Change-point — links can become collinear; the assembly can flip branch at the fold",
    };
  }

  let cls: GrashofClass;
  let description: string;
  switch (shortest) {
    case "ground":
      cls = "double-crank";
      description = "Grashof double-crank (drag-link) — both side links fully rotate";
      break;
    case "coupler":
      cls = "double-rocker";
      description = "Grashof double-rocker — the coupler fully rotates; both side links sway";
      break;
    case "crank":
      cls = "crank-rocker";
      description = "Grashof crank-rocker — the crank fully rotates, the rocker sways";
      break;
    default:
      cls = "crank-rocker";
      description =
        "Grashof rocker-crank — the output link fully rotates; the driven crank sways";
      break;
  }

  return {
    class: cls,
    grashof: true,
    shortest,
    fullyRotating,
    inputRotatesFully,
    description,
  };
}

export const classify = (c: FourBarConfig): GrashofResult =>
  classifyGrashof(groundLen(c), c.crankLen, c.couplerLen, c.rockerLen);

// ---------------------------------------------------------------------------
// Reachable input range
// ---------------------------------------------------------------------------

/** A CCW arc of input angles, in world frame; start/end normalized to (-π, π]. */
export interface InputArc {
  start: number;
  end: number;
}

export type InputRange =
  | { full: true }
  | {
      full: false;
      /**
       * Reachable θ2 arcs, symmetric about the ground line O2→O4.
       * Empty when the linkage cannot assemble at any input angle.
       */
      arcs: InputArc[];
    };

/**
 * Where can the crank go? The dyad closes iff |r3 − r4| ≤ |A−O4| ≤ r3 + r4.
 * With φ the angle between the crank and the ground line O2→O4,
 * |A−O4|² = r1² + r2² − 2·r1·r2·cos φ is monotonic in φ ∈ [0, π], so the
 * limits fall out of two acos evaluations.
 */
export function inputRange(config: FourBarConfig): InputRange {
  const r1 = groundLen(config);
  const r2 = config.crankLen;
  const r3 = config.couplerLen;
  const r4 = config.rockerLen;

  const dMin = Math.abs(r1 - r2);
  const dMax = r1 + r2;
  const reachLo = Math.abs(r3 - r4);
  const reachHi = r3 + r4;

  // The dyad can never close when even the closest/farthest crank positions
  // fall outside the reach annulus.
  if (dMin > reachHi || dMax < reachLo) return { full: false, arcs: [] };

  const cosAt = (d: number) => (r1 * r1 + r2 * r2 - d * d) / (2 * r1 * r2);

  // φ where |A−O4| = reachHi (upper closure limit)
  const phiMax = dMax <= reachHi ? Math.PI : Math.acos(Math.max(-1, Math.min(1, cosAt(reachHi))));
  // φ where |A−O4| = reachLo (lower closure limit)
  const phiMin = dMin >= reachLo ? 0 : Math.acos(Math.max(-1, Math.min(1, cosAt(reachLo))));

  if (phiMin <= 0 && phiMax >= Math.PI) return { full: true };
  if (phiMin > phiMax) return { full: false, arcs: [] }; // cannot assemble anywhere

  const gamma = angleOf(sub(config.O4, config.O2));
  if (phiMin <= 0) {
    // Single arc straddling the ground line.
    return {
      full: false,
      arcs: [
        { start: normalizeAngle(gamma - phiMax), end: normalizeAngle(gamma + phiMax) },
      ],
    };
  }
  // Two arcs, one on each side of the ground line.
  return {
    full: false,
    arcs: [
      { start: normalizeAngle(gamma + phiMin), end: normalizeAngle(gamma + phiMax) },
      { start: normalizeAngle(gamma - phiMax), end: normalizeAngle(gamma - phiMin) },
    ],
  };
}

/** Is θ inside the CCW arc [start, end]? */
export function angleInArc(theta: number, arc: InputArc): boolean {
  const t = normalizeAngle(theta);
  let span = arc.end - arc.start;
  if (span < 0) span += TWO_PI;
  let off = t - arc.start;
  if (off < 0) off += TWO_PI;
  return off <= span + 1e-12;
}

/** Clamp θ to the nearest angle inside the reachable range. */
export function clampToRange(theta: number, range: InputRange): number {
  if (range.full) return theta;
  if (range.arcs.length === 0) return theta;
  for (const arc of range.arcs) {
    if (angleInArc(theta, arc)) return theta;
  }
  // Snap to the nearest arc endpoint by angular distance.
  const t = normalizeAngle(theta);
  let best = t;
  let bestDist = Infinity;
  for (const arc of range.arcs) {
    for (const edge of [arc.start, arc.end]) {
      const d = Math.abs(normalizeAngle(t - edge));
      if (d < bestDist) {
        bestDist = d;
        best = edge;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Coupler curve
// ---------------------------------------------------------------------------

export interface CouplerCurve {
  points: Vec2[];
  /** true when the curve is a closed loop */
  closed: boolean;
}

/**
 * Trace the full coupler curve for the current geometry.
 *
 * Full-rotation input: sweep θ2 through 360° with nearest-point branch
 * continuation — one closed loop per branch.
 *
 * Limited input (rocker/non-Grashof): sweep the reachable arc on one branch,
 * then back on the other. At the arc limits the two branch solutions coincide
 * (the closure circles are tangent), so the out-and-back sweep is itself a
 * closed loop — that IS the full coupler curve of a swaying linkage.
 */
export function traceCouplerCurve(
  config: FourBarConfig,
  opts: { branch?: BranchSign; steps?: number; theta2?: number } = {},
): CouplerCurve {
  const steps = opts.steps ?? 360;
  const branch = opts.branch ?? 1;
  const range = inputRange(config);
  const points: Vec2[] = [];

  if (range.full) {
    let prevB: Vec2 | undefined;
    // Seed the branch at the starting angle, then continue by nearness.
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * TWO_PI;
      const res = solveFourBar(config, theta, prevB ? { prevB } : { branch });
      if (res.ok) {
        points.push(res.P);
        prevB = res.B;
      }
    }
    return { points, closed: points.length > 2 };
  }

  if (range.arcs.length === 0) return { points: [], closed: false };

  // Pick the arc containing the current input angle if given, else the first.
  const arc =
    (opts.theta2 !== undefined
      ? range.arcs.find((a) => angleInArc(opts.theta2!, a))
      : undefined) ?? range.arcs[0];

  let span = arc.end - arc.start;
  if (span < 0) span += TWO_PI;
  const half = Math.max(8, Math.floor(steps / 2));

  // Out on the requested branch…
  for (let i = 0; i <= half; i++) {
    const theta = arc.start + (i / half) * span;
    const res = solveFourBar(config, theta, { branch });
    if (res.ok) points.push(res.P);
  }
  // …and back on the other: the physical continuation through the fold.
  const other: BranchSign = branch === 1 ? -1 : 1;
  for (let i = half; i >= 0; i--) {
    const theta = arc.start + (i / half) * span;
    const res = solveFourBar(config, theta, { branch: other });
    if (res.ok) points.push(res.P);
  }
  return { points, closed: points.length > 2 };
}