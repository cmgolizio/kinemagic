import { describe, expect, it } from "vitest";
import {
  sliderAxisOrigin,
  sliderStroke,
  solveSliderCrank,
  type SliderCrankConfig,
} from "./slidercrank";
import { cross, degToRad, dist, fromAngle, sub, vec2 } from "./vec2";

/** Closed-form piston equation for axisAngle = 0, crank pivot at origin: */
const pistonX = (r: number, l: number, e: number, theta: number): number =>
  r * Math.cos(theta) + Math.sqrt(l * l - (r * Math.sin(theta) - e) ** 2);

const inline: SliderCrankConfig = {
  o2: vec2(0, 0),
  axisAngle: 0,
  crankLen: 30,
  rodLen: 70,
  offset: 0,
};

const offset: SliderCrankConfig = { ...inline, offset: 10 };

describe("solveSliderCrank — closed-form agreement", () => {
  it("matches the piston equation for the in-line slider-crank across a revolution", () => {
    for (let deg = 0; deg < 360; deg += 1) {
      const theta = degToRad(deg);
      const result = solveSliderCrank(inline, theta);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.sliderT).toBeCloseTo(pistonX(30, 70, 0, theta), 9);
      expect(result.slider.y).toBeCloseTo(0, 9);
    }
  });

  it("matches the piston equation with a perpendicular offset", () => {
    for (let deg = 0; deg < 360; deg += 1) {
      const theta = degToRad(deg);
      const result = solveSliderCrank(offset, theta);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.sliderT).toBeCloseTo(pistonX(30, 70, 10, theta), 9);
      expect(result.slider.y).toBeCloseTo(10, 9); // slider rides the offset axis
    }
  });

  it("hits top and bottom dead centre exactly for the in-line case", () => {
    const tdc = solveSliderCrank(inline, 0);
    const bdc = solveSliderCrank(inline, Math.PI);
    expect(tdc.ok && bdc.ok).toBe(true);
    if (!tdc.ok || !bdc.ok) return;
    expect(tdc.sliderT).toBeCloseTo(30 + 70, 12);
    expect(bdc.sliderT).toBeCloseTo(70 - 30, 12);
  });

  it("keeps the rod length exact at every angle", () => {
    for (let deg = 0; deg < 360; deg += 5) {
      const result = solveSliderCrank(offset, degToRad(deg));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(dist(result.slider, result.a)).toBeCloseTo(offset.rodLen, 9);
    }
  });
});

describe("solveSliderCrank — branches and continuity", () => {
  it("returns the negative-branch root on request", () => {
    const theta = degToRad(40);
    const pos = solveSliderCrank(inline, theta, { branch: "positive" });
    const neg = solveSliderCrank(inline, theta, { branch: "negative" });
    expect(pos.ok && neg.ok).toBe(true);
    if (!pos.ok || !neg.ok) return;
    const r = 30;
    const l = 70;
    const half = Math.sqrt(l * l - (r * Math.sin(theta)) ** 2);
    expect(pos.sliderT).toBeCloseTo(r * Math.cos(theta) + half, 9);
    expect(neg.sliderT).toBeCloseTo(r * Math.cos(theta) - half, 9);
  });

  it("continues on the same branch via prevT across a sweep", () => {
    let prevT: number | undefined;
    let maxStep = 0;
    for (let i = 0; i <= 720; i++) {
      const theta = (2 * Math.PI * i) / 720;
      const result = solveSliderCrank(inline, theta, { prevT });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.branch).toBe("positive"); // default start, never flips
      if (prevT !== undefined) maxStep = Math.max(maxStep, Math.abs(result.sliderT - prevT));
      prevT = result.sliderT;
    }
    expect(maxStep).toBeLessThan(1); // smooth: < 1 mm per half-degree step
  });

  it("picks the nearest root when prevT sits near the negative branch", () => {
    const theta = degToRad(100);
    const neg = solveSliderCrank(inline, theta, { branch: "negative" });
    expect(neg.ok).toBe(true);
    if (!neg.ok) return;
    const continued = solveSliderCrank(inline, theta + 0.01, { prevT: neg.sliderT });
    expect(continued.ok).toBe(true);
    if (continued.ok) expect(continued.branch).toBe("negative");
  });
});

describe("solveSliderCrank — world placement", () => {
  it("solves on a rotated, translated axis", () => {
    const config: SliderCrankConfig = {
      o2: vec2(100, 50),
      axisAngle: degToRad(90),
      crankLen: 25,
      rodLen: 60,
      offset: -8,
    };
    const axisDir = fromAngle(config.axisAngle);
    const origin = sliderAxisOrigin(config);
    for (let deg = 0; deg < 360; deg += 10) {
      const result = solveSliderCrank(config, degToRad(deg));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(dist(result.slider, result.a)).toBeCloseTo(60, 9);
      // The slider stays on the axis line: (S - origin) x axisDir == 0.
      expect(cross(sub(result.slider, origin), axisDir)).toBeCloseTo(0, 9);
      expect(dist(result.a, config.o2)).toBeCloseTo(25, 9);
    }
  });
});

describe("solveSliderCrank — unreachable and degenerate inputs", () => {
  it("returns typed unreachable when the rod cannot span to the axis", () => {
    // r=50, L=30: at theta=90 the crank pin is 50 mm off-axis, rod is 30.
    const config: SliderCrankConfig = { ...inline, crankLen: 50, rodLen: 30 };
    const result = solveSliderCrank(config, degToRad(90));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unreachable");
      expect(result.a).toBeDefined();
    }
    // ...but solves fine where the pin is close enough to the axis.
    const ok = solveSliderCrank(config, 0);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.sliderT).toBeCloseTo(80, 9);
  });

  it("never returns NaN across a sweep with unreachable spans", () => {
    const config: SliderCrankConfig = { ...inline, crankLen: 50, rodLen: 30 };
    for (let deg = 0; deg < 360; deg += 1) {
      const result = solveSliderCrank(config, degToRad(deg));
      if (result.ok) {
        expect(Number.isFinite(result.sliderT)).toBe(true);
        expect(Number.isFinite(result.slider.x)).toBe(true);
        expect(Number.isFinite(result.slider.y)).toBe(true);
      } else {
        expect(result.reason).toBe("unreachable");
      }
    }
  });

  it("rejects non-positive lengths and non-finite inputs as degenerate", () => {
    expect(solveSliderCrank({ ...inline, crankLen: 0 }, 0).ok).toBe(false);
    expect(solveSliderCrank({ ...inline, rodLen: -5 }, 0).ok).toBe(false);
    expect(solveSliderCrank({ ...inline, offset: NaN }, 0).ok).toBe(false);
    expect(solveSliderCrank(inline, Infinity).ok).toBe(false);
    const bad = solveSliderCrank({ ...inline, crankLen: 0 }, 0);
    if (!bad.ok) expect(bad.reason).toBe("degenerate");
  });
});

describe("sliderStroke", () => {
  it("matches the closed-form extremes for the offset slider-crank", () => {
    const stroke = sliderStroke(offset);
    expect(stroke).not.toBeNull();
    if (!stroke) return;
    expect(stroke.tMax).toBeCloseTo(Math.sqrt(100 * 100 - 10 * 10), 12);
    expect(stroke.tMin).toBeCloseTo(Math.sqrt(40 * 40 - 10 * 10), 12);
    expect(stroke.stroke).toBeCloseTo(stroke.tMax - stroke.tMin, 12);
  });

  it("bounds the swept slider positions", () => {
    const stroke = sliderStroke(offset);
    expect(stroke).not.toBeNull();
    if (!stroke) return;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (let i = 0; i < 3600; i++) {
      const result = solveSliderCrank(offset, (2 * Math.PI * i) / 3600);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      tMin = Math.min(tMin, result.sliderT);
      tMax = Math.max(tMax, result.sliderT);
    }
    expect(tMax).toBeLessThanOrEqual(stroke.tMax + 1e-9);
    expect(tMin).toBeGreaterThanOrEqual(stroke.tMin - 1e-9);
    // The sampled sweep should come within a hair of the true extremes.
    expect(tMax).toBeCloseTo(stroke.tMax, 2);
    expect(tMin).toBeCloseTo(stroke.tMin, 2);
  });

  it("returns null when the crank cannot fully rotate against the offset", () => {
    expect(sliderStroke({ ...inline, crankLen: 65, rodLen: 70, offset: 10 })).toBeNull();
  });
});