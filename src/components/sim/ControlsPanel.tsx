"use client";

import {
  angleOf,
  CAM_PRESETS,
  classify,
  degToRad,
  FOURBAR_PRESETS,
  GEAR_PRESETS,
  GENEVA_PRESETS,
  genevaDwellFraction,
  groundLen,
  normalizeAnglePositive,
  radToDeg,
  SLIDERCRANK_PRESETS,
  sub,
  type CamConfig,
  type GrashofResult,
  type MotionLaw,
} from "@/engine";
import { Panel } from "@/components/ui/Panel";
import { Slider } from "@/components/ui/Slider";
import {
  MECHANISMS,
  mechMeta,
  useSimStore,
  type MechType,
} from "@/store/simStore";
import { AnalysisPanel } from "./AnalysisPanel";
import { ComparePanel } from "./ComparePanel";
import { MeasurePanel } from "./MeasurePanel";

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function ToggleRow<T extends string>({
  options,
  active,
  onSelect,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  active: T;
  onSelect: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          aria-pressed={o.value === active}
          className={`flex-1 border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            o.value === active
              ? "border-accent text-accent"
              : "border-panel-border text-ink-muted hover:border-accent hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] leading-relaxed text-ink-faint">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Mechanism picker + presets + randomize
// ---------------------------------------------------------------------------

interface PresetEntry {
  id: string;
  label: string;
  blurb: string;
}

const PRESET_LISTS: Partial<Record<MechType, PresetEntry[]>> = {
  fourbar: FOURBAR_PRESETS,
  slidercrank: SLIDERCRANK_PRESETS,
  cam: CAM_PRESETS,
  gears: GEAR_PRESETS,
  geneva: GENEVA_PRESETS,
};

function MechanismPicker() {
  const mech = useSimStore((s) => s.mech);
  const setMechType = useSimStore((s) => s.setMechType);
  const setStraightVariant = useSimStore((s) => s.setStraightVariant);
  const applyPreset = useSimStore((s) => s.applyPreset);
  const randomize = useSimStore((s) => s.randomize);
  const meta = mechMeta(mech.type);
  const presets = PRESET_LISTS[mech.type];

  return (
    <Panel title="Mechanism">
      <select
        aria-label="Active mechanism"
        value={mech.type}
        onChange={(e) => setMechType(e.target.value as MechType)}
        className="w-full border border-panel-border bg-panel px-2 py-1.5 font-mono text-xs text-ink focus:border-accent focus:outline-none"
      >
        {MECHANISMS.map((m) => (
          <option key={m.type} value={m.type}>
            {m.label}
          </option>
        ))}
      </select>
      <Note>{meta.blurb}</Note>

      {presets && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            {mech.type === "fourbar" ? "Famous curves" : "Presets"}
          </span>
          <div className="grid grid-cols-2 gap-1">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.blurb}
                onClick={() => applyPreset(p.id)}
                className="border border-panel-border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-accent hover:text-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mech.type === "straightline" && (
        <ToggleRow
          ariaLabel="Straight-line variant"
          options={[
            { value: "watt", label: "Watt (≈)" },
            { value: "peaucellier", label: "Peaucellier (exact)" },
          ]}
          active={mech.variant}
          onSelect={setStraightVariant}
        />
      )}

      <button
        type="button"
        onClick={randomize}
        title="Replace the geometry with random values — always assemblable, never junk"
        className="border border-panel-border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-accent hover:text-accent"
      >
        ⚄ randomize (valid)
      </button>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

const THETA_LABEL: Record<MechType, string> = {
  fourbar: "crank angle θ₂",
  slidercrank: "crank angle θ₂",
  cam: "cam angle θ",
  gears: "input angle",
  geneva: "driver angle",
  straightline: "crank angle θ",
};

function DriveBadge() {
  const mech = useSimStore((s) => s.mech);

  let color = "var(--trace)";
  let text: string;
  switch (mech.type) {
    case "fourbar": {
      const impossible = !mech.range.full && mech.range.arcs.length === 0;
      color = impossible
        ? "var(--warn)"
        : mech.grashof.inputRotatesFully
          ? "var(--ok)"
          : "var(--trace)";
      text = impossible ? "no assembly" : mech.grashof.class;
      break;
    }
    case "slidercrank":
      color = mech.range.full ? "var(--ok)" : "var(--trace)";
      text = mech.range.full ? "full rotation" : "limited crank";
      break;
    case "cam":
      text = mech.config.kind === "rdf" ? `${mech.config.law} law` : "eccentric disc";
      break;
    case "gears":
      text = mech.pose.ok ? `ratio ×${mech.pose.overallRatio.toFixed(2)}` : "invalid";
      break;
    case "geneva":
      text = `dwell ${(genevaDwellFraction(mech.config.slots) * 100).toFixed(0)}%`;
      break;
    case "straightline":
      color = mech.variant === "peaucellier" ? "var(--ok)" : "var(--trace)";
      text = mech.variant === "peaucellier" ? "exact line" : "approx line";
      break;
  }

  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {text}
    </span>
  );
}

function DrivePanel() {
  const mechType = useSimStore((s) => s.mech.type);
  const theta = useSimStore((s) => s.theta);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const setTheta = useSimStore((s) => s.setTheta);

  const thetaDeg = radToDeg(normalizeAnglePositive(theta));

  return (
    <Panel title="Drive" badge={<DriveBadge />}>
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
        label={THETA_LABEL[mechType]}
        value={thetaDeg}
        min={0}
        max={360}
        step={0.5}
        unit="°"
        precision={1}
        onChange={(v) => setTheta(degToRad(v))}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Per-mechanism geometry panels
// ---------------------------------------------------------------------------

/** Live Grashof status dot + class, shown on the Links panel header. */
function GrashofBadge({
  grashof,
  impossible,
}: {
  grashof: GrashofResult;
  impossible: boolean;
}) {
  const color = impossible
    ? "var(--warn)"
    : grashof.inputRotatesFully
      ? "var(--ok)"
      : "var(--trace)";
  return (
    <span
      title={grashof.description}
      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted"
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {impossible ? "no assembly" : grashof.class}
    </span>
  );
}

function FourBarControls() {
  const mech = useSimStore((s) => s.mech);
  const patchFourBar = useSimStore((s) => s.patchFourBar);
  const setGroundLen = useSimStore((s) => s.setGroundLen);
  const setGroundAngle = useSimStore((s) => s.setGroundAngle);
  const setCouplerPoint = useSimStore((s) => s.setCouplerPoint);
  if (mech.type !== "fourbar") return null;
  const def = mech.config;
  const impossible = !mech.range.full && mech.range.arcs.length === 0;

  return (
    <>
      <Panel
        title="Links"
        badge={<GrashofBadge grashof={mech.grashof} impossible={impossible} />}
      >
        <Slider label="crank r₂" value={def.crankLen} min={2} max={150} onChange={(v) => patchFourBar({ crankLen: v })} />
        <Slider label="coupler r₃" value={def.couplerLen} min={2} max={250} onChange={(v) => patchFourBar({ couplerLen: v })} />
        <Slider label="rocker r₄" value={def.rockerLen} min={2} max={250} onChange={(v) => patchFourBar({ rockerLen: v })} />
        <Slider label="ground r₁" value={groundLen(def)} min={2} max={250} onChange={setGroundLen} />
        <Slider
          label="ground angle"
          value={radToDeg(angleOf(sub(def.O4, def.O2)))}
          min={-180}
          max={180}
          step={1}
          unit="°"
          precision={0}
          onChange={(v) => setGroundAngle(degToRad(v))}
        />
        <Note>{mech.grashof.description}</Note>
      </Panel>
      <Panel title="Coupler point">
        <Slider label="u (along A→B)" value={def.couplerPoint.u} min={-100} max={250} onChange={(v) => setCouplerPoint(v, def.couplerPoint.v)} />
        <Slider label="v (offset)" value={def.couplerPoint.v} min={-150} max={150} onChange={(v) => setCouplerPoint(def.couplerPoint.u, v)} />
        <Note>
          The perpendicular offset v is what makes coupler curves interesting —
          at v = 0 the point just traces arcs.
        </Note>
      </Panel>
    </>
  );
}

function SliderCrankControls() {
  const mech = useSimStore((s) => s.mech);
  const patch = useSimStore((s) => s.patchSliderCrank);
  if (mech.type !== "slidercrank") return null;
  const c = mech.config;
  const rodPoint = c.rodPoint ?? { u: c.rodLen / 2, v: 0 };

  return (
    <>
      <Panel title="Geometry">
        <Slider label="crank r" value={c.crankLen} min={2} max={120} onChange={(v) => patch({ crankLen: v })} />
        <Slider label="rod l" value={c.rodLen} min={2} max={250} onChange={(v) => patch({ rodLen: v })} />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Slider label="offset e" value={c.offset} min={-80} max={80} onChange={(v) => patch({ offset: v })} />
          </div>
          <button
            type="button"
            onClick={() => patch({ offset: 0 })}
            disabled={c.offset === 0}
            className="mb-1 shrink-0 border border-panel-border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            in-line
          </button>
        </div>
        <Slider
          label="axis angle"
          value={radToDeg(c.axisAngle)}
          min={-90}
          max={90}
          step={1}
          unit="°"
          precision={0}
          onChange={(v) => patch({ axisAngle: degToRad(v) })}
        />
        {mech.stroke && (
          <Note>
            stroke {(mech.stroke.max - mech.stroke.min).toFixed(1)} mm
            {c.offset !== 0 && " — offset makes the return faster than the advance"}
          </Note>
        )}
      </Panel>
      <Panel title="Rod trace point">
        <Slider label="u (along A→B)" value={rodPoint.u} min={-50} max={250} onChange={(v) => patch({ rodPoint: { u: v, v: rodPoint.v } })} />
        <Slider label="v (offset)" value={rodPoint.v} min={-100} max={100} onChange={(v) => patch({ rodPoint: { u: rodPoint.u, v } })} />
      </Panel>
    </>
  );
}

function CamControls() {
  const mech = useSimStore((s) => s.mech);
  const patch = useSimStore((s) => s.patchCam);
  if (mech.type !== "cam") return null;
  const c = mech.config;
  const programMax = (key: "riseDeg" | "dwellDeg" | "fallDeg"): number => {
    const others =
      key === "riseDeg"
        ? c.dwellDeg + c.fallDeg
        : key === "dwellDeg"
          ? c.riseDeg + c.fallDeg
          : c.riseDeg + c.dwellDeg;
    return Math.max(key === "dwellDeg" ? 0 : 10, 360 - others);
  };

  return (
    <>
      <Panel title="Profile">
        <ToggleRow
          ariaLabel="Cam profile kind"
          options={[
            { value: "rdf", label: "rise-dwell-fall" },
            { value: "eccentric", label: "eccentric disc" },
          ]}
          active={c.kind}
          onSelect={(kind) => patch({ kind: kind as CamConfig["kind"] })}
        />
        {c.kind === "rdf" ? (
          <>
            <ToggleRow
              ariaLabel="Motion law"
              options={[
                { value: "cycloidal", label: "cycloidal" },
                { value: "harmonic", label: "harmonic" },
                { value: "uniform", label: "uniform" },
              ]}
              active={c.law}
              onSelect={(law) => patch({ law: law as MotionLaw })}
            />
            <Slider label="base circle" value={c.baseR} min={10} max={80} onChange={(v) => patch({ baseR: v })} />
            <Slider label="lift h" value={c.lift} min={2} max={60} onChange={(v) => patch({ lift: v })} />
            <Slider label="rise" value={c.riseDeg} min={10} max={programMax("riseDeg")} step={1} unit="°" precision={0} onChange={(v) => patch({ riseDeg: v })} />
            <Slider label="dwell (top)" value={c.dwellDeg} min={0} max={programMax("dwellDeg")} step={1} unit="°" precision={0} onChange={(v) => patch({ dwellDeg: v })} />
            <Slider label="fall" value={c.fallDeg} min={10} max={programMax("fallDeg")} step={1} unit="°" precision={0} onChange={(v) => patch({ fallDeg: v })} />
            <Note>
              The rest of the revolution dwells at zero lift. Cycloidal has zero
              end-of-stroke acceleration — the smooth choice.
            </Note>
          </>
        ) : (
          <>
            <Slider label="disc radius" value={c.discR} min={10} max={80} onChange={(v) => patch({ discR: v })} />
            <Slider
              label="eccentricity"
              value={c.ecc}
              min={0}
              max={Math.max(1, c.discR - 2)}
              onChange={(v) => patch({ ecc: v })}
            />
            <Note>
              A circular disc mounted off-center — on a flat-face follower this
              is exact simple-harmonic motion.
            </Note>
          </>
        )}
      </Panel>
      <Panel title="Follower">
        <ToggleRow
          ariaLabel="Follower kind"
          options={[
            { value: "roller", label: "roller" },
            { value: "flat", label: "flat face" },
          ]}
          active={c.follower}
          onSelect={(follower) => patch({ follower: follower as CamConfig["follower"] })}
        />
        {c.follower === "roller" && (
          <Slider label="roller radius" value={c.rollerR} min={3} max={25} onChange={(v) => patch({ rollerR: v })} />
        )}
      </Panel>
    </>
  );
}

function GearsControls() {
  const mech = useSimStore((s) => s.mech);
  const patch = useSimStore((s) => s.patchGears);
  if (mech.type !== "gears") return null;
  const c = mech.config;

  const setCount = (count: "2" | "3") => {
    const n = Number(count);
    if (n === c.teeth.length) return;
    if (n === 2) patch({ teeth: c.teeth.slice(0, 2), meshAngles: c.meshAngles.slice(0, 1) });
    else patch({ teeth: [...c.teeth, 18], meshAngles: [...c.meshAngles, -Math.PI / 6] });
  };

  return (
    <Panel title="Train">
      <ToggleRow
        ariaLabel="Gear count"
        options={[
          { value: "2", label: "2 gears" },
          { value: "3", label: "3 gears" },
        ]}
        active={String(c.teeth.length) as "2" | "3"}
        onSelect={setCount}
      />
      <Slider label="module" value={c.module} min={2} max={8} step={0.5} unit="mm/t" onChange={(v) => patch({ module: v })} />
      {c.teeth.map((z, i) => (
        <Slider
          key={i}
          label={`gear ${i + 1} teeth`}
          value={z}
          min={6}
          max={60}
          step={1}
          unit="t"
          precision={0}
          onChange={(v) => {
            const teeth = [...c.teeth];
            teeth[i] = Math.round(v);
            patch({ teeth });
          }}
        />
      ))}
      <Slider
        label="mesh angle 1"
        value={radToDeg(c.meshAngles[0] ?? 0)}
        min={-90}
        max={90}
        step={1}
        unit="°"
        precision={0}
        onChange={(v) => {
          const meshAngles = [...c.meshAngles];
          meshAngles[0] = degToRad(v);
          patch({ meshAngles });
        }}
      />
      {c.teeth.length === 3 && (
        <Slider
          label="mesh angle 2"
          value={radToDeg(c.meshAngles[1] ?? 0)}
          min={-90}
          max={90}
          step={1}
          unit="°"
          precision={0}
          onChange={(v) => {
            const meshAngles = [...c.meshAngles];
            meshAngles[1] = degToRad(v);
            patch({ meshAngles });
          }}
        />
      )}
      {mech.pose.ok && (
        <Note>
          ω_out/ω_in = {mech.pose.overallRatio.toFixed(3)} —{" "}
          {mech.pose.overallRatio < 0 ? "reversed" : "same direction"}
          {c.teeth.length === 3 && "; the middle gear is an idler: it flips direction but drops out of the ratio"}
        </Note>
      )}
    </Panel>
  );
}

function GenevaControls() {
  const mech = useSimStore((s) => s.mech);
  const patch = useSimStore((s) => s.patchGeneva);
  if (mech.type !== "geneva") return null;
  const c = mech.config;

  return (
    <Panel title="Geometry">
      <Slider
        label="slots"
        value={c.slots}
        min={3}
        max={10}
        step={1}
        unit=""
        precision={0}
        onChange={(v) => patch({ slots: Math.round(v) })}
      />
      <Slider label="center distance" value={c.centerDist} min={40} max={160} onChange={(v) => patch({ centerDist: v })} />
      <Slider
        label="wheel direction"
        value={radToDeg(c.wheelDir)}
        min={-180}
        max={180}
        step={1}
        unit="°"
        precision={0}
        onChange={(v) => patch({ wheelDir: degToRad(v) })}
      />
      <Note>
        Each driver revolution indexes the wheel {`${(360 / c.slots).toFixed(0)}°`};
        it rests {(genevaDwellFraction(c.slots) * 100).toFixed(0)}% of the time.
        Pin and slots are proportioned for tangential (shock-free) entry.
      </Note>
    </Panel>
  );
}

function StraightLineControls() {
  const mech = useSimStore((s) => s.mech);
  const patchWatt = useSimStore((s) => s.patchWatt);
  const patchPeaucellier = useSimStore((s) => s.patchPeaucellier);
  const setGroundLen = useSimStore((s) => s.setGroundLen);
  const setCouplerPoint = useSimStore((s) => s.setCouplerPoint);
  if (mech.type !== "straightline") return null;

  if (mech.variant === "watt") {
    const def = mech.watt;
    const impossible = !mech.range.full && mech.range.arcs.length === 0;
    return (
      <Panel
        title="Links (Watt)"
        badge={<GrashofBadge grashof={classify(def)} impossible={impossible} />}
      >
        <Slider label="side link r₂" value={def.crankLen} min={10} max={200} onChange={(v) => patchWatt({ crankLen: v })} />
        <Slider label="coupler r₃" value={def.couplerLen} min={5} max={150} onChange={(v) => patchWatt({ couplerLen: v })} />
        <Slider label="side link r₄" value={def.rockerLen} min={10} max={200} onChange={(v) => patchWatt({ rockerLen: v })} />
        <Slider label="ground r₁" value={groundLen(def)} min={10} max={300} onChange={setGroundLen} />
        <Slider label="trace u" value={def.couplerPoint.u} min={-50} max={150} onChange={(v) => setCouplerPoint(v, def.couplerPoint.v)} />
        <Slider label="trace v" value={def.couplerPoint.v} min={-60} max={60} onChange={(v) => setCouplerPoint(def.couplerPoint.u, v)} />
        <Note>
          Keep the trace point at the coupler midpoint (u = r₃/2, v = 0) for the
          classic straight stroke; the drive sways between its limits.
        </Note>
      </Panel>
    );
  }

  const c = mech.peaucellier;
  return (
    <Panel title="Inversor cell">
      <Slider label="crank r" value={c.crankLen} min={10} max={90} onChange={(v) => patchPeaucellier({ crankLen: v })} />
      <Slider label="arm L" value={c.armLen} min={40} max={180} onChange={(v) => patchPeaucellier({ armLen: v })} />
      <Slider
        label="cell side s"
        value={c.cellSide}
        min={10}
        max={Math.max(12, c.armLen - 5)}
        onChange={(v) => patchPeaucellier({ cellSide: v })}
      />
      <Slider
        label="axis angle"
        value={radToDeg(c.axisAngle)}
        min={-180}
        max={180}
        step={1}
        unit="°"
        precision={0}
        onChange={(v) => patchPeaucellier({ axisAngle: degToRad(v) })}
      />
      <Note>
        Q inverts P about the pole: |OP|·|OQ| = L² − s². Because P rides a
        circle through O, the path of Q is an exact line — no approximation.
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function ControlsPanel() {
  const fitView = useSimStore((s) => s.fitView);
  const resetMechanism = useSimStore((s) => s.resetMechanism);

  return (
    <div className="flex w-full flex-col gap-2">
      <MechanismPicker />
      <DrivePanel />
      <FourBarControls />
      <SliderCrankControls />
      <CamControls />
      <GearsControls />
      <GenevaControls />
      <StraightLineControls />
      <AnalysisPanel />
      <MeasurePanel />
      <ComparePanel />

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