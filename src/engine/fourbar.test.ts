import { describe, expect, it } from "vitest";
import {
  classifyFourBar,
  classifyGrashof,
  fourBarFromLengths,
  fourBarInputRange,
  groundAngle,
  isInputAngleReachable,
  solveFourBar,
  traceCouplerCurve,
  type FourBarBranch,
  type FourBarConfig,
} from "./fourbar";
import { add, angleOf, degToRad, dist, fromAngle, len, scale, sub, vec2, type Vec2 } from "./vec2";

/**
 * Independent reference solve using the angle (law-of-cosines) formulation —
 * a different derivation from the production circle-circle solver, so the
 * two act as cross-checks on each other.
 */
function referenceSolveB(config: FourBarConfig, theta2: number, branch: FourBarBranch): Vec2 | null {
  const a = add(config.o2, scale(fromAngle(theta2), config.crankLen));
  const dVec = sub(config.o4, a);
  const d = len(dVec);
  const r3 = config.couplerLen;
  const r4 = config.rockerLen;
  if (d > r3 + r4 || d < Math.abs(r3 - r4) || d === 0) return null;
  const cosBeta = (r3 * r3 + d * d - r4 * r4) / (2 * r3 * d);
  const beta = Math.acos(Math.min(1, Math.max(-1, cosBeta)));
  const base = angleOf(dVec);
  const angle = branch === "open" ? base + beta : base - beta;
  return add(a, scale(fromAngle(angle), r3));
}

/** Crank-rocker used throughout: Grashof, shortest link = input crank. */
const crankRocker: FourBarConfig = fourBarFromLengths({
  groundLen: 100,
  crankLen: 30,
  couplerLen: 100,
  rockerLen: 80,
  couplerPoint: { u: 50, v: 35 },
});

describe("solveFourBar — known configurations", () => {
  it("matches an exact hand-computed pose (symmetric linkage)", () => {
    // Ground 40, crank 10, coupler 30 = rocker 30, theta2 = 0:
    // A = (10, 0); circles (10,0) r30 and (40,0) r30 meet at (25, +-15*sqrt(3)).
    const config = fourBarFromLengths({
      groundLen: 40,
      crankLen: 10,
      couplerLen: 30,
      rockerLen: 30,
    });
    const open = solveFourBar(config, 0, { branch: "open" });
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect(open.a.x).toBeCloseTo(10, 12);
    expect(open.a.y).toBeCloseTo(0, 12);
    expect(open.b.x).toBeCloseTo(25, 12);
    expect(open.b.y).toBeCloseTo(15 * Math.sqrt(3), 12);
    expect(open.branch).toBe("open");

    const crossed = solveFourBar(config, 0, { branch: "crossed" });
    expect(crossed.ok).toBe(true);
    if (!crossed.ok) return;
    expect(crossed.b.x).toBeCloseTo(25, 12);
    expect(crossed.b.y).toBeCloseTo(-15 * Math.sqrt(3), 12);
  });

  it("places the coupler point exactly (hand-computed with offset)", () => {
    // Same symmetric linkage; coupler axis from A=(10,0) to B=(25, 15*sqrt(3))
    // is the unit vector (1/2, sqrt(3)/2). With u=15, v=10:
    // P = A + 15*axis + 10*perp(axis) = (17.5 - 5*sqrt(3), 5 + 7.5*sqrt(3)).
    const config = fourBarFromLengths({
      groundLen: 40,
      crankLen: 10,
      couplerLen: 30,
      rockerLen: 30,
      couplerPoint: { u: 15, v: 10 },
    });
    const pose = solveFourBar(config, 0);
    expect(pose.ok).toBe(true);
    if (!pose.ok) return;
    expect(pose.p.x).toBeCloseTo(17.5 - 5 * Math.sqrt(3), 12);
    expect(pose.p.y).toBeCloseTo(5 + 7.5 * Math.sqrt(3), 12);
  });

  it("keeps the coupler point on segment AB when v = 0", () => {
    const config: FourBarConfig = { ...crankRocker, couplerPoint: { u: 40, v: 0 } };
    const pose = solveFourBar(config, degToRad(70));
    expect(pose.ok).toBe(true);
    if (!pose.ok) return;
    expect(dist(pose.a, pose.p)).toBeCloseTo(40, 9);
    expect(dist(pose.a, pose.p) + dist(pose.p, pose.b)).toBeCloseTo(config.couplerLen, 9);
  });

  it("agrees with the independent angle-method reference on both branches", () => {
    for (const branch of ["open", "crossed"] as const) {
      for (let deg = 0; deg < 360; deg += 3) {
        const theta2 = degToRad(deg);
        const result = solveFourBar(crankRocker, theta2, { branch });
        const ref = referenceSolveB(crankRocker, theta2, branch);
        expect(result.ok).toBe(true);
        expect(ref).not.toBeNull();
        if (!result.ok || !ref) continue;
        expect(result.b.x).toBeCloseTo(ref.x, 9);
        expect(result.b.y).toBeCloseTo(ref.y, 9);
      }
    }
  });

  it("satisfies the link-length constraints at every reachable angle", () => {
    for (let deg = 0; deg < 360; deg += 1) {
      const result = solveFourBar(crankRocker, degToRad(deg));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(dist(result.a, crankRocker.o2)).toBeCloseTo(crankRocker.crankLen, 9);
      expect(dist(result.b, result.a)).toBeCloseTo(crankRocker.couplerLen, 9);
      expect(dist(result.b, crankRocker.o4)).toBeCloseTo(crankRocker.rockerLen, 9);
    }
  });

  it("solves correctly when the mechanism is translated and rotated in the world", () => {
    const moved = fourBarFromLengths({
      groundLen: 100,
      crankLen: 30,
      couplerLen: 100,
      rockerLen: 80,
      couplerPoint: { u: 50, v: 35 },
      origin: vec2(-250, 130),
      groundAngleRad: degToRad(25),
    });
    for (let deg = 0; deg < 360; deg += 15) {
      const result = solveFourBar(moved, degToRad(deg));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(dist(result.b, result.a)).toBeCloseTo(100, 9);
      expect(dist(result.b, moved.o4)).toBeCloseTo(80, 9);
    }
  });

  it("reports a transmission angle in [0, PI/2]", () => {
    for (let deg = 0; deg < 360; deg += 5) {
      const result = solveFourBar(crankRocker, degToRad(deg));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.transmissionAngle).toBeGreaterThanOrEqual(0);
      expect(result.transmissionAngle).toBeLessThanOrEqual(Math.PI / 2 + 1e-12);
    }
  });
});

describe("solveFourBar — branch continuity", () => {
  it("never jumps discontinuously across a full 360-degree sweep", () => {
    const steps = 720;
    let prevB: Vec2 | undefined;
    let first: Vec2 | undefined;
    let maxStep = 0;
    for (let i = 0; i <= steps; i++) {
      const theta2 = (2 * Math.PI * i) / steps;
      const result = solveFourBar(crankRocker, theta2, { prevB });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      if (prevB) maxStep = Math.max(maxStep, dist(result.b, prevB));
      if (!first) first = result.b;
      prevB = result.b;
    }
    // A branch flip would jump ~2h (tens of mm); smooth motion at 0.5 deg
    // steps moves B a fraction of a millimetre.
    expect(maxStep).toBeLessThan(5);
    // Closure: after a full revolution B returns to its start.
    expect(prevB).toBeDefined();
    expect(first).toBeDefined();
    if (prevB && first) expect(dist(prevB, first)).toBeLessThan(1e-9);
  });

  it("holds the crossed branch across a sweep when started there", () => {
    let prev = solveFourBar(crankRocker, 0, { branch: "crossed" });
    expect(prev.ok).toBe(true);
    for (let i = 1; i <= 720; i++) {
      const theta2 = (2 * Math.PI * i) / 720;
      const result = solveFourBar(crankRocker, theta2, {
        prevB: prev.ok ? prev.b : undefined,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("crossed");
        prev = result;
      }
    }
  });
});

describe("classifyGrashof", () => {
  it("classifies a crank-rocker (shortest = input crank)", () => {
    const res = classifyGrashof({ groundLen: 6, crankLen: 2, couplerLen: 7, rockerLen: 9 });
    expect(res.class).toBe("crank-rocker");
    expect(res.isGrashof).toBe(true);
    expect(res.shortest).toBe("crank");
    expect(res.inputRotatesFully).toBe(true);
    expect(res.fullyRotating).toEqual(["crank"]);
  });

  it("classifies a double-crank / drag-link (shortest = ground)", () => {
    const res = classifyGrashof({ groundLen: 2, crankLen: 6, couplerLen: 7, rockerLen: 9 });
    expect(res.class).toBe("double-crank");
    expect(res.isGrashof).toBe(true);
    expect(res.inputRotatesFully).toBe(true);
    expect(res.fullyRotating).toEqual(["crank", "rocker"]);
  });

  it("classifies a Grashof double-rocker (shortest = coupler)", () => {
    const res = classifyGrashof({ groundLen: 6, crankLen: 7, couplerLen: 2, rockerLen: 9 });
    expect(res.class).toBe("grashof-double-rocker");
    expect(res.isGrashof).toBe(true);
    expect(res.inputRotatesFully).toBe(false);
    expect(res.fullyRotating).toEqual(["coupler"]);
  });

  it("classifies a crank-rocker seen from the other side (shortest = output)", () => {
    const res = classifyGrashof({ groundLen: 6, crankLen: 7, couplerLen: 9, rockerLen: 2 });
    expect(res.class).toBe("crank-rocker");
    expect(res.inputRotatesFully).toBe(false);
    expect(res.fullyRotating).toEqual(["rocker"]);
  });

  it("classifies the change point (s + l == p + q), e.g. a parallelogram", () => {
    const res = classifyGrashof({ groundLen: 6, crankLen: 3, couplerLen: 6, rockerLen: 3 });
    expect(res.class).toBe("change-point");
    expect(res.isGrashof).toBe(true);
  });

  it("classifies a non-Grashof triple rocker", () => {
    const res = classifyGrashof({ groundLen: 5, crankLen: 4, couplerLen: 4.5, rockerLen: 9 });
    expect(res.class).toBe("triple-rocker");
    expect(res.isGrashof).toBe(false);
    expect(res.inputRotatesFully).toBe(false);
    expect(res.fullyRotating).toEqual([]);
  });

  it("flags a linkage that cannot assemble (one link too long)", () => {
    const res = classifyGrashof({ groundLen: 1, crankLen: 1, couplerLen: 1, rockerLen: 10 });
    expect(res.class).toBe("non-assemblable");
    expect(res.isGrashof).toBe(false);
  });

  it("flags invalid lengths", () => {
    expect(classifyGrashof({ groundLen: 0, crankLen: 1, couplerLen: 1, rockerLen: 1 }).class).toBe(
      "invalid",
    );
    expect(classifyGrashof({ groundLen: 1, crankLen: -2, couplerLen: 1, rockerLen: 1 }).class).toBe(
      "invalid",
    );
    expect(
      classifyGrashof({ groundLen: 1, crankLen: NaN, couplerLen: 1, rockerLen: 1 }).class,
    ).toBe("invalid");
  });

  it("classifies from a world-positioned config", () => {
    expect(classifyFourBar(crankRocker).class).toBe("crank-rocker");
  });
});

describe("fourBarInputRange", () => {
  /** Triple rocker: ground 100, crank 60, coupler 40, rocker 40. */
  const rocker = fourBarFromLengths({
    groundLen: 100,
    crankLen: 60,
    couplerLen: 40,
    rockerLen: 40,
  });

  it("reports full rotation for a crank-rocker", () => {
    expect(fourBarInputRange(crankRocker)).toEqual({ type: "full" });
  });

  it("computes the limited range of a triple rocker (hand-verified)", () => {
    // d^2 = 100^2 + 60^2 - 2*100*60*cos(rel); assembly needs d <= 80:
    // cos(rel) >= (13600 - 6400) / 12000 = 0.6 -> |rel| <= acos(0.6).
    const range = fourBarInputRange(rocker);
    expect(range.type).toBe("limited");
    if (range.type !== "limited") return;
    expect(range.minAbs).toBeCloseTo(0, 12);
    expect(range.maxAbs).toBeCloseTo(Math.acos(0.6), 12);
  });

  it("agrees with the solver at and beyond the limits", () => {
    const limit = Math.acos(0.6);
    const inside = limit - 1e-3;
    const outside = limit + 1e-3;
    expect(solveFourBar(rocker, inside).ok).toBe(true);
    expect(solveFourBar(rocker, -inside).ok).toBe(true);
    const beyond = solveFourBar(rocker, outside);
    expect(beyond.ok).toBe(false);
    if (!beyond.ok) expect(beyond.reason).toBe("unreachable");
    expect(isInputAngleReachable(rocker, inside)).toBe(true);
    expect(isInputAngleReachable(rocker, outside)).toBe(false);
  });

  it("measures the range relative to the ground direction", () => {
    const rotated = fourBarFromLengths({
      groundLen: 100,
      crankLen: 60,
      couplerLen: 40,
      rockerLen: 40,
      groundAngleRad: degToRad(90),
    });
    const limit = Math.acos(0.6);
    expect(groundAngle(rotated)).toBeCloseTo(degToRad(90), 12);
    expect(solveFourBar(rotated, degToRad(90)).ok).toBe(true);
    expect(solveFourBar(rotated, degToRad(90) + limit - 1e-3).ok).toBe(true);
    expect(solveFourBar(rotated, degToRad(90) + limit + 1e-3).ok).toBe(false);
  });

  it("reports none when no angle assembles", () => {
    // Coupler + rocker can never reach the crank circle:
    // d ranges over [40, 160]; r3 + r4 = 30 < 40.
    const config = fourBarFromLengths({
      groundLen: 100,
      crankLen: 60,
      couplerLen: 15,
      rockerLen: 15,
    });
    expect(fourBarInputRange(config)).toEqual({ type: "none" });
    expect(solveFourBar(config, 1.23).ok).toBe(false);
  });
});

describe("solveFourBar — degenerate and unreachable inputs", () => {
  it("returns typed unreachable results with a finite crank pin, never NaN", () => {
    const rocker = fourBarFromLengths({
      groundLen: 100,
      crankLen: 60,
      couplerLen: 40,
      rockerLen: 40,
    });
    for (let deg = 0; deg < 360; deg += 1) {
      const result = solveFourBar(rocker, degToRad(deg));
      if (result.ok) {
        for (const v of [result.a, result.b, result.p]) {
          expect(Number.isFinite(v.x)).toBe(true);
          expect(Number.isFinite(v.y)).toBe(true);
        }
      } else {
        expect(result.reason).toBe("unreachable");
        expect(result.a).toBeDefined();
        if (result.a) {
          expect(Number.isFinite(result.a.x)).toBe(true);
          expect(Number.isFinite(result.a.y)).toBe(true);
        }
      }
    }
  });

  it("rejects non-positive link lengths as degenerate", () => {
    const bad = fourBarFromLengths({ groundLen: 100, crankLen: 0, couplerLen: 40, rockerLen: 40 });
    const result = solveFourBar(bad, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("degenerate");
  });

  it("rejects coincident ground pivots as degenerate", () => {
    const bad: FourBarConfig = {
      o2: vec2(5, 5),
      o4: vec2(5, 5),
      crankLen: 30,
      couplerLen: 40,
      rockerLen: 40,
      couplerPoint: { u: 0, v: 0 },
    };
    const result = solveFourBar(bad, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("degenerate");
  });

  it("rejects a non-finite input angle as degenerate", () => {
    const result = solveFourBar(crankRocker, NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("degenerate");
  });

  it("treats A landing on O4 with equal coupler and rocker as degenerate (coincident circles)", () => {
    const config = fourBarFromLengths({
      groundLen: 10,
      crankLen: 10,
      couplerLen: 5,
      rockerLen: 5,
    });
    const result = solveFourBar(config, 0); // A = (10, 0) = O4
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("degenerate");
  });
});

describe("coupler curve reference dump", () => {
  it("matches the frozen reference set of points", () => {
    // Reference coupler-curve for the standard crank-rocker above
    // (ground 100, crank 30, coupler 100, rocker 80, P at u=50, v=35),
    // open branch. The deg-0 point is hand-verifiable: A=(30,0), circles
    // (30,0) r100 and (100,0) r80 meet at B=(90.714.., 79.459..), giving
    // P=(32.546.., 60.979..). Any solver regression shows up here.
    const reference = [
      { deg: 0, x: 32.546398531, y: 60.979634752 },
      { deg: 30, x: 41.246825641, y: 74.0927009 },
      { deg: 60, x: 38.173324672, y: 82.443112611 },
      { deg: 90, x: 26.4564411, y: 85.000515673 },
      { deg: 120, x: 11.423931943, y: 80.996903569 },
      { deg: 150, x: -2.413444787, y: 71.299036884 },
      { deg: 180, x: -12.10486522, y: 58.350356907 },
      { deg: 210, x: -16.291491796, y: 45.258759037 },
      { deg: 240, x: -14.793722974, y: 35.051667379 },
      { deg: 270, x: -8.188025691, y: 30.481040296 },
      { deg: 300, x: 2.64637268, y: 33.788694066 },
      { deg: 330, x: 17.036916915, y: 45.373898607 },
    ];
    for (const { deg, x, y } of reference) {
      const result = solveFourBar(crankRocker, degToRad(deg));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      // Fixture is rounded to 9 decimals; allow 5e-8.
      expect(result.p.x).toBeCloseTo(x, 7);
      expect(result.p.y).toBeCloseTo(y, 7);
    }
  });
});

describe("traceCouplerCurve", () => {
  it("produces a fully reachable, continuous closed curve for a crank-rocker", () => {
    const samples = traceCouplerCurve(crankRocker, { steps: 360 });
    expect(samples).toHaveLength(360);
    let prev: Vec2 | undefined;
    for (const s of samples) {
      expect(s.result.ok).toBe(true);
      if (!s.result.ok) continue;
      if (prev) expect(dist(s.result.p, prev)).toBeLessThan(10);
      prev = s.result.p;
    }
  });

  it("keeps unreachable spans in the output for a limited rocker", () => {
    const rocker = fourBarFromLengths({
      groundLen: 100,
      crankLen: 60,
      couplerLen: 40,
      rockerLen: 40,
    });
    const samples = traceCouplerCurve(rocker, { steps: 360 });
    expect(samples).toHaveLength(360);
    const reachable = samples.filter((s) => s.result.ok).length;
    const unreachable = samples.filter(
      (s) => !s.result.ok && s.result.reason === "unreachable",
    ).length;
    expect(reachable).toBeGreaterThan(0);
    expect(unreachable).toBeGreaterThan(0);
    expect(reachable + unreachable).toBe(360);
    // acos(0.6) ~ 53.13 deg each side -> ~106/360 of the circle reachable.
    expect(reachable).toBeGreaterThan(90);
    expect(reachable).toBeLessThan(120);
  });
});