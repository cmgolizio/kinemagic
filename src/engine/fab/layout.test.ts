import { describe, expect, it } from "vitest";
import { vec } from "../vec";
import type { FourBarConfig } from "../mechanisms/fourbar";
import { defaultPeaucellier } from "../mechanisms/straightline";
import { defaultFabSettings, fabricationPlan } from "./parts";
import { layoutParts } from "./layout";

const fourBar: FourBarConfig = {
  O2: vec(-40, 0),
  O4: vec(50, 0),
  crankLen: 40,
  couplerLen: 100,
  rockerLen: 70,
  couplerPoint: { u: 55, v: 40 },
};

describe("layoutParts", () => {
  const s = defaultFabSettings();

  const overlaps = (
    a: { x0: number; y0: number; x1: number; y1: number },
    b: { x0: number; y0: number; x1: number; y1: number },
  ) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  for (const [label, plan] of [
    ["four-bar", fabricationPlan({ kind: "fourbar", config: fourBar }, s)],
    [
      "peaucellier",
      fabricationPlan({ kind: "peaucellier", config: defaultPeaucellier() }, s),
    ],
  ] as const) {
    it(`packs every ${label} part inside the sheet without overlap`, () => {
      const layout = layoutParts(plan.parts, s.spacing);
      expect(layout.placements).toHaveLength(plan.parts.length);

      const boxes = layout.placements.map(({ part, x, y }) => ({
        x0: x + part.bbox.min.x,
        y0: y + part.bbox.min.y,
        x1: x + part.bbox.max.x,
        y1: y + part.bbox.max.y,
      }));
      for (const b of boxes) {
        expect(b.x0).toBeGreaterThanOrEqual(s.spacing - 1e-9);
        expect(b.y0).toBeGreaterThanOrEqual(s.spacing - 1e-9);
        expect(b.x1).toBeLessThanOrEqual(layout.width - s.spacing + 1e-9);
        expect(b.y1).toBeLessThanOrEqual(layout.height - s.spacing + 1e-9);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i], boxes[j])).toBe(false);
        }
      }
    });
  }

  it("keeps at least the spacing between parts", () => {
    const plan = fabricationPlan({ kind: "fourbar", config: fourBar }, s);
    const layout = layoutParts(plan.parts, s.spacing);
    const boxes = layout.placements.map(({ part, x, y }) => ({
      x0: x + part.bbox.min.x,
      y0: y + part.bbox.min.y,
      x1: x + part.bbox.max.x,
      y1: y + part.bbox.max.y,
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const gapX = Math.max(boxes[i].x0, boxes[j].x0) - Math.min(boxes[i].x1, boxes[j].x1);
        const gapY = Math.max(boxes[i].y0, boxes[j].y0) - Math.min(boxes[i].y1, boxes[j].y1);
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(s.spacing - 1e-9);
      }
    }
  });
});