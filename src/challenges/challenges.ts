/**
 * Design-goal challenges, auto-graded against the live geometry in the sim
 * store. Each challenge names a target, a starting mechanism (shipped in the
 * share wire format, so "load starting point" is just loadShared), and a
 * grade function over the active mechanism slice. The graders are pure and
 * unit-tested; the UI (/learn) only renders their verdicts.
 */

import {
  degToRad,
  fitLine,
  quickReturnRatio,
  vec,
  type Vec2,
} from "@/engine";
import { FOURBAR_PRESETS, SLIDERCRANK_PRESETS } from "@/engine";
import type { SharedMech } from "@/share/codec";
import type { MechSlice } from "@/store/simStore";

// ---------------------------------------------------------------------------
// Straight-run measurement
// ---------------------------------------------------------------------------

export interface StraightRun {
  /** extent of the best window along its fitted line, mm */
  length: number;
  /** worst perpendicular deviation inside that window, mm */
  dev: number;
}

const RUN_MAX_POINTS = 240;

/**
 * Longest stretch of a traced curve that stays within `tol` mm of a straight
 * line: two-pointer sweep over the (decimated) polyline, refitting the
 * window with total-least-squares at each step. Closed curves may carry the
 * straight run across the seam, so the window is allowed to wrap.
 */
export function longestStraightRun(
  pointsIn: Vec2[],
  tol: number,
  closed: boolean,
): StraightRun {
  const stride = Math.max(1, Math.ceil(pointsIn.length / RUN_MAX_POINTS));
  const pts: Vec2[] = [];
  for (let i = 0; i < pointsIn.length; i += stride) pts.push(pointsIn[i]);
  const n = pts.length;
  if (n < 3) return { length: 0, dev: 0 };

  const ext = closed ? pts.concat(pts) : pts;
  let best: StraightRun = { length: 0, dev: 0 };
  let i = 0;
  let j = i + 3;
  while (i < n) {
    // Grow the window while it still fits a line; never let it lap itself.
    while (j - i <= n && j <= ext.length) {
      const fit = fitLine(ext.slice(i, j));
      if (!fit || fit.maxDev > tol) break;
      if (fit.length > best.length) best = { length: fit.length, dev: fit.maxDev };
      j++;
    }
    i++;
    if (j < i + 3) j = i + 3;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

export type GradeOutcome =
  | { kind: "pass"; measured: string }
  | { kind: "fail"; measured: string }
  /** the active mechanism can't attempt this challenge at all */
  | { kind: "wrong-mech"; measured: string };

export interface Challenge {
  id: string;
  title: string;
  /** the design goal, stated as a spec */
  goal: string;
  hint: string;
  /** the showpiece gets special billing on /learn */
  marquee?: boolean;
  /** starting geometry that does NOT yet meet the goal */
  start: SharedMech;
  grade(mech: MechSlice): GradeOutcome;
}

export const STRAIGHT_RUN_TOL = 0.5;
export const STRAIGHT_RUN_MIN = 60;
export const QUICK_RETURN_MIN = 1.4;
export const EXACT_LINE_DEV = 0.01;
export const EXACT_LINE_MIN = 100;

const pass = (measured: string): GradeOutcome => ({ kind: "pass", measured });
const fail = (measured: string): GradeOutcome => ({ kind: "fail", measured });
const wrongMech = (needed: string): GradeOutcome => ({
  kind: "wrong-mech",
  measured: `attempt this on a ${needed} — load the starting point`,
});

const kite = FOURBAR_PRESETS.find((p) => p.id === "kite")!;
const inlineEngine = SLIDERCRANK_PRESETS.find((p) => p.id === "engine")!;

export const CHALLENGES: Challenge[] = [
  {
    id: "straightaway",
    title: "The straightaway",
    goal: `Make the coupler point trace a straight segment at least ${STRAIGHT_RUN_MIN} mm long, staying within ±${STRAIGHT_RUN_TOL} mm of a true line.`,
    hint: "Rocking linkages with the trace point on the coupler line (v = 0) flatten part of the curve — Chebyshev found a famous set of proportions, and Watt another.",
    start: { t: "fourbar", c: kite.config, th: kite.theta2, br: kite.branch },
    grade(mech) {
      const eligible =
        mech.type === "fourbar" ||
        (mech.type === "straightline" && mech.variant === "watt");
      if (!eligible) return wrongMech("four-bar linkage (Watt's counts too)");
      const run = longestStraightRun(
        mech.trace.points,
        STRAIGHT_RUN_TOL,
        mech.trace.closed,
      );
      const measured = `longest straight run ${run.length.toFixed(1)} mm (target ≥ ${STRAIGHT_RUN_MIN} mm within ±${STRAIGHT_RUN_TOL} mm)`;
      return run.length >= STRAIGHT_RUN_MIN ? pass(measured) : fail(measured);
    },
  },
  {
    id: "full-circle",
    title: "Full circle",
    goal: "Turn this swaying four-bar into one whose input crank rotates a full 360°.",
    hint: "Grashof: the shortest + longest link must not exceed the other two combined, and the crank should be the shortest link. One length is doing most of the damage here.",
    start: {
      t: "fourbar",
      c: {
        O2: vec(-50, 0),
        O4: vec(50, 0),
        crankLen: 65,
        couplerLen: 80,
        rockerLen: 55,
        couplerPoint: { u: 40, v: 35 },
      },
      th: degToRad(40),
      br: 1,
    },
    grade(mech) {
      if (mech.type !== "fourbar") return wrongMech("four-bar linkage");
      const g = mech.grashof;
      return g.inputRotatesFully
        ? pass(g.description)
        : fail(g.description);
    },
  },
  {
    id: "quick-return",
    title: "Quick return",
    goal: `Give this slider-crank a quick-return time ratio of at least ${QUICK_RETURN_MIN.toFixed(1)} — the working stroke slower than the return, like a shaper.`,
    hint: "An in-line slider-crank is perfectly symmetric. Offset the slider axis from the crank pivot and the two dead-center arcs stop being equal — but keep crank + offset inside the rod's reach.",
    start: {
      t: "slidercrank",
      c: inlineEngine.config,
      th: inlineEngine.theta,
      br: 1,
    },
    grade(mech) {
      if (mech.type !== "slidercrank") return wrongMech("slider-crank");
      const ratio = quickReturnRatio(mech.config);
      if (ratio === null)
        return fail(
          "the crank cannot complete a rotation — shrink the offset or crank, or lengthen the rod",
        );
      const measured = `time ratio ${ratio.toFixed(2)} (target ≥ ${QUICK_RETURN_MIN.toFixed(2)})`;
      return ratio >= QUICK_RETURN_MIN ? pass(measured) : fail(measured);
    },
  },
  {
    id: "perfect-line",
    title: "The perfect line",
    marquee: true,
    goal: `Draw at least ${EXACT_LINE_MIN} mm of mathematically straight line (deviation under ${EXACT_LINE_DEV} mm) using nothing but rotating joints.`,
    hint: "The Peaucellier cell inverts a circle through its pole into a line — exactness is free, travel isn't. Longer crank and arms sweep more line before the cell folds.",
    // Stroke = 2·√((L+s)² − ((L²−s²)/2r)²): with r=31, L=100, s=40 the cell
    // hovers near its fold and sweeps only ~70 mm — growing the crank opens
    // it right up.
    start: {
      t: "peaucellier",
      c: { O: vec(-60, 0), crankLen: 31, armLen: 100, cellSide: 40, axisAngle: 0 },
      th: degToRad(12),
    },
    grade(mech) {
      if (!(mech.type === "straightline" && mech.variant === "peaucellier"))
        return wrongMech("Peaucellier–Lipkin linkage");
      const fit = fitLine(mech.trace.points);
      if (!fit) return fail("no trace — the cell cannot assemble");
      const devText =
        fit.maxDev < 1e-3 ? fit.maxDev.toExponential(1) : fit.maxDev.toFixed(3);
      const measured = `${fit.length.toFixed(1)} mm of line at ${devText} mm deviation (target ≥ ${EXACT_LINE_MIN} mm under ${EXACT_LINE_DEV} mm)`;
      return fit.length >= EXACT_LINE_MIN && fit.maxDev <= EXACT_LINE_DEV
        ? pass(measured)
        : fail(measured);
    },
  },
];

export const challengeById = (id: string): Challenge | undefined =>
  CHALLENGES.find((c) => c.id === id);
