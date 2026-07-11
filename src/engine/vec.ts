/**
 * Minimal 2D vector math. Framework-free — no React, no DOM.
 * Angles are radians, world coordinates are millimeters, Y is up.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const TWO_PI = Math.PI * 2;

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z-component of the 3D cross product; >0 when b is CCW of a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => len2(sub(a, b));

/** Unit vector of a; returns (0,0) for the zero vector rather than NaN. */
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

/** 90° counter-clockwise rotation. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const fromPolar = (r: number, theta: number): Vec2 => ({
  x: r * Math.cos(theta),
  y: r * Math.sin(theta),
});

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const rotate = (a: Vec2, theta: number): Vec2 => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

export const isFiniteVec = (a: Vec2): boolean =>
  Number.isFinite(a.x) && Number.isFinite(a.y);

/** Normalize an angle into (-π, π]. */
export const normalizeAngle = (theta: number): number => {
  let t = theta % TWO_PI;
  if (t <= -Math.PI) t += TWO_PI;
  else if (t > Math.PI) t -= TWO_PI;
  return t;
};

/** Normalize an angle into [0, 2π). */
export const normalizeAnglePositive = (theta: number): number => {
  let t = theta % TWO_PI;
  if (t < 0) t += TWO_PI;
  return t;
};

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;