/**
 * Canvas 2D renderer for the simulation surface. Pure drawing — reads a
 * scene snapshot, writes pixels, holds no state. All world geometry is mm;
 * hardware-ish details (pin bores, capsule width) are specified in mm so the
 * mechanism reads as a physical object, with px floors for legibility.
 */

import {
  normalizeAnglePositive,
  radToDeg,
  sub,
  TWO_PI,
  type CouplerCurve,
  type FourBarConfig,
  type FourBarResult,
  type GrashofResult,
  type InputRange,
  type Vec2,
} from "@/engine";
import type { SelectableId } from "@/store/simStore";
import { MONO_FONT, type Palette } from "./palette";
import { worldToScreen, type ScreenSize, type ViewState } from "./view";

export interface Scene {
  view: ViewState;
  size: ScreenSize;
  palette: Palette;
  def: FourBarConfig;
  pose: FourBarResult;
  trace: CouplerCurve;
  range: InputRange;
  grashof: GrashofResult;
  theta2: number;
  hovered: SelectableId | null;
  selected: SelectableId | null;
}

// Physical proportions (mm)
const LINK_HALF_W = 4.5;
const BORE_R = 2.2;
const PIN_R = 3.2;

const GRID_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

export function render(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { size } = scene;
  ctx.clearRect(0, 0, size.w, size.h);
  drawGrid(ctx, scene);
  drawTrace(ctx, scene);
  drawCrankGuide(ctx, scene);
  drawMechanism(ctx, scene);
  drawHoverAnnotations(ctx, scene);
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Coupler trace
// ---------------------------------------------------------------------------

function tracePath(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  points: Vec2[],
  closed: boolean,
): void {
  const { view, size } = scene;
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = worldToScreen(view, size, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (closed) ctx.closePath();
}

function drawTrace(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { palette, trace } = scene;
  if (trace.points.length < 2) return;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Glow pass under the core stroke — the hero visual.
  tracePath(ctx, scene, trace.points, trace.closed);
  ctx.strokeStyle = palette.traceGlow;
  ctx.lineWidth = 7;
  ctx.stroke();

  tracePath(ctx, scene, trace.points, trace.closed);
  ctx.strokeStyle = palette.trace;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Crank guide: reachable / unreachable input arcs
// ---------------------------------------------------------------------------

function drawCrankGuide(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { view, size, palette, def, range } = scene;
  if (range.full) return;

  const c = worldToScreen(view, size, def.O2);
  const r = def.crankLen * view.scale;

  // Whole crank circle, ghosted: where the pin cannot go.
  ctx.beginPath();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = palette.warn;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.arc(c.x, c.y, r, 0, TWO_PI);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (range.arcs.length === 0) return;

  // Solid overlay on the reachable arcs (canvas arcs are y-down: negate).
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;
  for (const arc of range.arcs) {
    let span = arc.end - arc.start;
    if (span < 0) span += TWO_PI;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, -arc.start, -(arc.start + span), true);
    ctx.stroke();

    // Limit ticks + angle labels at the arc ends
    ctx.font = `10px ${MONO_FONT}`;
    ctx.fillStyle = palette.inkMuted;
    for (const edge of [arc.start, arc.end]) {
      const dir = { x: Math.cos(edge), y: Math.sin(edge) };
      const p1 = { x: c.x + dir.x * (r - 5), y: c.y - dir.y * (r - 5) };
      const p2 = { x: c.x + dir.x * (r + 5), y: c.y - dir.y * (r + 5) };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      const lp = { x: c.x + dir.x * (r + 16), y: c.y - dir.y * (r + 16) };
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${radToDeg(edge).toFixed(0)}°`, lp.x, lp.y);
    }
  }
}

// ---------------------------------------------------------------------------
// Mechanism
// ---------------------------------------------------------------------------

function capsulePath(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  r: number,
): void {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.arc(a.x, a.y, r, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(b.x, b.y, r, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

function drawLinkBar(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  id: SelectableId,
  wa: Vec2,
  wb: Vec2,
): void {
  const { view, size, palette, hovered, selected } = scene;
  const a = worldToScreen(view, size, wa);
  const b = worldToScreen(view, size, wb);
  const r = Math.max(4, LINK_HALF_W * view.scale);
  const active = hovered === id || selected === id;

  capsulePath(ctx, a, b, r);
  ctx.fillStyle = palette.linkFill;
  ctx.fill();
  ctx.strokeStyle = active ? palette.accent : palette.linkStroke;
  ctx.lineWidth = active ? 2 : 1.4;
  ctx.stroke();

  // Pivot bores at both ends — the part you'd bolt through.
  const bore = Math.max(2.5, BORE_R * view.scale);
  ctx.strokeStyle = active ? palette.accent : palette.linkStroke;
  ctx.lineWidth = 1;
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, bore, 0, TWO_PI);
    ctx.stroke();
  }
}

function drawFixedPivot(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  id: SelectableId,
  w: Vec2,
): void {
  const { view, size, palette, hovered, selected } = scene;
  const p = worldToScreen(view, size, w);
  const active = hovered === id || selected === id;
  const s = 15; // screen-space size: the support symbol shouldn't scale away

  ctx.strokeStyle = active ? palette.accent : palette.inkMuted;
  ctx.fillStyle = palette.ground;
  ctx.lineWidth = 1.2;

  // Ground triangle
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - s * 0.8, p.y + s);
  ctx.lineTo(p.x + s * 0.8, p.y + s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Ground line + hatching
  ctx.beginPath();
  ctx.moveTo(p.x - s * 1.15, p.y + s);
  ctx.lineTo(p.x + s * 1.15, p.y + s);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const hx = p.x - s * 0.9 + i * s * 0.45;
    ctx.moveTo(hx, p.y + s);
    ctx.lineTo(hx - s * 0.35, p.y + s * 1.4);
  }
  ctx.stroke();

  // Pin
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(3.5, PIN_R * view.scale * 0.8), 0, TWO_PI);
  ctx.fillStyle = active ? palette.accent : palette.inkMuted;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(1.6, BORE_R * view.scale * 0.5), 0, TWO_PI);
  ctx.fillStyle = palette.ground;
  ctx.fill();

  if (active) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, TWO_PI);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  id: SelectableId,
  w: Vec2,
): void {
  const { view, size, palette, hovered, selected } = scene;
  const p = worldToScreen(view, size, w);
  const active = hovered === id || selected === id;
  const r = Math.max(4, PIN_R * view.scale);

  if (active) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6, 0, TWO_PI);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TWO_PI);
  ctx.fillStyle = active ? palette.accent : palette.linkStroke;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(1.8, BORE_R * view.scale * 0.55), 0, TWO_PI);
  ctx.fillStyle = palette.ground;
  ctx.fill();
}

function drawCouplerPoint(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  w: Vec2,
): void {
  const { view, size, palette, hovered, selected } = scene;
  const p = worldToScreen(view, size, w);
  const active = hovered === "P" || selected === "P";
  const r = active ? 7 : 5.5;

  if (active) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6, 0, TWO_PI);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // The tracing stylus: filled dot in trace color with a crosshair.
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TWO_PI);
  ctx.fillStyle = palette.trace;
  ctx.fill();
  ctx.strokeStyle = palette.ground;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x - r + 2, p.y);
  ctx.lineTo(p.x + r - 2, p.y);
  ctx.moveTo(p.x, p.y - r + 2);
  ctx.lineTo(p.x, p.y + r - 2);
  ctx.stroke();
}

function drawMechanism(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { view, size, palette, def, pose, hovered, selected } = scene;

  // Ground link: the frame — drawn faintly, dashed centerline style.
  const o2 = worldToScreen(view, size, def.O2);
  const o4 = worldToScreen(view, size, def.O4);
  ctx.beginPath();
  ctx.setLineDash([8, 4, 2, 4]);
  ctx.strokeStyle =
    hovered === "ground" || selected === "ground" ? palette.accent : palette.inkFaint;
  ctx.lineWidth = hovered === "ground" || selected === "ground" ? 2 : 1.2;
  ctx.moveTo(o2.x, o2.y);
  ctx.lineTo(o4.x, o4.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (pose.ok) {
    const { A, B, P } = pose;

    // Coupler rigid body: when P is off the A–B line, show the rigid triangle.
    const pOff =
      Math.abs(def.couplerPoint.v) > 0.5 ||
      def.couplerPoint.u < -0.5 ||
      def.couplerPoint.u > def.couplerLen + 0.5;
    if (pOff) {
      const a = worldToScreen(view, size, A);
      const b = worldToScreen(view, size, B);
      const pp = worldToScreen(view, size, P);
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

    drawLinkBar(ctx, scene, "coupler", A, B);
    drawLinkBar(ctx, scene, "rocker", def.O4, B);
    drawLinkBar(ctx, scene, "crank", def.O2, A);

    drawFixedPivot(ctx, scene, "O2", def.O2);
    drawFixedPivot(ctx, scene, "O4", def.O4);
    drawPin(ctx, scene, "A", A);
    drawPin(ctx, scene, "B", B);
    drawCouplerPoint(ctx, scene, P);

    drawCrankAngle(ctx, scene);
  } else {
    // Can't assemble here: draw the crank (always defined) plus the closure
    // circles as dashed construction geometry so the failure is legible.
    if (pose.A) {
      drawLinkBar(ctx, scene, "crank", def.O2, pose.A);
      drawPin(ctx, scene, "A", pose.A);

      const a = worldToScreen(view, size, pose.A);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.warn;
      ctx.beginPath();
      ctx.arc(a.x, a.y, def.couplerLen * view.scale, 0, TWO_PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o4.x, o4.y, def.rockerLen * view.scale, 0, TWO_PI);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `11px ${MONO_FONT}`;
      ctx.fillStyle = palette.warn;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("× cannot assemble at this crank angle", (o2.x + o4.x) / 2, Math.min(o2.y, o4.y) - 40);
    }
    drawFixedPivot(ctx, scene, "O2", def.O2);
    drawFixedPivot(ctx, scene, "O4", def.O4);
  }
}

/** Small angle arc + θ₂ readout at the crank pivot — drafting annotation. */
function drawCrankAngle(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { view, size, palette, def, theta2 } = scene;
  const c = worldToScreen(view, size, def.O2);
  const r = 26;
  const t = normalizeAnglePositive(theta2);

  ctx.beginPath();
  ctx.strokeStyle = palette.inkMuted;
  ctx.lineWidth = 1;
  // baseline tick along +x
  ctx.moveTo(c.x + r + 4, c.y);
  ctx.lineTo(c.x + r - 4, c.y);
  ctx.stroke();
  ctx.beginPath();
  // canvas y is down: sweep from 0 to -t counterclockwise on screen
  ctx.arc(c.x, c.y, r, 0, -t, true);
  ctx.stroke();

  const mid = t / 2;
  ctx.font = `10px ${MONO_FONT}`;
  ctx.fillStyle = palette.inkMuted;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `θ₂ ${radToDeg(t).toFixed(1)}°`,
    c.x + (r + 22) * Math.cos(mid),
    c.y - (r + 14) * Math.sin(mid),
  );
}

// ---------------------------------------------------------------------------
// Hover annotations: dimensions on demand
// ---------------------------------------------------------------------------

const JOINT_LABELS: Record<string, string> = {
  O2: "O₂",
  O4: "O₄",
  A: "A",
  B: "B",
  P: "P",
};

function drawHoverAnnotations(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { view, size, palette, def, pose, hovered } = scene;
  if (!hovered) return;

  const joints: Partial<Record<string, Vec2>> = pose.ok
    ? { O2: def.O2, O4: def.O4, A: pose.A, B: pose.B, P: pose.P }
    : { O2: def.O2, O4: def.O4, ...(pose.A ? { A: pose.A } : {}) };

  // Joint hover → coordinate readout
  const jw = joints[hovered];
  if (jw) {
    const p = worldToScreen(view, size, jw);
    const label = `${JOINT_LABELS[hovered]} (${jw.x.toFixed(1)}, ${jw.y.toFixed(1)})`;
    ctx.font = `11px ${MONO_FONT}`;
    const tw = ctx.measureText(label).width;
    const bx = p.x + 14;
    const by = p.y - 26;
    ctx.fillStyle = palette.ground;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx - 4, by - 9, tw + 8, 18);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.panelBorder;
    ctx.strokeRect(bx - 4, by - 9, tw + 8, 18);
    ctx.fillStyle = palette.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx, by);
    return;
  }

  // Link hover → dimension line with the length in mm
  const ends: Partial<Record<string, [Vec2, Vec2, number]>> = pose.ok
    ? {
        crank: [def.O2, pose.A, def.crankLen],
        coupler: [pose.A, pose.B, def.couplerLen],
        rocker: [def.O4, pose.B, def.rockerLen],
        ground: [def.O2, def.O4, Math.hypot(def.O4.x - def.O2.x, def.O4.y - def.O2.y)],
      }
    : {
        ground: [def.O2, def.O4, Math.hypot(def.O4.x - def.O2.x, def.O4.y - def.O2.y)],
        ...(pose.A ? { crank: [def.O2, pose.A, def.crankLen] as [Vec2, Vec2, number] } : {}),
      };
  const link = ends[hovered];
  if (!link) return;

  const [wa, wb, lenMm] = link;
  const a = worldToScreen(view, size, wa);
  const b = worldToScreen(view, size, wb);
  const d = sub(b, a);
  const dl = Math.hypot(d.x, d.y) || 1;
  const ux = d.x / dl;
  const uy = d.y / dl;
  // offset to the side away from the link body
  const off = Math.max(16, LINK_HALF_W * view.scale + 12);
  const nx = -uy * off;
  const ny = ux * off;

  const a2 = { x: a.x + nx, y: a.y + ny };
  const b2 = { x: b.x + nx, y: b.y + ny };

  ctx.strokeStyle = palette.inkMuted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // extension lines
  ctx.moveTo(a.x + nx * 0.25, a.y + ny * 0.25);
  ctx.lineTo(a.x + nx * 1.15, a.y + ny * 1.15);
  ctx.moveTo(b.x + nx * 0.25, b.y + ny * 0.25);
  ctx.lineTo(b.x + nx * 1.15, b.y + ny * 1.15);
  // dimension line
  ctx.moveTo(a2.x, a2.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.stroke();

  // arrowheads
  const ah = 6;
  ctx.beginPath();
  for (const [p, dir] of [
    [a2, 1],
    [b2, -1],
  ] as const) {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + dir * ah * ux - dir * ah * 0.35 * -uy, p.y + dir * ah * uy - dir * ah * 0.35 * ux);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + dir * ah * ux + dir * ah * 0.35 * -uy, p.y + dir * ah * uy + dir * ah * 0.35 * ux);
  }
  ctx.stroke();

  const label = `${hovered} ${lenMm.toFixed(1)} mm`;
  ctx.font = `11px ${MONO_FONT}`;
  const mx = (a2.x + b2.x) / 2;
  const my = (a2.y + b2.y) / 2;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = palette.ground;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(mx - tw / 2 - 4, my - 18, tw + 8, 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, mx, my - 10);
}

// ---------------------------------------------------------------------------
// Hit testing (screen space)
// ---------------------------------------------------------------------------

const JOINT_HIT_PX = 14;

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/** Topmost hit at a screen point: joints first (P > A > B > pivots), then links. */
export function hitTest(scene: Scene, s: Vec2): SelectableId | null {
  const { view, size, def, pose } = scene;
  const w2s = (p: Vec2) => worldToScreen(view, size, p);

  const joints: Array<[SelectableId, Vec2]> = [];
  if (pose.ok) {
    joints.push(["P", pose.P], ["A", pose.A], ["B", pose.B]);
  } else if (pose.A) {
    joints.push(["A", pose.A]);
  }
  joints.push(["O2", def.O2], ["O4", def.O4]);

  for (const [id, w] of joints) {
    const p = w2s(w);
    if (Math.hypot(s.x - p.x, s.y - p.y) <= JOINT_HIT_PX) return id;
  }

  const linkHit = Math.max(6, LINK_HALF_W * view.scale);
  const bars: Array<[SelectableId, Vec2, Vec2]> = [];
  if (pose.ok) {
    bars.push(
      ["crank", def.O2, pose.A],
      ["coupler", pose.A, pose.B],
      ["rocker", def.O4, pose.B],
    );
  } else if (pose.A) {
    bars.push(["crank", def.O2, pose.A]);
  }
  bars.push(["ground", def.O2, def.O4]);

  for (const [id, wa, wb] of bars) {
    if (distToSegment(s, w2s(wa), w2s(wb)) <= linkHit) return id;
  }
  return null;
}