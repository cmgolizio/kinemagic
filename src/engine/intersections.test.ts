import { describe, expect, it } from "vitest";
import { circleCircleIntersection, lineCircleIntersection } from "./intersections";
import { vec2 } from "./vec2";

describe("circleCircleIntersection", () => {
  it("finds both intersections of two overlapping circles (hand-verified)", () => {
    // Circles r=5 at (0,0) and (8,0): chord at x=4, half-height h=3 (3-4-5).
    const res = circleCircleIntersection(vec2(0, 0), 5, vec2(8, 0), 5);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    expect(res.tangent).toBe(false);
    // points[0] is on the CCW side of the a->b direction (+y here).
    expect(res.points[0].x).toBeCloseTo(4, 12);
    expect(res.points[0].y).toBeCloseTo(3, 12);
    expect(res.points[1].x).toBeCloseTo(4, 12);
    expect(res.points[1].y).toBeCloseTo(-3, 12);
  });

  it("orders points deterministically when centers are swapped", () => {
    const res = circleCircleIntersection(vec2(8, 0), 5, vec2(0, 0), 5);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    // Direction is now -x, so the CCW side is -y.
    expect(res.points[0].y).toBeCloseTo(-3, 12);
    expect(res.points[1].y).toBeCloseTo(3, 12);
  });

  it("handles external tangency as a doubled point", () => {
    const res = circleCircleIntersection(vec2(0, 0), 2, vec2(5, 0), 3);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    expect(res.tangent).toBe(true);
    expect(res.points[0].x).toBeCloseTo(2, 12);
    expect(res.points[0].y).toBeCloseTo(0, 12);
    expect(res.points[1].x).toBeCloseTo(2, 12);
    expect(res.points[1].y).toBeCloseTo(0, 12);
  });

  it("handles internal tangency", () => {
    const res = circleCircleIntersection(vec2(0, 0), 5, vec2(2, 0), 3);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    expect(res.tangent).toBe(true);
    expect(res.points[0].x).toBeCloseTo(5, 12);
    expect(res.points[0].y).toBeCloseTo(0, 12);
  });

  it("classifies separate circles", () => {
    expect(circleCircleIntersection(vec2(0, 0), 1, vec2(10, 0), 2).type).toBe("separate");
  });

  it("classifies one circle contained in the other", () => {
    expect(circleCircleIntersection(vec2(0, 0), 5, vec2(1, 0), 1).type).toBe("contained");
  });

  it("classifies concentric circles of different radii as contained", () => {
    expect(circleCircleIntersection(vec2(3, 3), 5, vec2(3, 3), 2).type).toBe("contained");
  });

  it("classifies coincident circles", () => {
    expect(circleCircleIntersection(vec2(3, 3), 5, vec2(3, 3), 5).type).toBe("coincident");
  });

  it("intersection points lie on both circles across arbitrary configurations", () => {
    const cases = [
      { a: vec2(-3, 7), rA: 12, b: vec2(10, -2), rB: 9 },
      { a: vec2(0.5, 0.5), rA: 1.1, b: vec2(1.2, -0.3), rB: 0.9 },
      { a: vec2(100, 200), rA: 150, b: vec2(-40, 90), rB: 80 },
    ];
    for (const { a, rA, b, rB } of cases) {
      const res = circleCircleIntersection(a, rA, b, rB);
      expect(res.type).toBe("intersecting");
      if (res.type !== "intersecting") continue;
      for (const p of res.points) {
        expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeCloseTo(rA, 9);
        expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeCloseTo(rB, 9);
      }
    }
  });
});

describe("lineCircleIntersection", () => {
  it("finds both crossings of a secant line (hand-verified)", () => {
    const res = lineCircleIntersection(vec2(-10, 0), vec2(1, 0), vec2(0, 0), 5);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    expect(res.tangent).toBe(false);
    // Ordered by parameter t along the direction.
    expect(res.ts[0]).toBeCloseTo(5, 12);
    expect(res.ts[1]).toBeCloseTo(15, 12);
    expect(res.points[0].x).toBeCloseTo(-5, 12);
    expect(res.points[1].x).toBeCloseTo(5, 12);
  });

  it("handles tangency as a doubled point", () => {
    const res = lineCircleIntersection(vec2(-10, 5), vec2(1, 0), vec2(0, 0), 5);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    expect(res.tangent).toBe(true);
    expect(res.points[0].x).toBeCloseTo(0, 6);
    expect(res.points[0].y).toBeCloseTo(5, 12);
    expect(res.ts[0]).toBeCloseTo(res.ts[1], 9);
  });

  it("classifies a miss", () => {
    expect(lineCircleIntersection(vec2(-10, 6), vec2(1, 0), vec2(0, 0), 5).type).toBe("miss");
  });

  it("rejects a zero-length direction", () => {
    expect(lineCircleIntersection(vec2(0, 0), vec2(0, 0), vec2(1, 1), 5).type).toBe("degenerate");
  });

  it("reports ts in units of the direction length when unnormalized", () => {
    const res = lineCircleIntersection(vec2(-10, 0), vec2(2, 0), vec2(0, 0), 5);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    expect(res.ts[0]).toBeCloseTo(2.5, 12);
    expect(res.ts[1]).toBeCloseTo(7.5, 12);
  });

  it("intersection points lie on the circle for oblique lines", () => {
    const res = lineCircleIntersection(vec2(-7, 3), vec2(3, 1), vec2(2, 5), 6);
    expect(res.type).toBe("intersecting");
    if (res.type !== "intersecting") return;
    for (const p of res.points) {
      expect(Math.hypot(p.x - 2, p.y - 5)).toBeCloseTo(6, 9);
    }
  });
});