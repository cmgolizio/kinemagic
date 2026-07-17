/**
 * Geneva drive (Maltese cross) solver — intermittent motion.
 *
 * A continuously rotating driver carries a pin at radius p; an n-slot wheel
 * sits `centerDist` away. Classic proportions make the pin enter and leave
 * the slots tangentially (no impact): p = d·sin(π/n), wheel radius
 * w = d·cos(π/n), so p ⊥ slot at entry (p² + w² = d²).
 *
 * The driver angle θ is unbounded; the wheel angle is a pure function of θ
 * (no accumulated state): each driver revolution indexes the wheel by
 * exactly −2π/n (opposite direction), with a dwell while the pin is out of
 * the slot. Engagement spans the window |Δ| ≤ φ = π/2 − π/n around the
 * pin-toward-wheel direction.
 */

import {
  add,
  fromPolar,
  normalizeAngle,
  TWO_PI,
  type Vec2,
  vec,
} from "../vec";

export interface GenevaConfig {
  /** driver center, world mm */
  center: Vec2;
  /** number of wheel slots, ≥ 3 */
  slots: number;
  /** distance between driver and wheel centers, mm */
  centerDist: number;
  /** direction from driver center to wheel center, radians */
  wheelDir: number;
}

export interface GenevaGeometry {
  driverCenter: Vec2;
  wheelCenter: Vec2;
  /** pin-circle radius p = d·sin(π/n) */
  pinCircleR: number;
  /** wheel radius w = d·cos(π/n) */
  wheelR: number;
  /** engagement half-window φ = π/2 − π/n (driver angle, radians) */
  halfWindow: number;
  /** closest pin approach to the wheel center (slot inner end), d − p */
  slotInnerR: number;
  /** locking-disc radius: driver center to the wheel rim between slots */
  lockR: number;
}

export function genevaGeometry(c: GenevaConfig): GenevaGeometry {
  const n = c.slots;
  const d = c.centerDist;
  const p = d * Math.sin(Math.PI / n);
  const w = d * Math.cos(Math.PI / n);
  const wheelCenter = add(c.center, fromPolar(d, c.wheelDir));
  return {
    driverCenter: c.center,
    wheelCenter,
    pinCircleR: p,
    wheelR: w,
    halfWindow: Math.PI / 2 - Math.PI / n,
    slotInnerR: d - p,
    // Distance from the driver center to the wheel rim halfway between two
    // slots — the radius the locking crescent must clear.
    lockR: Math.sqrt(d * d + w * w - 2 * d * w * Math.cos(Math.PI / n)),
  };
}

export function validateGeneva(c: GenevaConfig): string | null {
  if (!Number.isFinite(c.center.x + c.center.y)) return "driver center must be finite";
  if (!Number.isInteger(c.slots) || c.slots < 3) return "slot count must be an integer ≥ 3";
  if (!(Number.isFinite(c.centerDist) && c.centerDist > 0))
    return "center distance must be positive";
  if (!Number.isFinite(c.wheelDir)) return "wheel direction must be finite";
  return null;
}

export interface GenevaPose {
  ok: true;
  theta: number;
  /** world pin position */
  pin: Vec2;
  /** wheel rotation, radians (continuous in θ, decreasing for CCW driver) */
  wheelAngle: number;
  /** pin currently inside a slot */
  engaged: boolean;
  /** completed driver cycles (each indexes the wheel by one slot) */
  cycle: number;
}

export interface GenevaFailure {
  ok: false;
  theta: number;
  reason: "degenerate";
  detail: string;
}

export type GenevaResult = GenevaPose | GenevaFailure;

/** Wheel-center-relative angle of the pin, in the driver→wheel frame. */
function slotAngleAt(delta: number, p: number, d: number): number {
  return Math.atan2(p * Math.sin(delta), p * Math.cos(delta) - d);
}

export function solveGeneva(c: GenevaConfig, theta: number): GenevaResult {
  const invalid = validateGeneva(c);
  if (invalid) return { ok: false, theta, reason: "degenerate", detail: invalid };

  const n = c.slots;
  const d = c.centerDist;
  const g = genevaGeometry(c);
  const phi = g.halfWindow;
  const index = TWO_PI / n;

  // Decompose θ (relative to the wheel direction) into whole cycles plus a
  // centered phase Δ ∈ (−π, π]; the engagement window is centered on Δ = 0.
  const rel = theta - c.wheelDir;
  const delta = normalizeAngle(rel);
  const cycle = Math.round((rel - delta) / TWO_PI);

  // Wheel angle within the cycle, relative to the entry position. The swing
  // per engagement is 2π/n < π, so normalizeAngle resolves it unambiguously.
  const entry = slotAngleAt(-phi, g.pinCircleR, d);
  let swing: number;
  if (delta <= -phi) swing = 0;
  else if (delta >= phi) swing = -index;
  else swing = normalizeAngle(slotAngleAt(delta, g.pinCircleR, d) - entry);

  const wheelAngle = c.wheelDir + entry + swing - index * cycle;
  const pin = add(c.center, fromPolar(g.pinCircleR, theta));

  return {
    ok: true,
    theta,
    pin,
    wheelAngle,
    engaged: Math.abs(delta) < phi,
    cycle,
  };
}

/** Fraction of the driver revolution the wheel spends at rest. */
export const genevaDwellFraction = (slots: number): number =>
  1 - (Math.PI - TWO_PI / slots) / TWO_PI;

/** World angles of the wheel's slot centerlines for a given pose. */
export function genevaSlotAngles(c: GenevaConfig, wheelAngle: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < c.slots; k++) {
    out.push(wheelAngle + (k * TWO_PI) / c.slots);
  }
  return out;
}

/** Sensible default: 6-slot wheel, the movie-projector classic. */
export const defaultGeneva = (): GenevaConfig => ({
  center: vec(-45, 0),
  slots: 6,
  centerDist: 90,
  wheelDir: 0,
});