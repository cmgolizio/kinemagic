/**
 * Cam & follower solver.
 *
 * The cam spins about `center`; the follower translates on a fixed vertical
 * axis through the center (in-line layout). Two profile kinds:
 *
 * - "eccentric": a circular disc of radius `discR` whose center rides `ecc`
 *   mm from the cam axis — the classic circular-arc cam. Follower motion is
 *   solved geometrically from the contact condition (closed form; an
 *   eccentric disc on a flat-face follower is exact simple-harmonic motion).
 * - "rdf": a rise–dwell–fall displacement program built from a motion law
 *   (uniform / simple-harmonic / cycloidal). The profile is synthesized from
 *   the law, so the follower reproduces the law exactly.
 *
 * Angle convention: θ is the cam rotation; at θ = 0 the follower is at zero
 * lift. `lift` in a pose is mm of rise above that lowest position.
 */

import {
  add,
  norm,
  normalizeAnglePositive,
  perp,
  rotate,
  scale,
  sub,
  TWO_PI,
  vec,
  type Vec2,
} from "../vec";

export type MotionLaw = "uniform" | "harmonic" | "cycloidal";
export type FollowerKind = "flat" | "roller";
export type CamProfileKind = "eccentric" | "rdf";

export interface CamConfig {
  /** cam axis, world mm */
  center: Vec2;
  kind: CamProfileKind;
  follower: FollowerKind;
  /** roller radius (used when follower === "roller") */
  rollerR: number;
  /** eccentric: disc radius */
  discR: number;
  /** eccentric: disc-center offset from the cam axis (0 ≤ ecc < discR) */
  ecc: number;
  /** rdf: base circle radius */
  baseR: number;
  /** rdf: total lift of the rise, mm */
  lift: number;
  /** rdf: crank-angle spans of rise / high dwell / fall, degrees. The
   * remainder of the revolution dwells at zero lift. */
  riseDeg: number;
  dwellDeg: number;
  fallDeg: number;
  law: MotionLaw;
}

// ---------------------------------------------------------------------------
// Motion laws — normalized: f(0) = 0, f(1) = 1
// ---------------------------------------------------------------------------

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Normalized displacement f(x) of the motion law over x ∈ [0, 1]. */
export function lawValue(law: MotionLaw, xRaw: number): number {
  const x = clamp01(xRaw);
  switch (law) {
    case "uniform":
      return x;
    case "harmonic":
      return (1 - Math.cos(Math.PI * x)) / 2;
    case "cycloidal":
      return x - Math.sin(TWO_PI * x) / TWO_PI;
  }
}

/** df/dx of the motion law (normalized velocity). */
export function lawSlope(law: MotionLaw, xRaw: number): number {
  const x = clamp01(xRaw);
  switch (law) {
    case "uniform":
      return 1;
    case "harmonic":
      return (Math.PI / 2) * Math.sin(Math.PI * x);
    case "cycloidal":
      return 1 - Math.cos(TWO_PI * x);
  }
}

// ---------------------------------------------------------------------------
// Displacement s(θ) and its slope ds/dθ
// ---------------------------------------------------------------------------

interface RdfSpans {
  rise: number;
  dwell: number;
  fall: number;
}

const rdfSpans = (c: CamConfig): RdfSpans => ({
  rise: (c.riseDeg * Math.PI) / 180,
  dwell: (c.dwellDeg * Math.PI) / 180,
  fall: (c.fallDeg * Math.PI) / 180,
});

/** Follower lift s(θ) in mm above the lowest position. */
export function camLift(c: CamConfig, theta: number): number {
  if (c.kind === "eccentric") {
    if (c.follower === "flat") {
      return c.ecc * (1 - Math.cos(theta));
    }
    // Roller center on the axis at distance Q = discR + rollerR from the
    // disc center; disc center rides at radius ecc about the cam axis.
    const q = c.discR + c.rollerR;
    const sn = c.ecc * Math.sin(theta);
    return c.ecc * (1 - Math.cos(theta)) + Math.sqrt(q * q - sn * sn) - q;
  }

  const { rise, dwell, fall } = rdfSpans(c);
  const psi = normalizeAnglePositive(theta);
  if (psi < rise) return c.lift * lawValue(c.law, psi / rise);
  if (psi < rise + dwell) return c.lift;
  if (psi < rise + dwell + fall)
    return c.lift * lawValue(c.law, 1 - (psi - rise - dwell) / fall);
  return 0;
}

/** ds/dθ in mm/rad. For a flat-face follower this is also the contact
 * point's offset from the follower axis. */
export function camLiftSlope(c: CamConfig, theta: number): number {
  if (c.kind === "eccentric") {
    if (c.follower === "flat") return c.ecc * Math.sin(theta);
    const q = c.discR + c.rollerR;
    const sn = c.ecc * Math.sin(theta);
    return (
      c.ecc * Math.sin(theta) -
      (sn * c.ecc * Math.cos(theta)) / Math.sqrt(q * q - sn * sn)
    );
  }

  const { rise, dwell, fall } = rdfSpans(c);
  const psi = normalizeAnglePositive(theta);
  if (psi < rise) return (c.lift / rise) * lawSlope(c.law, psi / rise);
  if (psi < rise + dwell) return 0;
  if (psi < rise + dwell + fall)
    return (-c.lift / fall) * lawSlope(c.law, 1 - (psi - rise - dwell) / fall);
  return 0;
}

/** Peak lift of the program (2·ecc for the eccentric disc). */
export const camMaxLift = (c: CamConfig): number =>
  c.kind === "eccentric" ? 2 * c.ecc : c.lift;

/** Radial distance from the cam axis to the follower reference (flat face
 * line, or roller center) at zero lift. */
export function camBaseDist(c: CamConfig): number {
  if (c.kind === "eccentric") {
    return c.follower === "flat"
      ? c.discR - c.ecc
      : c.discR + c.rollerR - c.ecc;
  }
  return c.follower === "flat" ? c.baseR : c.baseR + c.rollerR;
}

// ---------------------------------------------------------------------------
// Validation & solve
// ---------------------------------------------------------------------------

const pos = (n: number): boolean => Number.isFinite(n) && n > 0;

export function validateCam(c: CamConfig): string | null {
  if (!Number.isFinite(c.center.x + c.center.y)) return "cam center must be finite";
  if (c.follower === "roller" && !pos(c.rollerR)) return "roller radius must be positive";
  if (c.kind === "eccentric") {
    if (!pos(c.discR)) return "disc radius must be positive";
    if (!(Number.isFinite(c.ecc) && c.ecc >= 0)) return "eccentricity must be ≥ 0";
    if (c.ecc >= c.discR) return "eccentricity must be smaller than the disc radius";
    return null;
  }
  if (!pos(c.baseR)) return "base circle radius must be positive";
  if (!pos(c.lift)) return "lift must be positive";
  if (!pos(c.riseDeg)) return "rise span must be positive";
  if (!pos(c.fallDeg)) return "fall span must be positive";
  if (!(Number.isFinite(c.dwellDeg) && c.dwellDeg >= 0)) return "dwell span must be ≥ 0";
  if (c.riseDeg + c.dwellDeg + c.fallDeg > 360)
    return "rise + dwell + fall must fit in 360°";
  return null;
}

export interface CamPose {
  ok: true;
  theta: number;
  /** follower lift above the lowest position, mm */
  lift: number;
  /** radial distance from the cam axis to the follower reference */
  followerDist: number;
  /** world position of the follower reference (roller center / face center) */
  follower: Vec2;
  /** world contact point on the cam surface */
  contact: Vec2;
}

export interface CamFailure {
  ok: false;
  theta: number;
  reason: "degenerate";
  detail: string;
}

export type CamResult = CamPose | CamFailure;

export function solveCam(c: CamConfig, theta: number): CamResult {
  const invalid = validateCam(c);
  if (invalid) return { ok: false, theta, reason: "degenerate", detail: invalid };

  const lift = camLift(c, theta);
  const followerDist = camBaseDist(c) + lift;
  const follower = add(c.center, vec(0, followerDist));

  let contact: Vec2;
  if (c.follower === "flat") {
    // Flat face: contact sits ds/dθ from the axis, on the face line.
    contact = add(c.center, vec(camLiftSlope(c, theta), followerDist));
  } else if (c.kind === "eccentric") {
    // Roller: contact on the segment roller-center → disc-center.
    const discCenter = add(c.center, rotate(vec(0, -c.ecc), theta));
    contact = add(follower, scale(norm(sub(discCenter, follower)), c.rollerR));
  } else {
    // Roller on a synthesized profile: step down the pitch-curve normal.
    const h = 1e-4;
    const at = (t: number): Vec2 =>
      rotate(vec(0, c.baseR + c.rollerR + camLift(c, t)), -t);
    const tangent = sub(at(theta + h), at(theta - h));
    let n = norm(perp(tangent));
    const local = at(theta);
    if (n.x * local.x + n.y * local.y > 0) n = scale(n, -1);
    const localContact = add(local, scale(n, c.rollerR));
    contact = add(c.center, rotate(localContact, theta));
  }

  return { ok: true, theta, lift, followerDist, follower, contact };
}

// ---------------------------------------------------------------------------
// Profile synthesis (cam local frame, θ = 0) — for rendering & export
// ---------------------------------------------------------------------------

/**
 * Closed profile polyline in the cam's local frame. Rotating these points by
 * θ gives the world profile. Exact for eccentric and flat-face cams; the
 * roller profile is the pitch curve offset inward along its numeric normal.
 */
export function camProfile(c: CamConfig, samples = 256): Vec2[] {
  if (validateCam(c)) return [];

  if (c.kind === "eccentric") {
    const out: Vec2[] = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * TWO_PI;
      out.push(vec(c.discR * Math.cos(a), -c.ecc + c.discR * Math.sin(a)));
    }
    return out;
  }

  if (c.follower === "flat") {
    // Envelope of the face lines: world contact (s'(ψ), baseR + s(ψ)),
    // carried back into the cam frame.
    const out: Vec2[] = [];
    for (let i = 0; i < samples; i++) {
      const psi = (i / samples) * TWO_PI;
      out.push(rotate(vec(camLiftSlope(c, psi), c.baseR + camLift(c, psi)), -psi));
    }
    return out;
  }

  // Roller: pitch curve (roller-center locus in the cam frame), then a
  // parallel curve rollerR inward.
  const pitch: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const psi = (i / samples) * TWO_PI;
    pitch.push(rotate(vec(0, c.baseR + c.rollerR + camLift(c, psi)), -psi));
  }
  const out: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const prev = pitch[(i - 1 + samples) % samples];
    const next = pitch[(i + 1) % samples];
    let n = norm(perp(sub(next, prev)));
    if (n.x * pitch[i].x + n.y * pitch[i].y > 0) n = scale(n, -1);
    out.push(add(pitch[i], scale(n, c.rollerR)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Displacement diagram — s(θ) over a full revolution, for the inset plot
// ---------------------------------------------------------------------------

export interface CamDiagram {
  /** lift sampled at steps+1 evenly spaced angles over [0, 2π] */
  lift: number[];
  maxLift: number;
}

export function camDiagram(c: CamConfig, steps = 180): CamDiagram {
  if (validateCam(c)) return { lift: [], maxLift: 0 };
  const lift: number[] = [];
  for (let i = 0; i <= steps; i++) {
    lift.push(camLift(c, (i / steps) * TWO_PI));
  }
  return { lift, maxLift: camMaxLift(c) };
}

/** Sensible default: cycloidal rise-dwell-fall on a roller follower. */
export const defaultCam = (): CamConfig => ({
  center: vec(0, 0),
  kind: "rdf",
  follower: "roller",
  rollerR: 10,
  discR: 45,
  ecc: 15,
  baseR: 35,
  lift: 25,
  riseDeg: 120,
  dwellDeg: 60,
  fallDeg: 120,
  law: "cycloidal",
});