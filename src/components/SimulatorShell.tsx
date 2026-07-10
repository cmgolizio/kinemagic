"use client";

import { useMemo, useState } from "react";
import {
  classifyFourBar,
  degToRad,
  fourBarFromLengths,
  fourBarInputRange,
  radToDeg,
  solveFourBar,
  traceCouplerCurve,
  type FourBarConfig,
  type GrashofClass,
  type Vec2,
} from "@/engine";
import { AngleArc, DimensionLine, JointPin, LinkBar } from "@/components/drafting";
import { Panel } from "@/components/Panel";
import { Slider } from "@/components/Slider";
import { TitleBlock } from "@/components/TitleBlock";

/**
 * Phase 0 simulator shell: a statically-solved four-bar rendered with the
 * drafting primitives, scrubbed by the control panel. Phase 2 replaces the
 * SVG with the live canvas surface (drive loop, dragging, pan/zoom); the
 * control-panel wiring and visual language carry forward.
 */

// World window (mm) and scale for the preview sheet.
const WORLD = { minX: -70, maxX: 170, minY: -70, maxY: 130 };
const SCALE = 4; // px per mm
const VIEW_W = (WORLD.maxX - WORLD.minX) * SCALE;
const VIEW_H = (WORLD.maxY - WORLD.minY) * SCALE;

/** World (y-up, mm) -> SVG screen (y-down, px). */
const toScreen = (p: Vec2) => ({
  x: (p.x - WORLD.minX) * SCALE,
  y: (WORLD.maxY - p.y) * SCALE,
});

const GRASHOF_LABELS: Record<GrashofClass, string> = {
  "crank-rocker": "Crank-rocker",
  "double-crank": "Double-crank (drag link)",
  "grashof-double-rocker": "Double-rocker (Grashof)",
  "change-point": "Change point",
  "triple-rocker": "Triple rocker (non-Grashof)",
  "non-assemblable": "Cannot assemble",
  invalid: "Invalid geometry",
};

function gridLines() {
  const minor: React.ReactNode[] = [];
  const major: React.ReactNode[] = [];
  for (let x = WORLD.minX; x <= WORLD.maxX; x += 5) {
    const sx = (x - WORLD.minX) * SCALE;
    const line = (
      <line key={`v${x}`} x1={sx} y1={0} x2={sx} y2={VIEW_H} strokeWidth={1} />
    );
    (x % 25 === 0 ? major : minor).push(line);
  }
  for (let y = WORLD.minY; y <= WORLD.maxY; y += 5) {
    const sy = (WORLD.maxY - y) * SCALE;
    const line = (
      <line key={`h${y}`} x1={0} y1={sy} x2={VIEW_W} y2={sy} strokeWidth={1} />
    );
    (y % 25 === 0 ? major : minor).push(line);
  }
  return { minor, major };
}

function couplerCurvePath(config: FourBarConfig): string {
  const samples = traceCouplerCurve(config, { steps: 240 });
  const segments: string[] = [];
  let current: string[] = [];
  for (const s of samples) {
    if (s.result.ok) {
      const p = toScreen(s.result.p);
      current.push(`${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    } else if (current.length > 1) {
      segments.push(`M ${current.join(" L ")}`);
      current = [];
    } else {
      current = [];
    }
  }
  if (current.length > 1) segments.push(`M ${current.join(" L ")}`);
  // Close the loop visually when the whole sweep was reachable.
  if (segments.length === 1 && samples.every((s) => s.result.ok)) segments[0] += " Z";
  return segments.join(" ");
}

export function SimulatorShell() {
  const [groundLenMm, setGroundLenMm] = useState(100);
  const [crankLen, setCrankLen] = useState(30);
  const [couplerLen, setCouplerLen] = useState(100);
  const [rockerLen, setRockerLen] = useState(80);
  const [couplerU, setCouplerU] = useState(50);
  const [couplerV, setCouplerV] = useState(35);
  const [theta2Deg, setTheta2Deg] = useState(65);

  const config = useMemo(
    () =>
      fourBarFromLengths({
        groundLen: groundLenMm,
        crankLen,
        couplerLen,
        rockerLen,
        couplerPoint: { u: couplerU, v: couplerV },
      }),
    [groundLenMm, crankLen, couplerLen, rockerLen, couplerU, couplerV],
  );

  const pose = useMemo(() => solveFourBar(config, degToRad(theta2Deg)), [config, theta2Deg]);
  const curvePath = useMemo(() => couplerCurvePath(config), [config]);
  const grashof = useMemo(() => classifyFourBar(config), [config]);
  const inputRange = useMemo(() => fourBarInputRange(config), [config]);

  const o2 = toScreen(config.o2);
  const o4 = toScreen(config.o4);
  const grid = gridLines();

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section
        aria-label="Drawing sheet"
        className="relative min-h-[380px] flex-1 overflow-hidden bg-ground"
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-full w-full"
          role="img"
          aria-label={`Four-bar linkage drawing at crank angle ${theta2Deg} degrees`}
          preserveAspectRatio="xMidYMid meet"
        >
          <g stroke="var(--grid-minor)" shapeRendering="crispEdges">
            {grid.minor}
          </g>
          <g stroke="var(--grid-major)" shapeRendering="crispEdges">
            {grid.major}
          </g>
          {/* origin marker */}
          <g stroke="var(--line-faint)" strokeWidth={1}>
            <line x1={o2.x - 10} y1={o2.y} x2={o2.x + 10} y2={o2.y} />
            <line x1={o2.x} y1={o2.y - 10} x2={o2.x} y2={o2.y + 10} />
          </g>

          {/* coupler curve — the hero */}
          {curvePath && (
            <path d={curvePath} fill="none" stroke="var(--trace)" strokeWidth={1.8} opacity={0.9} />
          )}

          {/* ground link, drawn faintly: it's the frame */}
          <LinkBar from={o2} to={o4} faint width={12} />

          {pose.ok ? (
            <>
              <LinkBar from={o2} to={toScreen(pose.a)} width={13} />
              <LinkBar from={toScreen(pose.a)} to={toScreen(pose.b)} width={13} />
              <LinkBar from={o4} to={toScreen(pose.b)} width={13} />
              {/* rigid coupler extension carrying P */}
              <g
                stroke="var(--line-faint)"
                strokeWidth={1}
                strokeDasharray="4 3"
                fill="none"
              >
                <path
                  d={`M ${toScreen(pose.a).x} ${toScreen(pose.a).y} L ${toScreen(pose.p).x} ${
                    toScreen(pose.p).y
                  } L ${toScreen(pose.b).x} ${toScreen(pose.b).y}`}
                />
              </g>
              <circle
                cx={toScreen(pose.p).x}
                cy={toScreen(pose.p).y}
                r={4.5}
                fill="var(--trace)"
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
              <AngleArc
                center={o2}
                radius={26}
                startAngle={0}
                endAngle={-degToRad(theta2Deg)}
                label={`θ₂=${theta2Deg.toFixed(0)}°`}
              />
              <JointPin at={toScreen(pose.a)} label="A" />
              <JointPin at={toScreen(pose.b)} label="B" />
              <text
                x={toScreen(pose.p).x + 10}
                y={toScreen(pose.p).y - 8}
                fill="var(--ink-muted)"
                fontSize={11}
                fontFamily="var(--font-plex-mono), monospace"
              >
                P
              </text>
            </>
          ) : (
            <>
              {pose.a && <JointPin at={toScreen(pose.a)} label="A" />}
              <text
                x={VIEW_W / 2}
                y={40}
                textAnchor="middle"
                fill="var(--danger)"
                fontSize={14}
                fontFamily="var(--font-plex-mono), monospace"
              >
                {pose.reason === "unreachable"
                  ? `θ₂=${theta2Deg.toFixed(0)}° UNREACHABLE — LINKAGE CANNOT ASSEMBLE HERE`
                  : "DEGENERATE GEOMETRY"}
              </text>
            </>
          )}

          <JointPin at={o2} variant="fixed" label="O₂" labelDx={-24} />
          <JointPin at={o4} variant="fixed" label="O₄" />
          <DimensionLine
            from={o2}
            to={o4}
            offset={64}
            label={`${groundLenMm.toFixed(0)} mm`}
          />

          {/* ruling note */}
          <text
            x={8}
            y={VIEW_H - 10}
            fill="var(--ink-muted)"
            fontSize={10}
            fontFamily="var(--font-plex-mono), monospace"
          >
            GRID 5 mm / 25 mm
          </text>
        </svg>
        <TitleBlock title="Four-bar linkage" />
      </section>

      <aside
        aria-label="Control panel"
        className="flex w-full flex-col gap-3 border-t border-surface-edge p-3 lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      >
        <Panel title="Drive">
          <Slider
            label="Crank angle θ₂"
            value={theta2Deg}
            min={0}
            max={360}
            step={1}
            unit="deg"
            onChange={setTheta2Deg}
          />
          <p className="mt-1 font-mono text-[11px] text-ink-muted">
            {inputRange.type === "full" && "Input rotates a full 360°."}
            {inputRange.type === "limited" &&
              `Reachable input: ±(${radToDeg(inputRange.minAbs).toFixed(1)}°–${radToDeg(
                inputRange.maxAbs,
              ).toFixed(1)}°) about the ground line.`}
            {inputRange.type === "none" && "No input angle can assemble this geometry."}
          </p>
        </Panel>

        <Panel title="Link lengths">
          <Slider
            label="Ground r₁"
            value={groundLenMm}
            min={20}
            max={150}
            unit="mm"
            onChange={setGroundLenMm}
          />
          <Slider
            label="Crank r₂"
            value={crankLen}
            min={10}
            max={100}
            unit="mm"
            onChange={setCrankLen}
          />
          <Slider
            label="Coupler r₃"
            value={couplerLen}
            min={20}
            max={150}
            unit="mm"
            onChange={setCouplerLen}
          />
          <Slider
            label="Rocker r₄"
            value={rockerLen}
            min={20}
            max={150}
            unit="mm"
            onChange={setRockerLen}
          />
        </Panel>

        <Panel title="Coupler point">
          <Slider
            label="Along A→B (u)"
            value={couplerU}
            min={-20}
            max={150}
            unit="mm"
            onChange={setCouplerU}
          />
          <Slider
            label="Offset (v)"
            value={couplerV}
            min={-80}
            max={80}
            unit="mm"
            onChange={setCouplerV}
          />
        </Panel>

        <Panel title="Classification">
          <p className="font-mono text-xs">
            <span className="mr-2 inline-block bg-accent px-1.5 py-0.5 font-semibold uppercase tracking-wider text-accent-ink">
              {GRASHOF_LABELS[grashof.class]}
            </span>
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] text-ink-muted">
            <dt>Grashof</dt>
            <dd className="text-right text-ink">{grashof.isGrashof ? "yes" : "no"}</dd>
            <dt>Crank drives 360°</dt>
            <dd className="text-right text-ink">{grashof.inputRotatesFully ? "yes" : "no"}</dd>
            <dt>Shortest link</dt>
            <dd className="text-right text-ink">{grashof.shortest}</dd>
            {pose.ok && (
              <>
                <dt>Transmission ∠</dt>
                <dd className="text-right text-ink">
                  {radToDeg(pose.transmissionAngle).toFixed(1)}°
                </dd>
                <dt>P (world)</dt>
                <dd className="text-right text-ink">
                  ({pose.p.x.toFixed(1)}, {pose.p.y.toFixed(1)})
                </dd>
              </>
            )}
          </dl>
        </Panel>
      </aside>
    </div>
  );
}