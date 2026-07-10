/**
 * Kinemagic kinematics engine.
 *
 * Pure TypeScript, framework-free: no React, no DOM, no canvas. Everything
 * downstream (rendering, export, URL state) depends on this module being
 * right — keep it fully unit-tested.
 */

export * from "./vec2";
export * from "./intersections";
export * from "./fourbar";
export * from "./slidercrank";