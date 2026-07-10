/**
 * Minimal 2D vector math for the kinematics engine.
 *
 * Framework-free by design: no React, no DOM, no rendering imports.
 * Vectors are plain `{ x, y }` objects so they serialize cleanly (URL state,
 * test fixtures) and stay cheap to allocate.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);

export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);

export const scale = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s);

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** 2D cross product (z-component of the 3D cross product). */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const lenSq = (a: Vec2): number => a.x * a.x + a.y * a.y;

export const len = (a: Vec2): number => Math.hypot(a.x, a.y);

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const distSq = (a: Vec2, b: Vec2): number => lenSq(sub(a, b));

/** Unit vector at `angle` radians from +x axis. */
export const fromAngle = (angle: number): Vec2 => vec2(Math.cos(angle), Math.sin(angle));

/** Angle of the vector from the +x axis, in radians (-PI, PI]. */
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

/** Counter-clockwise rotation by 90 degrees. */
export const perp = (a: Vec2): Vec2 => vec2(-a.y, a.x);

export const rotate = (a: Vec2, angle: number): Vec2 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec2(a.x * c - a.y * s, a.x * s + a.y * c);
};

/**
 * Normalize to unit length. Returns `null` for the zero vector rather than
 * producing NaN — callers must handle the degenerate case explicitly.
 */
export const normalize = (a: Vec2): Vec2 | null => {
  const l = len(a);
  return l === 0 ? null : vec2(a.x / l, a.y / l);
};

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export const degToRad = (deg: number): number => deg * DEG_TO_RAD;
export const radToDeg = (rad: number): number => rad * RAD_TO_DEG;