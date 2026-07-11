/**
 * World↔screen transform. World is millimeters with Y up; screen is CSS
 * pixels with Y down. The view is defined by the world point at the screen
 * center and a scale in px/mm.
 */

import type { Vec2 } from "@/engine";

export interface ViewState {
  /** world coords (mm) of the screen center */
  cx: number;
  cy: number;
  /** pixels per millimeter */
  scale: number;
}

export interface ScreenSize {
  w: number;
  h: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 200;

export const worldToScreen = (v: ViewState, size: ScreenSize, p: Vec2): Vec2 => ({
  x: size.w / 2 + (p.x - v.cx) * v.scale,
  y: size.h / 2 - (p.y - v.cy) * v.scale,
});

export const screenToWorld = (v: ViewState, size: ScreenSize, s: Vec2): Vec2 => ({
  x: v.cx + (s.x - size.w / 2) / v.scale,
  y: v.cy - (s.y - size.h / 2) / v.scale,
});

export const clampScale = (s: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** New view that keeps the world point under `screenPt` fixed while scaling. */
export function zoomAt(
  v: ViewState,
  size: ScreenSize,
  screenPt: Vec2,
  factor: number,
): ViewState {
  const scale = clampScale(v.scale * factor);
  if (scale === v.scale) return v;
  const anchor = screenToWorld(v, size, screenPt);
  return {
    scale,
    cx: anchor.x - (screenPt.x - size.w / 2) / scale,
    cy: anchor.y + (screenPt.y - size.h / 2) / scale,
  };
}

/** Pan by a screen-space delta (e.g. pointer movement). */
export const panBy = (v: ViewState, dxPx: number, dyPx: number): ViewState => ({
  ...v,
  cx: v.cx - dxPx / v.scale,
  cy: v.cy + dyPx / v.scale,
});

/** Fit a world-space bounding box into the viewport with a margin. */
export function fitBounds(
  size: ScreenSize,
  min: Vec2,
  max: Vec2,
  marginFrac = 0.15,
): ViewState {
  const bw = Math.max(1, max.x - min.x);
  const bh = Math.max(1, max.y - min.y);
  const scale = clampScale(
    Math.min(size.w / bw, size.h / bh) * (1 - marginFrac),
  );
  return { cx: (min.x + max.x) / 2, cy: (min.y + max.y) / 2, scale };
}