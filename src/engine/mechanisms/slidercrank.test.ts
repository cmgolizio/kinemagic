import { describe, expect, it } from "vitest";
import {
  defaultSliderCrank,
  pistonPositionClosedForm,
  quickReturnRatio,
  sliderCrankInputRange,
  sliderStroke,
  solveSliderCrank,
  traceSliderCrank,
  type SliderCrankConfig,
} from "./slidercrank";
import { angleInArc } from "./fourbar";
import { cross, dist, fromPolar, perp, sub, TWO_PI, vec } from "../vec";

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

describe("rod trace point", () => {
  it("stays rigid in the rod frame", () => {
    const cfg: SliderCrankConfig = {
      ...defaultSliderCrank(),
      rodPoint: { u: 30, v: 15 },
    };
    for (let i = 0; i < 360; i += 10) {
      const res = solveSliderCrank(cfg, (i / 360) * TWO_PI);
      if (!res.ok) continue;
      expect(dist(res.P, res.A)).toBeCloseTo(Math.hypot(30, 15), 9);
      expect(dist(res.P, res.B)).toBeCloseTo(Math.hypot(cfg.rodLen - 30, 15), 9);
    }
  });

  it("defaults to the rod midpoint when unset", () => {
    const cfg: SliderCrankConfig = { ...defaultSliderCrank(), rodPoint: undefined };
    const res = solveSliderCrank(cfg, 1.1);
    if (!res.ok) throw new Error("solve failed");
    expect(res.P.x).toBeCloseTo((res.A.x + res.B.x) / 2, 9);
    expect(res.P.y).toBeCloseTo((res.A.y + res.B.y) / 2, 9);
  });

  it("traces a closed loop over a full-rotation cycle", () => {
    const t = traceSliderCrank(defaultSliderCrank(), { steps: 240 });
    expect(t.closed).toBe(true);
    expect(t.points.length).toBeGreaterThan(200);
    const first = t.points[0];
    const last = t.points[t.points.length - 1];
    expect(dist(first, last)).toBeLessThan(1e-9);
  });
});

describe("input range", () => {
  it("is full when the rod out-reaches crank + |offset|", () => {
    expect(sliderCrankInputRange(defaultSliderCrank()).full).toBe(true);
  });

  it("is limited for a short rod: arc interiors solve, gaps fail", () => {
    const cfg: SliderCrankConfig = {
      O2: vec(0, 0),
      crankLen: 50,
      rodLen: 30,
      axisAngle: 0,
      offset: 0,
    };
    const range = sliderCrankInputRange(cfg);
    expect(range.full).toBe(false);
    if (range.full) return;
    expect(range.arcs.length).toBe(2);
    for (const arc of range.arcs) {
      let span = arc.end - arc.start;
      if (span < 0) span += TWO_PI;
      const mid = arc.start + span / 2;
      expect(solveSliderCrank(cfg, mid).ok).toBe(true);
      expect(angleInArc(mid, arc)).toBe(true);
    }
    // Straight up (crank ⟂ axis) is out of reach for r=50, l=30.
    expect(solveSliderCrank(cfg, Math.PI / 2).ok).toBe(false);
  });

  it("returns no arcs when the offset is beyond crank + rod", () => {
    const cfg: SliderCrankConfig = {
      O2: vec(0, 0),
      crankLen: 10,
      rodLen: 10,
      axisAngle: 0,
      offset: 40,
    };
    const range = sliderCrankInputRange(cfg);
    expect(range.full).toBe(false);
    if (!range.full) expect(range.arcs.length).toBe(0);
  });

  it("respects the axis rotation", () => {
    const cfg: SliderCrankConfig = {
      O2: vec(0, 0),
      crankLen: 50,
      rodLen: 30,
      axisAngle: Math.PI / 4,
      offset: 0,
    };
    const range = sliderCrankInputRange(cfg);
    expect(range.full).toBe(false);
    if (range.full) return;
    // Along the axis is reachable, perpendicular to it is not.
    expect(solveSliderCrank(cfg, Math.PI / 4).ok).toBe(true);
    expect(solveSliderCrank(cfg, Math.PI / 4 + Math.PI / 2).ok).toBe(false);
  });
});

describe("stroke", () => {
  it("matches r + l and l − r extremes for the in-line layout", () => {
    const s = sliderStroke(defaultSliderCrank());
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.max).toBeCloseTo(120, 6);
    expect(s.min).toBeCloseTo(60, 6);
  });
});

describe("quickReturnRatio", () => {
  it("is 1 for the symmetric in-line layout", () => {
    const ratio = quickReturnRatio(defaultSliderCrank());
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeCloseTo(1, 2);
  });

  it("matches the dead-center closed form for an offset layout", () => {
    // Dead centers put crank and rod collinear: outer at asin(e/(l+r)),
    // inner at π + asin(e/(l−r)); the ratio is slowArc/fastArc.
    const r = 32;
    const l = 95;
    const e = 38;
    const cfg: SliderCrankConfig = {
      O2: vec(-60, 0),
      crankLen: r,
      rodLen: l,
      axisAngle: 0,
      offset: e,
    };
    const phiOut = Math.asin(e / (l + r));
    const phiIn = Math.asin(e / (l - r));
    const expected = (Math.PI + phiIn - phiOut) / (Math.PI - phiIn + phiOut);
    const ratio = quickReturnRatio(cfg);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeCloseTo(expected, 2);
    expect(ratio!).toBeGreaterThan(1);
  });

  it("is symmetric in the sign of the offset", () => {
    const base = { ...defaultSliderCrank(), crankLen: 30, rodLen: 90 };
    const up = quickReturnRatio({ ...base, offset: 40 });
    const down = quickReturnRatio({ ...base, offset: -40 });
    expect(up).not.toBeNull();
    expect(down).not.toBeNull();
    expect(up!).toBeCloseTo(down!, 6);
  });

  it("returns null when the crank cannot fully rotate", () => {
    // crank + offset beyond the rod's reach → the input only sways.
    const cfg: SliderCrankConfig = {
      O2: vec(0, 0),
      crankLen: 50,
      rodLen: 60,
      axisAngle: 0,
      offset: 20,
    };
    expect(sliderCrankInputRange(cfg).full).toBe(false);
    expect(quickReturnRatio(cfg)).toBeNull();
  });
});