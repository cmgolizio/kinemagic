/**
 * Slider-crank solver: crank O2→A, connecting rod A→B, with B constrained to
 * a line (the slider axis). The axis passes through O2 offset by `offset` mm
 * perpendicular to its direction — offset 0 is the in-line engine layout.
 */

import {
  add,
  angleOf,
  fromPolar,
  normalizeAngle,
  perp,
  scale,
  sub,
  vec,
  type Vec2,
} from "./vec";
import { lineCircleIntersection } from "./geometry";

export interface SliderCrankConfig {
  /** crank pivot, world mm */
  O2: Vec2;
  crankLen: number;
  /** connecting rod length */
  rodLen: number;
  /** direction of slider travel, world radians */
  axisAngle: number;
  /** perpendicular offset of the slider line from O2 (+ is CCW of the axis) */
  offset: number;
}

export interface SliderCrankPose {
  ok: true;
  theta2: number;
  /** crank pin */
  A: Vec2;
  /** slider pin */
  B: Vec2;
  /** slider position along the axis, measured from O2's foot on the line */
  sliderPos: number;
  /** world angle of the rod A→B */
  rodAngle: number;
}

export interface SliderCrankFailure {
  ok: false;
  theta2: number;
  reason: "unreachable" | "degenerate";
  A: Vec2 | null;
  detail: string;
}

export type SliderCrankResult = SliderCrankPose | SliderCrankFailure;

export function validateSliderCrank(c: SliderCrankConfig): string | null {
  if (!(Number.isFinite(c.crankLen) && c.crankLen > 0)) return "crank length must be positive";
  if (!(Number.isFinite(c.rodLen) && c.rodLen > 0)) return "rod length must be positive";
  if (!Number.isFinite(c.offset)) return "offset must be finite";
  if (!Number.isFinite(c.axisAngle)) return "axis angle must be finite";
  return null;
}

/**
 * Forward solve at crank angle θ2. `branch` +1 takes the slider on the far
 * side of the crank pivot (the conventional engine assembly); −1 the near side.
 */
export function solveSliderCrank(
  config: SliderCrankConfig,
  theta2: number,
  opts: { branch?: 1 | -1 } = {},
): SliderCrankResult {
  const invalid = validateSliderCrank(config);
  if (invalid) {
    return { ok: false, theta2, reason: "degenerate", A: null, detail: invalid };
  }

  const branch = opts.branch ?? 1;
  const A = add(config.O2, fromPolar(config.crankLen, theta2));
  const axis = fromPolar(1, config.axisAngle);
  const lineOrigin = add(config.O2, scale(perp(axis), config.offset));

  const hit = lineCircleIntersection(lineOrigin, axis, A, config.rodLen);
  if (hit.kind === "none") {
    return {
      ok: false,
      theta2,
      reason: "unreachable",
      A,
      detail: "rod is too short to reach the slider line at this crank angle",
    };
  }

  let B: Vec2;
  let t: number;
  if (hit.kind === "tangent") {
    B = hit.p;
    t = hit.t;
  } else if (branch === 1) {
    B = hit.p2;
    t = hit.t2;
  } else {
    B = hit.p1;
    t = hit.t1;
  }

  return {
    ok: true,
    theta2,
    A,
    B,
    sliderPos: t,
    rodAngle: normalizeAngle(angleOf(sub(B, A))),
  };
}

/**
 * Closed-form piston position for the in-line/offset slider-crank with the
 * axis along +x through the origin: x = r·cosθ + √(l² − (r·sinθ − e)²).
 * Exists for cross-checking the general solver in tests.
 */
export function pistonPositionClosedForm(
  r: number,
  l: number,
  e: number,
  theta: number,
): number | null {
  const s = r * Math.sin(theta) - e;
  const under = l * l - s * s;
  if (under < 0) return null;
  return r * Math.cos(theta) + Math.sqrt(under);
}

/** Convenience default config used by tests and future UI presets. */
export const defaultSliderCrank = (): SliderCrankConfig => ({
  O2: vec(0, 0),
  crankLen: 30,
  rodLen: 90,
  axisAngle: 0,
  offset: 0,
});