import { describe, expect, it } from "vitest";
import {
  camMotion,
  fourBarMotion,
  fourBarTransmission,
  gearTrainMotion,
  genevaMotion,
  isPoorTransmission,
  peaucellierMotion,
  sliderCrankMotion,
  type MotionSeries,
} from "./analysis";
import { degToRad, radToDeg, TWO_PI, vec } from "./vec";
import { groundLen, type FourBarConfig } from "./mechanisms/fourbar";
import { fourBarPreset } from "./mechanisms/presets";
import {
  defaultSliderCrank,
  type SliderCrankConfig,
} from "./mechanisms/slidercrank";
import { camLiftSlope, defaultCam, type CamConfig } from "./mechanisms/cam";
import { defaultGearTrain, solveGearTrain } from "./mechanisms/gears";
import { defaultGeneva, genevaGeometry } from "./mechanisms/geneva";
import { defaultPeaucellier } from "./mechanisms/straightline";

function expectFiniteSeries(s: MotionSeries): void {
  for (const arr of [s.input, s.position, s.velocity, s.acceleration]) {
    expect(arr.length).toBe(s.input.length);
    for (const v of arr) expect(Number.isFinite(v)).toBe(true);
  }
}

describe("four-bar motion analysis", () => {
  const kite = fourBarPreset("kite")!;

  it("produces a finite, cyclic, continuous θ4 series on a crank-rocker", () => {
    const s = fourBarMotion(kite.config, { branch: kite.branch })!;
    expect(s).not.toBeNull();
    expect(s.cyclic).toBe(true);
    expectFiniteSeries(s);
    // No branch snaps: consecutive rocker angles stay close.
    for (let i = 1; i < s.position.length; i++) {
      expect(Math.abs(s.position[i] - s.position[i - 1])).toBeLessThan(0.2);
    }
  });

  it("rocker velocity crosses zero exactly twice per crank revolution", () => {
    const s = fourBarMotion(kite.config, { branch: kite.branch })!;
    let crossings = 0;
    // Skip the duplicated wrap sample at the end.
    for (let i = 1; i < s.velocity.length - 1; i++) {
      if (Math.sign(s.velocity[i]) !== Math.sign(s.velocity[i - 1])) crossings++;
    }
    expect(crossings).toBe(2);
  });

  it("velocity matches a direct finite difference of the position series", () => {
    const s = fourBarMotion(kite.config, { branch: kite.branch })!;
    const h = s.input[1] - s.input[0];
    for (let i = 1; i < s.position.length - 1; i++) {
      const fd = (s.position[i + 1] - s.position[i - 1]) / (2 * h);
      expect(s.velocity[i]).toBeCloseTo(fd, 6);
    }
  });

  it("transmission-angle extremes match the closed form at θ2 = 0 and π", () => {
    const c = kite.config;
    const r1 = groundLen(c);
    const muAt = (d: number) =>
      Math.acos(
        (c.couplerLen ** 2 + c.rockerLen ** 2 - d * d) /
          (2 * c.couplerLen * c.rockerLen),
      );
    const muMin = Math.min(muAt(r1 - c.crankLen), muAt(r1 + c.crankLen));
    const muMax = Math.max(muAt(r1 - c.crankLen), muAt(r1 + c.crankLen));

    const t = fourBarTransmission(c, { branch: kite.branch })!;
    expect(radToDeg(t.minMu)).toBeCloseTo(radToDeg(muMin), 0);
    expect(radToDeg(t.maxMu)).toBeCloseTo(radToDeg(muMax), 0);
  });

  it("flags a deliberately bad four-bar as poor transmission", () => {
    // Grashof crank-rocker whose μ collapses to ~29.5° at θ2 = 0.
    const bad: FourBarConfig = {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 48,
      couplerLen: 60,
      rockerLen: 95,
      couplerPoint: { u: 30, v: 20 },
    };
    const t = fourBarTransmission(bad)!;
    expect(radToDeg(t.minMu)).toBeLessThan(30);
    expect(isPoorTransmission(t.minMu)).toBe(true);
    // …and the healthy default is not flagged anywhere in its cycle.
    const good = fourBarTransmission(fourBarPreset("kite")!.config)!;
    expect(isPoorTransmission(good.minMu)).toBe(false);
    expect(isPoorTransmission(good.maxMu)).toBe(false);
  });

  it("covers only the reachable arc for a swaying (non-Grashof) input", () => {
    // Triple-rocker: s + l > p + q.
    const sway: FourBarConfig = {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 70,
      couplerLen: 60,
      rockerLen: 60,
      couplerPoint: { u: 30, v: 25 },
    };
    const s = fourBarMotion(sway)!;
    expect(s.cyclic).toBe(false);
    expectFiniteSeries(s);
    const span = s.input[s.input.length - 1] - s.input[0];
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThan(TWO_PI - 1e-6);
  });
});

describe("slider-crank motion analysis", () => {
  it("velocity matches the analytic derivative of the piston equation", () => {
    const c: SliderCrankConfig = {
      ...defaultSliderCrank(),
      O2: vec(0, 0),
      crankLen: 30,
      rodLen: 90,
      offset: 12,
      axisAngle: 0,
    };
    const s = sliderCrankMotion(c)!;
    expect(s.cyclic).toBe(true);
    expectFiniteSeries(s);
    const analytic = (theta: number) => {
      const r = c.crankLen;
      const l = c.rodLen;
      const e = c.offset;
      const q = r * Math.sin(theta) - e;
      return -r * Math.sin(theta) - (q * r * Math.cos(theta)) / Math.sqrt(l * l - q * q);
    };
    for (let i = 0; i < s.input.length; i++) {
      expect(s.velocity[i]).toBeCloseTo(analytic(s.input[i]), 2);
    }
  });

  it("acceleration is the derivative of velocity (numerically consistent)", () => {
    const s = sliderCrankMotion(defaultSliderCrank())!;
    const h = s.input[1] - s.input[0];
    for (let i = 1; i < s.input.length - 1; i++) {
      const fd = (s.velocity[i + 1] - s.velocity[i - 1]) / (2 * h);
      expect(s.acceleration[i]).toBeCloseTo(fd, 1);
    }
  });
});

describe("cam motion analysis", () => {
  it("velocity matches the analytic lift slope for a cycloidal program", () => {
    const c = defaultCam();
    const s = camMotion(c, 720)!;
    expectFiniteSeries(s);
    for (let i = 0; i < s.input.length; i++) {
      expect(s.velocity[i]).toBeCloseTo(camLiftSlope(c, s.input[i]), 1);
    }
  });

  it("cycloidal acceleration vanishes at the ends of the rise", () => {
    const c = defaultCam(); // cycloidal, rise 120°
    const s = camMotion(c, 720)!;
    const at = (deg: number) => {
      const idx = Math.round((degToRad(deg) / TWO_PI) * (s.input.length - 1));
      return s.acceleration[idx];
    };
    const peak = Math.max(...s.acceleration.map(Math.abs));
    expect(Math.abs(at(0))).toBeLessThan(peak * 0.05);
    expect(Math.abs(at(120))).toBeLessThan(peak * 0.05);
  });

  it("uniform law shows the end-of-stroke acceleration spike", () => {
    const c: CamConfig = { ...defaultCam(), law: "uniform" };
    const cyc = camMotion(defaultCam(), 360)!;
    const uni = camMotion(c, 360)!;
    const peak = (s: MotionSeries) => Math.max(...s.acceleration.map(Math.abs));
    expect(peak(uni)).toBeGreaterThan(peak(cyc) * 3);
  });
});

describe("gear train motion analysis", () => {
  it("velocity is exactly the overall ratio and acceleration is zero", () => {
    const c = defaultGearTrain();
    const ratio = solveGearTrain(c, 0);
    if (!ratio.ok) throw new Error("default train must solve");
    const s = gearTrainMotion(c)!;
    expectFiniteSeries(s);
    for (let i = 0; i < s.input.length; i++) {
      expect(s.velocity[i]).toBeCloseTo(ratio.overallRatio, 8);
      expect(s.acceleration[i]).toBeCloseTo(0, 6);
    }
  });
});

describe("geneva motion analysis", () => {
  it("indexes one slot per driver revolution, resting during the dwell", () => {
    const c = defaultGeneva();
    const g = genevaGeometry(c);
    const s = genevaMotion(c, 720)!;
    expectFiniteSeries(s);
    const indexed = s.position[s.position.length - 1] - s.position[0];
    expect(indexed).toBeCloseTo(-TWO_PI / c.slots, 5);

    // Wheel is stationary while the pin is outside the engagement window.
    for (let i = 0; i < s.input.length; i++) {
      const delta = s.input[i] - c.wheelDir;
      if (Math.abs(delta) > g.halfWindow + 0.15 && Math.abs(delta) < Math.PI - 0.05) {
        expect(Math.abs(s.velocity[i])).toBeLessThan(1e-6);
      }
    }
  });
});

describe("peaucellier motion analysis", () => {
  it("output travel along the exact line is finite and spans a real stroke", () => {
    const s = peaucellierMotion(defaultPeaucellier())!;
    expect(s.cyclic).toBe(false);
    expectFiniteSeries(s);
    const lo = Math.min(...s.position);
    const hi = Math.max(...s.position);
    expect(hi - lo).toBeGreaterThan(50);
  });
});