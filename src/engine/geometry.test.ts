import { describe, expect, it } from "vitest";
import { circleCircleIntersection, lineCircleIntersection } from "./geometry";
import { vec } from "./vec";

const SQRT3_2 = Math.sqrt(3) / 2;

describe("circleCircleIntersection", () => {
  it("finds both intersections of two unit circles at distance 1", () => {
    const res = circleCircleIntersection(vec(0, 0), 1, vec(1, 0), 1);
    if (res.kind !== "two") throw new Error(`expected two, got ${res.kind}`);
    // p1 is on the CCW (left) side of the center line c1→c2 (+x), i.e. +y
    expect(res.p1.x).toBeCloseTo(0.5, 12);
    expect(res.p1.y).toBeCloseTo(SQRT3_2, 12);
    expect(res.p2.x).toBeCloseTo(0.5, 12);
    expect(res.p2.y).toBeCloseTo(-SQRT3_2, 12);
  });

  it("detects external tangency", () => {
    const res = circleCircleIntersection(vec(0, 0), 1, vec(2, 0), 1);
    if (res.kind !== "tangent") throw new Error(`expected tangent, got ${res.kind}`);
    expect(res.p.x).toBeCloseTo(1, 12);
    expect(res.p.y).toBeCloseTo(0, 12);
  });

  it("detects internal tangency", () => {
    const res = circleCircleIntersection(vec(0, 0), 3, vec(1, 0), 2);
    if (res.kind !== "tangent") throw new Error(`expected tangent, got ${res.kind}`);
    expect(res.p.x).toBeCloseTo(3, 12);
    expect(res.p.y).toBeCloseTo(0, 12);
  });

  it("reports circles apart", () => {
    const res = circleCircleIntersection(vec(0, 0), 1, vec(5, 0), 1);
    expect(res).toEqual({ kind: "none", separation: "apart" });
  });

  it("reports containment", () => {
    const res = circleCircleIntersection(vec(0, 0), 5, vec(1, 0), 1);
    expect(res).toEqual({ kind: "none", separation: "contained" });
  });

  it("reports coincident circles", () => {
    const res = circleCircleIntersection(vec(2, 3), 4, vec(2, 3), 4);
    expect(res.kind).toBe("coincident");
  });

  it("never produces NaN coordinates", () => {
    // barely-tangent configuration prone to negative h² from rounding
    const res = circleCircleIntersection(vec(0, 0), 1, vec(2 - 1e-12, 0), 1);
    if (res.kind === "two") {
      expect(Number.isFinite(res.p1.x + res.p1.y + res.p2.x + res.p2.y)).toBe(true);
    } else if (res.kind === "tangent") {
      expect(Number.isFinite(res.p.x + res.p.y)).toBe(true);
    }
  });
});

describe("lineCircleIntersection", () => {
  it("finds two crossings with ordered parameters", () => {
    const res = lineCircleIntersection(vec(-5, 0), vec(1, 0), vec(0, 0), 2);
    if (res.kind !== "two") throw new Error(`expected two, got ${res.kind}`);
    expect(res.t1).toBeCloseTo(3, 12);
    expect(res.p1.x).toBeCloseTo(-2, 12);
    expect(res.t2).toBeCloseTo(7, 12);
    expect(res.p2.x).toBeCloseTo(2, 12);
    expect(res.t1).toBeLessThan(res.t2);
  });

  it("detects tangency", () => {
    const res = lineCircleIntersection(vec(-5, 2), vec(1, 0), vec(0, 0), 2);
    if (res.kind !== "tangent") throw new Error(`expected tangent, got ${res.kind}`);
    expect(res.p.x).toBeCloseTo(0, 9);
    expect(res.p.y).toBeCloseTo(2, 12);
  });

  it("reports a miss", () => {
    const res = lineCircleIntersection(vec(-5, 3), vec(1, 0), vec(0, 0), 2);
    expect(res.kind).toBe("none");
  });

  it("scales t by the direction length", () => {
    const res = lineCircleIntersection(vec(-5, 0), vec(2, 0), vec(0, 0), 2);
    if (res.kind !== "two") throw new Error(`expected two, got ${res.kind}`);
    expect(res.t1).toBeCloseTo(1.5, 12);
    expect(res.t2).toBeCloseTo(3.5, 12);
  });

  it("treats a zero direction as no intersection", () => {
    const res = lineCircleIntersection(vec(0, 0), vec(0, 0), vec(0, 0), 2);
    expect(res.kind).toBe("none");
  });
});