import { describe, expect, it } from "vitest";
import {
  defaultSliderCrank,
  pistonPositionClosedForm,
  solveSliderCrank,
  type SliderCrankConfig,
} from "./slidercrank";
import { cross, dist, fromPolar, perp, sub, TWO_PI, vec } from "./vec";

describe("solveSliderCrank vs the closed-form piston equation", () => {
  it.each([
    ["in-line", 0],
    ["offset", 10],
  ])("matches x = r·cosθ + √(l² − (r·sinθ − e)²) (%s)", (_name, e) => {
    const cfg: SliderCrankConfig = { ...defaultSliderCrank(), offset: e };
    for (let i = 0; i < 360; i += 3) {
      const theta = (i / 360) * TWO_PI;
      const expected = pistonPositionClosedForm(cfg.crankLen, cfg.rodLen, e, theta);
      const res = solveSliderCrank(cfg, theta);
      if (expected === null) {
        expect(res.ok).toBe(false);
        continue;
      }
      if (!res.ok) throw new Error(`failed at ${i}°: ${res.detail}`);
      expect(res.sliderPos).toBeCloseTo(expected, 9);
      expect(res.B.y).toBeCloseTo(e, 9); // slider stays on its line
      expect(dist(res.B, res.A)).toBeCloseTo(cfg.rodLen, 9);
    }
  });

  it("hits top and bottom dead center for the in-line layout", () => {
    const cfg = defaultSliderCrank(); // r=30, l=90
    const tdc = solveSliderCrank(cfg, 0);
    const bdc = solveSliderCrank(cfg, Math.PI);
    if (!tdc.ok || !bdc.ok) throw new Error("dead centers must be reachable");
    expect(tdc.sliderPos).toBeCloseTo(120, 12); // r + l
    expect(bdc.sliderPos).toBeCloseTo(60, 12); // l - r
  });
});

describe("rotated axis with offset", () => {
  it("keeps B on the slider line and matches the rotated closed form", () => {
    const cfg: SliderCrankConfig = {
      O2: vec(12, -7),
      crankLen: 25,
      rodLen: 70,
      axisAngle: Math.PI / 6,
      offset: 15,
    };
    const axis = fromPolar(1, cfg.axisAngle);
    const lineOrigin = {
      x: cfg.O2.x + perp(axis).x * cfg.offset,
      y: cfg.O2.y + perp(axis).y * cfg.offset,
    };
    for (let i = 0; i < 360; i += 5) {
      const theta = (i / 360) * TWO_PI;
      const expected = pistonPositionClosedForm(
        cfg.crankLen,
        cfg.rodLen,
        cfg.offset,
        theta - cfg.axisAngle,
      );
      const res = solveSliderCrank(cfg, theta);
      if (expected === null) {
        expect(res.ok).toBe(false);
        continue;
      }
      if (!res.ok) throw new Error(`failed at ${i}°: ${res.detail}`);
      expect(res.sliderPos).toBeCloseTo(expected, 9);
      expect(Math.abs(cross(sub(res.B, lineOrigin), axis))).toBeLessThan(1e-9);
      expect(dist(res.B, res.A)).toBeCloseTo(cfg.rodLen, 9);
    }
  });
});

describe("failure modes", () => {
  it("returns typed unreachable when the rod cannot reach the line", () => {
    const cfg: SliderCrankConfig = {
      O2: vec(0, 0),
      crankLen: 50,
      rodLen: 30,
      axisAngle: 0,
      offset: 0,
    };
    const res = solveSliderCrank(cfg, Math.PI / 2); // crank pin 50mm off the line
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unreachable");
  });

  it.each([
    ["zero rod", { rodLen: 0 }],
    ["negative crank", { crankLen: -3 }],
    ["NaN offset", { offset: Number.NaN }],
  ])("returns typed degenerate for %s", (_name, over) => {
    const res = solveSliderCrank({ ...defaultSliderCrank(), ...over }, 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("degenerate");
  });

  it("never returns NaN in successful poses", () => {
    const cfg = defaultSliderCrank();
    for (let i = 0; i <= 720; i++) {
      const res = solveSliderCrank(cfg, (i / 720) * 2 * TWO_PI);
      if (res.ok) {
        expect(
          Number.isFinite(res.A.x + res.A.y + res.B.x + res.B.y + res.sliderPos),
        ).toBe(true);
      }
    }
  });
});