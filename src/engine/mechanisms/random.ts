/**
 * "Randomize (valid)" — random geometry generators that only ever emit
 * assemblable mechanisms. Each generator draws from ranges that are almost
 * always valid, then *proves* validity (validate + reachable input range)
 * and retries on the rare miss; after `ATTEMPTS` tries it falls back to the
 * mechanism's curated default, so callers never receive junk.
 *
 * All generators take an injectable `rng` (uniform [0,1)) so tests can seed.
 */

import { vec } from "../vec";
import {
  classify,
  inputRange,
  solveFourBar,
  validateConfig,
  type BranchSign,
  type FourBarConfig,
} from "./fourbar";
import {
  defaultSliderCrank,
  sliderCrankInputRange,
  validateSliderCrank,
  type SliderCrankConfig,
} from "./slidercrank";
import { defaultCam, validateCam, type CamConfig, type FollowerKind, type MotionLaw } from "./cam";
import { defaultGearTrain, validateGearTrain, type GearTrainConfig } from "./gears";
import { defaultGeneva, validateGeneva, type GenevaConfig } from "./geneva";
import {
  defaultPeaucellier,
  defaultWatt,
  peaucellierInputRange,
  validatePeaucellier,
  type PeaucellierConfig,
} from "./straightline";
import { fourBarPreset } from "./presets";

export type Rng = () => number;

const ATTEMPTS = 60;

const uniform = (rng: Rng, lo: number, hi: number): number =>
  lo + (hi - lo) * rng();

const pickOne = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

const randInt = (rng: Rng, lo: number, hi: number): number =>
  Math.floor(uniform(rng, lo, hi + 1 - 1e-9));

// ---------------------------------------------------------------------------
// Four-bar
// ---------------------------------------------------------------------------

export interface RandomFourBar {
  config: FourBarConfig;
  theta2: number;
  branch: BranchSign;
}

/**
 * Any Grashof class is fair game as long as the linkage assembles somewhere;
 * the starting angle is placed inside the reachable range (mid-arc for
 * rockers) so the first frame is always a solved pose.
 */
export function randomFourBar(rng: Rng = Math.random): RandomFourBar {
  for (let i = 0; i < ATTEMPTS; i++) {
    const ground = uniform(rng, 50, 130);
    const config: FourBarConfig = {
      O2: vec(-ground / 2, 0),
      O4: vec(ground / 2, 0),
      crankLen: uniform(rng, 15, 0.9 * ground),
      couplerLen: uniform(rng, 0.4 * ground, 1.8 * ground),
      rockerLen: uniform(rng, 0.4 * ground, 1.8 * ground),
      couplerPoint: { u: 0, v: 0 },
    };
    config.couplerPoint = {
      u: uniform(rng, -0.25, 1.25) * config.couplerLen,
      v: uniform(rng, -0.85, 0.85) * config.couplerLen,
    };
    if (validateConfig(config)) continue;
    const range = inputRange(config);
    if (!range.full && range.arcs.length === 0) continue;

    const branch: BranchSign = rng() < 0.5 ? 1 : -1;
    let theta2: number;
    if (range.full) {
      theta2 = uniform(rng, 0, Math.PI * 2);
    } else {
      const arc = range.arcs[0];
      let span = arc.end - arc.start;
      if (span < 0) span += Math.PI * 2;
      theta2 = arc.start + span / 2;
    }
    if (!solveFourBar(config, theta2, { branch }).ok) continue;
    return { config, theta2, branch };
  }
  const p = fourBarPreset("kite")!;
  return { config: p.config, theta2: p.theta2, branch: p.branch };
}

// ---------------------------------------------------------------------------
// Slider-crank
// ---------------------------------------------------------------------------

export function randomSliderCrank(rng: Rng = Math.random): SliderCrankConfig {
  for (let i = 0; i < ATTEMPTS; i++) {
    const crankLen = uniform(rng, 18, 55);
    const rodLen = crankLen * uniform(rng, 1.7, 3.4);
    const config: SliderCrankConfig = {
      O2: vec(-60, 0),
      crankLen,
      rodLen,
      axisAngle: rng() < 0.7 ? 0 : uniform(rng, -Math.PI / 8, Math.PI / 8),
      // In-line a third of the time; otherwise a visible quick-return offset.
      offset: rng() < 0.33 ? 0 : uniform(rng, -0.55, 0.55) * crankLen,
      rodPoint: {
        u: uniform(rng, 0.25, 0.85) * rodLen,
        v: uniform(rng, -0.55, 0.55) * rodLen,
      },
    };
    if (validateSliderCrank(config)) continue;
    const range = sliderCrankInputRange(config);
    if (!range.full && range.arcs.length === 0) continue;
    return config;
  }
  return defaultSliderCrank();
}

// ---------------------------------------------------------------------------
// Cam & follower
// ---------------------------------------------------------------------------

const LAWS: readonly MotionLaw[] = ["cycloidal", "harmonic", "uniform"];
const FOLLOWERS: readonly FollowerKind[] = ["roller", "flat"];

export function randomCam(rng: Rng = Math.random): CamConfig {
  for (let i = 0; i < ATTEMPTS; i++) {
    const eccentric = rng() < 0.3;
    const discR = uniform(rng, 28, 60);
    const baseR = uniform(rng, 25, 55);
    const riseDeg = uniform(rng, 60, 150);
    const fallDeg = uniform(rng, 60, 150);
    const dwellDeg = uniform(rng, 0, Math.min(90, 350 - riseDeg - fallDeg));
    const config: CamConfig = {
      center: vec(0, 0),
      kind: eccentric ? "eccentric" : "rdf",
      follower: pickOne(rng, FOLLOWERS),
      rollerR: uniform(rng, 6, 14),
      discR,
      ecc: discR * uniform(rng, 0.15, 0.65),
      baseR,
      // Cap lift so the profile stays convex-ish and legible.
      lift: uniform(rng, 8, 0.8 * baseR),
      riseDeg,
      dwellDeg,
      fallDeg,
      law: pickOne(rng, LAWS),
    };
    if (validateCam(config)) continue;
    return config;
  }
  return defaultCam();
}

// ---------------------------------------------------------------------------
// Gear train
// ---------------------------------------------------------------------------

export function randomGearTrain(rng: Rng = Math.random): GearTrainConfig {
  for (let i = 0; i < ATTEMPTS; i++) {
    const count = rng() < 0.5 ? 2 : 3;
    const teeth: number[] = [];
    for (let g = 0; g < count; g++) teeth.push(randInt(rng, 8, 44));
    const meshAngles: number[] = [];
    for (let m = 0; m < count - 1; m++) {
      meshAngles.push(uniform(rng, -Math.PI / 2.4, Math.PI / 2.4));
    }
    const config: GearTrainConfig = {
      center: vec(-70, 0),
      module: randInt(rng, 4, 12) / 2,
      teeth,
      meshAngles,
    };
    if (validateGearTrain(config)) continue;
    return config;
  }
  return defaultGearTrain();
}

// ---------------------------------------------------------------------------
// Geneva drive
// ---------------------------------------------------------------------------

export function randomGeneva(rng: Rng = Math.random): GenevaConfig {
  for (let i = 0; i < ATTEMPTS; i++) {
    const config: GenevaConfig = {
      center: vec(-45, 0),
      slots: randInt(rng, 3, 9),
      centerDist: uniform(rng, 60, 130),
      wheelDir: 0,
    };
    if (validateGeneva(config)) continue;
    return config;
  }
  return defaultGeneva();
}

// ---------------------------------------------------------------------------
// Straight-line linkages
// ---------------------------------------------------------------------------

/**
 * Watt geometry stays in the classic proportion family (equal side links,
 * short coupler, pivots diagonally opposed) so the midpoint always keeps a
 * convincing straight run; only the scale and slenderness vary.
 */
export function randomWatt(rng: Rng = Math.random): FourBarConfig {
  for (let i = 0; i < ATTEMPTS; i++) {
    const coupler = uniform(rng, 32, 70);
    const side = coupler * uniform(rng, 1.55, 2.2);
    const ax = side * uniform(rng, 0.9, 1.0);
    const config: FourBarConfig = {
      O2: vec(-ax, -coupler / 2),
      O4: vec(ax, coupler / 2),
      crankLen: side,
      couplerLen: coupler,
      rockerLen: side,
      couplerPoint: { u: coupler / 2, v: 0 },
    };
    if (validateConfig(config)) continue;
    const range = inputRange(config);
    if (range.full || range.arcs.length === 0) continue; // must sway, not spin
    if (classify(config).grashof) continue; // the lemniscate is non-Grashof
    return config;
  }
  return defaultWatt();
}

export function randomPeaucellier(rng: Rng = Math.random): PeaucellierConfig {
  for (let i = 0; i < ATTEMPTS; i++) {
    const crankLen = uniform(rng, 32, 60);
    const armLen = crankLen * uniform(rng, 1.9, 2.9);
    const config: PeaucellierConfig = {
      O: vec(-65, 0),
      crankLen,
      armLen,
      cellSide: armLen * uniform(rng, 0.38, 0.68),
      axisAngle: 0,
    };
    if (validatePeaucellier(config)) continue;
    const range = peaucellierInputRange(config);
    if (!range.full && range.arcs.length === 0) continue;
    return config;
  }
  return defaultPeaucellier();
}