/**
 * Share-card renderer: /api/og[?m=<share-param>] → 1200×630 PNG.
 *
 * The card is the drawing, not a screenshot: the share param decodes to a
 * mechanism, the engine re-solves it server-side, and the coupler curve +
 * linkage skeleton render over blueprint graph paper with a proper
 * engineering title block. Without (or with a bad) `m`, the card features
 * the mechanism of the day.
 */

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import {
  add,
  camBaseDist,
  camProfile,
  clampToRange,
  fromPolar,
  genevaGeometry,
  genevaSlotAngles,
  inputRange,
  normalizeAngle,
  peaucellierCrankPivot,
  peaucellierInputRange,
  perp,
  rotate,
  scale,
  sliderCrankInputRange,
  sliderStroke,
  solveCam,
  solveFourBar,
  solveGearTrain,
  solveGeneva,
  solvePeaucellier,
  solveSliderCrank,
  traceCouplerCurve,
  tracePeaucellier,
  traceSliderCrank,
  vec,
  type FourBarConfig,
  type Vec2,
} from "@/engine";
import { decodeShare, sharedMechLabel, SHARE_PARAM, type SharedMech } from "@/share/codec";
import { mechanismOfTheDay } from "@/share/motd";

// Blueprint theme, fixed — share cards always wear the drafting blues.
const BG = "#0b2942";
const PANEL = "#0e3050";
const PANEL_BORDER = "rgba(213,232,249,0.35)";
const LINE = "#d5e8f9";
const LINE_FAINT = "rgba(213,232,249,0.45)";
const INK_MUTED = "#9dbcd8";
const ACCENT = "#4fc3f7";
const TRACE = "#ffd166";
const TRACE_GLOW = "rgba(255,209,102,0.3)";
const GRID_MINOR = "rgba(141,194,238,0.10)";
const GRID_MAJOR = "rgba(141,194,238,0.24)";

const W = 1200;
const H = 630;
// world geometry fits inside this box, leaving room for the title block
const FIT = { x0: 70, y0: 60, x1: 830, y1: 570 };

interface Seg {
  a: Vec2;
  b: Vec2;
  color?: string;
  width?: number;
  dash?: boolean;
}
interface Circle {
  c: Vec2;
  r: number;
  dash?: boolean;
}
interface Outline {
  points: Vec2[];
  closed: boolean;
}

interface Scene {
  segments: Seg[];
  circles: Circle[];
  outlines: Outline[];
  pins: Vec2[];
  /** the hero: traced curve, drawn in the trace color with a glow */
  trace: { points: Vec2[]; closed: boolean } | null;
  /** live traced point, if the pose solved */
  tracePoint: Vec2 | null;
}

const emptyScene = (): Scene => ({
  segments: [],
  circles: [],
  outlines: [],
  pins: [],
  trace: null,
  tracePoint: null,
});

function fourBarScene(c: FourBarConfig, thRaw: number, br: 1 | -1): Scene {
  const s = emptyScene();
  const th = normalizeAngle(clampToRange(thRaw, inputRange(c)));
  s.trace = traceCouplerCurve(c, { branch: br, steps: 240, theta2: th });
  s.segments.push({ a: c.O2, b: c.O4, dash: true, color: LINE_FAINT });
  s.pins.push(c.O2, c.O4);
  const pose = solveFourBar(c, th, { branch: br });
  if (pose.ok) {
    s.segments.push(
      { a: c.O2, b: pose.A },
      { a: pose.B, b: c.O4 },
      { a: pose.A, b: pose.B },
      { a: pose.A, b: pose.P, color: LINE_FAINT },
      { a: pose.B, b: pose.P, color: LINE_FAINT },
    );
    s.pins.push(pose.A, pose.B);
    s.tracePoint = pose.P;
  }
  return s;
}

function buildScene(shared: SharedMech): Scene {
  switch (shared.t) {
    case "fourbar":
    case "watt":
      return fourBarScene(shared.c, shared.th, shared.br);

    case "slidercrank": {
      const s = emptyScene();
      const c = shared.c;
      const th = normalizeAngle(clampToRange(shared.th, sliderCrankInputRange(c)));
      s.trace = traceSliderCrank(c, { branch: shared.br, steps: 240 });
      const axis = fromPolar(1, c.axisAngle);
      const origin = add(c.O2, scale(perp(axis), c.offset));
      const stroke = sliderStroke(c);
      if (stroke) {
        s.segments.push({
          a: add(origin, scale(axis, stroke.min - 25)),
          b: add(origin, scale(axis, stroke.max + 25)),
          dash: true,
          color: LINE_FAINT,
        });
      }
      s.pins.push(c.O2);
      const pose = solveSliderCrank(c, th, { branch: shared.br });
      if (pose.ok) {
        s.segments.push({ a: c.O2, b: pose.A }, { a: pose.A, b: pose.B });
        if (c.rodPoint) {
          s.segments.push(
            { a: pose.A, b: pose.P, color: LINE_FAINT },
            { a: pose.B, b: pose.P, color: LINE_FAINT },
          );
          s.tracePoint = pose.P;
        }
        // slider block: a small oriented rectangle riding the axis
        const u = scale(axis, 14);
        const v = scale(perp(axis), 9);
        const corner = (su: number, sv: number) =>
          add(pose.B, add(scale(u, su), scale(v, sv)));
        s.outlines.push({
          points: [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)],
          closed: true,
        });
        s.pins.push(pose.A, pose.B);
      }
      return s;
    }

    case "peaucellier": {
      const s = emptyScene();
      const c = shared.c;
      const th = normalizeAngle(clampToRange(shared.th, peaucellierInputRange(c)));
      s.trace = tracePeaucellier(c, 160);
      s.pins.push(c.O, peaucellierCrankPivot(c));
      const pose = solvePeaucellier(c, th);
      if (pose.ok) {
        s.segments.push(
          { a: c.O, b: pose.armA },
          { a: c.O, b: pose.armB },
          { a: pose.armA, b: pose.P },
          { a: pose.armB, b: pose.P },
          { a: pose.armA, b: pose.Q },
          { a: pose.armB, b: pose.Q },
          { a: pose.C, b: pose.P, color: LINE_FAINT },
        );
        s.pins.push(pose.armA, pose.armB, pose.P);
        s.tracePoint = pose.Q;
      }
      return s;
    }

    case "cam": {
      const s = emptyScene();
      const c = shared.c;
      const profile = camProfile(c, 180).map((p) => add(c.center, rotate(p, shared.th)));
      s.outlines.push({ points: profile, closed: true });
      s.circles.push({ c: c.center, r: camBaseDist(c), dash: true });
      s.pins.push(c.center);
      const pose = solveCam(c, shared.th);
      if (pose.ok) {
        if (c.follower === "roller") {
          s.circles.push({ c: pose.follower, r: c.rollerR });
        } else {
          const half = vec(30, 0);
          s.segments.push({ a: add(pose.follower, half), b: add(pose.follower, scale(half, -1)) });
        }
        // follower stem
        s.segments.push({
          a: pose.follower,
          b: add(pose.follower, vec(0, Math.max(25, camBaseDist(c) * 0.5))),
          color: LINE_FAINT,
        });
        s.tracePoint = pose.contact;
      }
      return s;
    }

    case "gears": {
      const s = emptyScene();
      const pose = solveGearTrain(shared.c, shared.th);
      if (pose.ok) {
        for (let i = 0; i < pose.gears.length; i++) {
          const g = pose.gears[i];
          s.circles.push({ c: g.center, r: g.r });
          s.segments.push({ a: g.center, b: add(g.center, fromPolar(g.r, g.angle)), color: LINE_FAINT });
          s.pins.push(g.center);
          if (i > 0) s.segments.push({ a: pose.gears[i - 1].center, b: g.center, dash: true, color: LINE_FAINT });
        }
      } else {
        s.pins.push(shared.c.center);
      }
      return s;
    }

    case "geneva": {
      const s = emptyScene();
      const c = shared.c;
      const geom = genevaGeometry(c);
      s.circles.push({ c: geom.driverCenter, r: geom.pinCircleR, dash: true });
      s.circles.push({ c: geom.wheelCenter, r: geom.wheelR });
      s.pins.push(geom.driverCenter, geom.wheelCenter);
      const pose = solveGeneva(c, shared.th);
      if (pose.ok) {
        for (const a of genevaSlotAngles(c, pose.wheelAngle)) {
          s.segments.push({
            a: add(geom.wheelCenter, fromPolar(geom.wheelR * 0.45, a)),
            b: add(geom.wheelCenter, fromPolar(geom.wheelR, a)),
            color: LINE_FAINT,
          });
        }
        s.tracePoint = pose.pin;
      }
      return s;
    }
  }
}

// ---------------------------------------------------------------------------
// World → card mapping
// ---------------------------------------------------------------------------

function sceneBounds(s: Scene): { min: Vec2; max: Vec2 } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const eat = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const seg of s.segments) {
    eat(seg.a);
    eat(seg.b);
  }
  for (const c of s.circles) {
    eat(vec(c.c.x - c.r, c.c.y - c.r));
    eat(vec(c.c.x + c.r, c.c.y + c.r));
  }
  for (const o of s.outlines) for (const p of o.points) eat(p);
  for (const p of s.pins) eat(p);
  if (s.trace) for (const p of s.trace.points) eat(p);
  if (!Number.isFinite(minX + minY + maxX + maxY)) {
    return { min: vec(-50, -50), max: vec(50, 50) };
  }
  return { min: vec(minX, minY), max: vec(maxX, maxY) };
}

function makeMapper(s: Scene) {
  const { min, max } = sceneBounds(s);
  const dx = Math.max(20, max.x - min.x);
  const dy = Math.max(20, max.y - min.y);
  const k = Math.min((FIT.x1 - FIT.x0) / dx, (FIT.y1 - FIT.y0) / dy);
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const ox = (FIT.x0 + FIT.x1) / 2;
  const oy = (FIT.y0 + FIT.y1) / 2;
  // y flips: world is y-up, screen is y-down
  return {
    x: (p: Vec2) => +(ox + (p.x - cx) * k).toFixed(1),
    y: (p: Vec2) => +(oy - (p.y - cy) * k).toFixed(1),
    r: (r: number) => +(r * k).toFixed(1),
  };
}

const pathOf = (
  m: ReturnType<typeof makeMapper>,
  points: Vec2[],
  closed: boolean,
): string =>
  points.length === 0
    ? ""
    : points
        .map((p, i) => `${i === 0 ? "M" : "L"}${m.x(p)} ${m.y(p)}`)
        .join("") + (closed ? "Z" : "");

function gridLines(): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  const step = 30;
  for (let x = step; x < W; x += step) {
    out.push(
      <line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={H}
        stroke={x % 150 === 0 ? GRID_MAJOR : GRID_MINOR}
        strokeWidth={1}
      />,
    );
  }
  for (let y = step; y < H; y += step) {
    out.push(
      <line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={W}
        y2={y}
        stroke={y % 150 === 0 ? GRID_MAJOR : GRID_MINOR}
        strokeWidth={1}
      />,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const param = request.nextUrl.searchParams.get(SHARE_PARAM);
    const decoded = param ? decodeShare(param) : null;
    const motd = decoded ? null : mechanismOfTheDay();
    const mech = decoded ?? motd!.mech;
    const title = motd ? motd.title : sharedMechLabel(mech);
    const subtitle = motd
      ? `mechanism of the day — ${sharedMechLabel(mech)}`
      : "a shared mechanism — the whole design lives in the link";

    const scene = buildScene(mech);
    const m = makeMapper(scene);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundColor: BG,
            position: "relative",
          }}
        >
          <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
            {gridLines()}
            {scene.trace && scene.trace.points.length > 1 && (
              <path
                d={pathOf(m, scene.trace.points, scene.trace.closed)}
                fill="none"
                stroke={TRACE_GLOW}
                strokeWidth={9}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {scene.circles.map((c, i) => (
              <circle
                key={`c${i}`}
                cx={m.x(c.c)}
                cy={m.y(c.c)}
                r={m.r(c.r)}
                fill="none"
                stroke={c.dash ? LINE_FAINT : LINE}
                strokeWidth={2.5}
                strokeDasharray={c.dash ? "7 7" : undefined}
              />
            ))}
            {scene.outlines.map((o, i) => (
              <path
                key={`o${i}`}
                d={pathOf(m, o.points, o.closed)}
                fill="rgba(232,242,251,0.08)"
                stroke={LINE}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            ))}
            {scene.segments.map((seg, i) => (
              <line
                key={`s${i}`}
                x1={m.x(seg.a)}
                y1={m.y(seg.a)}
                x2={m.x(seg.b)}
                y2={m.y(seg.b)}
                stroke={seg.color ?? LINE}
                strokeWidth={seg.width ?? 4}
                strokeLinecap="round"
                strokeDasharray={seg.dash ? "7 7" : undefined}
              />
            ))}
            {scene.trace && scene.trace.points.length > 1 && (
              <path
                d={pathOf(m, scene.trace.points, scene.trace.closed)}
                fill="none"
                stroke={TRACE}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {scene.pins.map((p, i) => (
              <circle
                key={`p${i}`}
                cx={m.x(p)}
                cy={m.y(p)}
                r={6}
                fill={BG}
                stroke={LINE}
                strokeWidth={2.5}
              />
            ))}
            {scene.tracePoint && (
              <circle
                cx={m.x(scene.tracePoint)}
                cy={m.y(scene.tracePoint)}
                r={7}
                fill={TRACE}
                stroke={BG}
                strokeWidth={2}
              />
            )}
          </svg>

          {/* title block, stamped bottom-right like a real drawing */}
          <div
            style={{
              position: "absolute",
              right: 40,
              bottom: 40,
              display: "flex",
              flexDirection: "column",
              border: `2px solid ${PANEL_BORDER}`,
              backgroundColor: PANEL,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 14,
                padding: "14px 22px 10px",
                borderBottom: `1px solid ${PANEL_BORDER}`,
              }}
            >
              <span
                style={{
                  fontSize: 26,
                  color: LINE,
                  letterSpacing: 6,
                  textTransform: "uppercase",
                }}
              >
                Kinema<span style={{ color: ACCENT }}>g</span>ic
              </span>
              <span style={{ fontSize: 15, color: INK_MUTED }}>
                planar mechanism simulator
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "12px 22px 14px",
                maxWidth: 560,
              }}
            >
              <span style={{ fontSize: 38, color: TRACE, letterSpacing: 2 }}>{title}</span>
              <span style={{ fontSize: 17, color: INK_MUTED, marginTop: 6 }}>{subtitle}</span>
              <span
                style={{
                  fontSize: 13,
                  color: ACCENT,
                  marginTop: 10,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}
              >
                drag joints · trace coupler curves · export to fabricate
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: W,
        height: H,
        headers: {
          // A given ?m= renders the same card forever; the bare card is the
          // mechanism of the day and must roll over.
          "Cache-Control": decoded
            ? "public, max-age=86400, s-maxage=604800, immutable"
            : "public, max-age=900, s-maxage=3600",
        },
      },
    );
  } catch (err) {
    console.error("og card failed:", err);
    return new Response("failed to render the share card", { status: 500 });
  }
}
