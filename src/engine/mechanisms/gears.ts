/**
 * Spur gear train solver — 2–3 external gears meshing in a chain.
 *
 * The kinematics are exact: pitch radius r = m·z/2 (module m in mm/tooth,
 * tooth count z), meshing centers sit exactly r_i + r_{i+1} apart, and each
 * external mesh reverses direction with ratio ω_{i+1}/ω_i = −z_i/z_{i+1}.
 * Tooth *rendering* elsewhere may be schematic, but the angles produced here
 * keep meshing teeth aligned: the phase constants are chosen so a tooth
 * center of one gear always faces a tooth gap of the next at the mesh point.
 */

import { add, fromPolar, vec, type Vec2 } from "../vec";

export interface GearTrainConfig {
  /** center of the input gear, world mm */
  center: Vec2;
  /** module, mm per tooth (pitch diameter = module · teeth) */
  module: number;
  /** tooth counts, 2–3 gears; index 0 is the driven input */
  teeth: number[];
  /** direction (radians) from each gear's center to the next gear's center */
  meshAngles: number[];
}

export interface GearState {
  center: Vec2;
  /** pitch radius, mm */
  r: number;
  z: number;
  /** rotation angle, radians (includes mesh phase) */
  angle: number;
  /** ω of this gear per unit input ω (signed; input gear = 1) */
  speedRatio: number;
}

export interface GearTrainPose {
  ok: true;
  theta: number;
  gears: GearState[];
  /** ω_out / ω_in, signed (negative = opposite direction to the input) */
  overallRatio: number;
}

export interface GearTrainFailure {
  ok: false;
  theta: number;
  reason: "degenerate";
  detail: string;
}

export type GearTrainResult = GearTrainPose | GearTrainFailure;

export const pitchRadius = (module: number, z: number): number => (module * z) / 2;

export function validateGearTrain(c: GearTrainConfig): string | null {
  if (!Number.isFinite(c.center.x + c.center.y)) return "gear center must be finite";
  if (!(Number.isFinite(c.module) && c.module > 0)) return "module must be positive";
  if (c.teeth.length < 2 || c.teeth.length > 3) return "train must have 2 or 3 gears";
  for (const z of c.teeth) {
    if (!Number.isInteger(z) || z < 4) return "tooth counts must be integers ≥ 4";
  }
  if (c.meshAngles.length < c.teeth.length - 1) return "missing mesh angle";
  for (let i = 0; i < c.teeth.length - 1; i++) {
    if (!Number.isFinite(c.meshAngles[i])) return "mesh angles must be finite";
  }
  return null;
}

/** Solve every gear's angle for input rotation θ (applied to gear 0). */
export function solveGearTrain(c: GearTrainConfig, theta: number): GearTrainResult {
  const invalid = validateGearTrain(c);
  if (invalid) return { ok: false, theta, reason: "degenerate", detail: invalid };

  const gears: GearState[] = [
    {
      center: c.center,
      r: pitchRadius(c.module, c.teeth[0]),
      z: c.teeth[0],
      angle: theta,
      speedRatio: 1,
    },
  ];

  for (let i = 0; i < c.teeth.length - 1; i++) {
    const prev = gears[i];
    const z = c.teeth[i + 1];
    const r = pitchRadius(c.module, z);
    const gamma = c.meshAngles[i];
    const center = add(prev.center, fromPolar(prev.r + r, gamma));
    const ratio = -prev.z / z;
    // Rolling contact fixes the angle up to a constant; the constant is
    // chosen so that when the previous gear has a tooth center pointing at
    // the mesh (angle γ), this gear presents a gap center back (γ + π):
    // tooth k at γ+π+π/z ⇒ gap at γ+π.
    const angle = gamma + Math.PI + Math.PI / z + ratio * (prev.angle - gamma);
    gears.push({ center, r, z, angle, speedRatio: prev.speedRatio * ratio });
  }

  return {
    ok: true,
    theta,
    gears,
    overallRatio: gears[gears.length - 1].speedRatio,
  };
}

/** Sensible default: a 3-gear reduction train laid out along +x. */
export const defaultGearTrain = (): GearTrainConfig => ({
  center: vec(-70, 0),
  module: 4,
  teeth: [12, 30, 18],
  meshAngles: [0, -Math.PI / 6],
});