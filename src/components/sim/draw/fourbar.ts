/**
 * Four-bar linkage renderer — also drives the Watt straight-line variant,
 * which is the same kinematic chain with a midpoint trace.
 */

import {
  groundLen,
  TWO_PI,
  type CouplerCurve,
  type FourBarConfig,
  type FourBarResult,
  type InputRange,
  type Vec2,
} from "@/engine";
import { MONO_FONT } from "../palette";
import {
  drawAngleAnnotation,
  drawCoordBox,
  drawDimension,
  drawFixedPivot,
  drawLinkBar,
  drawPin,
  drawRangeGuide,
  drawStylus,
  drawTrace,
  hitJointsThenBars,
  isActive,
  w2s,
  type DrawEnv,
} from "./parts";

const JOINT_LABELS: Record<string, string> = {
  O2: "O₂",
  O4: "O₄",
  A: "A",
  B: "B",
  P: "P",
};

export function drawFourBarMech(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  config: FourBarConfig,
  pose: FourBarResult,
  trace: CouplerCurve,
  range: InputRange,
): void {
  const { palette } = env;

  drawTrace(ctx, env, trace.points, trace.closed);
  drawRangeGuide(ctx, env, config.O2, config.crankLen, range);

  // Ground link: the frame — drawn faintly, dashed centerline style.
  const o2 = w2s(env, config.O2);
  const o4 = w2s(env, config.O4);
  ctx.beginPath();
  ctx.setLineDash([8, 4, 2, 4]);
  ctx.strokeStyle = isActive(env, "ground") ? palette.accent : palette.inkFaint;
  ctx.lineWidth = isActive(env, "ground") ? 2 : 1.2;
  ctx.moveTo(o2.x, o2.y);
  ctx.lineTo(o4.x, o4.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (pose.ok) {
    const { A, B, P } = pose;

    // Coupler rigid body: when P is off the A–B line, show the rigid triangle.
    const pOff =
      Math.abs(config.couplerPoint.v) > 0.5 ||
      config.couplerPoint.u < -0.5 ||
      config.couplerPoint.u > config.couplerLen + 0.5;
    if (pOff) {
      const a = w2s(env, A);
      const b = w2s(env, B);
      const pp = w2s(env, P);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(pp.x, pp.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = palette.inkFaint;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLinkBar(ctx, env, "coupler", A, B);
    drawLinkBar(ctx, env, "rocker", config.O4, B);
    drawLinkBar(ctx, env, "crank", config.O2, A);

    drawFixedPivot(ctx, env, "O2", config.O2);
    drawFixedPivot(ctx, env, "O4", config.O4);
    drawPin(ctx, env, "A", A);
    drawPin(ctx, env, "B", B);
    drawStylus(ctx, env, "P", P);

    drawAngleAnnotation(ctx, env, config.O2, pose.theta2, "θ₂");
  } else {
    // Can't assemble here: draw the crank (always defined) plus the closure
    // circles as dashed construction geometry so the failure is legible.
    if (pose.A) {
      drawLinkBar(ctx, env, "crank", config.O2, pose.A);
      drawPin(ctx, env, "A", pose.A);

      const a = w2s(env, pose.A);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.warn;
      ctx.beginPath();
      ctx.arc(a.x, a.y, config.couplerLen * env.view.scale, 0, TWO_PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o4.x, o4.y, config.rockerLen * env.view.scale, 0, TWO_PI);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `11px ${MONO_FONT}`;
      ctx.fillStyle = palette.warn;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        "× cannot assemble at this crank angle",
        (o2.x + o4.x) / 2,
        Math.min(o2.y, o4.y) - 40,
      );
    }
    drawFixedPivot(ctx, env, "O2", config.O2);
    drawFixedPivot(ctx, env, "O4", config.O4);
  }
}

/** Hover annotations: coordinates on joints, dimensions on links. */
export function drawFourBarHover(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  config: FourBarConfig,
  pose: FourBarResult,
): void {
  const hovered = env.hovered;
  if (!hovered) return;

  const joints: Partial<Record<string, Vec2>> = pose.ok
    ? { O2: config.O2, O4: config.O4, A: pose.A, B: pose.B, P: pose.P }
    : { O2: config.O2, O4: config.O4, ...(pose.A ? { A: pose.A } : {}) };

  const jw = joints[hovered];
  if (jw) {
    drawCoordBox(ctx, env, jw, JOINT_LABELS[hovered] ?? hovered);
    return;
  }

  const ends: Partial<Record<string, [Vec2, Vec2, number]>> = pose.ok
    ? {
        crank: [config.O2, pose.A, config.crankLen],
        coupler: [pose.A, pose.B, config.couplerLen],
        rocker: [config.O4, pose.B, config.rockerLen],
        ground: [config.O2, config.O4, groundLen(config)],
      }
    : {
        ground: [config.O2, config.O4, groundLen(config)],
        ...(pose.A
          ? { crank: [config.O2, pose.A, config.crankLen] as [Vec2, Vec2, number] }
          : {}),
      };
  const link = ends[hovered];
  if (!link) return;
  drawDimension(ctx, env, link[0], link[1], `${hovered} ${link[2].toFixed(1)} mm`);
}

/** Topmost hit at a screen point: joints first (P > A > B > pivots), then links. */
export function hitFourBar(
  env: DrawEnv,
  config: FourBarConfig,
  pose: FourBarResult,
  s: Vec2,
): string | null {
  const joints: Array<[string, Vec2]> = [];
  if (pose.ok) {
    joints.push(["P", pose.P], ["A", pose.A], ["B", pose.B]);
  } else if (pose.A) {
    joints.push(["A", pose.A]);
  }
  joints.push(["O2", config.O2], ["O4", config.O4]);

  const bars: Array<[string, Vec2, Vec2]> = [];
  if (pose.ok) {
    bars.push(
      ["crank", config.O2, pose.A],
      ["coupler", pose.A, pose.B],
      ["rocker", config.O4, pose.B],
    );
  } else if (pose.A) {
    bars.push(["crank", config.O2, pose.A]);
  }
  bars.push(["ground", config.O2, config.O4]);

  return hitJointsThenBars(env, joints, bars, s);
}