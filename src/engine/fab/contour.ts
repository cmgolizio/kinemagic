/**
 * Fabrication outlines. Framework-free — no React, no DOM.
 *
 * A part's outline is a closed `Contour`: a contiguous run of line and arc
 * segments in the part's local frame (mm, Y up). Keeping arcs symbolic means
 * the SVG export is *exact* — a bore measured in a vector editor is the true
 * circle, not a polygon — while the STL mesher tessellates the same contour
 * to any chord tolerance it likes.
 */

import { dist, vec, TWO_PI, type Vec2 } from "../vec";

export type ContourSeg =
  | { kind: "line"; a: Vec2; b: Vec2 }
  | {
      kind: "arc";
      c: Vec2;
      r: number;
      /** start angle, radians */
      a0: number;
      /** end angle, radians; sweep is (a1 − a0) in the `ccw` direction */
      a1: number;
      ccw: boolean;
    };

/** A closed loop of contiguous segments, wound CCW for outer boundaries. */
export interface Contour {
  segs: ContourSeg[];
}

export const segStart = (s: ContourSeg): Vec2 =>
  s.kind === "line" ? s.a : arcPoint(s, s.a0);

export const segEnd = (s: ContourSeg): Vec2 =>
  s.kind === "line" ? s.b : arcPoint(s, s.a1);

const arcPoint = (s: Extract<ContourSeg, { kind: "arc" }>, angle: number): Vec2 =>
  vec(s.c.x + s.r * Math.cos(angle), s.c.y + s.r * Math.sin(angle));

/** Signed sweep of an arc, positive CCW. */
export function arcSweep(s: Extract<ContourSeg, { kind: "arc" }>): number {
  let sweep = s.a1 - s.a0;
  if (s.ccw) {
    while (sweep < 0) sweep += TWO_PI;
  } else {
    while (sweep > 0) sweep -= TWO_PI;
  }
  return sweep;
}

/** A full circle as a contour (used for bores). CCW by default. */
export function circleContour(c: Vec2, r: number, ccw = true): Contour {
  const half: ContourSeg[] = ccw
    ? [
        { kind: "arc", c, r, a0: 0, a1: Math.PI, ccw: true },
        { kind: "arc", c, r, a0: Math.PI, a1: TWO_PI, ccw: true },
      ]
    : [
        { kind: "arc", c, r, a0: 0, a1: -Math.PI, ccw: false },
        { kind: "arc", c, r, a0: -Math.PI, a1: -TWO_PI, ccw: false },
      ];
  return { segs: half };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * Rounded bar in the local frame: material spans x ∈ [x0 − w/2, x1 + w/2],
 * y ∈ [−w/2, w/2], with end corners rounded by `fillet` ∈ [0, w/2]. At
 * fillet = w/2 the ends are full semicircles (a capsule / stadium).
 * Wound CCW.
 */
export function roundedBarContour(
  x0: number,
  x1: number,
  width: number,
  fillet: number,
): Contour {
  const h = width / 2;
  const f = Math.min(h, Math.max(0, fillet));
  const left = x0 - h;
  const right = x1 + h;
  const segs: ContourSeg[] = [];
  const line = (a: Vec2, b: Vec2) => {
    if (dist(a, b) > 1e-9) segs.push({ kind: "line", a, b });
  };
  const corner = (cx: number, cy: number, a0: number, a1: number) => {
    if (f > 1e-9) segs.push({ kind: "arc", c: vec(cx, cy), r: f, a0, a1, ccw: true });
  };

  // Start on the bottom edge, run CCW.
  line(vec(left + f, -h), vec(right - f, -h));
  corner(right - f, -h + f, -Math.PI / 2, 0);
  line(vec(right, -h + f), vec(right, h - f));
  corner(right - f, h - f, 0, Math.PI / 2);
  line(vec(right - f, h), vec(left + f, h));
  corner(left + f, h - f, Math.PI / 2, Math.PI);
  line(vec(left, h - f), vec(left, -h + f));
  corner(left + f, -h + f, Math.PI, Math.PI * 1.5);
  return { segs };
}

/**
 * Rounded plate: the convex hull of discs of radius `margin` centred on
 * `points` (≥ 3, not all collinear). This is the natural triangular coupler
 * plate — straight edges tangent to the corner discs, corner arcs of radius
 * `margin`. Wound CCW.
 */
export function roundedPlateContour(points: Vec2[], margin: number): Contour | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  const r = Math.max(0, margin);
  const n = hull.length;
  const segs: ContourSeg[] = [];

  // Outward normal of each CCW hull edge (interior is to the left).
  const normals: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % n];
    const len = dist(p, q);
    normals.push(vec((q.y - p.y) / len, -(q.x - p.x) / len));
  }

  for (let i = 0; i < n; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % n];
    const nrm = normals[i];
    segs.push({
      kind: "line",
      a: vec(p.x + nrm.x * r, p.y + nrm.y * r),
      b: vec(q.x + nrm.x * r, q.y + nrm.y * r),
    });
    // Corner arc at q, from this edge's normal to the next edge's normal.
    const next = normals[(i + 1) % n];
    const a0 = Math.atan2(nrm.y, nrm.x);
    let a1 = Math.atan2(next.y, next.x);
    while (a1 < a0) a1 += TWO_PI;
    if (a1 - a0 > 1e-9 && r > 1e-9) {
      segs.push({ kind: "arc", c: q, r, a0, a1, ccw: true });
    }
  }
  return { segs };
}

/** Convex hull (Andrew's monotone chain), CCW. Collinear points dropped. */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  // Drop exact duplicates.
  const uniq: Vec2[] = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (!last || dist(last, p) > 1e-9) uniq.push(p);
  }
  if (uniq.length < 3) return uniq;

  const crossZ = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Vec2[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9)
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  return hull.length >= 3 ? hull : [];
}

// ---------------------------------------------------------------------------
// Interrogation
// ---------------------------------------------------------------------------

/**
 * Tessellate a contour into a polygon. `chordTol` bounds the sagitta of every
 * arc chord (mm). Consecutive duplicate points are merged; the closing point
 * is NOT repeated.
 */
export function tessellateContour(contour: Contour, chordTol = 0.05): Vec2[] {
  const out: Vec2[] = [];
  const push = (p: Vec2) => {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > 1e-9) out.push(p);
  };
  for (const seg of contour.segs) {
    if (seg.kind === "line") {
      push(seg.a);
      push(seg.b);
    } else {
      const sweep = arcSweep(seg);
      // Sagitta s = r(1 − cos(Δ/2)) ≤ tol  →  Δ ≤ 2·acos(1 − tol/r)
      const maxStep =
        seg.r > chordTol ? 2 * Math.acos(1 - chordTol / seg.r) : Math.PI / 4;
      const steps = Math.max(2, Math.ceil(Math.abs(sweep) / maxStep));
      for (let i = 0; i <= steps; i++) {
        const a = seg.a0 + (sweep * i) / steps;
        push(vec(seg.c.x + seg.r * Math.cos(a), seg.c.y + seg.r * Math.sin(a)));
      }
    }
  }
  // Drop the closing duplicate if the contour ended where it began.
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-9) out.pop();
  return out;
}

/** Signed area of a polygon (positive when CCW). */
export function polygonArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export interface Box {
  min: Vec2;
  max: Vec2;
}

/** Exact axis-aligned bounds of a contour (arc extremes included). */
export function contourBounds(contour: Contour): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const seg of contour.segs) {
    if (seg.kind === "line") {
      take(seg.a);
      take(seg.b);
    } else {
      take(segStart(seg));
      take(segEnd(seg));
      // Axis extremes the arc passes through.
      const sweep = arcSweep(seg);
      for (let k = -4; k <= 4; k++) {
        const axis = (k * Math.PI) / 2;
        const t = (axis - seg.a0) / sweep;
        if (Number.isFinite(t) && t > 0 && t < 1) {
          take(vec(seg.c.x + seg.r * Math.cos(axis), seg.c.y + seg.r * Math.sin(axis)));
        }
      }
    }
  }
  return { min: vec(minX, minY), max: vec(maxX, maxY) };
}