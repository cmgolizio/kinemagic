/**
 * Fabrication parts: turn a mechanism's *definition* into physical link
 * geometry — rounded bars and plates with pivot bores — plus the paperwork
 * (bill of materials, pin schedule, layer stack-up) a build needs.
 *
 * Everything is in mm. Each part lives in its own local frame with its hole
 * axis along +X; the sheet layout places local frames onto a cut sheet.
 */

import { dist, vec, type Vec2 } from "../vec";
import type { FourBarConfig } from "../mechanisms/fourbar";
import { groundLen } from "../mechanisms/fourbar";
import type { SliderCrankConfig } from "../mechanisms/slidercrank";
import type { PeaucellierConfig } from "../mechanisms/straightline";
import {
  contourBounds,
  roundedBarContour,
  roundedPlateContour,
  type Box,
  type Contour,
} from "./contour";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface FabSettings {
  /** link bar width, mm */
  barWidth: number;
  /** nominal pin/bolt diameter, mm (M3 = 3) */
  pinDia: number;
  /** added to the pin diameter so parts actually assemble, mm */
  clearance: number;
  /** end fillet radius, mm; barWidth/2 gives full capsule ends */
  fillet: number;
  /** extrusion thickness for 3D printing, mm */
  thickness: number;
  /** gap between parts on the cut sheet, mm */
  spacing: number;
}

export const defaultFabSettings = (): FabSettings => ({
  barWidth: 12,
  pinDia: 3,
  clearance: 0.2,
  fillet: 6,
  thickness: 4,
  spacing: 5,
});

/** Bore diameter actually cut/printed: pin + clearance. */
export const boreDia = (s: FabSettings): number => s.pinDia + s.clearance;

/** Thinnest remaining wall between a bore and the outline edge. */
export const minWall = (s: FabSettings): number =>
  Math.min(s.barWidth, 2 * Math.max(s.fillet, s.barWidth / 2)) / 2 - boreDia(s) / 2;

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export interface FabHole {
  /** joint this bore belongs to (shared across parts, drives the pin schedule) */
  joint: string;
  /** position in the part's local frame, mm */
  p: Vec2;
  /** bore diameter, mm */
  dia: number;
}

export interface FabPart {
  /** unique per physical piece, e.g. "arm-2" */
  id: string;
  /** display/group name, e.g. "arm" — identical parts share it */
  name: string;
  role: "ground" | "link";
  holes: FabHole[];
  outline: Contour;
  /** centre-to-centre span of the two farthest bores, mm */
  span: number;
  /** local-frame bounds of the outline */
  bbox: Box;
}

export interface FabPlan {
  /** mechanism label for titles/filenames, e.g. "four-bar" */
  mechanism: string;
  parts: FabPart[];
  warnings: string[];
  /** free-text build notes (slider tracks, etc.) */
  notes: string[];
}

interface BarHole {
  joint: string;
  x: number;
}

/** Straight link: bores along the local X axis. */
function barPart(
  id: string,
  name: string,
  role: FabPart["role"],
  holes: BarHole[],
  s: FabSettings,
): FabPart {
  const xs = holes.map((h) => h.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const outline = roundedBarContour(x0, x1, s.barWidth, s.fillet);
  const d = boreDia(s);
  return {
    id,
    name,
    role,
    holes: holes.map((h) => ({ joint: h.joint, p: vec(h.x, 0), dia: d })),
    outline,
    span: x1 - x0,
    bbox: contourBounds(outline),
  };
}

/**
 * Plate link: bores anywhere in the local plane (the offset coupler). Falls
 * back to a bar when the points are collinear enough for the hull to vanish.
 */
function platePart(
  id: string,
  name: string,
  points: Array<{ joint: string; p: Vec2 }>,
  s: FabSettings,
): FabPart {
  const outline = roundedPlateContour(
    points.map((q) => q.p),
    s.barWidth / 2,
  );
  if (!outline) {
    // Collinear: project onto the principal direction and cut a bar.
    // Points come in with the first two spanning the axis (A at origin,
    // B on +X), so x-ordering is exact here.
    return barPart(
      id,
      name,
      "link",
      points.map((q) => ({ joint: q.joint, x: q.p.x })),
      s,
    );
  }
  const d = boreDia(s);
  let span = 0;
  for (const a of points)
    for (const b of points) span = Math.max(span, dist(a.p, b.p));
  return {
    id,
    name,
    role: "link",
    holes: points.map((q) => ({ joint: q.joint, p: q.p, dia: d })),
    outline,
    span,
    bbox: contourBounds(outline),
  };
}

// ---------------------------------------------------------------------------
// Per-mechanism plans
// ---------------------------------------------------------------------------

/** What the export module can fabricate. Pin-jointed linkages only. */
export type FabSource =
  | { kind: "fourbar"; config: FourBarConfig }
  | { kind: "slidercrank"; config: SliderCrankConfig }
  | { kind: "peaucellier"; config: PeaucellierConfig };

function settingsWarnings(s: FabSettings, plan: FabPlan): void {
  const wall = minWall(s);
  if (wall < 1) {
    plan.warnings.push(
      `only ${wall.toFixed(2)} mm of wall around each bore — widen the bar or shrink the pin`,
    );
  }
  if (s.fillet < s.barWidth / 2 - 1e-9) {
    // Squared-off ends still clear the bore, but flag tight cases.
    const endWall = s.fillet - boreDia(s) / 2;
    if (endWall < 0 && wall >= 1) {
      plan.warnings.push(
        "end fillet is smaller than the bore radius — corners will be sharp near end bores",
      );
    }
  }
  for (const part of plan.parts) {
    for (let i = 0; i < part.holes.length; i++) {
      for (let j = i + 1; j < part.holes.length; j++) {
        const gap =
          dist(part.holes[i].p, part.holes[j].p) -
          (part.holes[i].dia + part.holes[j].dia) / 2;
        if (gap < 1) {
          plan.warnings.push(
            `bores ${part.holes[i].joint} and ${part.holes[j].joint} on the ${part.name} are ${
              gap < 0 ? "overlapping" : `only ${gap.toFixed(1)} mm apart`
            } — lengthen the link or shrink the pin`,
          );
        }
      }
    }
  }
}

function fourBarParts(c: FourBarConfig, s: FabSettings): FabPlan {
  const r1 = groundLen(c);
  const parts: FabPart[] = [
    barPart("ground", "ground", "ground", [
      { joint: "O2", x: 0 },
      { joint: "O4", x: r1 },
    ], s),
    barPart("crank", "crank", "link", [
      { joint: "O2", x: 0 },
      { joint: "A", x: c.crankLen },
    ], s),
    barPart("rocker", "rocker", "link", [
      { joint: "O4", x: 0 },
      { joint: "B", x: c.rockerLen },
    ], s),
  ];

  // Coupler carries the trace point P as a third bore (pen/pointer mount).
  const { u, v } = c.couplerPoint;
  const couplerPts = [
    { joint: "A", p: vec(0, 0) },
    { joint: "B", p: vec(c.couplerLen, 0) },
    { joint: "P", p: vec(u, v) },
  ];
  parts.push(
    Math.abs(v) < 0.5
      ? barPart("coupler", "coupler", "link", [
          { joint: "A", x: 0 },
          { joint: "B", x: c.couplerLen },
          { joint: "P", x: u },
        ], s)
      : platePart("coupler", "coupler", couplerPts, s),
  );

  const plan: FabPlan = {
    mechanism: "four-bar",
    parts,
    warnings: [],
    notes: [
      "The P bore is the trace point — mount a pen or pointer there.",
      "Fix the ground bar to your base; everything else pivots.",
    ],
  };
  settingsWarnings(s, plan);
  return plan;
}

function sliderCrankParts(c: SliderCrankConfig, s: FabSettings): FabPlan {
  const rodPoint = c.rodPoint ?? { u: c.rodLen / 2, v: 0 };
  const parts: FabPart[] = [
    barPart("crank", "crank", "link", [
      { joint: "O2", x: 0 },
      { joint: "A", x: c.crankLen },
    ], s),
  ];
  const rodPts = [
    { joint: "A", p: vec(0, 0) },
    { joint: "B", p: vec(c.rodLen, 0) },
    { joint: "P", p: vec(rodPoint.u, rodPoint.v) },
  ];
  parts.push(
    Math.abs(rodPoint.v) < 0.5
      ? barPart("rod", "connecting rod", "link", [
          { joint: "A", x: 0 },
          { joint: "B", x: c.rodLen },
          { joint: "P", x: rodPoint.u },
        ], s)
      : platePart("rod", "connecting rod", rodPts, s),
  );

  const plan: FabPlan = {
    mechanism: "slider-crank",
    parts,
    warnings: [],
    notes: [
      "The slider is not exported: run the B pin in a slotted track or rail " +
        `parallel to the slider axis${c.offset !== 0 ? `, offset ${c.offset.toFixed(1)} mm from the crank pivot` : ", through the crank pivot"}.`,
      "Mount the crank pivot (O2) to the same base as the track.",
    ],
  };
  settingsWarnings(s, plan);
  return plan;
}

function peaucellierParts(c: PeaucellierConfig, s: FabSettings): FabPlan {
  const parts: FabPart[] = [
    barPart("ground", "ground", "ground", [
      { joint: "O", x: 0 },
      { joint: "C", x: c.crankLen },
    ], s),
    barPart("crank", "crank", "link", [
      { joint: "C", x: 0 },
      { joint: "P", x: c.crankLen },
    ], s),
    barPart("arm-1", "arm", "link", [
      { joint: "O", x: 0 },
      { joint: "M1", x: c.armLen },
    ], s),
    barPart("arm-2", "arm", "link", [
      { joint: "O", x: 0 },
      { joint: "M2", x: c.armLen },
    ], s),
    barPart("cell-1", "cell side", "link", [
      { joint: "M1", x: 0 },
      { joint: "P", x: c.cellSide },
    ], s),
    barPart("cell-2", "cell side", "link", [
      { joint: "M2", x: 0 },
      { joint: "P", x: c.cellSide },
    ], s),
    barPart("cell-3", "cell side", "link", [
      { joint: "M1", x: 0 },
      { joint: "Q", x: c.cellSide },
    ], s),
    barPart("cell-4", "cell side", "link", [
      { joint: "M2", x: 0 },
      { joint: "Q", x: c.cellSide },
    ], s),
  ];
  const plan: FabPlan = {
    mechanism: "peaucellier",
    parts,
    warnings: [],
    notes: [
      "Q is the output — it draws the exact straight line; mount a pen there.",
      "The ground bar spans pole O to crank pivot C; |OC| must equal the crank " +
        "length or the line degrades to an arc.",
    ],
  };
  settingsWarnings(s, plan);
  return plan;
}

/** Build the fabrication plan, or null for mechanisms without link geometry. */
export function fabricationPlan(source: FabSource, s: FabSettings): FabPlan {
  switch (source.kind) {
    case "fourbar":
      return fourBarParts(source.config, s);
    case "slidercrank":
      return sliderCrankParts(source.config, s);
    case "peaucellier":
      return peaucellierParts(source.config, s);
  }
}

// ---------------------------------------------------------------------------
// Pin schedule & layer stack-up
// ---------------------------------------------------------------------------

export interface PinRow {
  joint: string;
  /** display names of the parts this pin passes through */
  parts: string[];
  /** stack the pin must span: parts + a washer between each pair, mm */
  grip: number;
  /** e.g. "M3 × 12 + washers/nut", or null for single-part bores */
  suggestion: string | null;
}

const STANDARD_LENGTHS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 50, 60];
const WASHER = 0.5;

export function pinSchedule(plan: FabPlan, s: FabSettings): PinRow[] {
  const byJoint = new Map<string, string[]>();
  for (const part of plan.parts) {
    for (const hole of part.holes) {
      const list = byJoint.get(hole.joint) ?? [];
      list.push(part.name);
      byJoint.set(hole.joint, list);
    }
  }
  const rows: PinRow[] = [];
  for (const [joint, parts] of byJoint) {
    const n = parts.length;
    if (n < 2) {
      rows.push({ joint, parts, grip: s.thickness, suggestion: null });
      continue;
    }
    const grip = n * s.thickness + (n - 1) * WASHER;
    // Room for a nut (≈0.8·d) plus a thread or two.
    const need = grip + s.pinDia * 0.8 + 2;
    const len = STANDARD_LENGTHS.find((l) => l >= need) ?? Math.ceil(need);
    rows.push({
      joint,
      parts,
      grip,
      suggestion: `M${trimNum(s.pinDia)} × ${len}`,
    });
  }
  return rows;
}

const trimNum = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

/**
 * Suggested Z-level per part: BFS depth from the ground link across shared
 * joints. Adjacent levels clear each other; two parts that share a pin *and*
 * a level need a spacer between them.
 */
export function layerAssignment(plan: FabPlan): Map<string, number> {
  const layers = new Map<string, number>();
  const seeds = plan.parts.filter((p) => p.role === "ground");
  const queue: Array<{ id: string; layer: number }> = seeds.map((p) => ({
    id: p.id,
    layer: 0,
  }));
  // Mechanisms without an exported ground part start their links at level 1
  // (level 0 is the user's base plate).
  if (queue.length === 0 && plan.parts.length > 0)
    queue.push({ id: plan.parts[0].id, layer: 1 });

  const jointsOf = (id: string) =>
    plan.parts.find((p) => p.id === id)?.holes.map((h) => h.joint) ?? [];

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!;
    if (layers.has(id)) continue;
    layers.set(id, layer);
    const joints = new Set(jointsOf(id));
    for (const part of plan.parts) {
      if (layers.has(part.id)) continue;
      if (part.holes.some((h) => joints.has(h.joint))) {
        queue.push({ id: part.id, layer: layer + 1 });
      }
    }
  }
  // Anything disconnected still gets a level.
  for (const part of plan.parts) {
    if (!layers.has(part.id)) layers.set(part.id, 1);
  }
  return layers;
}

// ---------------------------------------------------------------------------
// Bill of materials
// ---------------------------------------------------------------------------

export interface BomRow {
  name: string;
  qty: number;
  /** bore span, mm */
  span: number;
  holes: number;
  /** suggested Z-level (from layerAssignment) */
  layer: number;
}

export interface Bom {
  rows: BomRow[];
  partCount: number;
  holeCount: number;
  boreDia: number;
  pins: PinRow[];
}

export function billOfMaterials(plan: FabPlan, s: FabSettings): Bom {
  const layers = layerAssignment(plan);
  const rows: BomRow[] = [];
  for (const part of plan.parts) {
    const existing = rows.find(
      (r) => r.name === part.name && Math.abs(r.span - part.span) < 1e-6,
    );
    if (existing) {
      existing.qty += 1;
    } else {
      rows.push({
        name: part.name,
        qty: 1,
        span: part.span,
        holes: part.holes.length,
        layer: layers.get(part.id) ?? 1,
      });
    }
  }
  return {
    rows,
    partCount: plan.parts.length,
    holeCount: plan.parts.reduce((acc, p) => acc + p.holes.length, 0),
    boreDia: boreDia(s),
    pins: pinSchedule(plan, s),
  };
}