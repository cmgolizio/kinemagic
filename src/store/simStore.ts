import { create } from "zustand";
import {
  add,
  angleInArc,
  angleOf,
  clampToRange,
  classify,
  degToRad,
  dist,
  dot,
  inputRange,
  norm,
  normalizeAngle,
  normalizeAnglePositive,
  perp,
  solveFourBar,
  sub,
  traceCouplerCurve,
  TWO_PI,
  vec,
  type BranchSign,
  type CouplerCurve,
  type FourBarConfig,
  type FourBarResult,
  type GrashofResult,
  type InputRange,
  type Vec2,
} from "@/engine";
import { fitBounds, type ScreenSize, type ViewState } from "@/components/sim/view";

export type JointId = "O2" | "O4" | "A" | "B" | "P";
export type LinkId = "crank" | "coupler" | "rocker" | "ground";
export type SelectableId = JointId | LinkId;

const MIN_LEN = 2;
const TRACE_STEPS = 480;

export const defaultFourBar = (): FourBarConfig => ({
  O2: vec(-50, 0),
  O4: vec(50, 0),
  crankLen: 35,
  couplerLen: 110,
  rockerLen: 85,
  couplerPoint: { u: 55, v: 48 },
});

interface DerivedSlice {
  def: FourBarConfig;
  theta2: number;
  prevB: Vec2 | null;
  branch: BranchSign;
  pose: FourBarResult;
  trace: CouplerCurve;
  grashof: GrashofResult;
  range: InputRange;
}

/**
 * Single source of truth for everything downstream of the geometry: solve the
 * pose (holding the assembly branch via nearest-point continuation), then the
 * full coupler curve and classification. Called by every mutation so the
 * canvas, panel, and readouts can never disagree.
 */
function derive(
  def: FourBarConfig,
  theta2: number,
  prevB: Vec2 | null,
  branch: BranchSign,
): DerivedSlice {
  const grashof = classify(def);
  const range = inputRange(def);
  const clamped = normalizeAngle(clampToRange(theta2, range));
  let pose = solveFourBar(def, clamped, prevB ? { prevB } : { branch });
  if (!pose.ok && prevB) {
    // Continuity seed can be stale after a large geometry change — retry
    // on the explicit branch before reporting failure.
    pose = solveFourBar(def, clamped, { branch });
  }
  const nextBranch = pose.ok ? pose.branch : branch;
  const nextPrevB = pose.ok ? pose.B : null;
  const trace = traceCouplerCurve(def, {
    branch: nextBranch,
    steps: TRACE_STEPS,
    theta2: clamped,
  });
  return {
    def,
    theta2: clamped,
    prevB: nextPrevB,
    branch: nextBranch,
    pose,
    trace,
    grashof,
    range,
  };
}

export interface SimState extends DerivedSlice {
  playing: boolean;
  /** crank speed, degrees per second */
  speed: number;
  /** current sweep direction; flips when a limited input bounces off a limit */
  driveDir: 1 | -1;
  view: ViewState;
  /** last known canvas size in CSS px, kept fresh by the canvas layer */
  canvasSize: ScreenSize;
  selected: SelectableId | null;
  hovered: SelectableId | null;
  /** joint being dragged, if any (drive is suspended while set) */
  dragging: JointId | "ground" | null;

  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  /** scrub the input angle (radians, world frame) */
  setTheta2(theta: number): void;
  /** advance the motor by dt seconds */
  tick(dt: number): void;
  patchDef(patch: Partial<FourBarConfig>): void;
  setGroundLen(len: number): void;
  setCouplerPoint(u: number, v: number): void;
  resetMechanism(): void;
  /** direct manipulation: move a joint to a world position */
  dragTo(id: JointId, w: Vec2): void;
  /** translate the whole mechanism (ground-link drag) */
  translateBy(delta: Vec2): void;
  setDragging(id: JointId | "ground" | null): void;
  setSelected(id: SelectableId | null): void;
  setHovered(id: SelectableId | null): void;
  setView(view: ViewState): void;
  setCanvasSize(size: ScreenSize): void;
  /** frame the mechanism + trace; uses the last known canvas size by default */
  fitView(size?: ScreenSize): void;
}

export const useSimStore = create<SimState>()((set, get) => ({
  ...derive(defaultFourBar(), degToRad(65), null, 1),
  playing: true,
  speed: 60,
  driveDir: 1,
  view: { cx: 0, cy: 30, scale: 3 },
  canvasSize: { w: 800, h: 600 },
  selected: null,
  hovered: null,
  dragging: null,

  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed: Math.max(1, Math.min(720, speed)) }),

  setTheta2: (theta) => {
    const st = get();
    set(derive(st.def, theta, st.prevB, st.branch));
  },

  tick: (dt) => {
    const st = get();
    if (!st.playing || st.dragging) return;
    const step = degToRad(st.speed) * dt * st.driveDir;

    if (st.range.full) {
      set(derive(st.def, st.theta2 + step, st.prevB, st.branch));
      return;
    }
    const arcs = st.range.arcs;
    if (arcs.length === 0) return;

    // Sweep within the current reachable arc; at a limit the closure circles
    // are tangent and the physical assembly continues through the fold onto
    // the other branch — so bounce the motor and flip the branch.
    const arc = arcs.find((a) => angleInArc(st.theta2, a)) ?? arcs[0];
    let span = arc.end - arc.start;
    if (span < 0) span += TWO_PI;
    let off = normalizeAnglePositive(st.theta2 - arc.start);
    if (off > span) off = span; // numeric guard when clamped exactly at a limit
    const next = off + step;

    if (next < 0 || next > span) {
      const clampedOff = Math.min(span, Math.max(0, next));
      const flipped: BranchSign = st.branch === 1 ? -1 : 1;
      set({
        driveDir: st.driveDir === 1 ? -1 : 1,
        ...derive(st.def, arc.start + clampedOff, null, flipped),
      });
    } else {
      set(derive(st.def, arc.start + next, st.prevB, st.branch));
    }
  },

  patchDef: (patch) => {
    const st = get();
    set(derive({ ...st.def, ...patch }, st.theta2, st.prevB, st.branch));
  },

  setGroundLen: (len) => {
    const st = get();
    const dir = norm(sub(st.def.O4, st.def.O2));
    const safeDir = dir.x === 0 && dir.y === 0 ? vec(1, 0) : dir;
    const O4 = add(st.def.O2, {
      x: safeDir.x * Math.max(MIN_LEN, len),
      y: safeDir.y * Math.max(MIN_LEN, len),
    });
    get().patchDef({ O4 });
  },

  setCouplerPoint: (u, v) => {
    get().patchDef({ couplerPoint: { u, v } });
  },

  resetMechanism: () => {
    set({
      ...derive(defaultFourBar(), degToRad(65), null, 1),
      driveDir: 1,
      selected: null,
      hovered: null,
      dragging: null,
    });
  },

  dragTo: (id, w) => {
    const st = get();
    const def = st.def;
    switch (id) {
      case "O2":
        set(derive({ ...def, O2: w }, st.theta2, st.prevB, st.branch));
        break;
      case "O4":
        set(derive({ ...def, O4: w }, st.theta2, st.prevB, st.branch));
        break;
      case "A": {
        // Dragging the crank pin sets both the crank length and the input angle.
        const rel = sub(w, def.O2);
        const r = Math.max(MIN_LEN, dist(w, def.O2));
        const theta = angleOf(rel);
        set(derive({ ...def, crankLen: r }, theta, st.prevB, st.branch));
        break;
      }
      case "B": {
        const A = st.pose.ok ? st.pose.A : st.pose.A ?? null;
        if (!A) break;
        // Coupler and rocker lengths recompute from the dragged position;
        // seeding continuity at the pointer keeps the assembly on that side.
        set(
          derive(
            {
              ...def,
              couplerLen: Math.max(MIN_LEN, dist(w, A)),
              rockerLen: Math.max(MIN_LEN, dist(w, def.O4)),
            },
            st.theta2,
            w,
            st.branch,
          ),
        );
        break;
      }
      case "P": {
        if (!st.pose.ok) break;
        const uHat = norm(sub(st.pose.B, st.pose.A));
        const vHat = perp(uHat);
        const rel = sub(w, st.pose.A);
        set(
          derive(
            { ...def, couplerPoint: { u: dot(rel, uHat), v: dot(rel, vHat) } },
            st.theta2,
            st.prevB,
            st.branch,
          ),
        );
        break;
      }
    }
  },

  translateBy: (delta) => {
    const st = get();
    set(
      derive(
        { ...st.def, O2: add(st.def.O2, delta), O4: add(st.def.O4, delta) },
        st.theta2,
        st.prevB ? add(st.prevB, delta) : null,
        st.branch,
      ),
    );
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
    const pts: Vec2[] = [st.def.O2, st.def.O4, ...st.trace.points];
    if (st.pose.ok) pts.push(st.pose.A, st.pose.B, st.pose.P);
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