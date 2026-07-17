import { describe, expect, it } from "vitest";
import {
  angleInArc,
  clampToRange,
  classifyGrashof,
  inputRange,
  solveFourBar,
  traceCouplerCurve,
  type FourBarConfig,
} from "./fourbar";
import { add, angleOf, dist, fromPolar, sub, TWO_PI, vec, type Vec2 } from "../vec";

const config = (over: Partial<FourBarConfig> = {}): FourBarConfig => ({
  O2: vec(0, 0),
  O4: vec(90, 0),
  crankLen: 30,
  couplerLen: 50,
  rockerLen: 50,
  couplerPoint: { u: 0, v: 0 },
  ...over,
});

describe("solveFourBar — hand-verified positions", () => {
  it("solves the symmetric 30/50/50 linkage at θ2 = 0", () => {
    // A=(30,0); B = intersection of r=50 circles at (30,0) and (90,0) → (60, ±40)
    const res = solveFourBar(config(), 0, { branch: 1 });
    if (!res.ok) throw new Error(res.detail);
    expect(res.A.x).toBeCloseTo(30, 12);
    expect(res.A.y).toBeCloseTo(0, 12);
    expect(res.B.x).toBeCloseTo(60, 10);
    expect(res.B.y).toBeCloseTo(40, 10);
    expect(res.theta3).toBeCloseTo(Math.atan2(40, 30), 10);
    expect(res.theta4).toBeCloseTo(Math.atan2(40, -30), 10);
  });

  it("picks the crossed branch on request", () => {
    const res = solveFourBar(config(), 0, { branch: -1 });
    if (!res.ok) throw new Error(res.detail);
    expect(res.B.y).toBeCloseTo(-40, 10);
  });

  it("places the coupler point in the coupler frame", () => {
    // û = (0.6, 0.8), v̂ = (-0.8, 0.6); u=25,v=10 → (30,0)+25û+10v̂ = (37,26)
    const res = solveFourBar(config({ couplerPoint: { u: 25, v: 10 } }), 0, { branch: 1 });
    if (!res.ok) throw new Error(res.detail);
    expect(res.P.x).toBeCloseTo(37, 10);
    expect(res.P.y).toBeCloseTo(26, 10);
  });

  it("computes the transmission angle at B", () => {
    // triangle A(30,0) B(60,40) O4(90,0): |BA|=|BO4|=50, |AO4|=60
    // cos μ = (50²+50²−60²)/(2·50·50) = 0.28
    const res = solveFourBar(config(), 0, { branch: 1 });
    if (!res.ok) throw new Error(res.detail);
    expect(Math.cos(res.transmissionAngle)).toBeCloseTo(0.28, 10);
  });

  it("solves the parallelogram linkage to the translated crank point", () => {
    const cfg = config({
      O4: vec(100, 0),
      crankLen: 40,
      couplerLen: 100,
      rockerLen: 40,
    });
    const theta = Math.PI / 3;
    const expected = add(add(cfg.O2, fromPolar(40, theta)), vec(100, 0));
    const r1 = solveFourBar(cfg, theta, { branch: 1 });
    const r2 = solveFourBar(cfg, theta, { branch: -1 });
    const hits = [r1, r2].filter((r) => r.ok) as Extract<typeof r1, { ok: true }>[];
    expect(hits.length).toBeGreaterThan(0);
    const best = Math.min(...hits.map((r) => dist(r.B, expected)));
    expect(best).toBeLessThan(1e-9);
  });
});

describe("solveFourBar — independent closed-form cross-check", () => {
  it("matches the law-of-cosines construction across a full crank turn", () => {
    const cfg = config({
      O4: vec(100, 0),
      crankLen: 40,
      couplerLen: 120,
      rockerLen: 80,
    });
    let prevB: Vec2 | undefined;
    for (let i = 0; i <= 360; i++) {
      const theta = (i / 360) * TWO_PI;
      const res = solveFourBar(cfg, theta, prevB ? { prevB } : { branch: 1 });
      if (!res.ok) throw new Error(`unexpected failure at ${i}°: ${res.detail}`);

      // Independent derivation: B = O4 + r4·dir(angle(O4→A) − β),
      // cos β = (d² + r4² − r3²) / (2·d·r4), for the branch-1 assembly.
      const toA = sub(res.A, cfg.O4);
      const d = Math.hypot(toA.x, toA.y);
      const cosBeta =
        (d * d + cfg.rockerLen ** 2 - cfg.couplerLen ** 2) / (2 * d * cfg.rockerLen);
      const beta = Math.acos(Math.max(-1, Math.min(1, cosBeta)));
      const expected = add(cfg.O4, fromPolar(cfg.rockerLen, angleOf(toA) - beta));

      expect(dist(res.B, expected)).toBeLessThan(1e-9);
      prevB = res.B;
    }
  });
});

describe("branch continuity", () => {
  it("sweeps a crank-rocker through 360° without B jumping", () => {
    const cfg = config({
      O4: vec(100, 0),
      crankLen: 40,
      couplerLen: 120,
      rockerLen: 80,
      couplerPoint: { u: 60, v: 40 },
    });
    const steps = 720;
    let prevB: Vec2 | undefined;
    let first: Vec2 | undefined;
    let maxStep = 0;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * TWO_PI;
      const res = solveFourBar(cfg, theta, prevB ? { prevB } : { branch: 1 });
      if (!res.ok) throw new Error(`unexpected failure at step ${i}`);
      if (prevB) maxStep = Math.max(maxStep, dist(res.B, prevB));
      if (!first) first = res.B;
      prevB = res.B;
    }
    // 0.5°/step on an 80mm rocker moves B well under 2mm — a branch snap
    // would jump tens of mm across the chord.
    expect(maxStep).toBeLessThan(2);
    expect(dist(prevB!, first!)).toBeLessThan(1e-9); // closes the loop
  });
});

describe("classifyGrashof — textbook cases", () => {
  it("crank-rocker when the crank is shortest", () => {
    const g = classifyGrashof(100, 40, 120, 80);
    expect(g.class).toBe("crank-rocker");
    expect(g.grashof).toBe(true);
    expect(g.inputRotatesFully).toBe(true);
    expect(g.fullyRotating).toEqual(["crank"]);
  });

  it("double-crank (drag link) when the ground is shortest", () => {
    const g = classifyGrashof(30, 80, 100, 70);
    expect(g.class).toBe("double-crank");
    expect(g.inputRotatesFully).toBe(true);
    expect(g.fullyRotating).toEqual(["crank", "rocker"]);
  });

  it("double-rocker when the coupler is shortest", () => {
    const g = classifyGrashof(80, 100, 30, 70);
    expect(g.class).toBe("double-rocker");
    expect(g.inputRotatesFully).toBe(false);
    expect(g.fullyRotating).toEqual(["coupler"]);
  });

  it("rocker-crank when the follower is shortest (input cannot lap)", () => {
    const g = classifyGrashof(100, 80, 120, 40);
    expect(g.class).toBe("crank-rocker");
    expect(g.inputRotatesFully).toBe(false);
    expect(g.fullyRotating).toEqual(["rocker"]);
  });

  it("change-point for the parallelogram", () => {
    const g = classifyGrashof(100, 40, 100, 40);
    expect(g.class).toBe("change-point");
    expect(g.grashof).toBe(true);
  });

  it("triple-rocker when Grashof fails", () => {
    const g = classifyGrashof(90, 30, 50, 50);
    expect(g.class).toBe("triple-rocker");
    expect(g.grashof).toBe(false);
    expect(g.inputRotatesFully).toBe(false);
    expect(g.fullyRotating).toEqual([]);
  });
});

describe("inputRange", () => {
  it("full rotation for a crank-rocker", () => {
    const cfg = config({ O4: vec(100, 0), crankLen: 40, couplerLen: 120, rockerLen: 80 });
    expect(inputRange(cfg)).toEqual({ full: true });
  });

  it("computes the swing limits of a rocker input", () => {
    // r1=100 r2=60 r3=60 r4=40: reach limit at cos φ = 0.3
    const cfg = config({ O4: vec(100, 0), crankLen: 60, couplerLen: 60, rockerLen: 40 });
    const range = inputRange(cfg);
    if (range.full) throw new Error("expected limited range");
    expect(range.arcs).toHaveLength(1);
    const phi = Math.acos(0.3);
    expect(range.arcs[0].start).toBeCloseTo(-phi, 10);
    expect(range.arcs[0].end).toBeCloseTo(phi, 10);

    // solver agrees with the range at and beyond the limits
    expect(solveFourBar(cfg, 0, { branch: 1 }).ok).toBe(true);
    expect(solveFourBar(cfg, phi - 1e-6, { branch: 1 }).ok).toBe(true);
    const past = solveFourBar(cfg, Math.PI, { branch: 1 });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.reason).toBe("unreachable");
  });

  it("splits into two arcs when the fold limit bites", () => {
    // r1=100 r2=60 r3=90 r4=40: reachLo=50 > dMin=40 → excluded zone around φ=0
    const cfg = config({ O4: vec(100, 0), crankLen: 60, couplerLen: 90, rockerLen: 40 });
    const range = inputRange(cfg);
    if (range.full) throw new Error("expected limited range");
    expect(range.arcs).toHaveLength(2);
    // θ2 = 0 is inside the excluded fold zone: circles are contained
    const res = solveFourBar(cfg, 0, { branch: 1 });
    expect(res.ok).toBe(false);
    expect(range.arcs.some((a) => angleInArc(0, a))).toBe(false);
  });

  it("returns empty arcs when the linkage can never assemble", () => {
    const cfg = config({ O4: vec(100, 0), crankLen: 10, couplerLen: 20, rockerLen: 20 });
    const range = inputRange(cfg);
    if (range.full) throw new Error("expected limited range");
    expect(range.arcs).toHaveLength(0);
    for (const theta of [0, 1, 2, 3, 4, 5, 6]) {
      expect(solveFourBar(cfg, theta, { branch: 1 }).ok).toBe(false);
    }
  });

  it("clamps an out-of-range angle to the nearest limit", () => {
    const cfg = config({ O4: vec(100, 0), crankLen: 60, couplerLen: 60, rockerLen: 40 });
    const range = inputRange(cfg);
    const clamped = clampToRange(Math.PI, range);
    expect(Math.abs(clamped)).toBeCloseTo(Math.acos(0.3), 10);
    // in-range angles pass through untouched
    expect(clampToRange(0.5, range)).toBe(0.5);
  });
});

describe("traceCouplerCurve", () => {
  it("produces a closed, finite curve for a crank-rocker", () => {
    const cfg = config({
      O4: vec(100, 0),
      crankLen: 40,
      couplerLen: 120,
      rockerLen: 80,
      couplerPoint: { u: 60, v: 45 },
    });
    const curve = traceCouplerCurve(cfg, { steps: 360 });
    expect(curve.closed).toBe(true);
    expect(curve.points.length).toBe(361);
    for (const p of curve.points) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(dist(curve.points[0], curve.points.at(-1)!)).toBeLessThan(1e-9);
  });

  it("traces out-and-back across both branches for a swaying input", () => {
    const cfg = config({
      O4: vec(100, 0),
      crankLen: 60,
      couplerLen: 60,
      rockerLen: 40,
      couplerPoint: { u: 30, v: 20 },
    });
    const curve = traceCouplerCurve(cfg, { steps: 240 });
    expect(curve.closed).toBe(true);
    expect(curve.points.length).toBeGreaterThan(200);
    for (const p of curve.points) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("returns an empty curve when the linkage cannot assemble", () => {
    const cfg = config({ O4: vec(100, 0), crankLen: 10, couplerLen: 20, rockerLen: 20 });
    const curve = traceCouplerCurve(cfg);
    expect(curve.points).toHaveLength(0);
    expect(curve.closed).toBe(false);
  });
});

describe("degenerate inputs return typed failures, never NaN", () => {
  it.each([
    ["zero crank", config({ crankLen: 0 })],
    ["negative coupler", config({ couplerLen: -5 })],
    ["NaN rocker", config({ rockerLen: Number.NaN })],
    ["coincident pivots", config({ O4: vec(0, 0) })],
  ])("%s", (_name, cfg) => {
    const res = solveFourBar(cfg, 1.1, { branch: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("degenerate");
      if (res.A) {
        expect(Number.isFinite(res.A.x) && Number.isFinite(res.A.y)).toBe(true);
      }
    }
  });
});