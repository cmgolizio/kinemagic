/**
 * URL-encoded mechanism state — the entire "save/share" system for v1.
 *
 * A mechanism definition serializes to a compact, versioned string that
 * travels in the `?m=` query param: JSON with short keys → UTF-8 →
 * base64url. Decoding zod-validates everything (types, enums, finite
 * numbers, sane bounds) so a mangled or hostile link can never produce
 * NaN geometry — it just falls back to the default mechanism.
 *
 * Framework-free: pure TS + zod, no React/DOM. The store maps its slices
 * to/from `SharedMech` (see simStore.ts); this module owns the wire format.
 *
 * Versioning: the payload carries `v: 1`. Future format changes bump the
 * version and add a migration here — old links must keep working.
 */

import { z } from "zod";

export const SHARE_PARAM = "m";
export const SHARE_VERSION = 1;

// ---------------------------------------------------------------------------
// Schema — mirrors the engine config types structurally. `watt` and
// `peaucellier` are separate wire types (the store folds both into its
// single "straightline" slice).
// ---------------------------------------------------------------------------

const coord = z.number().min(-1e5).max(1e5);
const len = z.number().gt(0).max(1e4);
const angle = z.number().min(-1e3).max(1e3);
const vec2 = z.object({ x: coord, y: coord });
const point = z.object({ u: z.number().min(-1e4).max(1e4), v: z.number().min(-1e4).max(1e4) });
const branch = z.union([z.literal(1), z.literal(-1)]);
const theta = angle;

const fourBarConfig = z.object({
  O2: vec2,
  O4: vec2,
  crankLen: len,
  couplerLen: len,
  rockerLen: len,
  couplerPoint: point,
});

const sliderCrankConfig = z.object({
  O2: vec2,
  crankLen: len,
  rodLen: len,
  axisAngle: angle,
  offset: z.number().min(-1e4).max(1e4),
  rodPoint: point.optional(),
});

const camConfig = z.object({
  center: vec2,
  kind: z.enum(["eccentric", "rdf"]),
  follower: z.enum(["flat", "roller"]),
  rollerR: len,
  discR: len,
  ecc: z.number().min(0).max(1e4),
  baseR: len,
  lift: len,
  riseDeg: z.number().min(0).max(360),
  dwellDeg: z.number().min(0).max(360),
  fallDeg: z.number().min(0).max(360),
  law: z.enum(["uniform", "harmonic", "cycloidal"]),
});

const gearTrainConfig = z
  .object({
    center: vec2,
    module: z.number().gt(0).max(100),
    teeth: z.array(z.number().int().min(4).max(300)).min(2).max(3),
    meshAngles: z.array(angle).min(1).max(2),
  })
  .refine((c) => c.meshAngles.length === c.teeth.length - 1, {
    message: "one mesh angle per gear pair",
  });

const genevaConfig = z.object({
  center: vec2,
  slots: z.number().int().min(3).max(20),
  centerDist: len,
  wheelDir: angle,
});

const peaucellierConfig = z.object({
  O: vec2,
  crankLen: len,
  armLen: len,
  cellSide: len,
  axisAngle: angle,
});

const sharedMech = z.discriminatedUnion("t", [
  z.object({ t: z.literal("fourbar"), c: fourBarConfig, th: theta, br: branch }),
  z.object({ t: z.literal("slidercrank"), c: sliderCrankConfig, th: theta, br: branch }),
  z.object({ t: z.literal("cam"), c: camConfig, th: theta }),
  z.object({ t: z.literal("gears"), c: gearTrainConfig, th: theta }),
  z.object({ t: z.literal("geneva"), c: genevaConfig, th: theta }),
  z.object({ t: z.literal("watt"), c: fourBarConfig, th: theta, br: branch }),
  z.object({ t: z.literal("peaucellier"), c: peaucellierConfig, th: theta }),
]);

const payload = z.object({ v: z.literal(SHARE_VERSION), m: sharedMech });

export type SharedMech = z.infer<typeof sharedMech>;
export type SharedMechType = SharedMech["t"];

// ---------------------------------------------------------------------------
// base64url — works in both the browser and Node (the OG route decodes
// server-side; tests run in Node).
// ---------------------------------------------------------------------------

function b64encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const toUrlSafe = (b64: string): string =>
  b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromUrlSafe = (s: string): string => s.replace(/-/g, "+").replace(/_/g, "/");

// ---------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------

/** Trim float noise so links stay short: 1e-4 mm / 1e-4 rad resolution. */
function roundDeep<T>(value: T): T {
  if (typeof value === "number") return (Math.round(value * 1e4) / 1e4) as T;
  if (Array.isArray(value)) return value.map(roundDeep) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = roundDeep(v);
    return out as T;
  }
  return value;
}

/** Serialize a mechanism to the URL-safe share string. */
export function encodeShare(mech: SharedMech): string {
  const json = JSON.stringify(roundDeep({ v: SHARE_VERSION, m: mech }));
  return toUrlSafe(b64encode(new TextEncoder().encode(json)));
}

/**
 * Parse a share string back into a validated mechanism. Returns null for
 * anything malformed — bad base64, bad JSON, unknown version, out-of-range
 * numbers — so callers can fall back cleanly.
 */
export function decodeShare(param: string): SharedMech | null {
  if (!param || param.length > 8192) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64decode(fromUrlSafe(param))));
  } catch {
    return null;
  }
  const result = payload.safeParse(parsed);
  return result.success ? result.data.m : null;
}

/** Human label for a shared mechanism, used by OG cards and page titles. */
export function sharedMechLabel(mech: SharedMech): string {
  switch (mech.t) {
    case "fourbar":
      return "Four-bar linkage";
    case "slidercrank":
      return "Slider-crank";
    case "cam":
      return "Cam & follower";
    case "gears":
      return "Gear train";
    case "geneva":
      return "Geneva drive";
    case "watt":
      return "Watt's linkage";
    case "peaucellier":
      return "Peaucellier–Lipkin linkage";
  }
}
