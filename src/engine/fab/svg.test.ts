import { describe, expect, it } from "vitest";
import { vec } from "../vec";
import type { FourBarConfig } from "../mechanisms/fourbar";
import { defaultFabSettings, fabricationPlan } from "./parts";
import { layoutParts } from "./layout";
import { contourToPathD, curveToSvg, sheetToSvg } from "./svg";
import { roundedBarContour } from "./contour";

const fourBar: FourBarConfig = {
  O2: vec(-40, 0),
  O4: vec(50, 0),
  crankLen: 40,
  couplerLen: 100,
  rockerLen: 70,
  couplerPoint: { u: 55, v: 40 },
};

describe("sheetToSvg", () => {
  const s = defaultFabSettings();
  const plan = fabricationPlan({ kind: "fourbar", config: fourBar }, s);
  const svg = sheetToSvg(plan, s);

  it("is true to scale: mm size equals viewBox units", () => {
    const m = svg.match(
      /width="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/,
    )!;
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeCloseTo(Number(m[3]), 9);
    expect(Number(m[2])).toBeCloseTo(Number(m[4]), 9);
  });

  it("draws one cut path per part", () => {
    const paths = svg.match(/<path id="/g)!;
    expect(paths).toHaveLength(plan.parts.length);
    for (const part of plan.parts) {
      expect(svg).toContain(`<path id="${part.id}"`);
    }
  });

  it("emits every bore as exact arcs of the bore radius", () => {
    // Bore radius 1.6 → 'A 1.6 1.6' pairs; 2 arcs per bore.
    const boreArcs = svg.match(/A 1\.6 1\.6 /g)!;
    const holeCount = plan.parts.reduce((acc, p) => acc + p.holes.length, 0);
    expect(boreArcs.length).toBe(2 * holeCount);
  });

  it("hole centre spacing on the sheet equals the link length", () => {
    // The crank path: parse its two bore subpaths' first arc start points
    // ("M x y A ..."), which sit at (cx − r, cy): spacing = |Δcentre|.
    const crank = plan.parts.find((p) => p.id === "crank")!;
    const path = svg.match(new RegExp(`<path id="crank" d="([^"]+)"`))![1];
    const bores = [...path.matchAll(/M ([\d.-]+) ([\d.-]+) A 1\.6/g)].map((m) => ({
      x: Number(m[1]) + 1.6,
      y: Number(m[2]),
    }));
    expect(bores).toHaveLength(2);
    const d = Math.hypot(bores[1].x - bores[0].x, bores[1].y - bores[0].y);
    expect(d).toBeCloseTo(crank.span, 3);
  });

  it("labels ride on a separate reference layer that can be disabled", () => {
    expect(svg).toContain("<text");
    const bare = sheetToSvg(plan, s, { labels: false });
    expect(bare).not.toContain("<text");
  });

  it("respects a precomputed layout", () => {
    const layout = layoutParts(plan.parts, s.spacing);
    const again = sheetToSvg(plan, s, { layout });
    expect(again).toBe(svg);
  });
});

describe("contourToPathD", () => {
  it("flips Y and closes the path", () => {
    const d = contourToPathD(roundedBarContour(0, 10, 4, 0), 0, 0);
    // Square-ended bar: pure lines, closed.
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    expect(d).not.toContain("A ");
    // Local y = −2 (bottom edge) maps to +2 after the flip about y = 0.
    expect(d).toContain("2");
  });
});

describe("curveToSvg", () => {
  it("exports a closed coupler curve at true scale with padding", () => {
    // A 40 × 20 mm ellipse-ish loop.
    const pts = Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return vec(20 * Math.cos(a), 10 * Math.sin(a));
    });
    const svg = curveToSvg(pts, true, { title: "test curve", padding: 5 })!;
    const m = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/)!;
    expect(Number(m[1])).toBeCloseTo(50, 6);
    expect(Number(m[2])).toBeCloseTo(30, 6);
    expect(svg).toContain(" Z");
    expect(svg).toContain("test curve");
  });

  it("leaves open curves open and rejects empty input", () => {
    const open = curveToSvg([vec(0, 0), vec(10, 5)], false)!;
    expect(open).not.toContain("Z");
    expect(curveToSvg([vec(0, 0)], false)).toBeNull();
  });
});