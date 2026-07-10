/**
 * Four-bar linkage solver.
 *
 * Conventions (see docs/build-plan.md, Phase 1):
 * - Ground pivots O2 (crank/input) and O4 (output/rocker) are stored in world
 *   coordinates so the mechanism can be positioned/rotated freely. The ground
 *   link length r1 is derived: `|O4 - O2|`.
 * - Link lengths in mm: crankLen (r2), couplerLen (r3), rockerLen (r4).
 * - Input angle theta2 is measured in world frame, radians CCW from +x.
 * - The coupler point P is fixed in the coupler's local frame: `u` mm along
 *   A->B and `v` mm perpendicular (CCW-positive). A nonzero `v` is what makes
 *   coupler curves interesting.
 */

import { circleCircleIntersection } from "./intersections";
import {
  add,
  angleOf,
  dist,
  distSq,
  fromAngle,
  perp,
  scale,
  sub,
  vec2,
  type Vec2,
} from "./vec2";

export interface CouplerPointDef {
  /** mm along the A->B axis of the coupler. */
  u: number;
  /** mm perpendicular to A->B, CCW-positive. */
  v: number;
}

export interface FourBarConfig {
  /** Ground pivot of the input (crank) link, world mm. */
  o2: Vec2;
  /** Ground pivot of the output (rocker) link, world mm. */
  o4: Vec2;
  /** r2 — input link length, mm. */
  crankLen: number;
  /** r3 — coupler link length, mm. */
  couplerLen: number;
  /** r4 — output link length, mm. */
  rockerLen: number;
  /** Coupler point in the coupler's local frame. */
  couplerPoint: CouplerPointDef;
}

/** Derived ground link length r1, mm. */
export const groundLen = (config: Pick<FourBarConfig, "o2" | "o4">): number =>
  dist(config.o2, config.o4);

/** World angle of the ground link (O2 -> O4), radians. */
export const groundAngle = (config: Pick<FourBarConfig, "o2" | "o4">): number =>
  angleOf(sub(config.o4, config.o2));

/**
 * Convenience constructor: place O2 at `origin` and O4 at `groundLen` along
 * `groundAngleRad`, mirroring the textbook r1..r4 parameterization.
 */
export function fourBarFromLengths(params: {
  groundLen: number;
  crankLen: number;
  couplerLen: number;
  rockerLen: number;
  couplerPoint?: CouplerPointDef;
  origin?: Vec2;
  groundAngleRad?: number;
}): FourBarConfig {
  const origin = params.origin ?? vec2(0, 0);
  const angle = params.groundAngleRad ?? 0;
  return {
    o2: origin,
    o4: add(origin, scale(fromAngle(angle), params.groundLen)),
    crankLen: params.crankLen,
    couplerLen: params.couplerLen,
    rockerLen: params.rockerLen,
    couplerPoint: params.couplerPoint ?? { u: 0, v: 0 },
  };
}

/**
 * The two circle-circle solutions are the "open" and "crossed" assemblies.
 * `open` places B on the counter-clockwise side of the ray A -> O4,
 * `crossed` on the clockwise side. The solver holds a branch across frames —
 * switching branches mid-rotation is the classic bug that makes linkages
 * visually "snap".
 */
export type FourBarBranch = "open" | "crossed";

export interface FourBarPose {
  ok: true;
  /** Input angle this pose was solved at, radians. */
  theta2: number;
  /** Crank pin (end of input link), world mm. */
  a: Vec2;
  /** Coupler-rocker pin, world mm. */
  b: Vec2;
  /** Coupler point P, world mm. Traces the coupler curve. */
  p: Vec2;
  /** Branch this pose actually lies on. */
  branch: FourBarBranch;
  /**
   * Transmission angle: acute angle between coupler and rocker at B,
   * radians in [0, PI/2]. Near 0 the mechanism binds (force transmission
   * degrades); ~PI/2 is ideal.
   */
  transmissionAngle: number;
}

export type FourBarFailureReason =
  /** Geometry is fine, but this input angle cannot be reached. */
  | "unreachable"
  /** Geometry itself is invalid (non-positive lengths, coincident pivots, non-finite input). */
  | "degenerate";

export interface FourBarFailure {
  ok: false;
  reason: FourBarFailureReason;
  theta2: number;
  /** Crank pin position, still well-defined when only B fails to assemble. */
  a?: Vec2;
}

export type FourBarResult = FourBarPose | FourBarFailure;

export interface FourBarSolveOptions {
  /**
   * Assembly branch to use when there is no previous pose to continue from.
   * Default: "open".
   */
  branch?: FourBarBranch;
  /**
   * Previous B position for branch continuity: the solver picks the
   * intersection nearest to it (nearest-point continuation) instead of a
   * fixed formula, so the linkage never snaps between assemblies mid-sweep.
   */
  prevB?: Vec2;
}

const isFiniteVec = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

function validateConfig(config: FourBarConfig): boolean {
  return (
    isFiniteVec(config.o2) &&
    isFiniteVec(config.o4) &&
    Number.isFinite(config.crankLen) &&
    Number.isFinite(config.couplerLen) &&
    Number.isFinite(config.rockerLen) &&
    Number.isFinite(config.couplerPoint.u) &&
    Number.isFinite(config.couplerPoint.v) &&
    config.crankLen > 0 &&
    config.couplerLen > 0 &&
    config.rockerLen > 0 &&
    groundLen(config) > 0
  );
}

/** Acute angle between coupler (A->B) and rocker (O4->B) at joint B. */
function transmissionAngleAt(a: Vec2, b: Vec2, o4: Vec2): number {
  const coupler = sub(b, a);
  const rocker = sub(b, o4);
  const cosMu =
    (coupler.x * rocker.x + coupler.y * rocker.y) /
    (Math.hypot(coupler.x, coupler.y) * Math.hypot(rocker.x, rocker.y));
  const mu = Math.acos(Math.min(1, Math.max(-1, cosMu)));
  return mu > Math.PI / 2 ? Math.PI - mu : mu;
}

/** Which branch a solved B lies on, given the two ordered intersections. */
function branchOf(b: Vec2, points: [Vec2, Vec2]): FourBarBranch {
  return distSq(b, points[0]) <= distSq(b, points[1]) ? "open" : "crossed";
}

/**
 * Forward-solve the four-bar at input angle `theta2`.
 *
 * 1. Crank end A = O2 + r2 * (cos theta2, sin theta2).
 * 2. B satisfies |B - A| = r3 and |B - O4| = r4 -> circle-circle intersection.
 * 3. Branch: nearest-point continuation from `opts.prevB` when provided,
 *    otherwise the requested (or default "open") assembly.
 * 4. No intersection -> typed "unreachable" result, never NaN.
 */
export function solveFourBar(
  config: FourBarConfig,
  theta2: number,
  opts: FourBarSolveOptions = {},
): FourBarResult {
  if (!validateConfig(config) || !Number.isFinite(theta2)) {
    return { ok: false, reason: "degenerate", theta2 };
  }

  const a = add(config.o2, scale(fromAngle(theta2), config.crankLen));
  const hit = circleCircleIntersection(a, config.couplerLen, config.o4, config.rockerLen);

  if (hit.type === "separate" || hit.type === "contained") {
    return { ok: false, reason: "unreachable", theta2, a };
  }
  if (hit.type === "coincident") {
    // A sits on O4 with r3 == r4: infinitely many assemblies.
    return { ok: false, reason: "degenerate", theta2, a };
  }

  let b: Vec2;
  let branch: FourBarBranch;
  if (opts.prevB && isFiniteVec(opts.prevB)) {
    b =
      distSq(opts.prevB, hit.points[0]) <= distSq(opts.prevB, hit.points[1])
        ? hit.points[0]
        : hit.points[1];
    branch = branchOf(b, hit.points);
  } else {
    branch = opts.branch ?? "open";
    b = branch === "open" ? hit.points[0] : hit.points[1];
  }

  // Coupler point P: rigid in the coupler frame (u along A->B, v perpendicular).
  const axis = scale(sub(b, a), 1 / config.couplerLen);
  const p = add(a, add(scale(axis, config.couplerPoint.u), scale(perp(axis), config.couplerPoint.v)));

  return {
    ok: true,
    theta2,
    a,
    b,
    p,
    branch,
    transmissionAngle: transmissionAngleAt(a, b, config.o4),
  };
}

// ---------------------------------------------------------------------------
// Grashof classification
// ---------------------------------------------------------------------------

export type FourBarLink = "ground" | "crank" | "coupler" | "rocker";

export type GrashofClass =
  /** Grashof, shortest link is a side link: that link fully rotates. */
  | "crank-rocker"
  /** Grashof, shortest link is the ground: both side links fully rotate (drag-link). */
  | "double-crank"
  /** Grashof, shortest link is the coupler: both side links only rock. */
  | "grashof-double-rocker"
  /** s + l == p + q: can change branch through the change point. */
  | "change-point"
  /** Non-Grashof: no link fully rotates; all three moving links rock. */
  | "triple-rocker"
  /** One link longer than the other three combined: cannot assemble at all. */
  | "non-assemblable"
  /** Non-positive or non-finite lengths. */
  | "invalid";

export interface GrashofResult {
  class: GrashofClass;
  /** True when s + l <= p + q (includes the change point). */
  isGrashof: boolean;
  shortest: FourBarLink;
  longest: FourBarLink;
  /** Links that can rotate fully (360 deg) relative to the ground. */
  fullyRotating: FourBarLink[];
  /** Whether the input crank (r2) is a full 360-degree driver. */
  inputRotatesFully: boolean;
}

/** Relative tolerance for the change-point equality test. */
const GRASHOF_EPS = 1e-9;

export function classifyGrashof(lengths: {
  groundLen: number;
  crankLen: number;
  couplerLen: number;
  rockerLen: number;
}): GrashofResult {
  const entries: Array<{ link: FourBarLink; len: number }> = [
    { link: "ground", len: lengths.groundLen },
    { link: "crank", len: lengths.crankLen },
    { link: "coupler", len: lengths.couplerLen },
    { link: "rocker", len: lengths.rockerLen },
  ];

  const invalid = entries.some((e) => !Number.isFinite(e.len) || e.len <= 0);
  if (invalid) {
    return {
      class: "invalid",
      isGrashof: false,
      shortest: "ground",
      longest: "ground",
      fullyRotating: [],
      inputRotatesFully: false,
    };
  }

  const sorted = [...entries].sort((x, y) => x.len - y.len);
  const [s, p, q, l] = sorted;
  const scaleRef = l.len;

  if (l.len > s.len + p.len + q.len + scaleRef * GRASHOF_EPS) {
    return {
      class: "non-assemblable",
      isGrashof: false,
      shortest: s.link,
      longest: l.link,
      fullyRotating: [],
      inputRotatesFully: false,
    };
  }

  const excess = s.len + l.len - (p.len + q.len);
  const changePoint = Math.abs(excess) <= scaleRef * GRASHOF_EPS;
  const isGrashof = excess <= scaleRef * GRASHOF_EPS;

  let cls: GrashofClass;
  let fullyRotating: FourBarLink[];

  if (changePoint) {
    cls = "change-point";
    // At the change point the shortest link can still make full revolutions
    // (through folded configurations); branch is ambiguous there.
    fullyRotating = fullRotatorsFor(s.link);
  } else if (!isGrashof) {
    cls = "triple-rocker";
    fullyRotating = [];
  } else if (s.link === "ground") {
    cls = "double-crank";
    fullyRotating = ["crank", "rocker"];
  } else if (s.link === "coupler") {
    cls = "grashof-double-rocker";
    // The coupler makes full revolutions relative to the side links, but
    // neither side link fully rotates relative to ground.
    fullyRotating = ["coupler"];
  } else {
    cls = "crank-rocker";
    fullyRotating = [s.link];
  }

  return {
    class: cls,
    isGrashof,
    shortest: s.link,
    longest: l.link,
    fullyRotating,
    inputRotatesFully: fullyRotating.includes("crank"),
  };
}

function fullRotatorsFor(shortest: FourBarLink): FourBarLink[] {
  switch (shortest) {
    case "ground":
      return ["crank", "rocker"];
    case "coupler":
      return ["coupler"];
    default:
      return [shortest];
  }
}

export const classifyFourBar = (config: FourBarConfig): GrashofResult =>
  classifyGrashof({
    groundLen: groundLen(config),
    crankLen: config.crankLen,
    couplerLen: config.couplerLen,
    rockerLen: config.rockerLen,
  });

// ---------------------------------------------------------------------------
// Valid input range
// ---------------------------------------------------------------------------

export type FourBarInputRange =
  /** The input crank can be driven through a full revolution. */
  | { type: "full" }
  /**
   * The input only assembles for angles theta2 with
   * `minAbs <= |wrapPi(theta2 - groundAngle)| <= maxAbs` (radians).
   * The reachable set is symmetric about the ground line.
   */
  | { type: "limited"; minAbs: number; maxAbs: number }
  /** No input angle assembles (or the geometry is degenerate). */
  | { type: "none" };

/** Wrap an angle to (-PI, PI]. */
export const wrapPi = (angle: number): number => {
  const tau = 2 * Math.PI;
  let a = angle % tau;
  if (a <= -Math.PI) a += tau;
  else if (a > Math.PI) a -= tau;
  return a;
};

/**
 * Compute the reachable theta2 range from the triangle inequality on the
 * A-O4 diagonal: assembly requires |r3 - r4| <= |A - O4| <= r3 + r4.
 */
export function fourBarInputRange(config: FourBarConfig): FourBarInputRange {
  if (!validateConfig(config)) return { type: "none" };

  const r1 = groundLen(config);
  const r2 = config.crankLen;
  const r3 = config.couplerLen;
  const r4 = config.rockerLen;

  // cos(thetaRel) bounds from d^2 = r1^2 + r2^2 - 2 r1 r2 cos(thetaRel).
  const cMin = (r1 * r1 + r2 * r2 - (r3 + r4) * (r3 + r4)) / (2 * r1 * r2);
  const cMax = (r1 * r1 + r2 * r2 - (r3 - r4) * (r3 - r4)) / (2 * r1 * r2);

  if (cMin > 1 || cMax < -1 || cMin > cMax) return { type: "none" };
  if (cMin <= -1 && cMax >= 1) return { type: "full" };

  const minAbs = cMax >= 1 ? 0 : Math.acos(cMax);
  const maxAbs = cMin <= -1 ? Math.PI : Math.acos(cMin);
  return { type: "limited", minAbs, maxAbs };
}

/** Whether a given theta2 lies in the reachable input range. */
export function isInputAngleReachable(config: FourBarConfig, theta2: number): boolean {
  const range = fourBarInputRange(config);
  if (range.type === "full") return true;
  if (range.type === "none") return false;
  const rel = Math.abs(wrapPi(theta2 - groundAngle(config)));
  const eps = 1e-12;
  return rel >= range.minAbs - eps && rel <= range.maxAbs + eps;
}

// ---------------------------------------------------------------------------
// Coupler curve tracing
// ---------------------------------------------------------------------------

export interface CouplerCurveSample {
  theta2: number;
  result: FourBarResult;
}

/**
 * Sweep theta2 through a full revolution with branch continuity and return
 * every sample (reachable or not). Unreachable spans stay in the output so
 * callers can render gaps / valid ranges.
 */
export function traceCouplerCurve(
  config: FourBarConfig,
  opts: { steps?: number; branch?: FourBarBranch; startTheta2?: number } = {},
): CouplerCurveSample[] {
  const steps = Math.max(4, Math.floor(opts.steps ?? 360));
  const start = opts.startTheta2 ?? 0;
  const samples: CouplerCurveSample[] = [];
  let prevB: Vec2 | undefined;

  for (let i = 0; i < steps; i++) {
    const theta2 = start + (2 * Math.PI * i) / steps;
    const result = solveFourBar(config, theta2, { branch: opts.branch, prevB });
    if (result.ok) prevB = result.b;
    samples.push({ theta2, result });
  }
  return samples;
}