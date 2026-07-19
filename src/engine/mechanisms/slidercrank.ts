/**
 * Slider-crank solver: crank O2→A, connecting rod A→B, with B constrained to
 * a line (the slider axis). The axis passes through O2 offset by `offset` mm
 * perpendicular to its direction — offset 0 is the in-line engine layout.
 */

import {
  add,
  angleOf,
  fromPolar,
  norm,
  normalizeAngle,
  perp,
  scale,
  sub,
  TWO_PI,
  vec,
  type Vec2,
} from "../vec";
import { lineCircleIntersection } from "../geometry";
import type { CouplerCurve, CouplerPoint, InputRange } from "./fourbar";

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
  /** trace point fixed in the rod frame: u mm along A→B, v mm perpendicular
   * (CCW). Points off the axis trace the interesting rod curves. */
  rodPoint?: CouplerPoint;
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
  /** rod trace point in world coords (midpoint of the rod when unset) */
  P: Vec2;
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

  const rodPoint = config.rodPoint ?? { u: config.rodLen / 2, v: 0 };
  const uHat = norm(sub(B, A));
  const vHat = perp(uHat);
  const P = add(A, add(scale(uHat, rodPoint.u), scale(vHat, rodPoint.v)));

  return {
    ok: true,
    theta2,
    A,
    B,
    sliderPos: t,
    rodAngle: normalizeAngle(angleOf(sub(B, A))),
    P,
  };
}

/**
 * Reachable crank angles. In the axis frame the rod closes iff
 * |crank·sin(θ − axisAngle) − offset| ≤ rodLen, so the limits are asin
 * evaluations: sin(θ_rel) ∈ [(offset − rod)/crank, (offset + rod)/crank].
 */
export function sliderCrankInputRange(config: SliderCrankConfig): InputRange {
  if (validateSliderCrank(config)) return { full: false, arcs: [] };
  const r = config.crankLen;
  const lo = (config.offset - config.rodLen) / r;
  const hi = (config.offset + config.rodLen) / r;

  if (lo > 1 || hi < -1) return { full: false, arcs: [] };
  if (lo <= -1 && hi >= 1) return { full: true };

  const a = config.axisAngle;
  const sLo = Math.max(-1, lo);
  const sHi = Math.min(1, hi);
  // sin is increasing on [−π/2, π/2] and decreasing on [π/2, 3π/2]; the
  // allowed set is one arc per monotonic half.
  const arcs = [
    { start: normalizeAngle(a + Math.asin(sLo)), end: normalizeAngle(a + Math.asin(sHi)) },
    {
      start: normalizeAngle(a + Math.PI - Math.asin(sHi)),
      end: normalizeAngle(a + Math.PI - Math.asin(sLo)),
    },
  ];
  // The two arcs merge when a bound is inactive (limit at ±1).
  if (sHi >= 1) {
    return {
      full: false,
      arcs: [{ start: arcs[0].start, end: arcs[1].end }],
    };
  }
  if (sLo <= -1) {
    return {
      full: false,
      arcs: [{ start: arcs[1].start, end: arcs[0].end }],
    };
  }
  return { full: false, arcs };
}

/**
 * Trace the rod point over the crank cycle (or the reachable arcs, out and
 * back on both slider branches when the rod is short).
 */
export function traceSliderCrank(
  config: SliderCrankConfig,
  opts: { branch?: 1 | -1; steps?: number } = {},
): CouplerCurve {
  const steps = opts.steps ?? 360;
  const branch = opts.branch ?? 1;
  const range = sliderCrankInputRange(config);
  const points: Vec2[] = [];

  if (range.full) {
    for (let i = 0; i <= steps; i++) {
      const res = solveSliderCrank(config, (i / steps) * TWO_PI, { branch });
      if (res.ok) points.push(res.P);
    }
    return { points, closed: points.length > 2 };
  }

  if (range.arcs.length === 0) return { points: [], closed: false };
  const half = Math.max(8, Math.floor(steps / 2));
  const arc = range.arcs[0];
  let span = arc.end - arc.start;
  if (span < 0) span += TWO_PI;
  // At the arc limits the rod is tangent to the slider line; the assembly
  // continues through the fold onto the other branch, closing the loop.
  for (let i = 0; i <= half; i++) {
    const res = solveSliderCrank(config, arc.start + (i / half) * span, { branch });
    if (res.ok) points.push(res.P);
  }
  const other = branch === 1 ? -1 : 1;
  for (let i = half; i >= 0; i--) {
    const res = solveSliderCrank(config, arc.start + (i / half) * span, {
      branch: other as 1 | -1,
    });
    if (res.ok) points.push(res.P);
  }
  return { points, closed: points.length > 2 };
}

/** Slider travel extremes over the cycle (for stroke annotation). */
export function sliderStroke(
  config: SliderCrankConfig,
  steps = 720,
): { min: number; max: number } | null {
  if (validateSliderCrank(config)) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < steps; i++) {
    const res = solveSliderCrank(config, (i / steps) * TWO_PI);
    if (res.ok) {
      if (res.sliderPos < min) min = res.sliderPos;
      if (res.sliderPos > max) max = res.sliderPos;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/**
 * Quick-return time ratio: at constant crank speed, the crank arc swept
 * between the slider's two dead centers differs from the arc swept coming
 * back whenever the axis is offset — the slower sweep over the faster one,
 * so ≥ 1 (exactly 1 for the in-line layout). Returns null when the crank
 * cannot fully rotate (a swaying crank has no cycle to time) or the stroke
 * degenerates.
 */
export function quickReturnRatio(
  config: SliderCrankConfig,
  steps = 1440,
): number | null {
  const range = sliderCrankInputRange(config);
  if (!range.full) return null;
  let thAtMin = 0;
  let thAtMax = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * TWO_PI;
    const res = solveSliderCrank(config, th, { branch: 1 });
    if (!res.ok) return null;
    if (res.sliderPos < min) {
      min = res.sliderPos;
      thAtMin = th;
    }
    if (res.sliderPos > max) {
      max = res.sliderPos;
      thAtMax = th;
    }
  }
  if (!(max - min > 1e-9)) return null;
  // Crank arc from outer dead center to inner, sweeping in +θ.
  let arc = thAtMin - thAtMax;
  arc %= TWO_PI;
  if (arc < 0) arc += TWO_PI;
  const other = TWO_PI - arc;
  const lo = Math.min(arc, other);
  return lo > 1e-6 ? Math.max(arc, other) / lo : null;
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

/** Convenience default config used by tests and UI presets. */
export const defaultSliderCrank = (): SliderCrankConfig => ({
  O2: vec(-60, 0),
  crankLen: 30,
  rodLen: 90,
  axisAngle: 0,
  offset: 0,
  rodPoint: { u: 45, v: 26 },
});