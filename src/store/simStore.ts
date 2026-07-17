import { create } from "zustand";
import {
  add,
  angleInArc,
  angleOf,
  camBaseDist,
  camDiagram,
  camMaxLift,
  camProfile,
  clampToRange,
  classify,
  defaultCam,
  defaultGearTrain,
  defaultGeneva,
  defaultPeaucellier,
  defaultSliderCrank,
  defaultWatt,
  degToRad,
  dist,
  dot,
  fitLine,
  fourBarPreset,
  fromPolar,
  genevaGeometry,
  inputRange,
  norm,
  normalizeAngle,
  normalizeAnglePositive,
  peaucellierInputRange,
  peaucellierLine,
  perp,
  scale,
  sliderCrankInputRange,
  sliderStroke,
  solveCam,
  solveFourBar,
  solveGearTrain,
  solveGeneva,
  solvePeaucellier,
  solveSliderCrank,
  sub,
  traceCouplerCurve,
  tracePeaucellier,
  traceSliderCrank,
  TWO_PI,
  vec,
  type BranchSign,
  type CamConfig,
  type CamDiagram,
  type CamResult,
  type CouplerCurve,
  type FourBarConfig,
  type FourBarResult,
  type GearTrainConfig,
  type GearTrainResult,
  type GenevaConfig,
  type GenevaGeometry,
  type GenevaResult,
  type GrashofResult,
  type InputRange,
  type PeaucellierConfig,
  type PeaucellierResult,
  type SliderCrankConfig,
  type SliderCrankResult,
  type StraightLineVariant,
  type Vec2,
} from "@/engine";
import { fitBounds, type ScreenSize, type ViewState } from "@/components/sim/view";

// ---------------------------------------------------------------------------
// The mechanism library
// ---------------------------------------------------------------------------

export type MechType =
  | "fourbar"
  | "slidercrank"
  | "cam"
  | "gears"
  | "geneva"
  | "straightline";

export interface MechMeta {
  type: MechType;
  label: string;
  /** what it's for — shown in the mechanism menu */
  blurb: string;
}

export const MECHANISMS: MechMeta[] = [
  {
    type: "fourbar",
    label: "Four-bar linkage",
    blurb:
      "The fundamental linkage. A crank, a coupler and a rocker between two fixed pivots — points on the coupler trace curves used in wipers, walking machines and film advances.",
  },
  {
    type: "slidercrank",
    label: "Slider-crank",
    blurb:
      "Rotation to translation and back — every piston engine and compressor. Offset the slider axis for a quick-return stroke.",
  },
  {
    type: "cam",
    label: "Cam & follower",
    blurb:
      "Program motion directly into a profile: rise, dwell, fall. The follower reads the program off the spinning cam — valve trains, automats, sewing machines.",
  },
  {
    type: "gears",
    label: "Gear train",
    blurb:
      "Exact speed ratios between meshing spur gears. Ratios multiply down the chain; every external mesh reverses direction.",
  },
  {
    type: "geneva",
    label: "Geneva drive",
    blurb:
      "Intermittent motion: a continuously turning pin indexes a slotted wheel one station at a time, with a hard dwell in between — movie projectors, indexing tables.",
  },
  {
    type: "straightline",
    label: "Straight-line linkage",
    blurb:
      "Rotary joints only, straight-line output. Watt's linkage gets close (steam-engine guides); Peaucellier–Lipkin is mathematically exact.",
  },
];

export const mechMeta = (type: MechType): MechMeta =>
  MECHANISMS.find((m) => m.type === type)!;

// ---------------------------------------------------------------------------
// Per-mechanism state slices (config + everything derived from it)
// ---------------------------------------------------------------------------

export interface FourBarSlice {
  type: "fourbar";
  config: FourBarConfig;
  pose: FourBarResult;
  trace: CouplerCurve;
  grashof: GrashofResult;
  range: InputRange;
  prevB: Vec2 | null;
  branch: BranchSign;
}

export interface SliderCrankSlice {
  type: "slidercrank";
  config: SliderCrankConfig;
  pose: SliderCrankResult;
  trace: CouplerCurve;
  range: InputRange;
  stroke: { min: number; max: number } | null;
  branch: 1 | -1;
}

export interface CamSlice {
  type: "cam";
  config: CamConfig;
  pose: CamResult;
  /** profile polyline in the cam frame (rotate by θ to draw) */
  profile: Vec2[];
  diagram: CamDiagram;
  range: InputRange;
}

export interface GearsSlice {
  type: "gears";
  config: GearTrainConfig;
  pose: GearTrainResult;
  range: InputRange;
}

export interface GenevaSlice {
  type: "geneva";
  config: GenevaConfig;
  pose: GenevaResult;
  geom: GenevaGeometry;
  /** wheel angle sampled over one driver revolution, for the inset plot */
  diagram: number[];
  range: InputRange;
}

export interface StraightLineSlice {
  type: "straightline";
  variant: StraightLineVariant;
  watt: FourBarConfig;
  peaucellier: PeaucellierConfig;
  /** pose of the active variant (the other is null) */
  wattPose: FourBarResult | null;
  peauPose: PeaucellierResult | null;
  trace: CouplerCurve;
  range: InputRange;
  /** reference line the output point is compared against */
  refLine: { a: Vec2; b: Vec2 } | null;
  /** max deviation of the straight stroke from that line, mm (Watt: central
   * run of the lemniscate; Peaucellier: the whole trace — effectively 0) */
  refDev: number | null;
  prevB: Vec2 | null;
  branch: BranchSign;
}

export type MechSlice =
  | FourBarSlice
  | SliderCrankSlice
  | CamSlice
  | GearsSlice
  | GenevaSlice
  | StraightLineSlice;

/** ids of joints/links, per mechanism; plain strings keep cross-mech code sane */
export type SelectableId = string;

const MIN_LEN = 2;
const TRACE_STEPS = 480;
const FULL: InputRange = { full: true };

// ---------------------------------------------------------------------------
// Derivation — config + θ → fully solved slice (single source of truth)
// ---------------------------------------------------------------------------

function deriveFourBar(
  config: FourBarConfig,
  theta: number,
  prevB: Vec2 | null,
  branch: BranchSign,
): { mech: FourBarSlice; theta: number } {
  const grashof = classify(config);
  const range = inputRange(config);
  const clamped = normalizeAngle(clampToRange(theta, range));
  let pose = solveFourBar(config, clamped, prevB ? { prevB } : { branch });
  if (!pose.ok && prevB) {
    // Continuity seed can be stale after a large geometry change — retry on
    // the explicit branch before reporting failure.
    pose = solveFourBar(config, clamped, { branch });
  }
  const nextBranch = pose.ok ? pose.branch : branch;
  const trace = traceCouplerCurve(config, {
    branch: nextBranch,
    steps: TRACE_STEPS,
    theta2: clamped,
  });
  return {
    mech: {
      type: "fourbar",
      config,
      pose,
      trace,
      grashof,
      range,
      prevB: pose.ok ? pose.B : null,
      branch: nextBranch,
    },
    theta: clamped,
  };
}

function deriveSliderCrank(
  config: SliderCrankConfig,
  theta: number,
  branch: 1 | -1,
): { mech: SliderCrankSlice; theta: number } {
  const range = sliderCrankInputRange(config);
  const clamped = normalizeAngle(clampToRange(theta, range));
  const pose = solveSliderCrank(config, clamped, { branch });
  const trace = traceSliderCrank(config, { branch, steps: TRACE_STEPS });
  return {
    mech: {
      type: "slidercrank",
      config,
      pose,
      trace,
      range,
      stroke: sliderStroke(config),
      branch,
    },
    theta: clamped,
  };
}

function deriveCam(config: CamConfig, theta: number): { mech: CamSlice; theta: number } {
  return {
    mech: {
      type: "cam",
      config,
      pose: solveCam(config, theta),
      profile: camProfile(config, 256),
      diagram: camDiagram(config, 180),
      range: FULL,
    },
    theta,
  };
}

function deriveGears(
  config: GearTrainConfig,
  theta: number,
): { mech: GearsSlice; theta: number } {
  return {
    mech: { type: "gears", config, pose: solveGearTrain(config, theta), range: FULL },
    theta,
  };
}

const GENEVA_DIAGRAM_STEPS = 240;

function deriveGeneva(
  config: GenevaConfig,
  theta: number,
): { mech: GenevaSlice; theta: number } {
  const diagram: number[] = [];
  for (let i = 0; i <= GENEVA_DIAGRAM_STEPS; i++) {
    const res = solveGeneva(config, config.wheelDir - Math.PI + (i / GENEVA_DIAGRAM_STEPS) * TWO_PI);
    diagram.push(res.ok ? res.wheelAngle : 0);
  }
  return {
    mech: {
      type: "geneva",
      config,
      pose: solveGeneva(config, theta),
      geom: genevaGeometry(config),
      diagram,
      range: FULL,
    },
    theta,
  };
}

function deriveStraightLine(
  variant: StraightLineVariant,
  watt: FourBarConfig,
  peaucellier: PeaucellierConfig,
  theta: number,
  prevB: Vec2 | null,
  branch: BranchSign,
): { mech: StraightLineSlice; theta: number } {
  if (variant === "watt") {
    const fb = deriveFourBar(watt, theta, prevB, branch);
    // Reference line: fit the central 40% of the out-sweep of the trace —
    // the straight part of the lemniscate.
    const pts = fb.mech.trace.points;
    const half = Math.floor(pts.length / 2);
    const mid = pts.slice(Math.floor(half * 0.3), Math.ceil(half * 0.7));
    const fit = fitLine(mid);
    const refLine = fit
      ? {
          a: add(fit.centroid, scale(fit.dir, -fit.length * 0.9)),
          b: add(fit.centroid, scale(fit.dir, fit.length * 0.9)),
        }
      : null;
    return {
      mech: {
        type: "straightline",
        variant,
        watt,
        peaucellier,
        wattPose: fb.mech.pose,
        peauPose: null,
        trace: fb.mech.trace,
        range: fb.mech.range,
        refLine,
        refDev: fit ? fit.maxDev : null,
        prevB: fb.mech.prevB,
        branch: fb.mech.branch,
      },
      theta: fb.theta,
    };
  }

  const range = peaucellierInputRange(peaucellier);
  const clamped = normalizeAngle(clampToRange(theta, range));
  const pose = solvePeaucellier(peaucellier, clamped);
  const trace = tracePeaucellier(peaucellier, TRACE_STEPS / 2);
  const line = peaucellierLine(peaucellier);
  const traceFit = fitLine(trace.points);
  let refLine: { a: Vec2; b: Vec2 } | null = null;
  if (trace.points.length > 1) {
    // Span the traced stroke, extended a touch.
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of trace.points) {
      const t = dot(sub(p, line.point), line.dir);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    refLine = {
      a: add(line.point, scale(line.dir, lo * 1.08)),
      b: add(line.point, scale(line.dir, hi * 1.08)),
    };
  }
  return {
    mech: {
      type: "straightline",
      variant,
      watt,
      peaucellier,
      wattPose: null,
      peauPose: pose,
      trace,
      range,
      refLine,
      refDev: traceFit ? traceFit.maxDev : null,
      prevB: null,
      branch,
    },
    theta: clamped,
  };
}

/** Re-derive a slice from its own config(s) at a (possibly new) angle. */
function deriveMech(mech: MechSlice, theta: number): { mech: MechSlice; theta: number } {
  switch (mech.type) {
    case "fourbar":
      return deriveFourBar(mech.config, theta, mech.prevB, mech.branch);
    case "slidercrank":
      return deriveSliderCrank(mech.config, theta, mech.branch);
    case "cam":
      return deriveCam(mech.config, theta);
    case "gears":
      return deriveGears(mech.config, theta);
    case "geneva":
      return deriveGeneva(mech.config, theta);
    case "straightline":
      return deriveStraightLine(
        mech.variant,
        mech.watt,
        mech.peaucellier,
        theta,
        mech.prevB,
        mech.branch,
      );
  }
}

/** Fresh slice for a mechanism type at its default geometry. */
function defaultMech(type: MechType): { mech: MechSlice; theta: number } {
  switch (type) {
    case "fourbar": {
      const p = fourBarPreset("kite")!;
      return deriveFourBar(p.config, p.theta2, null, p.branch);
    }
    case "slidercrank":
      return deriveSliderCrank(defaultSliderCrank(), degToRad(50), 1);
    case "cam":
      return deriveCam(defaultCam(), degToRad(30));
    case "gears":
      return deriveGears(defaultGearTrain(), 0);
    case "geneva":
      return deriveGeneva(defaultGeneva(), degToRad(-120));
    case "straightline":
      return deriveStraightLine(
        "peaucellier",
        defaultWatt(),
        defaultPeaucellier(),
        degToRad(150),
        null,
        1,
      );
  }
}

/** Flip the assembly branch (used when a limited drive bounces off a limit). */
function flipBranch(mech: MechSlice): MechSlice {
  switch (mech.type) {
    case "fourbar":
      return { ...mech, branch: mech.branch === 1 ? -1 : 1, prevB: null };
    case "slidercrank":
      return { ...mech, branch: mech.branch === 1 ? -1 : 1 };
    case "straightline":
      return mech.variant === "watt"
        ? { ...mech, branch: mech.branch === 1 ? -1 : 1, prevB: null }
        : mech;
    default:
      return mech;
  }
}

/** Joints the pointer can grab, per mechanism. */
export function draggableIds(mech: MechSlice): SelectableId[] {
  switch (mech.type) {
    case "fourbar":
      return ["O2", "O4", "A", "B", "P", "ground"];
    case "slidercrank":
      return ["O2", "A", "B", "P", "ground"];
    case "cam":
      return ["center", "ground"];
    case "gears":
      return ["center", "ground"];
    case "geneva":
      return ["center", "wheel", "ground"];
    case "straightline":
      return mech.variant === "watt"
        ? ["O2", "O4", "A", "B", "P", "ground"]
        : ["O", "C", "P", "ground"];
  }
}

// ---------------------------------------------------------------------------
// View fitting
// ---------------------------------------------------------------------------

function boundsPoints(mech: MechSlice, theta: number): Vec2[] {
  const pts: Vec2[] = [];
  const circle = (c: Vec2, r: number) => {
    pts.push(vec(c.x - r, c.y - r), vec(c.x + r, c.y + r));
  };
  switch (mech.type) {
    case "fourbar": {
      const { O2, O4, crankLen, rockerLen } = mech.config;
      circle(O2, crankLen);
      circle(O4, rockerLen);
      pts.push(...mech.trace.points);
      if (mech.pose.ok) pts.push(mech.pose.A, mech.pose.B, mech.pose.P);
      break;
    }
    case "slidercrank": {
      const c = mech.config;
      circle(c.O2, c.crankLen);
      pts.push(...mech.trace.points);
      const axis = fromPolar(1, c.axisAngle);
      const origin = add(c.O2, scale(perp(axis), c.offset));
      if (mech.stroke) {
        const pad = c.crankLen * 0.8;
        pts.push(
          add(origin, scale(axis, mech.stroke.min - pad)),
          add(origin, scale(axis, mech.stroke.max + pad)),
        );
      }
      if (mech.pose.ok) pts.push(mech.pose.A, mech.pose.B, mech.pose.P);
      break;
    }
    case "cam": {
      const c = mech.config;
      const r = camBaseDist(c) + camMaxLift(c) + (c.follower === "roller" ? c.rollerR : 0);
      circle(c.center, r * 1.15);
      // follower stem headroom
      pts.push(add(c.center, vec(0, r + 30)));
      break;
    }
    case "gears": {
      if (mech.pose.ok) {
        for (const g of mech.pose.gears) circle(g.center, g.r + mech.config.module * 1.5);
      } else {
        circle(mech.config.center, 50);
      }
      break;
    }
    case "geneva": {
      circle(mech.geom.driverCenter, mech.geom.pinCircleR * 1.2);
      circle(mech.geom.wheelCenter, mech.geom.wheelR * 1.1);
      break;
    }
    case "straightline": {
      pts.push(...mech.trace.points);
      if (mech.variant === "watt") {
        circle(mech.watt.O2, mech.watt.crankLen);
        circle(mech.watt.O4, mech.watt.rockerLen);
      } else {
        const p = mech.peaucellier;
        circle(p.O, p.crankLen * 2.2);
        if (mech.peauPose?.ok) {
          pts.push(mech.peauPose.armA, mech.peauPose.armB, mech.peauPose.Q);
        }
      }
      if (mech.refLine) pts.push(mech.refLine.a, mech.refLine.b);
      break;
    }
  }
  void theta;
  return pts;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

interface SavedMech {
  mech: MechSlice;
  theta: number;
}

export interface SimState {
  mech: MechSlice;
  /** input angle of the active mechanism (radians, world frame) */
  theta: number;
  playing: boolean;
  /** input speed, degrees per second */
  speed: number;
  /** current sweep direction; flips when a limited input bounces off a limit */
  driveDir: 1 | -1;
  view: ViewState;
  /** last known canvas size in CSS px, kept fresh by the canvas layer */
  canvasSize: ScreenSize;
  selected: SelectableId | null;
  hovered: SelectableId | null;
  /** joint being dragged, if any (drive is suspended while set) */
  dragging: SelectableId | null;
  /** parked state of inactive mechanisms, restored when switching back */
  saved: Partial<Record<MechType, SavedMech>>;

  setMechType(type: MechType): void;
  setStraightVariant(variant: StraightLineVariant): void;
  applyFourBarPreset(id: string): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  /** scrub the input angle (radians, world frame) */
  setTheta(theta: number): void;
  /** advance the motor by dt seconds */
  tick(dt: number): void;
  patchFourBar(patch: Partial<FourBarConfig>): void;
  patchSliderCrank(patch: Partial<SliderCrankConfig>): void;
  patchCam(patch: Partial<CamConfig>): void;
  patchGears(patch: Partial<GearTrainConfig>): void;
  patchGeneva(patch: Partial<GenevaConfig>): void;
  patchWatt(patch: Partial<FourBarConfig>): void;
  patchPeaucellier(patch: Partial<PeaucellierConfig>): void;
  setGroundLen(len: number): void;
  setCouplerPoint(u: number, v: number): void;
  resetMechanism(): void;
  /** direct manipulation: move a joint to a world position */
  dragTo(id: SelectableId, w: Vec2): void;
  /** translate the whole mechanism (ground drag) */
  translateBy(delta: Vec2): void;
  setDragging(id: SelectableId | null): void;
  setSelected(id: SelectableId | null): void;
  setHovered(id: SelectableId | null): void;
  setView(view: ViewState): void;
  setCanvasSize(size: ScreenSize): void;
  /** frame the mechanism + trace; uses the last known canvas size by default */
  fitView(size?: ScreenSize): void;
}

const initial = defaultMech("fourbar");

export const useSimStore = create<SimState>()((set, get) => ({
  mech: initial.mech,
  theta: initial.theta,
  playing: true,
  speed: 60,
  driveDir: 1,
  view: { cx: 0, cy: 30, scale: 3 },
  canvasSize: { w: 800, h: 600 },
  selected: null,
  hovered: null,
  dragging: null,
  saved: {},

  setMechType: (type) => {
    const st = get();
    if (st.mech.type === type) return;
    const saved = {
      ...st.saved,
      [st.mech.type]: { mech: st.mech, theta: st.theta },
    };
    const parked = saved[type];
    const next = parked
      ? deriveMech(parked.mech, parked.theta)
      : defaultMech(type);
    set({
      mech: next.mech,
      theta: next.theta,
      saved,
      driveDir: 1,
      selected: null,
      hovered: null,
      dragging: null,
    });
    get().fitView();
  },

  setStraightVariant: (variant) => {
    const st = get();
    if (st.mech.type !== "straightline" || st.mech.variant === variant) return;
    const theta = variant === "watt" ? degToRad(16) : degToRad(150);
    const next = deriveStraightLine(
      variant,
      st.mech.watt,
      st.mech.peaucellier,
      theta,
      null,
      1,
    );
    set({ mech: next.mech, theta: next.theta, driveDir: 1, selected: null });
    get().fitView();
  },

  applyFourBarPreset: (id) => {
    const preset = fourBarPreset(id);
    const st = get();
    if (!preset || st.mech.type !== "fourbar") return;
    const next = deriveFourBar(preset.config, preset.theta2, null, preset.branch);
    set({ mech: next.mech, theta: next.theta, driveDir: 1 });
    get().fitView();
  },

  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed: Math.max(1, Math.min(720, speed)) }),

  setTheta: (theta) => {
    const st = get();
    set(deriveMech(st.mech, theta));
  },

  tick: (dt) => {
    const st = get();
    if (!st.playing || st.dragging) return;
    const step = degToRad(st.speed) * dt * st.driveDir;
    const range = st.mech.range;

    if (range.full) {
      set(deriveMech(st.mech, st.theta + step));
      return;
    }
    const arcs = range.arcs;
    if (arcs.length === 0) return;

    // Sweep within the current reachable arc; at a limit the assembly
    // continues through the fold onto the other branch — bounce the motor
    // and flip the branch.
    const arc = arcs.find((a) => angleInArc(st.theta, a)) ?? arcs[0];
    let span = arc.end - arc.start;
    if (span < 0) span += TWO_PI;
    let off = normalizeAnglePositive(st.theta - arc.start);
    if (off > span) off = span; // numeric guard when clamped exactly at a limit
    const next = off + step;

    if (next < 0 || next > span) {
      const clampedOff = Math.min(span, Math.max(0, next));
      set({
        driveDir: st.driveDir === 1 ? -1 : 1,
        ...deriveMech(flipBranch(st.mech), arc.start + clampedOff),
      });
    } else {
      set(deriveMech(st.mech, arc.start + next));
    }
  },

  patchFourBar: (patch) => {
    const st = get();
    if (st.mech.type !== "fourbar") return;
    set(deriveFourBar({ ...st.mech.config, ...patch }, st.theta, st.mech.prevB, st.mech.branch));
  },

  patchSliderCrank: (patch) => {
    const st = get();
    if (st.mech.type !== "slidercrank") return;
    set(deriveSliderCrank({ ...st.mech.config, ...patch }, st.theta, st.mech.branch));
  },

  patchCam: (patch) => {
    const st = get();
    if (st.mech.type !== "cam") return;
    set(deriveCam({ ...st.mech.config, ...patch }, st.theta));
  },

  patchGears: (patch) => {
    const st = get();
    if (st.mech.type !== "gears") return;
    set(deriveGears({ ...st.mech.config, ...patch }, st.theta));
  },

  patchGeneva: (patch) => {
    const st = get();
    if (st.mech.type !== "geneva") return;
    set(deriveGeneva({ ...st.mech.config, ...patch }, st.theta));
  },

  patchWatt: (patch) => {
    const st = get();
    if (st.mech.type !== "straightline" || st.mech.variant !== "watt") return;
    set(
      deriveStraightLine(
        "watt",
        { ...st.mech.watt, ...patch },
        st.mech.peaucellier,
        st.theta,
        st.mech.prevB,
        st.mech.branch,
      ),
    );
  },

  patchPeaucellier: (patch) => {
    const st = get();
    if (st.mech.type !== "straightline" || st.mech.variant !== "peaucellier") return;
    set(
      deriveStraightLine(
        "peaucellier",
        st.mech.watt,
        { ...st.mech.peaucellier, ...patch },
        st.theta,
        null,
        st.mech.branch,
      ),
    );
  },

  setGroundLen: (len) => {
    const st = get();
    const config =
      st.mech.type === "fourbar"
        ? st.mech.config
        : st.mech.type === "straightline" && st.mech.variant === "watt"
          ? st.mech.watt
          : null;
    if (!config) return;
    const dir = norm(sub(config.O4, config.O2));
    const safeDir = dir.x === 0 && dir.y === 0 ? vec(1, 0) : dir;
    const O4 = add(config.O2, scale(safeDir, Math.max(MIN_LEN, len)));
    if (st.mech.type === "fourbar") get().patchFourBar({ O4 });
    else get().patchWatt({ O4 });
  },

  setCouplerPoint: (u, v) => {
    const st = get();
    if (st.mech.type === "fourbar") get().patchFourBar({ couplerPoint: { u, v } });
    else if (st.mech.type === "straightline" && st.mech.variant === "watt")
      get().patchWatt({ couplerPoint: { u, v } });
  },

  resetMechanism: () => {
    const st = get();
    const next = defaultMech(st.mech.type);
    // Keep the straight-line variant the user was looking at.
    if (st.mech.type === "straightline" && next.mech.type === "straightline") {
      const variant = st.mech.variant;
      const fresh = deriveStraightLine(
        variant,
        defaultWatt(),
        defaultPeaucellier(),
        variant === "watt" ? degToRad(16) : degToRad(150),
        null,
        1,
      );
      set({ mech: fresh.mech, theta: fresh.theta, driveDir: 1, selected: null, hovered: null, dragging: null });
    } else {
      set({ mech: next.mech, theta: next.theta, driveDir: 1, selected: null, hovered: null, dragging: null });
    }
    get().fitView();
  },

  dragTo: (id, w) => {
    const st = get();
    const mech = st.mech;
    switch (mech.type) {
      case "fourbar": {
        const def = mech.config;
        if (id === "O2") set(deriveFourBar({ ...def, O2: w }, st.theta, mech.prevB, mech.branch));
        else if (id === "O4") set(deriveFourBar({ ...def, O4: w }, st.theta, mech.prevB, mech.branch));
        else if (id === "A") {
          // Dragging the crank pin sets both the crank length and the angle.
          const r = Math.max(MIN_LEN, dist(w, def.O2));
          set(deriveFourBar({ ...def, crankLen: r }, angleOf(sub(w, def.O2)), mech.prevB, mech.branch));
        } else if (id === "B") {
          if (!mech.pose.ok) break;
          // Coupler and rocker lengths recompute from the dragged position;
          // seeding continuity at the pointer keeps the assembly on that side.
          set(
            deriveFourBar(
              {
                ...def,
                couplerLen: Math.max(MIN_LEN, dist(w, mech.pose.A)),
                rockerLen: Math.max(MIN_LEN, dist(w, def.O4)),
              },
              st.theta,
              w,
              mech.branch,
            ),
          );
        } else if (id === "P") {
          if (!mech.pose.ok) break;
          const uHat = norm(sub(mech.pose.B, mech.pose.A));
          const vHat = perp(uHat);
          const rel = sub(w, mech.pose.A);
          set(
            deriveFourBar(
              { ...def, couplerPoint: { u: dot(rel, uHat), v: dot(rel, vHat) } },
              st.theta,
              mech.prevB,
              mech.branch,
            ),
          );
        }
        break;
      }
      case "slidercrank": {
        const c = mech.config;
        if (id === "O2") set(deriveSliderCrank({ ...c, O2: w }, st.theta, mech.branch));
        else if (id === "A") {
          const r = Math.max(MIN_LEN, dist(w, c.O2));
          set(deriveSliderCrank({ ...c, crankLen: r }, angleOf(sub(w, c.O2)), mech.branch));
        } else if (id === "B") {
          if (!mech.pose.ok) break;
          // Slider pin follows the pointer: perpendicular component moves the
          // line (offset), distance from A resizes the rod.
          const axis = fromPolar(1, c.axisAngle);
          const offset = dot(sub(w, c.O2), perp(axis));
          const rodLen = Math.max(MIN_LEN, dist(w, mech.pose.A));
          set(deriveSliderCrank({ ...c, offset, rodLen }, st.theta, mech.branch));
        } else if (id === "P") {
          if (!mech.pose.ok) break;
          const uHat = norm(sub(mech.pose.B, mech.pose.A));
          const rel = sub(w, mech.pose.A);
          set(
            deriveSliderCrank(
              { ...c, rodPoint: { u: dot(rel, uHat), v: dot(rel, perp(uHat)) } },
              st.theta,
              mech.branch,
            ),
          );
        }
        break;
      }
      case "cam": {
        if (id === "center") set(deriveCam({ ...mech.config, center: w }, st.theta));
        break;
      }
      case "gears": {
        if (id === "center") set(deriveGears({ ...mech.config, center: w }, st.theta));
        break;
      }
      case "geneva": {
        if (id === "center") set(deriveGeneva({ ...mech.config, center: w }, st.theta));
        else if (id === "wheel") {
          // Dragging the wheel re-aims and re-spaces the pair.
          const rel = sub(w, mech.config.center);
          const d = Math.max(10, dist(w, mech.config.center));
          set(
            deriveGeneva(
              { ...mech.config, centerDist: d, wheelDir: angleOf(rel) },
              st.theta,
            ),
          );
        }
        break;
      }
      case "straightline": {
        if (mech.variant === "watt") {
          const def = mech.watt;
          if (id === "O2")
            set(deriveStraightLine("watt", { ...def, O2: w }, mech.peaucellier, st.theta, mech.prevB, mech.branch));
          else if (id === "O4")
            set(deriveStraightLine("watt", { ...def, O4: w }, mech.peaucellier, st.theta, mech.prevB, mech.branch));
          else if (id === "A") {
            const r = Math.max(MIN_LEN, dist(w, def.O2));
            set(
              deriveStraightLine(
                "watt",
                { ...def, crankLen: r },
                mech.peaucellier,
                angleOf(sub(w, def.O2)),
                mech.prevB,
                mech.branch,
              ),
            );
          } else if (id === "B" && mech.wattPose?.ok) {
            set(
              deriveStraightLine(
                "watt",
                {
                  ...def,
                  couplerLen: Math.max(MIN_LEN, dist(w, mech.wattPose.A)),
                  rockerLen: Math.max(MIN_LEN, dist(w, def.O4)),
                },
                mech.peaucellier,
                st.theta,
                w,
                mech.branch,
              ),
            );
          } else if (id === "P" && mech.wattPose?.ok) {
            const uHat = norm(sub(mech.wattPose.B, mech.wattPose.A));
            const rel = sub(w, mech.wattPose.A);
            set(
              deriveStraightLine(
                "watt",
                { ...def, couplerPoint: { u: dot(rel, uHat), v: dot(rel, perp(uHat)) } },
                mech.peaucellier,
                st.theta,
                mech.prevB,
                mech.branch,
              ),
            );
          }
        } else {
          const c = mech.peaucellier;
          if (id === "O")
            set(deriveStraightLine("peaucellier", mech.watt, { ...c, O: w }, st.theta, null, mech.branch));
          else if (id === "C") {
            // Crank pivot: distance from O fixes the crank length (the line
            // condition |OC| = crank is preserved by construction).
            const minCrank = (c.armLen - c.cellSide) / 2 + 1;
            const crankLen = Math.max(minCrank, dist(w, c.O));
            set(
              deriveStraightLine(
                "peaucellier",
                mech.watt,
                { ...c, crankLen, axisAngle: angleOf(sub(w, c.O)) },
                st.theta,
                null,
                mech.branch,
              ),
            );
          } else if (id === "P" && mech.peauPose?.ok) {
            set(deriveMech(mech, angleOf(sub(w, mech.peauPose.C))));
          }
        }
        break;
      }
    }
  },

  translateBy: (delta) => {
    const st = get();
    const mech = st.mech;
    switch (mech.type) {
      case "fourbar":
        set(
          deriveFourBar(
            { ...mech.config, O2: add(mech.config.O2, delta), O4: add(mech.config.O4, delta) },
            st.theta,
            mech.prevB ? add(mech.prevB, delta) : null,
            mech.branch,
          ),
        );
        break;
      case "slidercrank":
        set(deriveSliderCrank({ ...mech.config, O2: add(mech.config.O2, delta) }, st.theta, mech.branch));
        break;
      case "cam":
        set(deriveCam({ ...mech.config, center: add(mech.config.center, delta) }, st.theta));
        break;
      case "gears":
        set(deriveGears({ ...mech.config, center: add(mech.config.center, delta) }, st.theta));
        break;
      case "geneva":
        set(deriveGeneva({ ...mech.config, center: add(mech.config.center, delta) }, st.theta));
        break;
      case "straightline":
        if (mech.variant === "watt") {
          set(
            deriveStraightLine(
              "watt",
              { ...mech.watt, O2: add(mech.watt.O2, delta), O4: add(mech.watt.O4, delta) },
              mech.peaucellier,
              st.theta,
              mech.prevB ? add(mech.prevB, delta) : null,
              mech.branch,
            ),
          );
        } else {
          set(
            deriveStraightLine(
              "peaucellier",
              mech.watt,
              { ...mech.peaucellier, O: add(mech.peaucellier.O, delta) },
              st.theta,
              null,
              mech.branch,
            ),
          );
        }
        break;
    }
  },

  setDragging: (dragging) => set({ dragging }),
  setSelected: (selected) => set({ selected }),
  setHovered: (hovered) => {
    if (get().hovered !== hovered) set({ hovered });
  },
  setView: (view) => set({ view }),
  setCanvasSize: (canvasSize) => set({ canvasSize }),

  fitView: (sizeArg) => {
    const st = get();
    const size = sizeArg ?? st.canvasSize;
    const pts = boundsPoints(st.mech, st.theta);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX + minY + maxX + maxY)) return;
    set({ view: fitBounds(size, vec(minX, minY), vec(maxX, maxY)) });
  },
}));