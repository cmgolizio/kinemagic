/**
 * STL export: extrude part outlines into watertight prisms and write binary
 * STL. No CAD kernel — the caps are 2D polygons-with-holes triangulated by
 * hole-bridging + ear clipping, and the walls are quad strips along the
 * tessellated boundary loops. Cap triangulation and walls share the exact
 * same boundary vertices, which is what makes the mesh watertight.
 */

import { vec, type Vec2 } from "../vec";
import { polygonArea, tessellateContour } from "./contour";
import type { FabPart } from "./parts";
import { layoutParts } from "./layout";

// ---------------------------------------------------------------------------
// Polygon-with-holes triangulation
// ---------------------------------------------------------------------------

const AREA_EPS = 1e-9;

interface TriInput {
  /** flat vertex list: outer loop then each hole loop */
  vertices: Vec2[];
  /** index ranges of each loop */
  loops: Array<{ start: number; count: number }>;
}

/**
 * Triangulate an outer CCW polygon with CW hole polygons. Returns index
 * triples into the combined vertex list (outer vertices first, then holes in
 * order). Triangles are wound CCW.
 */
export function triangulatePolygonWithHoles(
  outer: Vec2[],
  holes: Vec2[][],
): number[] {
  const input = buildInput(outer, holes);
  return earClip(input.vertices, bridgeHoles(input));
}

function buildInput(outer: Vec2[], holes: Vec2[][]): TriInput {
  const vertices: Vec2[] = [];
  const loops: TriInput["loops"] = [];
  const pushLoop = (poly: Vec2[], wantCcw: boolean) => {
    const ccw = polygonArea(poly) > 0;
    const ordered = ccw === wantCcw ? poly : [...poly].reverse();
    loops.push({ start: vertices.length, count: ordered.length });
    vertices.push(...ordered);
  };
  pushLoop(outer, true);
  for (const hole of holes) pushLoop(hole, false);
  return { vertices, loops };
}

/** Merge every hole into the outer loop with left-going bridge slits. */
function bridgeHoles(input: TriInput): number[] {
  const { vertices, loops } = input;
  let loop: number[] = [];
  for (let i = 0; i < loops[0].count; i++) loop.push(loops[0].start + i);

  // Left-to-right by each hole's leftmost vertex: a bridge cast toward −x
  // can then only meet geometry that is already part of the merged loop.
  const holeLoops = loops.slice(1).map((l) => {
    const idx: number[] = [];
    for (let i = 0; i < l.count; i++) idx.push(l.start + i);
    let leftmost = 0;
    for (let i = 1; i < idx.length; i++) {
      if (vertices[idx[i]].x < vertices[idx[leftmost]].x) leftmost = i;
    }
    return { idx, leftmost };
  });
  holeLoops.sort(
    (a, b) => vertices[a.idx[a.leftmost]].x - vertices[b.idx[b.leftmost]].x,
  );

  for (const hole of holeLoops) {
    const h = hole.idx[hole.leftmost];
    const bridge = findBridge(vertices, loop, vertices[h]);
    if (bridge < 0) continue; // unreachable hole; skip rather than corrupt
    // Splice: … bridge, h, h+1 … h−1, h, bridge, …
    const at = loop.indexOf(bridge);
    const holeRun: number[] = [];
    for (let i = 0; i <= hole.idx.length; i++) {
      holeRun.push(hole.idx[(hole.leftmost + i) % hole.idx.length]);
    }
    loop = [
      ...loop.slice(0, at + 1),
      ...holeRun,
      bridge,
      ...loop.slice(at + 1),
    ];
  }
  return loop;
}

/**
 * Pick a loop vertex to bridge the hole point `h` to: prefer near vertices
 * to the left of the hole whose connecting segment stays inside the merged
 * polygon and crosses no edge.
 */
function findBridge(vertices: Vec2[], loop: number[], h: Vec2): number {
  const candidates = loop
    .filter((i) => vertices[i].x <= h.x + 1e-12)
    .sort((a, b) => dist2(vertices[a], h) - dist2(vertices[b], h));

  for (const c of candidates) {
    const p = vertices[c];
    if (dist2(p, h) < 1e-18) continue;
    if (!segmentClearOfLoop(vertices, loop, h, p, c)) continue;
    const mid = vec((h.x + p.x) / 2, (h.y + p.y) / 2);
    if (!pointInLoop(vertices, loop, mid)) continue;
    return c;
  }
  return -1;
}

const dist2 = (a: Vec2, b: Vec2): number =>
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** Does segment a–b properly cross any loop edge (ignoring edges at `skip`)? */
function segmentClearOfLoop(
  vertices: Vec2[],
  loop: number[],
  a: Vec2,
  b: Vec2,
  skip: number,
): boolean {
  for (let i = 0; i < loop.length; i++) {
    const i0 = loop[i];
    const i1 = loop[(i + 1) % loop.length];
    if (i0 === skip || i1 === skip) continue;
    if (segmentsCross(a, b, vertices[i0], vertices[i1])) return false;
  }
  return true;
}

/** Proper intersection test (shared endpoints don't count). */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < -AREA_EPS && o3 * o4 < -AREA_EPS;
}

const orient = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Ray-cast point-in-polygon; bridge double-edges cancel out. */
function pointInLoop(vertices: Vec2[], loop: number[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0; i < loop.length; i++) {
    const a = vertices[loop[i]];
    const b = vertices[loop[(i + 1) % loop.length]];
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Ear-clip a simple (possibly slit) CCW polygon given as vertex indices. */
function earClip(vertices: Vec2[], loop: number[]): number[] {
  const tris: number[] = [];
  const work = [...loop];

  let guard = work.length * work.length + 16;
  while (work.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < work.length; i++) {
      const ia = work[(i + work.length - 1) % work.length];
      const ib = work[i];
      const ic = work[(i + 1) % work.length];
      const a = vertices[ia];
      const b = vertices[ib];
      const c = vertices[ic];
      const area = orient(a, b, c);
      if (area <= AREA_EPS) continue; // reflex or degenerate corner
      if (anyPointInTriangle(vertices, work, ia, ib, ic)) continue;
      tris.push(ia, ib, ic);
      work.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // Numerical dead end: drop the flattest corner and press on. With the
      // convex-outline shapes this exporter builds, this path never runs,
      // but never loop forever on hostile input.
      let flattest = 0;
      let best = Infinity;
      for (let i = 0; i < work.length; i++) {
        const a = vertices[work[(i + work.length - 1) % work.length]];
        const b = vertices[work[i]];
        const c = vertices[work[(i + 1) % work.length]];
        const m = Math.abs(orient(a, b, c));
        if (m < best) {
          best = m;
          flattest = i;
        }
      }
      work.splice(flattest, 1);
    }
  }
  if (work.length === 3) tris.push(work[0], work[1], work[2]);
  return tris;
}

function anyPointInTriangle(
  vertices: Vec2[],
  loop: number[],
  ia: number,
  ib: number,
  ic: number,
): boolean {
  const a = vertices[ia];
  const b = vertices[ib];
  const c = vertices[ic];
  for (const i of loop) {
    if (i === ia || i === ib || i === ic) continue;
    const p = vertices[i];
    // Bridge duplicates share coordinates with the corners; on-corner points
    // don't block the ear.
    if (dist2(p, a) < 1e-18 || dist2(p, b) < 1e-18 || dist2(p, c) < 1e-18) continue;
    if (
      orient(a, b, p) > AREA_EPS &&
      orient(b, c, p) > AREA_EPS &&
      orient(c, a, p) > AREA_EPS
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Extrusion
// ---------------------------------------------------------------------------

export interface FabMesh {
  /** xyz triples */
  positions: number[];
  /** vertex-index triples, wound CCW seen from outside */
  triangles: number[];
}

/** Chord tolerance for tessellating outlines into mesh boundaries, mm. */
const MESH_CHORD_TOL = 0.02;
const HOLE_SEGMENTS = 48;

function holePolygonCw(c: Vec2, r: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < HOLE_SEGMENTS; i++) {
    const a = -(i / HOLE_SEGMENTS) * Math.PI * 2;
    pts.push(vec(c.x + r * Math.cos(a), c.y + r * Math.sin(a)));
  }
  return pts;
}

/**
 * Extrude a part to `thickness` mm: bottom cap at z = 0, top cap at z =
 * thickness, walls along the outline and each bore.
 */
export function extrudePart(
  part: FabPart,
  thickness: number,
  offset: Vec2 = vec(0, 0),
): FabMesh {
  const outer = tessellateContour(part.outline, MESH_CHORD_TOL).map((p) =>
    vec(p.x + offset.x, p.y + offset.y),
  );
  const holes = part.holes.map((h) =>
    holePolygonCw(vec(h.p.x + offset.x, h.p.y + offset.y), h.dia / 2),
  );

  const input = buildInput(outer, holes);
  const flat = input.vertices;
  const capTris = earClip(flat, bridgeHoles(input));

  const n = flat.length;
  const positions: number[] = [];
  for (const p of flat) positions.push(p.x, p.y, 0); // bottom: 0 … n−1
  for (const p of flat) positions.push(p.x, p.y, thickness); // top: n … 2n−1

  const triangles: number[] = [];
  // Top cap keeps the CCW winding (+Z normal); bottom cap is reversed (−Z).
  for (let i = 0; i < capTris.length; i += 3) {
    triangles.push(capTris[i] + n, capTris[i + 1] + n, capTris[i + 2] + n);
    triangles.push(capTris[i], capTris[i + 2], capTris[i + 1]);
  }
  // Walls: outer loop is CCW and holes are CW, so the same quad winding
  // faces outward on the rim and into the bore on holes — both correct.
  for (const loopDef of input.loops) {
    for (let i = 0; i < loopDef.count; i++) {
      const i0 = loopDef.start + i;
      const i1 = loopDef.start + ((i + 1) % loopDef.count);
      triangles.push(i0, i1, i1 + n);
      triangles.push(i0, i1 + n, i0 + n);
    }
  }
  return { positions, triangles };
}

/** One mesh per part, laid out flat with `spacing` mm between parts. */
export function planMeshes(
  parts: FabPart[],
  thickness: number,
  spacing: number,
): FabMesh[] {
  const layout = layoutParts(parts, spacing);
  return layout.placements.map(({ part, x, y }) =>
    extrudePart(part, thickness, vec(x, y)),
  );
}

// ---------------------------------------------------------------------------
// Binary STL
// ---------------------------------------------------------------------------

export function meshesToBinaryStl(meshes: FabMesh[], name = "kinemagic"): ArrayBuffer {
  let triCount = 0;
  for (const m of meshes) triCount += m.triangles.length / 3;

  const buffer = new ArrayBuffer(84 + 50 * triCount);
  const view = new DataView(buffer);
  const header = `${name} — binary STL, units mm`;
  for (let i = 0; i < Math.min(79, header.length); i++) {
    view.setUint8(i, header.charCodeAt(i) & 0x7f);
  }
  view.setUint32(80, triCount, true);

  let off = 84;
  for (const m of meshes) {
    const pos = m.positions;
    for (let t = 0; t < m.triangles.length; t += 3) {
      const i0 = m.triangles[t] * 3;
      const i1 = m.triangles[t + 1] * 3;
      const i2 = m.triangles[t + 2] * 3;
      // Face normal from the winding.
      const ux = pos[i1] - pos[i0];
      const uy = pos[i1 + 1] - pos[i0 + 1];
      const uz = pos[i1 + 2] - pos[i0 + 2];
      const vx = pos[i2] - pos[i0];
      const vy = pos[i2 + 1] - pos[i0 + 1];
      const vz = pos[i2 + 2] - pos[i0 + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len > 0) {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      view.setFloat32(off, nx, true);
      view.setFloat32(off + 4, ny, true);
      view.setFloat32(off + 8, nz, true);
      for (const idx of [i0, i1, i2]) {
        off += 12;
        view.setFloat32(off, pos[idx], true);
        view.setFloat32(off + 4, pos[idx + 1], true);
        view.setFloat32(off + 8, pos[idx + 2], true);
      }
      off += 12;
      view.setUint16(off, 0, true);
      off += 2;
    }
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Diagnostics (used by tests and sanity checks)
// ---------------------------------------------------------------------------

export interface MeshDiagnostics {
  triangles: number;
  /** every directed edge is matched by its reverse */
  watertight: boolean;
  openEdges: number;
  /** signed volume via divergence theorem, mm³ (positive = outward winding) */
  volume: number;
}

export function meshDiagnostics(mesh: FabMesh): MeshDiagnostics {
  const { positions: pos, triangles } = mesh;
  const edges = new Map<string, number>();
  const keyOf = (i: number) => `${pos[i * 3]},${pos[i * 3 + 1]},${pos[i * 3 + 2]}`;

  let volume = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = `${keyOf(i)}|${keyOf(j)}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
    const ax = pos[a * 3];
    const ay = pos[a * 3 + 1];
    const az = pos[a * 3 + 2];
    const bx = pos[b * 3];
    const by = pos[b * 3 + 1];
    const bz = pos[b * 3 + 2];
    const cx = pos[c * 3];
    const cy = pos[c * 3 + 1];
    const cz = pos[c * 3 + 2];
    volume +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;
  }

  let openEdges = 0;
  for (const [k, count] of edges) {
    const [ka, kb] = k.split("|");
    const rev = edges.get(`${kb}|${ka}`) ?? 0;
    if (rev !== count) openEdges++;
  }
  return {
    triangles: triangles.length / 3,
    watertight: openEdges === 0,
    openEdges,
    volume,
  };
}

/** Area of a part's cap (outline minus bores), mm² — for volume checks. */
export function partCapArea(part: FabPart): number {
  const outer = Math.abs(polygonArea(tessellateContour(part.outline, MESH_CHORD_TOL)));
  const holes = part.holes.reduce(
    (acc, h) => acc + Math.abs(polygonArea(holePolygonCw(h.p, h.dia / 2))),
    0,
  );
  return outer - holes;
}