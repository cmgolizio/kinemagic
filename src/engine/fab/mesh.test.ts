import { describe, expect, it } from "vitest";
import { vec } from "../vec";
import type { FourBarConfig } from "../mechanisms/fourbar";
import { defaultPeaucellier } from "../mechanisms/straightline";
import { defaultFabSettings, fabricationPlan } from "./parts";
import { polygonArea } from "./contour";
import {
  extrudePart,
  meshDiagnostics,
  meshesToBinaryStl,
  partCapArea,
  planMeshes,
  triangulatePolygonWithHoles,
} from "./mesh";

const fourBar: FourBarConfig = {
  O2: vec(-40, 0),
  O4: vec(50, 0),
  crankLen: 40,
  couplerLen: 100,
  rockerLen: 70,
  couplerPoint: { u: 55, v: 40 },
};

describe("triangulatePolygonWithHoles", () => {
  it("triangulates a square with a square hole to the exact area", () => {
    const outer = [vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)];
    const hole = [vec(4, 4), vec(4, 6), vec(6, 6), vec(6, 4)]; // CW
    const tris = triangulatePolygonWithHoles(outer, [hole]);
    const verts = [...outer, ...hole];
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      area += polygonArea([verts[tris[i]], verts[tris[i + 1]], verts[tris[i + 2]]]);
    }
    expect(area).toBeCloseTo(100 - 4, 9);
    // All triangles CCW.
    for (let i = 0; i < tris.length; i += 3) {
      expect(
        polygonArea([verts[tris[i]], verts[tris[i + 1]], verts[tris[i + 2]]]),
      ).toBeGreaterThan(0);
    }
  });

  it("handles several holes", () => {
    const outer = [vec(0, 0), vec(30, 0), vec(30, 10), vec(0, 10)];
    const mkHole = (cx: number) => [
      vec(cx - 1, 4),
      vec(cx - 1, 6),
      vec(cx + 1, 6),
      vec(cx + 1, 4),
    ];
    const holes = [mkHole(5), mkHole(15), mkHole(25)];
    const tris = triangulatePolygonWithHoles(outer, holes);
    const verts = [...outer, ...holes.flat()];
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      area += polygonArea([verts[tris[i]], verts[tris[i + 1]], verts[tris[i + 2]]]);
    }
    expect(area).toBeCloseTo(300 - 3 * 4, 9);
  });
});

describe("extrudePart", () => {
  const s = defaultFabSettings();
  const plan = fabricationPlan({ kind: "fourbar", config: fourBar }, s);

  for (const part of plan.parts) {
    it(`produces a watertight ${part.id} with the right volume`, () => {
      const mesh = extrudePart(part, s.thickness);
      const diag = meshDiagnostics(mesh);
      expect(diag.watertight).toBe(true);
      expect(diag.openEdges).toBe(0);
      const expected = partCapArea(part) * s.thickness;
      expect(Math.abs(diag.volume - expected) / expected).toBeLessThan(1e-6);
    });
  }

  it("stays watertight across every peaucellier part", () => {
    const peau = fabricationPlan(
      { kind: "peaucellier", config: defaultPeaucellier() },
      s,
    );
    for (const part of peau.parts) {
      expect(meshDiagnostics(extrudePart(part, s.thickness)).watertight).toBe(true);
    }
  });

  it("survives square ends and thin bars", () => {
    const tight = fabricationPlan(
      { kind: "fourbar", config: fourBar },
      { ...s, fillet: 0, barWidth: 6 },
    );
    for (const part of tight.parts) {
      const diag = meshDiagnostics(extrudePart(part, 2));
      expect(diag.watertight).toBe(true);
      expect(diag.volume).toBeGreaterThan(0);
    }
  });
});

describe("planMeshes + binary STL", () => {
  const s = defaultFabSettings();
  const plan = fabricationPlan({ kind: "fourbar", config: fourBar }, s);

  it("lays out one mesh per part, all watertight", () => {
    const meshes = planMeshes(plan.parts, s.thickness, s.spacing);
    expect(meshes).toHaveLength(plan.parts.length);
    for (const m of meshes) {
      expect(meshDiagnostics(m).watertight).toBe(true);
    }
  });

  it("writes a valid binary STL", () => {
    const meshes = planMeshes(plan.parts, s.thickness, s.spacing);
    const stl = meshesToBinaryStl(meshes);
    const view = new DataView(stl);
    const count = view.getUint32(80, true);
    const expected = meshes.reduce((acc, m) => acc + m.triangles.length / 3, 0);
    expect(count).toBe(expected);
    expect(stl.byteLength).toBe(84 + 50 * count);
    // Attribute byte count of the first triangle is zero.
    expect(view.getUint16(84 + 48, true)).toBe(0);
    // First normal is unit length.
    const nx = view.getFloat32(84, true);
    const ny = view.getFloat32(88, true);
    const nz = view.getFloat32(92, true);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
  });

  it("volume scales with thickness", () => {
    const part = plan.parts[0];
    const v4 = meshDiagnostics(extrudePart(part, 4)).volume;
    const v8 = meshDiagnostics(extrudePart(part, 8)).volume;
    expect(v8 / v4).toBeCloseTo(2, 9);
  });

  it("clearance changes the printed bore volume", () => {
    const loose = fabricationPlan(
      { kind: "fourbar", config: fourBar },
      { ...s, clearance: 0.6 },
    );
    const tight = meshDiagnostics(extrudePart(plan.parts[0], 4)).volume;
    const looseV = meshDiagnostics(extrudePart(loose.parts[0], 4)).volume;
    expect(looseV).toBeLessThan(tight); // bigger bores → less material
  });
});