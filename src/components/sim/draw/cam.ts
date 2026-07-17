/**
 * Cam & follower renderer: rotating profile, translating follower on a
 * vertical guide, plus the displacement-diagram inset — s(θ) with a live
 * cursor, the classic cam design drawing.
 */

import {
  add,
  camBaseDist,
  camMaxLift,
  normalizeAnglePositive,
  rotate,
  TWO_PI,
  vec,
  type Vec2,
} from "@/engine";
import type { CamSlice } from "@/store/simStore";
import { MONO_FONT } from "../palette";
import {
  drawAngleAnnotation,
  drawCoordBox,
  drawFixedPivot,
  drawInsetPlot,
  isActive,
  w2s,
  type DrawEnv,
} from "./parts";

export function drawCam(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: CamSlice,
  theta: number,
): void {
  const { palette } = env;
  const c = slice.config;
  const center = w2s(env, c.center);

  // Base/prime circle, dashed construction geometry.
  const baseR =
    (c.kind === "eccentric" ? c.discR - c.ecc : c.baseR) * env.view.scale;
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = palette.inkFaint;
  ctx.lineWidth = 1;
  ctx.arc(center.x, center.y, baseR, 0, TWO_PI);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cam profile (local points rotated by θ).
  if (slice.profile.length > 2) {
    ctx.beginPath();
    slice.profile.forEach((lp, i) => {
      const p = w2s(env, add(c.center, rotate(lp, theta)));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = palette.linkFill;
    ctx.fill();
    ctx.strokeStyle = isActive(env, "center") ? palette.accent : palette.linkStroke;
    ctx.lineWidth = isActive(env, "center") ? 2 : 1.6;
    ctx.stroke();
  }

  // Rotation witness: a keyway line from the hub toward profile zero.
  const witness = w2s(env, add(c.center, rotate(vec(0, baseR / env.view.scale * 0.85), theta)));
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(witness.x, witness.y);
  ctx.strokeStyle = palette.inkFaint;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Camshaft pivot.
  drawFixedPivot(ctx, env, "center", c.center);

  if (slice.pose.ok) {
    const pose = slice.pose;
    const fol = w2s(env, pose.follower);
    const contact = w2s(env, pose.contact);

    // Follower guide: two short rails above the highest lift.
    const guideBottom = camBaseDist(c) + camMaxLift(c) + 6;
    const guideTop = guideBottom + Math.max(30, camMaxLift(c) * 0.8);
    const railOff = 6 * Math.max(1, env.view.scale * 0.5);
    ctx.strokeStyle = palette.inkMuted;
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      const a = w2s(env, add(c.center, vec((side * railOff) / env.view.scale, guideBottom)));
      const b = w2s(env, add(c.center, vec((side * railOff) / env.view.scale, guideTop)));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Follower stem from the face/roller up into the guide.
    const stemTop = w2s(env, add(c.center, vec(0, guideTop)));
    ctx.beginPath();
    ctx.moveTo(fol.x, fol.y);
    ctx.lineTo(stemTop.x, stemTop.y);
    ctx.strokeStyle = palette.linkStroke;
    ctx.lineWidth = Math.max(3, 3 * env.view.scale * 0.8);
    ctx.stroke();

    if (c.follower === "roller") {
      // Roller wheel.
      ctx.beginPath();
      ctx.arc(fol.x, fol.y, Math.max(3, c.rollerR * env.view.scale), 0, TWO_PI);
      ctx.fillStyle = palette.linkFill;
      ctx.fill();
      ctx.strokeStyle = palette.linkStroke;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fol.x, fol.y, Math.max(1.5, c.rollerR * 0.25 * env.view.scale), 0, TWO_PI);
      ctx.stroke();
    } else {
      // Flat face: a plate perpendicular to the stem.
      const half = Math.max(18, (camMaxLift(c) + 14) * env.view.scale * 0.6);
      ctx.beginPath();
      ctx.moveTo(fol.x - half, fol.y);
      ctx.lineTo(fol.x + half, fol.y);
      ctx.strokeStyle = palette.linkStroke;
      ctx.lineWidth = Math.max(3, 2.5 * env.view.scale);
      ctx.stroke();
    }

    // Contact point.
    ctx.beginPath();
    ctx.arc(contact.x, contact.y, 3, 0, TWO_PI);
    ctx.fillStyle = palette.trace;
    ctx.fill();

    // Lift dimension tick beside the follower.
    ctx.font = `10px ${MONO_FONT}`;
    ctx.fillStyle = palette.inkMuted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`s = ${pose.lift.toFixed(1)} mm`, fol.x + 14, fol.y - 10);

    drawAngleAnnotation(ctx, env, c.center, theta, "θ");
  } else {
    ctx.font = `11px ${MONO_FONT}`;
    ctx.fillStyle = palette.warn;
    ctx.textAlign = "center";
    ctx.fillText(`× ${slice.pose.detail}`, center.x, center.y - 30);
  }

  // Displacement diagram inset, top-left.
  drawInsetPlot(ctx, env, {
    x: 12,
    y: 12,
    w: Math.min(300, env.size.w * 0.4),
    h: 110,
    title: "follower displacement s(θ)",
    samples: slice.diagram.lift,
    cursor: normalizeAnglePositive(theta) / TWO_PI,
    xLabel: "θ 0–360°",
    yLabel: `${slice.diagram.maxLift.toFixed(0)} mm`,
  });
}

export function drawCamHover(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: CamSlice,
): void {
  if (env.hovered === "center") {
    drawCoordBox(ctx, env, slice.config.center, "axis");
  } else if (env.hovered === "follower" && slice.pose.ok) {
    drawCoordBox(ctx, env, slice.pose.follower, "follower");
  }
}

export function hitCam(env: DrawEnv, slice: CamSlice, s: Vec2): string | null {
  const c = w2s(env, slice.config.center);
  if (Math.hypot(s.x - c.x, s.y - c.y) <= 14) return "center";
  if (slice.pose.ok) {
    const f = w2s(env, slice.pose.follower);
    if (Math.hypot(s.x - f.x, s.y - f.y) <= 14) return "follower";
  }
  return null;
}