/**
 * Motion analysis — kinematic series for every mechanism, produced by
 * numerically differentiating the solvers across a full input cycle.
 *
 * Conventions:
 * - The independent variable is the input angle θ in radians.
 * - `velocity` and `acceleration` are *kinematic coefficients*: derivatives
 *   with respect to θ (per radian of input), independent of motor speed.
 *   Multiply by ω and ω² for time rates at a given input speed.
 * - Angle outputs stay in radians, length outputs in mm; converting for
 *   display is the caller's business.
 *
 * Full-rotation inputs are sampled on an extended grid (one step past each
 * end of the revolution) so central differences never need wrap bookkeeping
 * — this also keeps secular outputs (a gear angle that grows every turn)
 * correct at the seam. Limited inputs (rockers) are sampled across the
 * reachable arc with one-sided differences at the fold limits, where the
 * true coefficients genuinely diverge — the spike IS the binding.
 */

import {
  dot,
  radToDeg,
  sub,
  TWO_PI,
  type Vec2,
} from "./vec";
import {
  angleInArc,
  inputRange,
  solveFourBar,
  validateConfig,
  type BranchSign,
  type FourBarConfig,
  type InputArc,
  type InputRange,
} from "./mechanisms/fourbar";
import {
  sliderCrankInputRange,
  solveSliderCrank,
  validateSliderCrank,
  type SliderCrankConfig,
} from "./mechanisms/slidercrank";
import { camLift, validateCam, type CamConfig } from "./mechanisms/cam";
import {
  solveGearTrain,
  validateGearTrain,
  type GearTrainConfig,
} from "./mechanisms/gears";
import { solveGeneva, validateGeneva, type GenevaConfig } from "./mechanisms/geneva";
import {
  peaucellierInputRange,
  peaucellierLine,
  solvePeaucellier,
  validatePeaucellier,
  type PeaucellierConfig,
} from "./mechanisms/straightline";

export interface MotionSeries {
  /** input-angle samples, radians, strictly increasing */
  input: number[];
  /** output at each sample (radians for angles, mm for lengths) */
  position: number[];
  /** d(position)/dθ, per radian of input */
  velocity: number[];
  /** d²(position)/dθ² */
  acceleration: number[];
  /** the input sweeps a full revolution (vs. a limited rocker arc) */
  cyclic: boolean;
}

// ---------------------------------------------------------------------------
// Sampling & differentiation scaffolding
// ---------------------------------------------------------------------------

/** Forward- then back-fill unsolvable samples; null when nothing solved. */
function fillGaps(raw: Array<number | null>): number[] | null {
  const out: number[] = new Array(raw.length);
  let last: number | null = null;
  let any = false;
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (v !== null && Number.isFinite(v)) {
      last = v;
      any = true;
    }
    out[i] = last ?? Number.NaN;
  }
  if (!any) return null;
  // Forward fill leaves at most a leading run of NaNs; back-fill those.
  for (let i = raw.length - 2; i >= 0; i--) {
    if (Number.isNaN(out[i])) out[i] = out[i + 1];
  }
  return out;
}

/** Remove 2π jumps so an angle output is continuous along the sweep. */
function unwrapInPlace(a: number[]): void {
  let offset = 0;
  for (let i = 1; i < a.length; i++) {
    const d = a[i] + offset - a[i - 1];
    if (d > Math.PI) offset -= TWO_PI;
    else if (d < -Math.PI) offset += TWO_PI;
    a[i] += offset;
  }
}

function motionFromFn(
  f: (theta: number) => number | null,
  start: number,
  span: number,
  steps: number,
  cyclic: boolean,
  unwrap: boolean,
): MotionSeries | null {
  if (!(span > 0) || steps < 8) return null;
  const h = span / steps;
  const n = steps + 1;

  // Cyclic: sample one step past each end so every output point gets a true
  // central difference. Limited arc: sample the arc exactly.
  const lo = cyclic ? -1 : 0;
  const hi = cyclic ? steps + 1 : steps;
  const raw: Array<number | null> = [];
  for (let i = lo; i <= hi; i++) raw.push(f(start + i * h));
  const pos = fillGaps(raw);
  if (!pos) return null;
  if (unwrap) unwrapInPlace(pos);

  const at = (i: number) => pos[i - lo];
  const input: number[] = new Array(n);
  const position: number[] = new Array(n);
  const velocity: number[] = new Array(n);
  const acceleration: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    input[i] = start + i * h;
    position[i] = at(i);
    if (cyclic || (i > 0 && i < n - 1)) {
      velocity[i] = (at(i + 1) - at(i - 1)) / (2 * h);
      acceleration[i] = (at(i + 1) - 2 * at(i) + at(i - 1)) / (h * h);
    } else if (i === 0) {
      velocity[i] = (-3 * at(0) + 4 * at(1) - at(2)) / (2 * h);
      acceleration[i] = (at(0) - 2 * at(1) + at(2)) / (h * h);
    } else {
      velocity[i] = (3 * at(i) - 4 * at(i - 1) + at(i - 2)) / (2 * h);
      acceleration[i] = (at(i) - 2 * at(i - 1) + at(i - 2)) / (h * h);
    }
  }
  return { input, position, velocity, acceleration, cyclic };
}

const arcSpan = (arc: InputArc): number => {
  let span = arc.end - arc.start;
  if (span < 0) span += TWO_PI;
  return span;
};

/** The arc containing the hint angle, else the first. */
const pickArc = (arcs: InputArc[], hint?: number): InputArc =>
  (hint !== undefined ? arcs.find((a) => angleInArc(hint, a)) : undefined) ??
  arcs[0];

interface SweepOpts {
  branch?: BranchSign;
  /** current input angle — selects the reachable arc when the range is limited */
  theta?: number;
  steps?: number;
}

/**
 * Common full-circle / limited-arc dispatch. `f` receives (θ, cyclic) so
 * full sweeps can use branch continuation while arc sweeps hold a branch.
 */
function sweepRange(
  range: InputRange,
  opts: SweepOpts,
  f: (theta: number, cyclic: boolean) => number | null,
  unwrap: boolean,
): MotionSeries | null {
  const steps = opts.steps ?? 360;
  if (range.full) {
    return motionFromFn((t) => f(t, true), 0, TWO_PI, steps, true, unwrap);
  }
  if (range.arcs.length === 0) return null;
  const arc = pickArc(range.arcs, opts.theta);
  return motionFromFn(
    (t) => f(t, false),
    arc.start,
    arcSpan(arc),
    steps,
    false,
    unwrap,
  );
}

// ---------------------------------------------------------------------------
// Four-bar: rocker angle θ4 and transmission angle μ
// ---------------------------------------------------------------------------

/** Rocker output θ4(θ2), unwrapped radians. */
export function fourBarMotion(
  config: FourBarConfig,
  opts: SweepOpts = {},
): MotionSeries | null {
  if (validateConfig(config)) return null;
  const branch = opts.branch ?? 1;
  let prevB: Vec2 | null = null;
  return sweepRange(
    inputRange(config),
    opts,
    (theta, cyclic) => {
      const res = solveFourBar(
        config,
        theta,
        cyclic && prevB ? { prevB } : { branch },
      );
      if (!res.ok) return null;
      if (cyclic) prevB = res.B;
      return res.theta4;
    },
    true,
  );
}

export interface TransmissionSeries {
  /** input-angle samples, radians */
  input: number[];
  /** transmission angle μ at each sample, radians in (0, π) */
  mu: number[];
  minMu: number;
  maxMu: number;
  cyclic: boolean;
}

/** μ over the input cycle. Poor near 0/π — the linkage binds there. */
export function fourBarTransmission(
  config: FourBarConfig,
  opts: SweepOpts = {},
): TransmissionSeries | null {
  if (validateConfig(config)) return null;
  const branch = opts.branch ?? 1;
  let prevB: Vec2 | null = null;
  const series = sweepRange(
    inputRange(config),
    opts,
    (theta, cyclic) => {
      const res = solveFourBar(
        config,
        theta,
        cyclic && prevB ? { prevB } : { branch },
      );
      if (!res.ok) return null;
      if (cyclic) prevB = res.B;
      return res.transmissionAngle;
    },
    false,
  );
  if (!series) return null;
  let minMu = Infinity;
  let maxMu = -Infinity;
  for (const m of series.position) {
    if (m < minMu) minMu = m;
    if (m > maxMu) maxMu = m;
  }
  return {
    input: series.input,
    mu: series.position,
    minMu,
    maxMu,
    cyclic: series.cyclic,
  };
}

/** Textbook comfort band: flag μ outside [30°, 150°]. */
export const TRANSMISSION_POOR_LOW = (30 * Math.PI) / 180;
export const TRANSMISSION_POOR_HIGH = (150 * Math.PI) / 180;

export const isPoorTransmission = (mu: number): boolean =>
  mu < TRANSMISSION_POOR_LOW || mu > TRANSMISSION_POOR_HIGH;

/** Degrees helper for badges/labels. */
export const transmissionDeg = (mu: number): number => radToDeg(mu);

// ---------------------------------------------------------------------------
// Slider-crank: slider position (mm)
// ---------------------------------------------------------------------------

export function sliderCrankMotion(
  config: SliderCrankConfig,
  opts: SweepOpts = {},
): MotionSeries | null {
  if (validateSliderCrank(config)) return null;
  const branch = (opts.branch ?? 1) as 1 | -1;
  return sweepRange(
    sliderCrankInputRange(config),
    opts,
    (theta) => {
      const res = solveSliderCrank(config, theta, { branch });
      return res.ok ? res.sliderPos : null;
    },
    false,
  );
}

// ---------------------------------------------------------------------------
// Cam: follower lift (mm)
// ---------------------------------------------------------------------------

export function camMotion(config: CamConfig, steps = 360): MotionSeries | null {
  if (validateCam(config)) return null;
  return motionFromFn((t) => camLift(config, t), 0, TWO_PI, steps, true, false);
}

// ---------------------------------------------------------------------------
// Gear train: output gear angle (radians, secular)
// ---------------------------------------------------------------------------

export function gearTrainMotion(
  config: GearTrainConfig,
  steps = 360,
): MotionSeries | null {
  if (validateGearTrain(config)) return null;
  return motionFromFn(
    (t) => {
      const res = solveGearTrain(config, t);
      return res.ok ? res.gears[res.gears.length - 1].angle : null;
    },
    0,
    TWO_PI,
    steps,
    true,
    false,
  );
}

// ---------------------------------------------------------------------------
// Geneva: wheel angle (radians) over one driver revolution
// ---------------------------------------------------------------------------

export function genevaMotion(
  config: GenevaConfig,
  steps = 360,
): MotionSeries | null {
  if (validateGeneva(config)) return null;
  // One revolution centered on the engagement window (Δ = 0 at wheelDir).
  return motionFromFn(
    (t) => {
      const res = solveGeneva(config, t);
      return res.ok ? res.wheelAngle : null;
    },
    config.wheelDir - Math.PI,
    TWO_PI,
    steps,
    true,
    false,
  );
}

// ---------------------------------------------------------------------------
// Peaucellier: output-point travel along the exact line (mm)
// ---------------------------------------------------------------------------

export function peaucellierMotion(
  config: PeaucellierConfig,
  opts: SweepOpts = {},
): MotionSeries | null {
  if (validatePeaucellier(config)) return null;
  const line = peaucellierLine(config);
  return sweepRange(
    peaucellierInputRange(config),
    opts,
    (theta) => {
      const res = solvePeaucellier(config, theta);
      return res.ok ? dot(sub(res.Q, line.point), line.dir) : null;
    },
    false,
  );
}