import { describe, expect, it } from "vitest";
import {
  CAM_PRESETS,
  FOURBAR_PRESETS,
  fourBarPreset,
  GEAR_PRESETS,
  GENEVA_PRESETS,
  mechanismPreset,
  SLIDERCRANK_PRESETS,
} from "./presets";
import {
  classify,
  inputRange,
  solveFourBar,
  traceCouplerCurve,
  validateConfig,
} from "./fourbar";
import { sliderCrankInputRange, validateSliderCrank } from "./slidercrank";
import { validateCam } from "./cam";
import { solveGearTrain, validateGearTrain } from "./gears";
import { validateGeneva } from "./geneva";
import { fitLine } from "./straightline";
import { type Vec2 } from "../vec";

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return (
    o(a, b, c) !== o(a, b, d) &&
    o(c, d, a) !== o(c, d, b) &&
    o(a, b, c) !== 0 &&
    o(c, d, a) !== 0
  );
}

function selfIntersections(pts: Vec2[]): number {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      if (i === 0 && j === pts.length - 2) continue;
      if (segIntersect(pts[i], pts[i + 1], pts[j], pts[j + 1])) n++;
    }
  }
  return n;
}

/** Longest contiguous run of trace points within tol of its best-fit line. */
function longestFlatRun(pts: Vec2[], tol: number): number {
  let best = 0;
  let i = 0;
  while (i < pts.length) {
    let j = i + 4;
    let lastLen = 0;
    while (j <= pts.length) {
      const fit = fitLine(pts.slice(i, j));
      if (!fit || fit.maxDev > tol) break;
      lastLen = fit.length;
      j += 2;
    }
    best = Math.max(best, lastLen);
    i += 2;
  }
  return best;
}

describe("four-bar preset drawer", () => {
  it("every preset is valid and assembles at its starting pose", () => {
    for (const p of FOURBAR_PRESETS) {
      expect(validateConfig(p.config), p.id).toBeNull();
      const pose = solveFourBar(p.config, p.theta2, { branch: p.branch });
      expect(pose.ok, `${p.id} must assemble at θ₂=${p.theta2}`).toBe(true);
      const trace = traceCouplerCurve(p.config, {
        branch: p.branch,
        theta2: p.theta2,
        steps: 240,
      });
      expect(trace.points.length, p.id).toBeGreaterThan(180);
    }
  });

  it("presets are findable by id and ids are unique", () => {
    const ids = FOURBAR_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fourBarPreset("figure-eight")?.label).toMatch(/eight/i);
    expect(fourBarPreset("nope")).toBeUndefined();
  });

  it("kite and figure-eight are full-rotation crank-rockers", () => {
    for (const id of ["kite", "figure-eight", "d-curve"]) {
      const p = fourBarPreset(id)!;
      expect(classify(p.config).inputRotatesFully, id).toBe(true);
      expect(inputRange(p.config).full, id).toBe(true);
    }
  });

  it("figure-eight actually crosses itself exactly once", () => {
    const p = fourBarPreset("figure-eight")!;
    const t = traceCouplerCurve(p.config, { branch: p.branch, steps: 240 });
    expect(selfIntersections(t.points)).toBe(1);
  });

  it("chebyshev runs straight for > 100 mm within 1 mm", () => {
    const p = fourBarPreset("chebyshev")!;
    const t = traceCouplerCurve(p.config, {
      branch: p.branch,
      theta2: p.theta2,
      steps: 480,
    });
    expect(longestFlatRun(t.points, 1.0)).toBeGreaterThan(100);
  });

  it("d-curve has a > 60 mm flat side on an otherwise curved loop", () => {
    const p = fourBarPreset("d-curve")!;
    const t = traceCouplerCurve(p.config, { branch: p.branch, steps: 480 });
    expect(longestFlatRun(t.points, 1.5)).toBeGreaterThan(60);
    const whole = fitLine(t.points);
    expect(whole && whole.maxDev).toBeGreaterThan(15);
  });
});

describe("mechanism library presets", () => {
  it("slider-crank presets validate and can reach their starting angle", () => {
    expect(SLIDERCRANK_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of SLIDERCRANK_PRESETS) {
      expect(validateSliderCrank(p.config), p.id).toBeNull();
      const range = sliderCrankInputRange(p.config);
      expect(range.full || range.arcs.length > 0, p.id).toBe(true);
    }
  });

  it("quick-return preset actually has an offset; engine preset is in-line", () => {
    expect(mechanismPreset(SLIDERCRANK_PRESETS, "quick-return")!.config.offset).not.toBe(0);
    expect(mechanismPreset(SLIDERCRANK_PRESETS, "engine")!.config.offset).toBe(0);
  });

  it("cam presets validate; the harsh preset really is the uniform law", () => {
    expect(CAM_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of CAM_PRESETS) {
      expect(validateCam(p.config), p.id).toBeNull();
    }
    expect(mechanismPreset(CAM_PRESETS, "uniform-jolt")!.config.law).toBe("uniform");
    expect(mechanismPreset(CAM_PRESETS, "eccentric")!.config.kind).toBe("eccentric");
  });

  it("gear presets validate and deliver the advertised ratios", () => {
    expect(GEAR_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of GEAR_PRESETS) {
      expect(validateGearTrain(p.config), p.id).toBeNull();
    }
    const ratio = (id: string) => {
      const res = solveGearTrain(mechanismPreset(GEAR_PRESETS, id)!.config, 0);
      if (!res.ok) throw new Error(`${id} must solve`);
      return res.overallRatio;
    };
    expect(ratio("reduction")).toBeCloseTo(-12 / 30, 10);
    expect(ratio("idler")).toBeCloseTo(1, 10);
    expect(ratio("speed-up")).toBeCloseTo(-3, 10);
  });

  it("geneva presets validate with the advertised slot counts", () => {
    expect(GENEVA_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of GENEVA_PRESETS) {
      expect(validateGeneva(p.config), p.id).toBeNull();
    }
    expect(mechanismPreset(GENEVA_PRESETS, "film")!.config.slots).toBe(4);
  });

  it("preset ids are unique within each list", () => {
    for (const list of [SLIDERCRANK_PRESETS, CAM_PRESETS, GEAR_PRESETS, GENEVA_PRESETS]) {
      const ids = list.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});