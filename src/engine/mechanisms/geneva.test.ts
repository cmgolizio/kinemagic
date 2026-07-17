import { describe, expect, it } from "vitest";
import {
  defaultGeneva,
  genevaDwellFraction,
  genevaGeometry,
  solveGeneva,
  type GenevaConfig,
} from "./geneva";
import { dot, normalizeAngle, sub, TWO_PI, vec } from "../vec";

const cfg = (over: Partial<GenevaConfig> = {}): GenevaConfig => ({
  center: vec(0, 0),
  slots: 4,
  centerDist: 100,
  wheelDir: 0,
  ...over,
});

describe("geneva geometry", () => {
  it("uses tangential-entry proportions: p² + w² = d²", () => {
    for (const slots of [3, 4, 5, 6, 8]) {
      const g = genevaGeometry(cfg({ slots }));
      expect(g.pinCircleR ** 2 + g.wheelR ** 2).toBeCloseTo(100 ** 2, 9);
      expect(g.pinCircleR).toBeCloseTo(100 * Math.sin(Math.PI / slots), 12);
    }
  });

  it("pin velocity is along the slot at entry (right angle at the pin)", () => {
    for (const slots of [4, 6]) {
      const c = cfg({ slots });
      const g = genevaGeometry(c);
      const res = solveGeneva(c, -g.halfWindow);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      // At entry the driver arm C1→pin is perpendicular to pin→C2 (slot axis).
      const arm = sub(res.pin, g.driverCenter);
      const slot = sub(g.wheelCenter, res.pin);
      expect(Math.abs(dot(arm, slot))).toBeLessThan(1e-9 * 100 * 100);
    }
  });
});

describe("geneva motion", () => {
  it("indexes the wheel by exactly −2π/n per driver revolution", () => {
    for (const slots of [3, 4, 6, 8]) {
      const c = cfg({ slots });
      for (const theta of [0, 1.234, -7.7]) {
        const a = solveGeneva(c, theta);
        const b = solveGeneva(c, theta + TWO_PI);
        if (!a.ok || !b.ok) throw new Error("solve failed");
        expect(b.wheelAngle - a.wheelAngle).toBeCloseTo(-TWO_PI / slots, 12);
      }
    }
  });

  it("dwells exactly while the pin is out of the slot", () => {
    const c = cfg({ slots: 6 });
    const g = genevaGeometry(c);
    const ref = solveGeneva(c, g.halfWindow + 0.01);
    if (!ref.ok) throw new Error("solve failed");
    for (let t = g.halfWindow + 0.01; t < TWO_PI - g.halfWindow; t += 0.05) {
      const res = solveGeneva(c, t);
      if (!res.ok) throw new Error("solve failed");
      expect(res.wheelAngle).toBeCloseTo(ref.wheelAngle, 12);
      expect(res.engaged).toBe(false);
    }
  });

  it("is continuous everywhere, including entry, exit and cycle wrap", () => {
    const c = cfg({ slots: 5 });
    let prev: number | null = null;
    const step = TWO_PI / 3600;
    for (let i = -3600; i <= 7200; i++) {
      const res = solveGeneva(c, i * step);
      if (!res.ok) throw new Error("solve failed");
      if (prev !== null) {
        // Peak wheel speed for a Geneva is p/(d−p) times the driver speed.
        const g = genevaGeometry(c);
        const maxRate = g.pinCircleR / (c.centerDist - g.pinCircleR) + 1;
        expect(Math.abs(res.wheelAngle - prev)).toBeLessThan(maxRate * step * 1.5);
      }
      prev = res.wheelAngle;
    }
  });

  it("moves monotonically (opposite the driver) during engagement", () => {
    const c = cfg({ slots: 6 });
    const g = genevaGeometry(c);
    let prev: number | null = null;
    for (let t = -g.halfWindow + 1e-6; t <= g.halfWindow - 1e-6; t += g.halfWindow / 200) {
      const res = solveGeneva(c, t);
      if (!res.ok) throw new Error("solve failed");
      if (prev !== null) expect(res.wheelAngle).toBeLessThan(prev + 1e-12);
      prev = res.wheelAngle;
    }
  });

  it("a slot points straight at the driver at full depth (θ = wheelDir)", () => {
    for (const wheelDir of [0, 1.1]) {
      const c = cfg({ slots: 6, wheelDir });
      const res = solveGeneva(c, wheelDir);
      if (!res.ok) throw new Error("solve failed");
      // Slot k angle = wheelAngle + k·2π/n; one of them must face the driver
      // (wheel→driver direction = wheelDir + π).
      const facing = normalizeAngle(res.wheelAngle - (wheelDir + Math.PI));
      const offset = Math.abs(
        facing - Math.round(facing / (TWO_PI / 6)) * (TWO_PI / 6),
      );
      expect(offset).toBeLessThan(1e-9);
    }
  });

  it("dwell fraction matches 1 − (π − 2π/n)/2π", () => {
    expect(genevaDwellFraction(4)).toBeCloseTo(1 - (Math.PI - Math.PI / 2) / TWO_PI, 12);
    const c = cfg({ slots: 4 });
    // Empirically: fraction of the revolution with engaged === false.
    let dwellSamples = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const res = solveGeneva(c, (i / N) * TWO_PI);
      if (res.ok && !res.engaged) dwellSamples++;
    }
    expect(dwellSamples / N).toBeCloseTo(genevaDwellFraction(4), 2);
  });

  it.each([
    ["two slots", { slots: 2 }],
    ["fractional slots", { slots: 4.5 }],
    ["zero distance", { centerDist: 0 }],
  ])("returns typed degenerate for %s", (_name, over) => {
    const res = solveGeneva(cfg(over as Partial<GenevaConfig>), 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("degenerate");
  });

  it("default config solves without NaN across several revolutions", () => {
    const c = defaultGeneva();
    for (let i = 0; i <= 2000; i++) {
      const res = solveGeneva(c, (i / 2000) * 4 * TWO_PI - TWO_PI);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(Number.isFinite(res.wheelAngle + res.pin.x + res.pin.y)).toBe(true);
      }
    }
  });
});