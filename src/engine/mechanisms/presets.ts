/**
 * Curated presets, per mechanism type. The four-bar drawer holds famous
 * coupler-curve shapes; every other mechanism gets a small set of canonical
 * starting points. All entries are verified numerically (see
 * presets.test.ts): each assembles/validates and shows the advertised
 * behavior (self-intersection for the figure-eight, flat-run length for the
 * straight-line and D-curve, quick-return asymmetry for the offset
 * slider-crank, …).
 */

import { degToRad, vec } from "../vec";
import type { BranchSign, FourBarConfig } from "./fourbar";
import type { SliderCrankConfig } from "./slidercrank";
import type { CamConfig } from "./cam";
import type { GearTrainConfig } from "./gears";
import type { GenevaConfig } from "./geneva";

export interface FourBarPreset {
  id: string;
  label: string;
  blurb: string;
  config: FourBarConfig;
  /** starting input angle, radians */
  theta2: number;
  branch: BranchSign;
}

export const FOURBAR_PRESETS: FourBarPreset[] = [
  {
    id: "kite",
    label: "Kite",
    blurb: "A balanced crank-rocker — the default. Smooth kidney-shaped curve.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 35,
      couplerLen: 110,
      rockerLen: 85,
      couplerPoint: { u: 55, v: 48 },
    },
    theta2: (65 * Math.PI) / 180,
    branch: 1,
  },
  {
    id: "figure-eight",
    label: "Figure-eight",
    blurb: "The coupler point crosses its own path once per cycle — a true lemniscate loop.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 40,
      couplerLen: 80,
      rockerLen: 80,
      couplerPoint: { u: 40, v: -80 },
    },
    theta2: (65 * Math.PI) / 180,
    branch: 1,
  },
  {
    id: "chebyshev",
    label: "Straight-line (Chebyshev)",
    blurb: "Chebyshev's crossed double-rocker: the coupler midpoint runs dead straight for over 100 mm.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 125,
      couplerLen: 50,
      rockerLen: 125,
      couplerPoint: { u: 25, v: 0 },
    },
    theta2: Math.PI / 2,
    branch: -1,
  },
  {
    id: "d-curve",
    label: "D-curve",
    blurb: "One flat side, one round side — the shape dwell mechanisms are built on.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 50,
      couplerLen: 100,
      rockerLen: 70,
      couplerPoint: { u: 100, v: 70 },
    },
    theta2: (65 * Math.PI) / 180,
    branch: 1,
  },
];

export const fourBarPreset = (id: string): FourBarPreset | undefined =>
  FOURBAR_PRESETS.find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Presets for the rest of the library
// ---------------------------------------------------------------------------

export interface MechanismPreset<C> {
  id: string;
  label: string;
  blurb: string;
  config: C;
  /** starting input angle, radians */
  theta: number;
}

export const SLIDERCRANK_PRESETS: Array<MechanismPreset<SliderCrankConfig>> = [
  {
    id: "engine",
    label: "In-line engine",
    blurb: "The classic piston layout — symmetric stroke, near-sinusoidal motion.",
    config: {
      O2: vec(-60, 0),
      crankLen: 30,
      rodLen: 90,
      axisAngle: 0,
      offset: 0,
      rodPoint: { u: 45, v: 26 },
    },
    theta: degToRad(50),
  },
  {
    id: "quick-return",
    label: "Quick return",
    blurb:
      "Offsetting the slider axis makes the return stroke faster than the advance — shapers and power hacksaws.",
    config: {
      O2: vec(-60, 0),
      crankLen: 32,
      rodLen: 95,
      axisAngle: 0,
      offset: 38,
      rodPoint: { u: 48, v: 22 },
    },
    theta: degToRad(70),
  },
  {
    id: "long-rod",
    label: "Long rod",
    blurb:
      "A rod several crank-lengths long — the slider motion approaches a pure cosine, the compressor layout.",
    config: {
      O2: vec(-70, 0),
      crankLen: 22,
      rodLen: 120,
      axisAngle: 0,
      offset: 0,
      rodPoint: { u: 60, v: 30 },
    },
    theta: degToRad(40),
  },
];

export const CAM_PRESETS: Array<MechanismPreset<CamConfig>> = [
  {
    id: "valve",
    label: "Valve lift",
    blurb:
      "Cycloidal rise–dwell–fall on a roller follower — zero end-of-stroke acceleration, the smooth automotive choice.",
    config: {
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
    },
    theta: degToRad(30),
  },
  {
    id: "uniform-jolt",
    label: "Uniform (harsh)",
    blurb:
      "Constant-velocity law — the velocity jumps at each stroke end, so acceleration spikes. Watch the analysis plot.",
    config: {
      center: vec(0, 0),
      kind: "rdf",
      follower: "roller",
      rollerR: 9,
      discR: 45,
      ecc: 15,
      baseR: 38,
      lift: 20,
      riseDeg: 100,
      dwellDeg: 80,
      fallDeg: 100,
      law: "uniform",
    },
    theta: degToRad(30),
  },
  {
    id: "eccentric",
    label: "Eccentric disc",
    blurb:
      "A circular disc mounted off-center on a flat-face follower — exact simple-harmonic motion from one part.",
    config: {
      center: vec(0, 0),
      kind: "eccentric",
      follower: "flat",
      rollerR: 10,
      discR: 48,
      ecc: 16,
      baseR: 35,
      lift: 25,
      riseDeg: 120,
      dwellDeg: 60,
      fallDeg: 120,
      law: "harmonic",
    },
    theta: degToRad(60),
  },
];

export const GEAR_PRESETS: Array<MechanismPreset<GearTrainConfig>> = [
  {
    id: "reduction",
    label: "2.5:1 reduction",
    blurb: "A pinion driving a big wheel — output slows to 2/5 speed, torque up by the same factor.",
    config: {
      center: vec(-60, 0),
      module: 4,
      teeth: [12, 30],
      meshAngles: [0],
    },
    theta: 0,
  },
  {
    id: "idler",
    label: "Idler pass-through",
    blurb:
      "Equal end gears with an idler between: ratio exactly +1 — the idler only flips direction back, it never changes speed.",
    config: {
      center: vec(-80, 0),
      module: 4,
      teeth: [16, 24, 16],
      meshAngles: [0, degToRad(-35)],
    },
    theta: 0,
  },
  {
    id: "speed-up",
    label: "Speed-up",
    blurb: "Driving the big wheel spins the pinion 3× faster the other way — the overdrive layout.",
    config: {
      center: vec(-40, 0),
      module: 4,
      teeth: [36, 12],
      meshAngles: [degToRad(-15)],
    },
    theta: 0,
  },
];

export const GENEVA_PRESETS: Array<MechanismPreset<GenevaConfig>> = [
  {
    id: "film",
    label: "4-slot film",
    blurb:
      "The projector movement: each driver turn yanks the film one frame (90°) and holds it dead still for the shutter.",
    config: { center: vec(-40, 0), slots: 4, centerDist: 80, wheelDir: 0 },
    theta: degToRad(-120),
  },
  {
    id: "six",
    label: "6-slot index",
    blurb: "The general-purpose indexing table — 60° per revolution with a generous locked dwell.",
    config: { center: vec(-45, 0), slots: 6, centerDist: 90, wheelDir: 0 },
    theta: degToRad(-120),
  },
  {
    id: "eight",
    label: "8-station",
    blurb: "More stations, gentler indexing — smaller wheel swing per cycle means lower peak acceleration.",
    config: { center: vec(-50, 0), slots: 8, centerDist: 100, wheelDir: 0 },
    theta: degToRad(-120),
  },
];

export const mechanismPreset = <C,>(
  list: Array<MechanismPreset<C>>,
  id: string,
): MechanismPreset<C> | undefined => list.find((p) => p.id === id);