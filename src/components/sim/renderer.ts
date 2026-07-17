/**
 * Canvas 2D renderer for the simulation surface. Pure drawing — reads a
 * scene snapshot, writes pixels, holds no state. The graph-paper grid is
 * shared; everything mechanism-specific dispatches to draw/<type>.
 */

import { dist, TWO_PI, type Vec2 } from "@/engine";
import {
  measurableJoints,
  traceBounds,
  type GhostCurve,
  type MeasureState,
  type MechSlice,
} from "@/store/simStore";
import { MONO_FONT, type Palette } from "./palette";
import type { ScreenSize, ViewState } from "./view";
import { drawDimension, drawGhostTrace, w2s, type DrawEnv } from "./draw/parts";
import { drawFourBarHover, drawFourBarMech, hitFourBar } from "./draw/fourbar";
import {
  drawSliderCrank,
  drawSliderCrankHover,
  hitSliderCrank,
} from "./draw/slidercrank";
import { drawCam, drawCamHover, hitCam } from "./draw/cam";
import { drawGears, drawGearsHover, hitGears } from "./draw/gears";
import { drawGeneva, drawGenevaHover, hitGeneva } from "./draw/geneva";
import {
  drawStraightLine,
  drawStraightLineHover,
  hitStraightLine,
} from "./draw/straightline";

export interface Scene {
  view: ViewState;
  size: ScreenSize;
  palette: Palette;
  mech: MechSlice;
  theta: number;
  hovered: string | null;
  selected: string | null;
  measure: MeasureState;
  ghost: GhostCurve | null;
  showCurveBox: boolean;
}

const env = (scene: Scene): DrawEnv => ({
  view: scene.view,
  size: scene.size,
  palette: scene.palette,
  hovered: scene.hovered,
  selected: scene.selected,
});

export function render(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { size } = scene;
  ctx.clearRect(0, 0, size.w, size.h);
  drawGrid(ctx, scene);

  const e = env(scene);
  const mech = scene.mech;

  // Pinned comparison curve sits under the live drawing.
  if (scene.ghost) drawGhostTrace(ctx, e, scene.ghost.points, scene.ghost.closed);

  switch (mech.type) {
    case "fourbar":
      drawFourBarMech(ctx, e, mech.config, mech.pose, mech.trace, mech.range);
      drawFourBarHover(ctx, e, mech.config, mech.pose);
      break;
    case "slidercrank":
      drawSliderCrank(ctx, e, mech);
      drawSliderCrankHover(ctx, e, mech);
      break;
    case "cam":
      drawCam(ctx, e, mech, scene.theta);
      drawCamHover(ctx, e, mech);
      break;
    case "gears":
      drawGears(ctx, e, mech);
      drawGearsHover(ctx, e, mech);
      break;
    case "geneva":
      drawGeneva(ctx, e, mech, scene.theta);
      drawGenevaHover(ctx, e, mech);
      break;
    case "straightline":
      drawStraightLine(ctx, e, mech);
      drawStraightLineHover(ctx, e, mech);
      break;
  }

  if (scene.showCurveBox) drawCurveBox(ctx, e, mech);
  drawMeasure(ctx, e, mech, scene.measure);
}

// ---------------------------------------------------------------------------
// Measure tool & curve bounding box
// ---------------------------------------------------------------------------

function drawMeasure(
  ctx: CanvasRenderingContext2D,
  e: DrawEnv,
  mech: MechSlice,
  measure: MeasureState,
): void {
  if (!measure.a && !measure.active) return;
  const joints = measurableJoints(mech);
  const find = (id: string | null) => joints.find((j) => j.id === id);
  const a = find(measure.a);
  const b = find(measure.b);

  // Rings on the picked joints so the pair reads at a glance.
  for (const j of [a, b]) {
    if (!j) continue;
    const p = w2s(e, j.w);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, TWO_PI);
    ctx.strokeStyle = e.palette.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (a && b) {
    drawDimension(
      ctx,
      e,
      a.w,
      b.w,
      `${a.label}–${b.label} ${dist(a.w, b.w).toFixed(1)} mm`,
    );
  } else if (measure.active) {
    // Prompt while the pair is incomplete.
    ctx.font = `11px ${MONO_FONT}`;
    ctx.fillStyle = e.palette.inkMuted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      a ? `${a.label} picked — click a second joint` : "measure: click a joint",
      e.size.w / 2,
      10,
    );
  }
}

function drawCurveBox(
  ctx: CanvasRenderingContext2D,
  e: DrawEnv,
  mech: MechSlice,
): void {
  const bounds = traceBounds(mech);
  if (!bounds) return;
  const tl = w2s(e, { x: bounds.min.x, y: bounds.max.y });
  const br = w2s(e, { x: bounds.max.x, y: bounds.min.y });
  const w = bounds.max.x - bounds.min.x;
  const h = bounds.max.y - bounds.min.y;

  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = e.palette.inkMuted;
  ctx.lineWidth = 1;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.setLineDash([]);

  ctx.font = `10px ${MONO_FONT}`;
  ctx.fillStyle = e.palette.inkMuted;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    `${w.toFixed(1)} × ${h.toFixed(1)} mm`,
    (tl.x + br.x) / 2,
    tl.y - 4,
  );
}

/** Topmost interactive element at a screen point. */
export function hitTest(scene: Scene, s: Vec2): string | null {
  const e = env(scene);
  const mech = scene.mech;
  switch (mech.type) {
    case "fourbar":
      return hitFourBar(e, mech.config, mech.pose, s);
    case "slidercrank":
      return hitSliderCrank(e, mech, s);
    case "cam":
      return hitCam(e, mech, s);
    case "gears":
      return hitGears(e, mech, s);
    case "geneva":
      return hitGeneva(e, mech, s);
    case "straightline":
      return hitStraightLine(e, mech, s);
  }
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

const GRID_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

function drawGrid(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { view, size, palette } = scene;
  const minor =
    GRID_STEPS.find((s) => s * view.scale >= 9) ?? GRID_STEPS[GRID_STEPS.length - 1];
  const major = minor * 5;

  const left = view.cx - size.w / 2 / view.scale;
  const right = view.cx + size.w / 2 / view.scale;
  const bottom = view.cy - size.h / 2 / view.scale;
  const top = view.cy + size.h / 2 / view.scale;

  ctx.lineWidth = 1;

  const isMajor = (v: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6;

  // Two passes so major lines aren't overpainted by minors.
  for (const pass of ["minor", "major"] as const) {
    ctx.strokeStyle = pass === "minor" ? palette.gridMinor : palette.gridMajor;
    ctx.beginPath();
    for (let x = Math.ceil(left / minor) * minor; x <= right; x += minor) {
      if (isMajor(x) !== (pass === "major")) continue;
      const sx = Math.round(size.w / 2 + (x - view.cx) * view.scale) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size.h);
    }
    for (let y = Math.ceil(bottom / minor) * minor; y <= top; y += minor) {
      if (isMajor(y) !== (pass === "major")) continue;
      const sy = Math.round(size.h / 2 - (y - view.cy) * view.scale) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(size.w, sy);
    }
    ctx.stroke();
  }

  // World axes through the origin
  ctx.strokeStyle = palette.gridAxis;
  ctx.beginPath();
  const ox = size.w / 2 + (0 - view.cx) * view.scale;
  const oy = size.h / 2 - (0 - view.cy) * view.scale;
  if (ox >= 0 && ox <= size.w) {
    ctx.moveTo(Math.round(ox) + 0.5, 0);
    ctx.lineTo(Math.round(ox) + 0.5, size.h);
  }
  if (oy >= 0 && oy <= size.h) {
    ctx.moveTo(0, Math.round(oy) + 0.5);
    ctx.lineTo(size.w, Math.round(oy) + 0.5);
  }
  ctx.stroke();

  // Origin marker
  if (ox >= -20 && ox <= size.w + 20 && oy >= -20 && oy <= size.h + 20) {
    ctx.beginPath();
    ctx.arc(ox, oy, 4, 0, TWO_PI);
    ctx.stroke();
  }

  // mm labels on major lines, along the bottom and left edges
  ctx.font = `9px ${MONO_FONT}`;
  ctx.fillStyle = palette.inkFaint;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let x = Math.ceil(left / major) * major; x <= right; x += major) {
    const sx = size.w / 2 + (x - view.cx) * view.scale;
    ctx.fillText(String(x), sx, size.h - 3);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let y = Math.ceil(bottom / major) * major; y <= top; y += major) {
    const sy = size.h / 2 - (y - view.cy) * view.scale;
    ctx.fillText(String(y), 4, sy);
  }
  // Grid legend: current minor spacing
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = palette.inkMuted;
  ctx.fillText(`grid ${minor} mm`, size.w - 6, size.h - 3);
}