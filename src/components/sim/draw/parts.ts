/**
 * Shared canvas drawing vocabulary — capsule links, pins, fixed pivots,
 * traces, range guides, dimension annotations, inset plots. Every mechanism
 * renderer builds from these so the whole library reads as one drawing.
 * All world geometry is mm; hardware proportions are mm with px floors.
 */

import {
  radToDeg,
  sub,
  TWO_PI,
  type InputRange,
  type Vec2,
} from "@/engine";
import { MONO_FONT, type Palette } from "../palette";
import { worldToScreen, type ScreenSize, type ViewState } from "../view";

export interface DrawEnv {
  view: ViewState;
  size: ScreenSize;
  palette: Palette;
  hovered: string | null;
  selected: string | null;
}

// Physical proportions (mm)
export const LINK_HALF_W = 4.5;
export const BORE_R = 2.2;
export const PIN_R = 3.2;

export const w2s = (env: DrawEnv, p: Vec2): Vec2 =>
  worldToScreen(env.view, env.size, p);

export const isActive = (env: DrawEnv, id: string): boolean =>
  env.hovered === id || env.selected === id;

// ---------------------------------------------------------------------------
// Links & joints
// ---------------------------------------------------------------------------

export function capsulePath(
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

export function drawLinkBar(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  id: string,
  wa: Vec2,
  wb: Vec2,
): void {
  const { palette } = env;
  const a = w2s(env, wa);
  const b = w2s(env, wb);
  const r = Math.max(4, LINK_HALF_W * env.view.scale);
  const active = isActive(env, id);

  capsulePath(ctx, a, b, r);
  ctx.fillStyle = palette.linkFill;
  ctx.fill();
  ctx.strokeStyle = active ? palette.accent : palette.linkStroke;
  ctx.lineWidth = active ? 2 : 1.4;
  ctx.stroke();

  // Pivot bores at both ends — the part you'd bolt through.
  const bore = Math.max(2.5, BORE_R * env.view.scale);
  ctx.strokeStyle = active ? palette.accent : palette.linkStroke;
  ctx.lineWidth = 1;
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, bore, 0, TWO_PI);
    ctx.stroke();
  }
}

/** Thin rigid tie (for cell sides / triangles) — lighter than a full bar. */
export function drawRod(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  id: string,
  wa: Vec2,
  wb: Vec2,
): void {
  const a = w2s(env, wa);
  const b = w2s(env, wb);
  const active = isActive(env, id);
  const r = Math.max(2.5, LINK_HALF_W * 0.55 * env.view.scale);
  capsulePath(ctx, a, b, r);
  ctx.fillStyle = env.palette.linkFill;
  ctx.fill();
  ctx.strokeStyle = active ? env.palette.accent : env.palette.linkStroke;
  ctx.lineWidth = active ? 2 : 1.2;
  ctx.stroke();
}

export function drawFixedPivot(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  id: string,
  w: Vec2,
): void {
  const { palette } = env;
  const p = w2s(env, w);
  const active = isActive(env, id);
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
  ctx.arc(p.x, p.y, Math.max(3.5, PIN_R * env.view.scale * 0.8), 0, TWO_PI);
  ctx.fillStyle = active ? palette.accent : palette.inkMuted;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(1.6, BORE_R * env.view.scale * 0.5), 0, TWO_PI);
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

export function drawPin(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  id: string,
  w: Vec2,
): void {
  const { palette } = env;
  const p = w2s(env, w);
  const active = isActive(env, id);
  const r = Math.max(4, PIN_R * env.view.scale);

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
  ctx.arc(p.x, p.y, Math.max(1.8, BORE_R * env.view.scale * 0.55), 0, TWO_PI);
  ctx.fillStyle = palette.ground;
  ctx.fill();
}

/** The tracing stylus: filled dot in trace color with a crosshair. */
export function drawStylus(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  id: string,
  w: Vec2,
): void {
  const { palette } = env;
  const p = w2s(env, w);
  const active = isActive(env, id);
  const r = active ? 7 : 5.5;

  if (active) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6, 0, TWO_PI);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

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

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

function tracePath(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  points: Vec2[],
  closed: boolean,
): void {
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = w2s(env, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (closed) ctx.closePath();
}

export function drawTrace(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  points: Vec2[],
  closed: boolean,
): void {
  if (points.length < 2) return;
  const { palette } = env;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Glow pass under the core stroke — the hero visual.
  tracePath(ctx, env, points, closed);
  ctx.strokeStyle = palette.traceGlow;
  ctx.lineWidth = 7;
  ctx.stroke();

  tracePath(ctx, env, points, closed);
  ctx.strokeStyle = palette.trace;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Input range guide (reachable / unreachable arcs on the drive circle)
// ---------------------------------------------------------------------------

export function drawRangeGuide(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  center: Vec2,
  radiusMm: number,
  range: InputRange,
): void {
  if (range.full) return;
  const { palette } = env;
  const c = w2s(env, center);
  const r = radiusMm * env.view.scale;

  // Whole drive circle, ghosted: where the pin cannot go.
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

/** Small angle arc + readout at a drive pivot — drafting annotation. */
export function drawAngleAnnotation(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  center: Vec2,
  theta: number,
  label: string,
): void {
  const { palette } = env;
  const c = w2s(env, center);
  const r = 26;
  let t = theta % TWO_PI;
  if (t < 0) t += TWO_PI;

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
    `${label} ${radToDeg(t).toFixed(1)}°`,
    c.x + (r + 24) * Math.cos(mid),
    c.y - (r + 14) * Math.sin(mid),
  );
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

/** Coordinate readout box next to a hovered joint. */
export function drawCoordBox(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  w: Vec2,
  label: string,
): void {
  const { palette } = env;
  const p = w2s(env, w);
  const text = `${label} (${w.x.toFixed(1)}, ${w.y.toFixed(1)})`;
  ctx.font = `11px ${MONO_FONT}`;
  const tw = ctx.measureText(text).width;
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
  ctx.fillText(text, bx, by);
}

/** Dimension line with extension lines, arrowheads and an mm label. */
export function drawDimension(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  wa: Vec2,
  wb: Vec2,
  label: string,
): void {
  const { palette } = env;
  const a = w2s(env, wa);
  const b = w2s(env, wb);
  const d = sub(b, a);
  const dl = Math.hypot(d.x, d.y) || 1;
  const ux = d.x / dl;
  const uy = d.y / dl;
  // offset to the side away from the link body
  const off = Math.max(16, LINK_HALF_W * env.view.scale + 12);
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
// Inset plot (displacement diagrams)
// ---------------------------------------------------------------------------

export interface InsetPlotSpec {
  /** top-left corner and size, CSS px */
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  /** samples evenly spaced across the x-axis */
  samples: number[];
  /** cursor position, 0..1 of the x-axis (omit to hide) */
  cursor?: number;
  xLabel: string;
  yLabel: string;
}

export function drawInsetPlot(
  ctx: CanvasRenderingContext2D,
  env: DrawEnv,
  spec: InsetPlotSpec,
): void {
  const { palette } = env;
  const { x, y, w, h, samples } = spec;
  if (samples.length < 2) return;

  let lo = Infinity;
  let hi = -Infinity;
  for (const s of samples) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) return;
  if (hi - lo < 1e-9) hi = lo + 1;

  // Frame
  ctx.fillStyle = palette.ground;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);

  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 16;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Curve
  ctx.beginPath();
  samples.forEach((s, i) => {
    const px = x + padL + (i / (samples.length - 1)) * plotW;
    const py = y + padT + (1 - (s - lo) / (hi - lo)) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = palette.trace;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cursor
  if (spec.cursor !== undefined) {
    const frac = Math.min(1, Math.max(0, spec.cursor));
    const cx = x + padL + frac * plotW;
    ctx.beginPath();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1;
    ctx.moveTo(cx, y + padT - 2);
    ctx.lineTo(cx, y + padT + plotH + 2);
    ctx.stroke();
    const idx = Math.round(frac * (samples.length - 1));
    const cy = y + padT + (1 - (samples[idx] - lo) / (hi - lo)) * plotH;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, TWO_PI);
    ctx.fillStyle = palette.accent;
    ctx.fill();
  }

  // Labels
  ctx.font = `9px ${MONO_FONT}`;
  ctx.fillStyle = palette.inkMuted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(spec.title, x + padL, y + 5);
  ctx.textAlign = "right";
  ctx.fillText(spec.yLabel, x + w - padR, y + 5);
  ctx.textBaseline = "bottom";
  ctx.fillText(spec.xLabel, x + w - padR, y + h - 4);
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export const JOINT_HIT_PX = 14;

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/** First joint within range, then first link segment within range. */
export function hitJointsThenBars(
  env: DrawEnv,
  joints: Array<[string, Vec2]>,
  bars: Array<[string, Vec2, Vec2]>,
  s: Vec2,
): string | null {
  for (const [id, w] of joints) {
    const p = w2s(env, w);
    if (Math.hypot(s.x - p.x, s.y - p.y) <= JOINT_HIT_PX) return id;
  }
  const linkHit = Math.max(6, LINK_HALF_W * env.view.scale);
  for (const [id, wa, wb] of bars) {
    if (distToSegment(s, w2s(env, wa), w2s(env, wb)) <= linkHit) return id;
  }
  return null;
}