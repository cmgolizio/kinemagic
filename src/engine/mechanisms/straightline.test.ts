import { describe, expect, it } from "vitest";
import {
  defaultPeaucellier,
  defaultWatt,
  fitLine,
  peaucellierInputRange,
  peaucellierK,
  peaucellierLine,
  solvePeaucellier,
  tracePeaucellier,
  type PeaucellierConfig,
} from "./straightline";
import { angleInArc, inputRange, solveFourBar, traceCouplerCurve } from "./fourbar";
import { dist, dot, sub, vec, type Vec2 } from "../vec";

describe("Peaucellier–Lipkin exact straight line", () => {
  it("output deviates from the true line by < 1e-9 mm across the full sweep", () => {
    const c = defaultPeaucellier();
    const line = peaucellierLine(c);
    const range = peaucellierInputRange(c);
    expect(range.full).toBe(false);
    if (range.full || range.arcs.length === 0) throw new Error("expected limited range");

    let solved = 0;
    for (const arc of range.arcs) {
      let span = arc.end - arc.start;
      if (span < 0) span += Math.PI * 2;
      for (let i = 1; i < 400; i++) {
        const theta = arc.start + (i / 400) * span;
        const res = solvePeaucellier(c, theta);
        if (!res.ok) continue; // exact arc endpoints may fail on fp noise
        solved++;
        // Perpendicular distance from Q to the line.
        const n = vec(-line.dir.y, line.dir.x);
        expect(Math.abs(dot(sub(res.Q, line.point), n))).toBeLessThan(1e-9);
      }
    }
    expect(solved).toBeGreaterThan(350);
  });

  it("maintains the inversion identity |OP|·|OQ| = L² − s²", () => {
    const c = defaultPeaucellier();
    for (let i = -100; i <= 100; i++) {
      const res = solvePeaucellier(c, (i / 100) * 1.8); // inside the sweep
      if (!res.ok) continue;
      expect(dist(c.O, res.P) * dist(c.O, res.Q)).toBeCloseTo(peaucellierK(c), 8);
    }
  });

  it("keeps every bar at its length: arms L, all four cell sides s", () => {
    const c = defaultPeaucellier();
    const res = solvePeaucellier(c, 0.9);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(dist(c.O, res.armA)).toBeCloseTo(c.armLen, 9);
    expect(dist(c.O, res.armB)).toBeCloseTo(c.armLen, 9);
    for (const corner of [res.P, res.Q]) {
      expect(dist(corner, res.armA)).toBeCloseTo(c.cellSide, 9);
      expect(dist(corner, res.armB)).toBeCloseTo(c.cellSide, 9);
    }
    // Q is the reflection of P across the arm chord — verify it's the far
    // corner (a genuine rhombus, not P duplicated).
    expect(dist(res.P, res.Q)).toBeGreaterThan(1);
  });

  it("crank pivot sits exactly crankLen from the pole (the line condition)", () => {
    const c = defaultPeaucellier();
    const res = solvePeaucellier(c, 0.3);
    if (!res.ok) throw new Error("solve failed");
    expect(dist(res.C, c.O)).toBeCloseTo(c.crankLen, 12);
  });

  it("reports unreachable beyond the fold limits, never NaN", () => {
    const c = defaultPeaucellier();
    const range = peaucellierInputRange(c);
    if (range.full || range.arcs.length === 0) throw new Error("expected arcs");
    // The gap between arcs (crank pointing at the pole) must be unreachable.
    const res = solvePeaucellier(c, c.axisAngle + Math.PI);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("unreachable");
      expect(res.P && Number.isFinite(res.P.x + res.P.y)).toBe(true);
    }
    // And angles inside the arcs must solve.
    for (const arc of range.arcs) {
      const mid = arc.start + ((arc.end - arc.start + Math.PI * 2) % (Math.PI * 2)) / 2;
      expect(solvePeaucellier(c, mid).ok).toBe(true);
      expect(angleInArc(mid, arc)).toBe(true);
    }
  });

  it("trace produces a long, perfectly straight stroke", () => {
    const c = defaultPeaucellier();
    const t = tracePeaucellier(c, 300);
    expect(t.points.length).toBeGreaterThan(250);
    const fit = fitLine(t.points);
    expect(fit).not.toBeNull();
    if (!fit) return;
    expect(fit.maxDev).toBeLessThan(1e-6);
    expect(fit.length).toBeGreaterThan(100);
  });

  it.each([
    ["cell ≥ arm", { cellSide: 120 }],
    ["crank too short to open the cell", { crankLen: 20 }],
    ["negative arm", { armLen: -5 }],
  ])("returns typed degenerate for %s", (_name, over) => {
    const res = solvePeaucellier(
      { ...defaultPeaucellier(), ...(over as Partial<PeaucellierConfig>) },
      1,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("degenerate");
  });
});

describe("Watt's linkage approximate straight line", () => {
  it("is a swaying (non-Grashof) four-bar that assembles at its midpose", () => {
    const c = defaultWatt();
    const range = inputRange(c);
    expect(range.full).toBe(false);
    const mid = solveFourBar(c, Math.atan2(17.5, 60), { branch: 1 });
    expect(mid.ok).toBe(true);
  });

  it("coupler midpoint stays within 0.5 mm of a line for a > 60 mm run", () => {
    const c = defaultWatt();
    const trace = traceCouplerCurve(c, { steps: 480 });
    expect(trace.points.length).toBeGreaterThan(400);

    // Longest contiguous run within 0.5 mm of its own best-fit line.
    const pts = trace.points;
    let best: { count: number; length: number } = { count: 0, length: 0 };
    let i = 0;
    while (i < pts.length) {
      let j = i + 4;
      let lastGood: { count: number; length: number } | null = null;
      while (j <= pts.length) {
        const fit = fitLine(pts.slice(i, j));
        if (!fit || fit.maxDev > 0.5) break;
        lastGood = { count: j - i, length: fit.length };
        j += 2;
      }
      if (lastGood && lastGood.count > best.count) best = lastGood;
      i += 2;
    }
    expect(best.length).toBeGreaterThan(60);
  });
});

describe("fitLine", () => {
  it("recovers an exact line at any angle", () => {
    const pts: Vec2[] = [];
    for (let i = 0; i <= 50; i++) {
      pts.push(vec(3 + i * 0.7, -2 + i * 1.9));
    }
    const fit = fitLine(pts);
    if (!fit) throw new Error("fit failed");
    expect(fit.maxDev).toBeLessThan(1e-9);
    expect(fit.length).toBeCloseTo(Math.hypot(50 * 0.7, 50 * 1.9), 9);
  });

  it("reports deviation for off-line points", () => {
    const fit = fitLine([vec(0, 0), vec(10, 0), vec(5, 3)]);
    if (!fit) throw new Error("fit failed");
    expect(fit.maxDev).toBeGreaterThan(1);
  });
});