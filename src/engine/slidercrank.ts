/**
 * Slider-crank solver: crank + connecting rod + a slider constrained to a
 * line with optional perpendicular offset. The piston mechanism.
 *
 * Conventions:
 * - Crank pivot O2 in world mm; crank angle theta2 in world frame, radians
 *   CCW from +x.
 * - The slider travels along an axis at `axisAngle` (radians, world). The
 *   axis passes `offset` mm from O2, measured perpendicular to the axis,
 *   CCW-positive (offset > 0 puts the axis on the left of the axis
 *   direction). offset = 0 is the classic in-line slider-crank.
 * - Slider position is reported both as a world point and as `sliderT`:
 *   signed mm along the axis from the axis origin (the point of the axis
 *   nearest... precisely: O2 + offset * perp(axisDir)).
 */

import { lineCircleIntersection } from "./intersections";
import { add, fromAngle, perp, scale, type Vec2 } from "./vec2";

export interface SliderCrankConfig {
  /** Crank ground pivot, world mm. */
  o2: Vec2;
  /** Direction of slider travel, radians CCW from +x. */
  axisAngle: number;
  /** r2 — crank length, mm. */
  crankLen: number;
  /** r3 — connecting-rod (coupler) length, mm. */
  rodLen: number;
  /** Perpendicular offset of the slider axis from O2, mm, CCW-positive. */
  offset: number;
}

/**
 * The line-circle solve has two roots; `positive` takes the slider at the
 * larger parameter along the axis direction (the conventional piston
 * assembly, crank pushing the slider away along +axis), `negative` the
 * smaller.
 */
export type SliderCrankBranch = "positive" | "negative";

export interface SliderCrankPose {
  ok: true;
  theta2: number;
  /** Crank pin (rod's crank-side joint), world mm. */
  a: Vec2;
  /** Slider pin (rod's slider-side joint), world mm. */
  slider: Vec2;
  /** Signed slider travel along the axis from the axis origin, mm. */
  sliderT: number;
  branch: SliderCrankBranch;
}

export interface SliderCrankFailure {
  ok: false;
  reason: "unreachable" | "degenerate";
  theta2: number;
  a?: Vec2;
}

export type SliderCrankResult = SliderCrankPose | SliderCrankFailure;

export interface SliderCrankSolveOptions {
  /** Branch when there's no previous pose to continue from. Default "positive". */
  branch?: SliderCrankBranch;
  /** Previous sliderT for continuity: picks the root nearest to it. */
  prevT?: number;
}

const isFiniteVec = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

function validateConfig(config: SliderCrankConfig): boolean {
  return (
    isFiniteVec(config.o2) &&
    Number.isFinite(config.axisAngle) &&
    Number.isFinite(config.crankLen) &&
    Number.isFinite(config.rodLen) &&
    Number.isFinite(config.offset) &&
    config.crankLen > 0 &&
    config.rodLen > 0
  );
}

/** Origin of the slider axis: the offset foot point relative to O2. */
export function sliderAxisOrigin(config: SliderCrankConfig): Vec2 {
  return add(config.o2, scale(perp(fromAngle(config.axisAngle)), config.offset));
}

/**
 * Forward-solve the slider-crank at input angle `theta2`.
 *
 * The slider point S lies on the axis line and satisfies |S - A| = rodLen —
 * a line-circle intersection. Unreachable when the rod is too short to span
 * from the crank pin to the axis (|distance from A to axis| > rodLen).
 */
export function solveSliderCrank(
  config: SliderCrankConfig,
  theta2: number,
  opts: SliderCrankSolveOptions = {},
): SliderCrankResult {
  if (!validateConfig(config) || !Number.isFinite(theta2)) {
    return { ok: false, reason: "degenerate", theta2 };
  }

  const a = add(config.o2, scale(fromAngle(theta2), config.crankLen));
  const axisDir = fromAngle(config.axisAngle); // unit: ts are in mm
  const origin = sliderAxisOrigin(config);

  const hit = lineCircleIntersection(origin, axisDir, a, config.rodLen);
  if (hit.type === "degenerate") return { ok: false, reason: "degenerate", theta2, a };
  if (hit.type === "miss") return { ok: false, reason: "unreachable", theta2, a };

  // hit.ts are ordered ascending: [0] = negative branch, [1] = positive.
  let index: 0 | 1;
  if (opts.prevT !== undefined && Number.isFinite(opts.prevT)) {
    index = Math.abs(opts.prevT - hit.ts[0]) <= Math.abs(opts.prevT - hit.ts[1]) ? 0 : 1;
  } else {
    index = (opts.branch ?? "positive") === "positive" ? 1 : 0;
  }

  return {
    ok: true,
    theta2,
    a,
    slider: hit.points[index],
    sliderT: hit.ts[index],
    branch: index === 1 ? "positive" : "negative",
  };
}

/**
 * Slider travel extremes over a full crank revolution, for the positive
 * branch: the slider is farthest when crank and rod are extended in line
 * (combined length crankLen + rodLen) and nearest when folded
 * (|rodLen - crankLen|), both reduced by the offset.
 *
 * Returns null when the mechanism cannot complete a full revolution
 * (the crank is not a full rotator relative to the axis): that requires
 * rodLen - crankLen >= |offset| ... i.e. the folded reach still spans the
 * offset for every crank angle.
 */
export function sliderStroke(
  config: SliderCrankConfig,
): { tMax: number; tMin: number; stroke: number } | null {
  if (!validateConfig(config)) return null;
  const r = config.crankLen;
  const l = config.rodLen;
  const e = config.offset;

  const reachOut = (r + l) * (r + l) - e * e;
  const reachIn = (l - r) * (l - r) - e * e;
  if (l - r < Math.abs(e) || reachOut <= 0 || reachIn < 0) return null;

  const tMax = Math.sqrt(reachOut);
  const tMin = Math.sqrt(reachIn);
  return { tMax, tMin, stroke: tMax - tMin };
}