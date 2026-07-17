/**
 * Geneva drive renderer: pin-carrying driver with a locking crescent, and
 * the slotted wheel it indexes. The inset plots wheel angle vs driver angle
 * — the flat dwell steps are the whole point of the mechanism.
 */

import {
  genevaSlotAngles,
  normalizeAngle,
  radToDeg,
  TWO_PI,
  type Vec2,
} from "@/engine";
import type { GenevaSlice } from "@/store/simStore";
import { MONO_FONT } from "../palette";
import {
  drawCoordBox,
  drawFixedPivot,
  drawInsetPlot,
  isActive,
  w2s,
  type DrawEnv,
} from "./parts";

export function drawGeneva(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: GenevaSlice,
  theta: number,
): void {
  const { palette } = env;
  const g = slice.geom;
  const c = slice.config;

  if (!slice.pose.ok) {
    const p = w2s(env, c.center);
    ctx.font = `11px ${MONO_FONT}`;
    ctx.fillStyle = palette.warn;
    ctx.textAlign = "center";
    ctx.fillText(`× ${slice.pose.detail}`, p.x, p.y);
    return;
  }
  const pose = slice.pose;
  const driver = w2s(env, g.driverCenter);
  const wheel = w2s(env, g.wheelCenter);
  const scalePx = env.view.scale;

  // --- Wheel: disc + slots + rim ------------------------------------------
  const wheelR = g.wheelR * scalePx;
  const slotHalfW = Math.max(2.5, g.pinCircleR * 0.09 * scalePx);
  const slotInner = g.slotInnerR * scalePx;

  ctx.beginPath();
  ctx.arc(wheel.x, wheel.y, wheelR, 0, TWO_PI);
  ctx.fillStyle = palette.linkFill;
  ctx.fill();
  ctx.strokeStyle = isActive(env, "wheel") ? palette.accent : palette.linkStroke;
  ctx.lineWidth = isActive(env, "wheel") ? 2 : 1.5;
  ctx.stroke();

  // Slots: cut from rim down to the pin's deepest reach.
  for (const a of genevaSlotAngles(c, pose.wheelAngle)) {
    const dir = { x: Math.cos(a), y: -Math.sin(a) }; // screen y down
    const n = { x: -dir.y, y: dir.x };
    const inner = { x: wheel.x + dir.x * slotInner, y: wheel.y + dir.y * slotInner };
    const outer = { x: wheel.x + dir.x * (wheelR + 1), y: wheel.y + dir.y * (wheelR + 1) };
    ctx.beginPath();
    ctx.moveTo(inner.x + n.x * slotHalfW, inner.y + n.y * slotHalfW);
    ctx.lineTo(outer.x + n.x * slotHalfW, outer.y + n.y * slotHalfW);
    ctx.lineTo(outer.x - n.x * slotHalfW, outer.y - n.y * slotHalfW);
    ctx.lineTo(inner.x - n.x * slotHalfW, inner.y - n.y * slotHalfW);
    ctx.closePath();
    ctx.fillStyle = palette.ground;
    ctx.fill();
    ctx.strokeStyle = palette.linkStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Round slot bottom.
    ctx.beginPath();
    ctx.arc(inner.x, inner.y, slotHalfW, 0, TWO_PI);
    ctx.fillStyle = palette.ground;
    ctx.fill();
    ctx.stroke();
  }

  // Wheel hub.
  ctx.beginPath();
  ctx.arc(wheel.x, wheel.y, Math.max(4, wheelR * 0.12), 0, TWO_PI);
  ctx.fillStyle = palette.ground;
  ctx.fill();
  ctx.strokeStyle = palette.linkStroke;
  ctx.stroke();

  // --- Driver: locking disc with a relief mouth around the pin ------------
  const lockR = g.lockR * 0.96 * scalePx;
  const mouth = g.halfWindow + 0.35; // relief so wheel corners clear
  ctx.beginPath();
  // Pac-man: arc everywhere except the mouth around the pin direction.
  ctx.moveTo(driver.x, driver.y);
  ctx.arc(driver.x, driver.y, lockR, -(theta + mouth), -(theta - mouth) + 0, false);
  ctx.closePath();
  // Note: arc from θ+mouth CCW around to θ−mouth (canvas y down: negated).
  ctx.fillStyle = palette.linkFill;
  ctx.fill();
  ctx.strokeStyle = isActive(env, "center") ? palette.accent : palette.linkStroke;
  ctx.lineWidth = isActive(env, "center") ? 2 : 1.5;
  ctx.stroke();

  // Driver arm out to the pin.
  const pin = w2s(env, pose.pin);
  ctx.beginPath();
  ctx.moveTo(driver.x, driver.y);
  ctx.lineTo(pin.x, pin.y);
  ctx.strokeStyle = palette.linkStroke;
  ctx.lineWidth = Math.max(3, 3 * scalePx);
  ctx.stroke();

  // Pin circle path, ghosted.
  ctx.beginPath();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = palette.inkFaint;
  ctx.lineWidth = 1;
  ctx.arc(driver.x, driver.y, g.pinCircleR * scalePx, 0, TWO_PI);
  ctx.stroke();
  ctx.setLineDash([]);

  // The pin itself.
  ctx.beginPath();
  ctx.arc(pin.x, pin.y, Math.max(3.5, slotHalfW * 0.9), 0, TWO_PI);
  ctx.fillStyle = pose.engaged ? palette.trace : palette.linkStroke;
  ctx.fill();

  drawFixedPivot(ctx, env, "center", g.driverCenter);

  // Status annotation.
  ctx.font = `10px ${MONO_FONT}`;
  ctx.fillStyle = pose.engaged ? palette.trace : palette.inkMuted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(
    pose.engaged ? "indexing" : "dwell (wheel locked)",
    wheel.x,
    wheel.y + wheelR + 10,
  );

  // Inset: wheel angle vs driver angle across one revolution.
  const delta = normalizeAngle(theta - c.wheelDir);
  drawInsetPlot(ctx, env, {
    x: 12,
    y: 12,
    w: Math.min(300, env.size.w * 0.4),
    h: 110,
    title: `wheel angle vs driver (${c.slots} slots)`,
    samples: slice.diagram.map((a) => radToDeg(a)),
    cursor: (delta + Math.PI) / TWO_PI,
    xLabel: "driver −180°→180°",
    yLabel: `${(360 / c.slots).toFixed(0)}°/index`,
  });
}

export function drawGenevaHover(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: GenevaSlice,
): void {
  if (env.hovered === "center") drawCoordBox(ctx, env, slice.geom.driverCenter, "driver");
  else if (env.hovered === "wheel") drawCoordBox(ctx, env, slice.geom.wheelCenter, "wheel");
}

export function hitGeneva(env: DrawEnv, slice: GenevaSlice, s: Vec2): string | null {
  const d = w2s(env, slice.geom.driverCenter);
  if (Math.hypot(s.x - d.x, s.y - d.y) <= 14) return "center";
  const wc = w2s(env, slice.geom.wheelCenter);
  if (Math.hypot(s.x - wc.x, s.y - wc.y) <= 14) return "wheel";
  return null;
}