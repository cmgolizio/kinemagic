import { describe, expect, it } from "vitest";
import {
  defaultGearTrain,
  pitchRadius,
  solveGearTrain,
  type GearTrainConfig,
} from "./gears";
import { dist, normalizeAnglePositive, TWO_PI, vec } from "../vec";

const train = (over: Partial<GearTrainConfig> = {}): GearTrainConfig => ({
  center: vec(0, 0),
  module: 4,
  teeth: [12, 30],
  meshAngles: [0],
  ...over,
});

describe("gear train kinematics", () => {
  it("pitch radii follow r = m·z/2 and centers sit exactly r_i + r_j apart", () => {
    const res = solveGearTrain(train({ teeth: [12, 30, 18], meshAngles: [0, Math.PI / 3] }), 0.7);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.gears[0].r).toBeCloseTo(pitchRadius(4, 12), 12);
    expect(res.gears[1].r).toBeCloseTo(60, 12);
    expect(res.gears[2].r).toBeCloseTo(36, 12);
    expect(dist(res.gears[0].center, res.gears[1].center)).toBeCloseTo(24 + 60, 12);
    expect(dist(res.gears[1].center, res.gears[2].center)).toBeCloseTo(60 + 36, 12);
  });

  it("two external gears reverse with ratio −z1/z2, exactly", () => {
    const c = train();
    for (const theta of [0, 0.3, 2.1, 9.4, -3.3]) {
      const res = solveGearTrain(c, theta);
      if (!res.ok) throw new Error("solve failed");
      expect(res.overallRatio).toBeCloseTo(-12 / 30, 15);
      // Angles advance in exact ratio (compare against θ = 0 phase).
      const zero = solveGearTrain(c, 0);
      if (!zero.ok) throw new Error("solve failed");
      expect(res.gears[1].angle - zero.gears[1].angle).toBeCloseTo(
        (-12 / 30) * theta,
        12,
      );
    }
  });

  it("a 3-gear chain restores the input direction (idler law)", () => {
    const res = solveGearTrain(train({ teeth: [12, 30, 18], meshAngles: [0, 0] }), 1);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.overallRatio).toBeCloseTo(12 / 18, 15); // sign positive: same direction
    expect(res.gears[1].speedRatio).toBeCloseTo(-12 / 30, 15);
  });

  it("pitch-line velocities match at every mesh (rolling without slip)", () => {
    const res = solveGearTrain(train({ teeth: [15, 45, 9], meshAngles: [1.1, -0.4] }), 2.2);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (let i = 0; i < res.gears.length - 1; i++) {
      const a = res.gears[i];
      const b = res.gears[i + 1];
      expect(a.speedRatio * a.r).toBeCloseTo(-b.speedRatio * b.r, 12);
    }
  });

  it("keeps meshing teeth aligned: tooth center ↔ tooth gap at the mesh point", () => {
    // For any input angle, when we look along the center line, the nearest
    // tooth of one gear and the nearest gap of the other must coincide.
    const c = train({ teeth: [12, 30], meshAngles: [0.5] });
    for (const theta of [0, 0.17, 1.9, 4.4]) {
      const res = solveGearTrain(c, theta);
      if (!res.ok) throw new Error("solve failed");
      const [g1, g2] = res.gears;
      const gamma = 0.5;
      const pitch1 = TWO_PI / g1.z;
      const pitch2 = TWO_PI / g2.z;
      // Fractional tooth position at the mesh direction, each gear.
      const f1 = normalizeAnglePositive(gamma - g1.angle) / pitch1;
      const f2 = normalizeAnglePositive(gamma + Math.PI - g2.angle) / pitch2;
      const frac1 = f1 - Math.floor(f1); // 0 = tooth center at mesh
      const frac2 = f2 - Math.floor(f2);
      // Rolling constraint keeps frac1 + frac2 ≡ ½ (tooth meets gap).
      const sum = (frac1 + frac2) % 1;
      expect(Math.min(sum, 1 - sum)).toBeCloseTo(0.5, 9);
    }
  });

  it.each([
    ["one gear", { teeth: [20], meshAngles: [] }],
    ["four gears", { teeth: [10, 20, 30, 40], meshAngles: [0, 0, 0] }],
    ["fractional teeth", { teeth: [12.5, 30] }],
    ["tiny gear", { teeth: [3, 30] }],
    ["zero module", { module: 0 }],
    ["missing mesh angle", { teeth: [12, 30, 18], meshAngles: [0] }],
  ])("returns typed degenerate for %s", (_name, over) => {
    const res = solveGearTrain(train(over as Partial<GearTrainConfig>), 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("degenerate");
  });

  it("default train solves and reduces speed overall", () => {
    const res = solveGearTrain(defaultGearTrain(), 0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.gears.length).toBe(3);
    expect(Math.abs(res.overallRatio)).toBeLessThan(1);
  });
});