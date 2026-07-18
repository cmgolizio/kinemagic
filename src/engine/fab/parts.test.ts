import { describe, expect, it } from "vitest";
import { vec } from "../vec";
import type { FourBarConfig } from "../mechanisms/fourbar";
import { defaultSliderCrank } from "../mechanisms/slidercrank";
import { defaultPeaucellier } from "../mechanisms/straightline";
import {
  billOfMaterials,
  boreDia,
  defaultFabSettings,
  fabricationPlan,
  layerAssignment,
  pinSchedule,
} from "./parts";
import { dist } from "../vec";

const fourBar: FourBarConfig = {
  O2: vec(-40, 0),
  O4: vec(50, 0),
  crankLen: 40,
  couplerLen: 100,
  rockerLen: 70,
  couplerPoint: { u: 55, v: 40 },
};

describe("fabricationPlan — four-bar", () => {
  const s = defaultFabSettings();
  const plan = fabricationPlan({ kind: "fourbar", config: fourBar }, s);

  it("produces ground, crank, coupler and rocker", () => {
    expect(plan.parts.map((p) => p.id).sort()).toEqual([
      "coupler",
      "crank",
      "ground",
      "rocker",
    ]);
  });

  it("sizes every bar to its link length exactly", () => {
    const byId = new Map(plan.parts.map((p) => [p.id, p]));
    expect(byId.get("crank")!.span).toBeCloseTo(40, 9);
    expect(byId.get("rocker")!.span).toBeCloseTo(70, 9);
    expect(byId.get("ground")!.span).toBeCloseTo(90, 9); // |O4 − O2|
    // Coupler: A→B bores exactly couplerLen apart.
    const coupler = byId.get("coupler")!;
    const a = coupler.holes.find((h) => h.joint === "A")!;
    const b = coupler.holes.find((h) => h.joint === "B")!;
    expect(dist(a.p, b.p)).toBeCloseTo(100, 9);
  });

  it("puts the P bore at the coupler point's local (u, v)", () => {
    const coupler = plan.parts.find((p) => p.id === "coupler")!;
    const pHole = coupler.holes.find((h) => h.joint === "P")!;
    expect(pHole.p.x).toBeCloseTo(55, 9);
    expect(pHole.p.y).toBeCloseTo(40, 9);
    // Off-axis P means a plate, not a bar: outline must reach past the bar.
    expect(coupler.bbox.max.y).toBeGreaterThan(40);
  });

  it("collapses the coupler to a 3-bore bar when P is on the axis", () => {
    const inline = fabricationPlan(
      {
        kind: "fourbar",
        config: { ...fourBar, couplerPoint: { u: 55, v: 0 } },
      },
      s,
    );
    const coupler = inline.parts.find((p) => p.id === "coupler")!;
    expect(coupler.holes).toHaveLength(3);
    expect(coupler.bbox.max.y).toBeCloseTo(s.barWidth / 2, 9);
  });

  it("bore diameter = pin + clearance, and clearance changes it", () => {
    for (const part of plan.parts) {
      for (const hole of part.holes) expect(hole.dia).toBeCloseTo(3.2, 9);
    }
    const loose = fabricationPlan(
      { kind: "fourbar", config: fourBar },
      { ...s, clearance: 0.4 },
    );
    expect(loose.parts[0].holes[0].dia).toBeCloseTo(3.4, 9);
  });

  it("warns when the bore leaves too little wall", () => {
    const bad = fabricationPlan(
      { kind: "fourbar", config: fourBar },
      { ...s, barWidth: 4, fillet: 2, pinDia: 3 },
    );
    expect(bad.warnings.some((w) => w.includes("wall"))).toBe(true);
    expect(plan.warnings).toHaveLength(0);
  });
});

describe("fabricationPlan — other mechanisms", () => {
  const s = defaultFabSettings();

  it("slider-crank exports crank + rod and notes the track", () => {
    const plan = fabricationPlan(
      { kind: "slidercrank", config: defaultSliderCrank() },
      s,
    );
    expect(plan.parts.map((p) => p.id).sort()).toEqual(["crank", "rod"]);
    expect(plan.notes.join(" ")).toMatch(/track|rail/);
  });

  it("peaucellier exports the full 8-part cell", () => {
    const plan = fabricationPlan(
      { kind: "peaucellier", config: defaultPeaucellier() },
      s,
    );
    expect(plan.parts).toHaveLength(8);
    const arms = plan.parts.filter((p) => p.name === "arm");
    const cells = plan.parts.filter((p) => p.name === "cell side");
    expect(arms).toHaveLength(2);
    expect(cells).toHaveLength(4);
    const c = defaultPeaucellier();
    for (const a of arms) expect(a.span).toBeCloseTo(c.armLen, 9);
    for (const side of cells) expect(side.span).toBeCloseTo(c.cellSide, 9);
  });
});

describe("pin schedule & layers", () => {
  const s = defaultFabSettings();
  const plan = fabricationPlan({ kind: "fourbar", config: fourBar }, s);

  it("groups shared bores into pins with a fastener suggestion", () => {
    const pins = pinSchedule(plan, s);
    const byJoint = new Map(pins.map((p) => [p.joint, p]));
    expect(byJoint.get("O2")!.parts.sort()).toEqual(["crank", "ground"]);
    expect(byJoint.get("A")!.parts.sort()).toEqual(["coupler", "crank"]);
    expect(byJoint.get("B")!.parts.sort()).toEqual(["coupler", "rocker"]);
    expect(byJoint.get("O4")!.parts.sort()).toEqual(["ground", "rocker"]);
    // Two 4 mm parts + washer + nut headroom → M3 × 16.
    expect(byJoint.get("A")!.suggestion).toBe("M3 × 16");
    // P is a single-part mount, not a pin.
    expect(byJoint.get("P")!.suggestion).toBeNull();
  });

  it("stacks parts by BFS depth from the ground link", () => {
    const layers = layerAssignment(plan);
    expect(layers.get("ground")).toBe(0);
    expect(layers.get("crank")).toBe(1);
    expect(layers.get("rocker")).toBe(1);
    expect(layers.get("coupler")).toBe(2);
  });

  it("BOM groups identical parts and counts everything", () => {
    const peau = fabricationPlan(
      { kind: "peaucellier", config: defaultPeaucellier() },
      s,
    );
    const bom = billOfMaterials(peau, s);
    expect(bom.partCount).toBe(8);
    const cellRow = bom.rows.find((r) => r.name === "cell side")!;
    expect(cellRow.qty).toBe(4);
    expect(bom.rows.find((r) => r.name === "arm")!.qty).toBe(2);
    expect(bom.boreDia).toBeCloseTo(boreDia(s), 12);
    expect(bom.holeCount).toBe(16);
  });
});