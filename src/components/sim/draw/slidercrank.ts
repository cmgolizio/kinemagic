/**
 * Slider-crank renderer: crank, connecting rod, slider block on its track.
 */

import { add, fromPolar, perp, scale, type Vec2 } from "@/engine";
import type { SliderCrankSlice } from "@/store/simStore";
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

/** Slider block half-size, mm. */
const BLOCK_HALF_L = 14;
const BLOCK_HALF_W = 9;

interface TrackFrame {
  axis: Vec2;
  normal: Vec2;
  origin: Vec2; // O2's foot on the slider line
  lo: number;
  hi: number;
}

function trackFrame(slice: SliderCrankSlice): TrackFrame {
  const c = slice.config;
  const axis = fromPolar(1, c.axisAngle);
  const normal = perp(axis);
  const origin = add(c.O2, scale(normal, c.offset));
  const pad = BLOCK_HALF_L + 10;
  const lo = (slice.stroke?.min ?? -c.rodLen) - pad;
  const hi = (slice.stroke?.max ?? c.rodLen) + pad;
  return { axis, normal, origin, lo, hi };
}

export function drawSliderCrank(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: SliderCrankSlice,
): void {
  const { palette } = env;
  const c = slice.config;
  const { axis, normal, origin, lo, hi } = trackFrame(slice);

  drawTrace(ctx, env, slice.trace.points, slice.trace.closed);
  drawRangeGuide(ctx, env, c.O2, c.crankLen, slice.range);

  // Track: two rails just outside the block, with end stops.
  const railOff = BLOCK_HALF_W + 1.5;
  ctx.strokeStyle = palette.inkMuted;
  ctx.lineWidth = 1.2;
  for (const side of [1, -1]) {
    const a = w2s(env, add(origin, add(scale(axis, lo), scale(normal, side * railOff))));
    const b = w2s(env, add(origin, add(scale(axis, hi), scale(normal, side * railOff))));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Hatching under the far rail — it's grounded.
  ctx.beginPath();
  ctx.lineWidth = 1;
  const hatchStep = 12 / env.view.scale;
  for (let t = lo; t <= hi; t += hatchStep) {
    const base = add(origin, add(scale(axis, t), scale(normal, -railOff)));
    const tip = add(base, add(scale(axis, -4 / env.view.scale), scale(normal, -6 / env.view.scale)));
    const a = w2s(env, base);
    const b = w2s(env, tip);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = palette.inkFaint;
  ctx.stroke();

  if (slice.pose.ok) {
    const { A, B, P } = slice.pose;

    // Slider block, oriented along the axis.
    const corners = [
      add(B, add(scale(axis, BLOCK_HALF_L), scale(normal, BLOCK_HALF_W))),
      add(B, add(scale(axis, BLOCK_HALF_L), scale(normal, -BLOCK_HALF_W))),
      add(B, add(scale(axis, -BLOCK_HALF_L), scale(normal, -BLOCK_HALF_W))),
      add(B, add(scale(axis, -BLOCK_HALF_L), scale(normal, BLOCK_HALF_W))),
    ].map((p) => w2s(env, p));
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = palette.linkFill;
    ctx.fill();
    ctx.strokeStyle = isActive(env, "B") ? palette.accent : palette.linkStroke;
    ctx.lineWidth = isActive(env, "B") ? 2 : 1.4;
    ctx.stroke();

    // Rod trace-point tie (when P is off the rod line).
    if (c.rodPoint && Math.abs(c.rodPoint.v) > 0.5) {
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

    drawLinkBar(ctx, env, "rod", A, B);
    drawLinkBar(ctx, env, "crank", c.O2, A);
    drawFixedPivot(ctx, env, "O2", c.O2);
    drawPin(ctx, env, "A", A);
    drawPin(ctx, env, "B", B);
    drawStylus(ctx, env, "P", P);
    drawAngleAnnotation(ctx, env, c.O2, slice.pose.theta2, "θ₂");
  } else {
    if (slice.pose.A) {
      drawLinkBar(ctx, env, "crank", c.O2, slice.pose.A);
      drawPin(ctx, env, "A", slice.pose.A);
      const a = w2s(env, slice.pose.A);
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = palette.warn;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x, a.y, c.rodLen * env.view.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `11px ${MONO_FONT}`;
      ctx.fillStyle = palette.warn;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const o2 = w2s(env, c.O2);
      ctx.fillText("× rod cannot reach the track here", o2.x, o2.y - 40);
    }
    drawFixedPivot(ctx, env, "O2", c.O2);
  }
}

export function drawSliderCrankHover(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: SliderCrankSlice,
): void {
  const hovered = env.hovered;
  if (!hovered) return;
  const c = slice.config;
  const pose = slice.pose;

  const joints: Partial<Record<string, Vec2>> = pose.ok
    ? { O2: c.O2, A: pose.A, B: pose.B, P: pose.P }
    : { O2: c.O2, ...(pose.A ? { A: pose.A } : {}) };
  const jw = joints[hovered];
  if (jw) {
    drawCoordBox(ctx, env, jw, hovered === "O2" ? "O₂" : hovered);
    return;
  }

  if (!pose.ok) return;
  if (hovered === "crank") {
    drawDimension(ctx, env, c.O2, pose.A, `crank ${c.crankLen.toFixed(1)} mm`);
  } else if (hovered === "rod") {
    drawDimension(ctx, env, pose.A, pose.B, `rod ${c.rodLen.toFixed(1)} mm`);
  } else if (hovered === "track" && slice.stroke) {
    const { axis, origin } = trackFrame(slice);
    drawDimension(
      ctx,
      env,
      add(origin, scale(axis, slice.stroke.min)),
      add(origin, scale(axis, slice.stroke.max)),
      `stroke ${(slice.stroke.max - slice.stroke.min).toFixed(1)} mm`,
    );
  }
}

export function hitSliderCrank(
  env: DrawEnv,
  slice: SliderCrankSlice,
  s: Vec2,
): string | null {
  const c = slice.config;
  const pose = slice.pose;
  const joints: Array<[string, Vec2]> = [];
  if (pose.ok) joints.push(["P", pose.P], ["A", pose.A], ["B", pose.B]);
  else if (pose.A) joints.push(["A", pose.A]);
  joints.push(["O2", c.O2]);

  const bars: Array<[string, Vec2, Vec2]> = [];
  if (pose.ok) {
    bars.push(["crank", c.O2, pose.A], ["rod", pose.A, pose.B]);
  } else if (pose.A) {
    bars.push(["crank", c.O2, pose.A]);
  }
  const { axis, origin, lo, hi } = trackFrame(slice);
  bars.push(["track", add(origin, scale(axis, lo)), add(origin, scale(axis, hi))]);

  return hitJointsThenBars(env, joints, bars, s);
}