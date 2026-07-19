import { describe, expect, it } from "vitest";
import { FOURBAR_PRESETS, vec, type Vec2 } from "@/engine";
import { decodeShare, encodeShare, type SharedMech } from "@/share/codec";
import { useSimStore, type MechSlice } from "@/store/simStore";
import {
  CHALLENGES,
  challengeById,
  longestStraightRun,
  EXACT_LINE_MIN,
  STRAIGHT_RUN_MIN,
  STRAIGHT_RUN_TOL,
} from "./challenges";

/** Grade a challenge against a mechanism loaded through the real app path. */
function gradeLoaded(id: string, mech: SharedMech) {
  useSimStore.getState().loadShared(mech);
  return challengeById(id)!.grade(useSimStore.getState().mech);
}

const activeSlice = (): MechSlice => useSimStore.getState().mech;

describe("longestStraightRun", () => {
  it("finds the full length of a clean straight polyline", () => {
    const pts: Vec2[] = [];
    for (let i = 0; i <= 100; i++) pts.push(vec(i, 0.1 * Math.sin(i * 0.9)));
    const run = longestStraightRun(pts, 0.5, false);
    expect(run.length).toBeGreaterThan(95);
    expect(run.dev).toBeLessThanOrEqual(0.5);
  });

  it("only credits a circle with the short chord its curvature allows", () => {
    const pts: Vec2[] = [];
    const R = 100;
    for (let i = 0; i < 360; i += 2)
      pts.push(vec(R * Math.cos((i * Math.PI) / 180), R * Math.sin((i * Math.PI) / 180)));
    const run = longestStraightRun(pts, 0.5, true);
    // ±0.5 mm of a chord on R100 ⇒ roughly a 28 mm window — nowhere near 60.
    expect(run.length).toBeGreaterThan(10);
    expect(run.length).toBeLessThan(45);
  });

  it("carries a straight run across the seam of a closed curve", () => {
    // A closed "stadium": straight top edge, semicircular caps, straight
    // bottom edge — rotated so the array seam splits the bottom edge.
    const pts: Vec2[] = [];
    const edge = 80;
    const r = 20;
    for (let x = -edge / 2; x <= edge / 2; x += 2) pts.push(vec(x, r));
    for (let a = 90; a >= -90; a -= 6)
      pts.push(vec(edge / 2 + r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)));
    for (let x = edge / 2; x >= -edge / 2; x -= 2) pts.push(vec(x, -r));
    for (let a = 270; a >= 90; a -= 6)
      pts.push(vec(-edge / 2 + r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)));
    const seamSplit = pts.slice(Math.floor(pts.length * 0.6)).concat(pts.slice(0, Math.floor(pts.length * 0.6)));
    const run = longestStraightRun(seamSplit, 0.5, true);
    expect(run.length).toBeGreaterThan(edge * 0.9);
  });

  it("returns zero for degenerate input", () => {
    expect(longestStraightRun([], 0.5, false).length).toBe(0);
    expect(longestStraightRun([vec(0, 0), vec(1, 1)], 0.5, false).length).toBe(0);
  });
});

describe("challenge starting points", () => {
  it("every start decodes through the share schema and does NOT already pass", () => {
    for (const ch of CHALLENGES) {
      const wire = decodeShare(encodeShare(ch.start));
      expect(wire, ch.id).not.toBeNull();
      const outcome = gradeLoaded(ch.id, wire!);
      expect(outcome.kind, `${ch.id} start should be a puzzle, not a gift`).toBe("fail");
    }
  });
});

describe("the straightaway", () => {
  it("passes on Chebyshev's straight-line proportions", () => {
    const p = FOURBAR_PRESETS.find((x) => x.id === "chebyshev")!;
    const outcome = gradeLoaded("straightaway", {
      t: "fourbar",
      c: p.config,
      th: p.theta2,
      br: p.branch,
    });
    expect(outcome.kind).toBe("pass");
  });

  it("measures honestly: the kite's kidney curve has no 60 mm straightaway", () => {
    const kite = FOURBAR_PRESETS.find((x) => x.id === "kite")!;
    useSimStore.getState().loadShared({ t: "fourbar", c: kite.config, th: kite.theta2, br: kite.branch });
    const mech = activeSlice();
    if (mech.type !== "fourbar") throw new Error("expected fourbar");
    const run = longestStraightRun(mech.trace.points, STRAIGHT_RUN_TOL, mech.trace.closed);
    expect(run.length).toBeLessThan(STRAIGHT_RUN_MIN);
  });

  it("rejects the wrong mechanism", () => {
    const geneva: SharedMech = {
      t: "geneva",
      c: { center: vec(-40, 0), slots: 4, centerDist: 80, wheelDir: 0 },
      th: 0,
    };
    expect(gradeLoaded("straightaway", geneva).kind).toBe("wrong-mech");
  });
});

describe("full circle", () => {
  it("passes once the crank is the shortest link of a Grashof chain", () => {
    const start = challengeById("full-circle")!.start;
    if (start.t !== "fourbar") throw new Error("expected fourbar start");
    const fixed: SharedMech = {
      ...start,
      c: { ...start.c, crankLen: 30 },
    };
    expect(gradeLoaded("full-circle", fixed).kind).toBe("pass");
  });
});

describe("quick return", () => {
  it("passes with a healthy offset and fails without one", () => {
    const start = challengeById("quick-return")!.start;
    if (start.t !== "slidercrank") throw new Error("expected slider-crank start");
    expect(gradeLoaded("quick-return", start).kind).toBe("fail");
    const offset: SharedMech = { ...start, c: { ...start.c, offset: 55 } };
    expect(gradeLoaded("quick-return", offset).kind).toBe("pass");
  });
});

describe("the perfect line", () => {
  it("passes once the crank opens the cell into a long stroke", () => {
    const start = challengeById("perfect-line")!.start;
    if (start.t !== "peaucellier") throw new Error("expected peaucellier start");
    const fixed: SharedMech = { ...start, c: { ...start.c, crankLen: 45 } };
    const outcome = gradeLoaded("perfect-line", fixed);
    expect(outcome.kind).toBe("pass");
    // and the pass really is an exact line ≥ the target, not a rounding fluke
    expect(outcome.measured).toContain("mm of line");
  });

  it("the starting stroke is honestly short of the target", () => {
    const start = challengeById("perfect-line")!.start;
    useSimStore.getState().loadShared(start);
    const mech = activeSlice();
    if (!(mech.type === "straightline" && mech.variant === "peaucellier"))
      throw new Error("expected peaucellier");
    // refDev/refLine machinery aside, the trace itself must span < target
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of mech.trace.points) {
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
    expect(hi - lo).toBeLessThan(EXACT_LINE_MIN);
  });
});
