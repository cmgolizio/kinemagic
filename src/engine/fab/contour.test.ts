import { describe, expect, it } from "vitest";
import {
  contourBounds,
  convexHull,
  polygonArea,
  roundedBarContour,
  roundedPlateContour,
  segEnd,
  segStart,
  tessellateContour,
} from "./contour";
import { dist, vec } from "../vec";
import type { Contour } from "./contour";

const expectClosedAndContiguous = (c: Contour) => {
  for (let i = 0; i < c.segs.length; i++) {
    const end = segEnd(c.segs[i]);
    const next = segStart(c.segs[(i + 1) % c.segs.length]);
    expect(dist(end, next)).toBeLessThan(1e-9);
  }
};

describe("roundedBarContour", () => {
  it("builds a capsule at fillet = width/2 with exact bounds", () => {
    // Bar between holes at x = 0 and x = 80, 12 mm wide.
    const c = roundedBarContour(0, 80, 12, 6);
    expectClosedAndContiguous(c);
    const b = contourBounds(c);
    expect(b.min.x).toBeCloseTo(-6, 9);
    expect(b.max.x).toBeCloseTo(86, 9);
    expect(b.min.y).toBeCloseTo(-6, 9);
    expect(b.max.y).toBeCloseTo(6, 9);
  });

  it("matches the analytic capsule area when tessellated", () => {
    const L = 80;
    const w = 12;
    const c = roundedBarContour(0, L, w, w / 2);
    const poly = tessellateContour(c, 0.005);
    const area = polygonArea(poly);
    // Stadium: rect (L × w) + full circle of radius w/2.
    const exact = L * w + Math.PI * (w / 2) ** 2;
    expect(area).toBeGreaterThan(0); // CCW
    expect(Math.abs(area - exact) / exact).toBeLessThan(1e-3);
  });

  it("builds a rounded rectangle for fillet < width/2", () => {
    const c = roundedBarContour(0, 50, 10, 2);
    expectClosedAndContiguous(c);
    const poly = tessellateContour(c, 0.005);
    // Rounded rect 60 × 10 with corner radius 2.
    const exact = 60 * 10 - (4 - Math.PI) * 2 ** 2;
    expect(Math.abs(polygonArea(poly) - exact) / exact).toBeLessThan(1e-3);
  });

  it("handles square ends at fillet = 0", () => {
    const c = roundedBarContour(0, 50, 10, 0);
    expectClosedAndContiguous(c);
    expect(c.segs.every((s) => s.kind === "line")).toBe(true);
    const poly = tessellateContour(c);
    expect(polygonArea(poly)).toBeCloseTo(60 * 10, 6);
  });
});

describe("roundedPlateContour", () => {
  it("wraps a triangle of points with tangent lines and corner arcs", () => {
    const pts = [vec(0, 0), vec(60, 0), vec(20, 30)];
    const r = 6;
    const c = roundedPlateContour(pts, r)!;
    expect(c).not.toBeNull();
    expectClosedAndContiguous(c);
    const poly = tessellateContour(c, 0.005);
    // Hull-of-discs area = hull area + perimeter·r + πr².
    const hullArea = Math.abs(polygonArea(pts));
    const per =
      dist(pts[0], pts[1]) + dist(pts[1], pts[2]) + dist(pts[2], pts[0]);
    const exact = hullArea + per * r + Math.PI * r * r;
    expect(Math.abs(polygonArea(poly) - exact) / exact).toBeLessThan(1e-3);
  });

  it("returns null for collinear points", () => {
    expect(roundedPlateContour([vec(0, 0), vec(10, 0), vec(20, 0)], 5)).toBeNull();
  });
});

describe("convexHull", () => {
  it("finds the hull of a point cloud, CCW", () => {
    const hull = convexHull([
      vec(0, 0),
      vec(10, 0),
      vec(10, 10),
      vec(0, 10),
      vec(5, 5), // interior
      vec(5, 0), // on edge
    ]);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBeCloseTo(100, 9);
  });
});

describe("tessellateContour", () => {
  it("respects the chord tolerance on arcs", () => {
    const r = 6;
    const c = roundedBarContour(0, 40, 2 * r, r);
    const tol = 0.01;
    const poly = tessellateContour(c, tol);
    // Every point must lie within tol of the true outline: check the ends.
    for (const p of poly) {
      if (p.x < 0) {
        expect(Math.abs(dist(p, vec(0, 0)) - r)).toBeLessThan(tol + 1e-9);
      } else if (p.x > 40) {
        expect(Math.abs(dist(p, vec(40, 0)) - r)).toBeLessThan(tol + 1e-9);
      }
    }
    // No consecutive duplicates, not closed.
    for (let i = 1; i < poly.length; i++) {
      expect(dist(poly[i - 1], poly[i])).toBeGreaterThan(1e-10);
    }
    expect(dist(poly[0], poly[poly.length - 1])).toBeGreaterThan(1e-10);
  });
});