/**
 * Straight-line linkage renderer. Watt reuses the four-bar drawing; the
 * Peaucellier cell gets its own: pole, crank, two long arms and the rhombus,
 * with the exact output line drawn as a dashed reference the trace rides.
 */

import type { Vec2 } from "@/engine";
import type { StraightLineSlice } from "@/store/simStore";
import { MONO_FONT } from "../palette";
import { drawFourBarHover, drawFourBarMech, hitFourBar } from "./fourbar";
import {
  drawAngleAnnotation,
  drawCoordBox,
  drawDimension,
  drawFixedPivot,
  drawLinkBar,
  drawPin,
  drawRangeGuide,
  drawRod,
  drawStylus,
  drawTrace,
  hitJointsThenBars,
  w2s,
  type DrawEnv,
} from "./parts";

function drawRefLine(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: StraightLineSlice,
): void {
  if (!slice.refLine) return;
  const { palette } = env;
  const a = w2s(env, slice.refLine.a);
  const b = w2s(env, slice.refLine.b);
  ctx.beginPath();
  ctx.setLineDash([10, 6]);
  ctx.strokeStyle = palette.accentSoft;
  ctx.lineWidth = 1.2;
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Deviation callout: how straight is the straight part, really?
  if (slice.refDev === null) return;
  const label =
    slice.variant === "peaucellier"
      ? "exact straight line (deviation ≈ 0)"
      : `central run within ${slice.refDev.toFixed(2)} mm of straight`;
  ctx.font = `10px ${MONO_FONT}`;
  ctx.fillStyle = palette.inkMuted;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, Math.min(a.x, b.x), Math.min(a.y, b.y) - 6);
}

export function drawStraightLine(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: StraightLineSlice,
): void {
  const { palette } = env;

  if (slice.variant === "watt") {
    if (!slice.wattPose) return;
    drawFourBarMech(ctx, env, slice.watt, slice.wattPose, slice.trace, slice.range);
    drawRefLine(ctx, env, slice);
    return;
  }

  if (!slice.peauPose) return;
  const c = slice.peaucellier;
  const pose = slice.peauPose;

  drawTrace(ctx, env, slice.trace.points, slice.trace.closed);
  drawRefLine(ctx, env, slice);
  drawRangeGuide(ctx, env, pose.ok ? pose.C : c.O, c.crankLen, slice.range);

  if (pose.ok) {
    // Long arms O→A, O→B and the rhombus A-P-B-Q.
    drawRod(ctx, env, "armA", c.O, pose.armA);
    drawRod(ctx, env, "armB", c.O, pose.armB);
    drawRod(ctx, env, "cell", pose.armA, pose.P);
    drawRod(ctx, env, "cell", pose.P, pose.armB);
    drawRod(ctx, env, "cell", pose.armB, pose.Q);
    drawRod(ctx, env, "cell", pose.Q, pose.armA);
    drawLinkBar(ctx, env, "crank", pose.C, pose.P);

    drawFixedPivot(ctx, env, "O", c.O);
    drawFixedPivot(ctx, env, "C", pose.C);
    drawPin(ctx, env, "armA", pose.armA);
    drawPin(ctx, env, "armB", pose.armB);
    drawPin(ctx, env, "P", pose.P);
    drawStylus(ctx, env, "Q", pose.Q);

    drawAngleAnnotation(ctx, env, pose.C, pose.theta, "θ");
  } else {
    // Crank tip still shows where the cell would have to reach.
    if (pose.P) {
      const C = w2s(env, { x: c.O.x + c.crankLen * Math.cos(c.axisAngle), y: c.O.y + c.crankLen * Math.sin(c.axisAngle) });
      const P = w2s(env, pose.P);
      ctx.beginPath();
      ctx.moveTo(C.x, C.y);
      ctx.lineTo(P.x, P.y);
      ctx.strokeStyle = palette.warn;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `11px ${MONO_FONT}`;
      ctx.fillStyle = palette.warn;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`× ${pose.detail}`, P.x, P.y - 14);
    }
    drawFixedPivot(ctx, env, "O", c.O);
  }
}

export function drawStraightLineHover(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: StraightLineSlice,
): void {
  if (!env.hovered) return;

  if (slice.variant === "watt") {
    if (slice.wattPose) drawFourBarHover(ctx, env, slice.watt, slice.wattPose);
    return;
  }
  const pose = slice.peauPose;
  if (!pose?.ok) return;
  const c = slice.peaucellier;
  switch (env.hovered) {
    case "O":
      drawCoordBox(ctx, env, c.O, "O (pole)");
      break;
    case "C":
      drawCoordBox(ctx, env, pose.C, "C (crank pivot)");
      break;
    case "P":
      drawCoordBox(ctx, env, pose.P, "P");
      break;
    case "Q":
      drawCoordBox(ctx, env, pose.Q, "Q (output)");
      break;
    case "crank":
      drawDimension(ctx, env, pose.C, pose.P, `crank ${c.crankLen.toFixed(1)} mm`);
      break;
    case "armA":
      drawDimension(ctx, env, c.O, pose.armA, `arm ${c.armLen.toFixed(1)} mm`);
      break;
    case "armB":
      drawDimension(ctx, env, c.O, pose.armB, `arm ${c.armLen.toFixed(1)} mm`);
      break;
    case "cell":
      drawDimension(ctx, env, pose.armA, pose.P, `side ${c.cellSide.toFixed(1)} mm`);
      break;
  }
}

export function hitStraightLine(
  env: DrawEnv,
  slice: StraightLineSlice,
  s: Vec2,
): string | null {
  if (slice.variant === "watt") {
    return slice.wattPose ? hitFourBar(env, slice.watt, slice.wattPose, s) : null;
  }
  const pose = slice.peauPose;
  const c = slice.peaucellier;
  if (!pose?.ok) {
    return hitJointsThenBars(env, [["O", c.O]], [], s);
  }
  return hitJointsThenBars(
    env,
    [
      ["Q", pose.Q],
      ["P", pose.P],
      ["armA", pose.armA],
      ["armB", pose.armB],
      ["C", pose.C],
      ["O", c.O],
    ],
    [
      ["crank", pose.C, pose.P],
      ["armA", c.O, pose.armA],
      ["armB", c.O, pose.armB],
      ["cell", pose.armA, pose.P],
      ["cell", pose.P, pose.armB],
      ["cell", pose.armB, pose.Q],
      ["cell", pose.Q, pose.armA],
    ],
    s,
  );
}