import { describe, expect, it } from "vitest";
import {
  randomCam,
  randomFourBar,
  randomGearTrain,
  randomGeneva,
  randomPeaucellier,
  randomSliderCrank,
  randomWatt,
  type Rng,
} from "./random";
import { classify, inputRange, solveFourBar, validateConfig } from "./fourbar";
import { sliderCrankInputRange, validateSliderCrank } from "./slidercrank";
import { validateCam } from "./cam";
import { validateGearTrain } from "./gears";
import { validateGeneva } from "./geneva";
import { peaucellierInputRange, validatePeaucellier } from "./straightline";

/** mulberry32 — tiny deterministic PRNG for reproducible sweeps. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUNS = 200;

describe("randomize (valid) generators", () => {
  it("random four-bars always assemble at their starting pose", () => {
    const rng = seeded(1);
    for (let i = 0; i < RUNS; i++) {
      const { config, theta2, branch } = randomFourBar(rng);
      expect(validateConfig(config)).toBeNull();
      const range = inputRange(config);
      expect(range.full || range.arcs.length > 0).toBe(true);
      expect(solveFourBar(config, theta2, { branch }).ok).toBe(true);
    }
  });

  it("random slider-cranks always have a reachable input range", () => {
    const rng = seeded(2);
    for (let i = 0; i < RUNS; i++) {
      const config = randomSliderCrank(rng);
      expect(validateSliderCrank(config)).toBeNull();
      const range = sliderCrankInputRange(config);
      expect(range.full || range.arcs.length > 0).toBe(true);
    }
  });

  it("random cams always validate (program fits in 360°, ecc < disc)", () => {
    const rng = seeded(3);
    for (let i = 0; i < RUNS; i++) {
      expect(validateCam(randomCam(rng))).toBeNull();
    }
  });

  it("random gear trains always validate (integer teeth, finite meshes)", () => {
    const rng = seeded(4);
    for (let i = 0; i < RUNS; i++) {
      const config = randomGearTrain(rng);
      expect(validateGearTrain(config)).toBeNull();
      expect(config.teeth.every((z) => Number.isInteger(z) && z >= 4)).toBe(true);
    }
  });

  it("random genevas always validate (integer slots ≥ 3)", () => {
    const rng = seeded(5);
    for (let i = 0; i < RUNS; i++) {
      expect(validateGeneva(randomGeneva(rng))).toBeNull();
    }
  });

  it("random Watt linkages are non-Grashof sway linkages that assemble", () => {
    const rng = seeded(6);
    for (let i = 0; i < RUNS; i++) {
      const config = randomWatt(rng);
      expect(validateConfig(config)).toBeNull();
      expect(classify(config).grashof).toBe(false);
      const range = inputRange(config);
      expect(!range.full && range.arcs.length > 0).toBe(true);
    }
  });

  it("random Peaucellier cells always close somewhere on the crank circle", () => {
    const rng = seeded(7);
    for (let i = 0; i < RUNS; i++) {
      const config = randomPeaucellier(rng);
      expect(validatePeaucellier(config)).toBeNull();
      const range = peaucellierInputRange(config);
      expect(range.full || range.arcs.length > 0).toBe(true);
    }
  });
});