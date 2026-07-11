"use client";

import {
  degToRad,
  groundLen,
  normalizeAnglePositive,
  radToDeg,
} from "@/engine";
import { Panel } from "@/components/ui/Panel";
import { Slider } from "@/components/ui/Slider";
import { useSimStore } from "@/store/simStore";

function GrashofBadge() {
  const grashof = useSimStore((s) => s.grashof);
  const range = useSimStore((s) => s.range);

  const impossible = !range.full && range.arcs.length === 0;
  const color = impossible
    ? "var(--warn)"
    : grashof.inputRotatesFully
      ? "var(--ok)"
      : "var(--trace)";

  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {impossible ? "no assembly" : grashof.class}
    </span>
  );
}

export function ControlsPanel() {
  const def = useSimStore((s) => s.def);
  const theta2 = useSimStore((s) => s.theta2);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const grashof = useSimStore((s) => s.grashof);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const setTheta2 = useSimStore((s) => s.setTheta2);
  const patchDef = useSimStore((s) => s.patchDef);
  const setGroundLen = useSimStore((s) => s.setGroundLen);
  const setCouplerPoint = useSimStore((s) => s.setCouplerPoint);
  const resetMechanism = useSimStore((s) => s.resetMechanism);
  const fitView = useSimStore((s) => s.fitView);

  const thetaDeg = radToDeg(normalizeAnglePositive(theta2));

  return (
    <div className="flex w-full flex-col gap-2">
      <Panel title="Drive" badge={<GrashofBadge />}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? "Pause the motor" : "Run the motor"}
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-panel-border font-mono text-sm text-ink transition-colors hover:border-accent hover:text-accent"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="min-w-0 flex-1">
            <Slider
              label="speed"
              value={speed}
              min={5}
              max={360}
              step={5}
              unit="°/s"
              precision={0}
              onChange={setSpeed}
            />
          </div>
        </div>
        <Slider
          label="crank angle θ₂"
          value={thetaDeg}
          min={0}
          max={360}
          step={0.5}
          unit="°"
          precision={1}
          onChange={(v) => setTheta2(degToRad(v))}
        />
        <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
          {grashof.description}
        </p>
      </Panel>

      <Panel title="Links">
        <Slider
          label="crank r₂"
          value={def.crankLen}
          min={2}
          max={150}
          onChange={(v) => patchDef({ crankLen: v })}
        />
        <Slider
          label="coupler r₃"
          value={def.couplerLen}
          min={2}
          max={250}
          onChange={(v) => patchDef({ couplerLen: v })}
        />
        <Slider
          label="rocker r₄"
          value={def.rockerLen}
          min={2}
          max={250}
          onChange={(v) => patchDef({ rockerLen: v })}
        />
        <Slider
          label="ground r₁"
          value={groundLen(def)}
          min={2}
          max={250}
          onChange={setGroundLen}
        />
      </Panel>

      <Panel title="Coupler point">
        <Slider
          label="u (along A→B)"
          value={def.couplerPoint.u}
          min={-100}
          max={250}
          onChange={(v) => setCouplerPoint(v, def.couplerPoint.v)}
        />
        <Slider
          label="v (offset)"
          value={def.couplerPoint.v}
          min={-150}
          max={150}
          onChange={(v) => setCouplerPoint(def.couplerPoint.u, v)}
        />
        <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
          The perpendicular offset v is what makes coupler curves interesting —
          at v = 0 the point just traces arcs.
        </p>
      </Panel>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fitView()}
          className="flex-1 border border-panel-border bg-panel px-2 py-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-muted backdrop-blur-sm transition-colors hover:border-accent hover:text-ink"
        >
          Fit view
        </button>
        <button
          type="button"
          onClick={resetMechanism}
          className="flex-1 border border-panel-border bg-panel px-2 py-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-muted backdrop-blur-sm transition-colors hover:border-accent hover:text-ink"
        >
          Reset
        </button>
      </div>
    </div>
  );
}