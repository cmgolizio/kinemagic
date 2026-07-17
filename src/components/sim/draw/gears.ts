/**
 * Gear train renderer. Tooth shapes are schematic tabs (the plan allows
 * that); tooth COUNT, positions and phases come straight from the exact
 * solver, so meshes stay visually locked as they turn.
 */

import { add, fromPolar, TWO_PI, type Vec2 } from "@/engine";
import type { GearsSlice } from "@/store/simStore";
import { MONO_FONT } from "../palette";
import {
  drawCoordBox,
  drawFixedPivot,
  isActive,
  w2s,
  type DrawEnv,
} from "./parts";

export function drawGears(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: GearsSlice,
): void {
  const { palette } = env;
  if (!slice.pose.ok) {
    const c = w2s(env, slice.config.center);
    ctx.font = `11px ${MONO_FONT}`;
    ctx.fillStyle = palette.warn;
    ctx.textAlign = "center";
    ctx.fillText(`× ${slice.pose.detail}`, c.x, c.y);
    return;
  }

  const m = slice.config.module;
  const addendum = m; // standard proportions: addendum = module
  const dedendum = 1.25 * m;

  slice.pose.gears.forEach((g, gi) => {
    const id = gi === 0 ? "center" : `gear${gi}`;
    const c = w2s(env, g.center);
    const active = isActive(env, id);
    const rootR = (g.r - dedendum) * env.view.scale;
    const tipR = (g.r + addendum) * env.view.scale;
    const pitchR = g.r * env.view.scale;

    // Body to the root circle.
    ctx.beginPath();
    ctx.arc(c.x, c.y, rootR, 0, TWO_PI);
    ctx.fillStyle = palette.linkFill;
    ctx.fill();
    ctx.strokeStyle = active ? palette.accent : palette.linkStroke;
    ctx.lineWidth = active ? 2 : 1.4;
    ctx.stroke();

    // Teeth: filled tabs root→tip, half a pitch wide, at solver angles.
    const pitch = TWO_PI / g.z;
    const halfTooth = pitch * 0.23;
    ctx.fillStyle = palette.linkFill;
    ctx.strokeStyle = active ? palette.accent : palette.linkStroke;
    ctx.lineWidth = 1;
    for (let k = 0; k < g.z; k++) {
      const a = g.angle + k * pitch;
      // Trapezoid: slightly narrower at the tip (canvas y is down: negate).
      const a1 = -(a - halfTooth);
      const a2 = -(a + halfTooth);
      const t1 = -(a - halfTooth * 0.6);
      const t2 = -(a + halfTooth * 0.6);
      ctx.beginPath();
      ctx.moveTo(c.x + rootR * Math.cos(a1), c.y + rootR * Math.sin(a1));
      ctx.lineTo(c.x + tipR * Math.cos(t1), c.y + tipR * Math.sin(t1));
      ctx.lineTo(c.x + tipR * Math.cos(t2), c.y + tipR * Math.sin(t2));
      ctx.lineTo(c.x + rootR * Math.cos(a2), c.y + rootR * Math.sin(a2));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Pitch circle, dashed — where the ratio lives.
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = palette.inkFaint;
    ctx.lineWidth = 1;
    ctx.arc(c.x, c.y, pitchR, 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rotation witness spoke + hub.
    const spokeEnd = w2s(env, add(g.center, fromPolar(g.r - dedendum - 2, g.angle)));
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(spokeEnd.x, spokeEnd.y);
    ctx.strokeStyle = palette.inkMuted;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    drawFixedPivot(ctx, env, id, g.center);

    // Direction arrow: short arc with an arrowhead, sign from the solver.
    const dir = Math.sign(g.speedRatio) || 1;
    const arcR = pitchR + 12;
    const a0 = Math.PI / 2 - 0.5 * dir;
    const a1 = Math.PI / 2 + 0.5 * dir;
    ctx.beginPath();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.5;
    ctx.arc(c.x, c.y, arcR, -a0, -a1, dir > 0);
    ctx.stroke();
    const tip = { x: c.x + arcR * Math.cos(-a1), y: c.y + arcR * Math.sin(-a1) };
    const tangent = { x: Math.sin(-a1) * dir, y: -Math.cos(-a1) * dir };
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - 6 * tangent.x + 3 * Math.cos(-a1), tip.y - 6 * tangent.y + 3 * Math.sin(-a1));
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - 6 * tangent.x - 3 * Math.cos(-a1), tip.y - 6 * tangent.y - 3 * Math.sin(-a1));
    ctx.stroke();

    // Tooth count + speed label.
    ctx.font = `10px ${MONO_FONT}`;
    ctx.fillStyle = palette.inkMuted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      `z=${g.z}  ω×${g.speedRatio.toFixed(2)}`,
      c.x,
      c.y + tipR + 18,
    );
  });

  // Overall ratio annotation between first and last gear.
  const gears = slice.pose.gears;
  const first = w2s(env, gears[0].center);
  const last = w2s(env, gears[gears.length - 1].center);
  const ratio = slice.pose.overallRatio;
  const label = `ratio ${gears[0].z}:${gears[gears.length - 1].z} → output ×${Math.abs(ratio).toFixed(2)} ${ratio < 0 ? "reversed" : "same direction"}`;
  ctx.font = `11px ${MONO_FONT}`;
  const tw = ctx.measureText(label).width;
  const mx = (first.x + last.x) / 2;
  const my = Math.min(first.y, last.y) - Math.max(...gears.map((g) => (g.r + m) * env.view.scale)) - 26;
  ctx.fillStyle = env.palette.ground;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(mx - tw / 2 - 6, my - 10, tw + 12, 20);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = env.palette.panelBorder;
  ctx.strokeRect(mx - tw / 2 - 6, my - 10, tw + 12, 20);
  ctx.fillStyle = env.palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, mx, my);
}

export function drawGearsHover(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  slice: GearsSlice,
): void {
  if (!env.hovered || !slice.pose.ok) return;
  const idx =
    env.hovered === "center" ? 0 : env.hovered.startsWith("gear") ? Number(env.hovered.slice(4)) : -1;
  const g = slice.pose.gears[idx];
  if (g) drawCoordBox(ctx, env, g.center, `gear ${idx + 1} (r ${g.r.toFixed(1)})`);
}

export function hitGears(env: DrawEnv, slice: GearsSlice, s: Vec2): string | null {
  if (!slice.pose.ok) return null;
  for (let i = 0; i < slice.pose.gears.length; i++) {
    const g = slice.pose.gears[i];
    const c = w2s(env, g.center);
    if (Math.hypot(s.x - c.x, s.y - c.y) <= 14) return i === 0 ? "center" : `gear${i}`;
  }
  return null;
}