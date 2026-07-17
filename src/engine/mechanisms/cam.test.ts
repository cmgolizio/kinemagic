import { describe, expect, it } from "vitest";
import {
  camBaseDist,
  camDiagram,
  camLift,
  camLiftSlope,
  camMaxLift,
  camProfile,
  defaultCam,
  lawSlope,
  lawValue,
  solveCam,
  type CamConfig,
  type MotionLaw,
} from "./cam";
import { degToRad, dist, len, rotate, TWO_PI, vec } from "../vec";

const LAWS: MotionLaw[] = ["uniform", "harmonic", "cycloidal"];

describe("motion laws", () => {
  it.each(LAWS)("%s runs 0 → 1 and is monotonic", (law) => {
    expect(lawValue(law, 0)).toBeCloseTo(0, 12);
    expect(lawValue(law, 1)).toBeCloseTo(1, 12);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = lawValue(law, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it.each(LAWS)("%s is symmetric about the midpoint", (law) => {
    for (let i = 0; i <= 50; i++) {
      const x = i / 100;
      expect(lawValue(law, 1 - x)).toBeCloseTo(1 - lawValue(law, x), 12);
    }
  });

  it("harmonic and cycloidal start and end at rest (zero slope)", () => {
    for (const law of ["harmonic", "cycloidal"] as const) {
      expect(lawSlope(law, 0)).toBeCloseTo(0, 12);
      expect(lawSlope(law, 1)).toBeCloseTo(0, 12);
    }
  });

  it.each(LAWS)("%s slope matches the numeric derivative", (law) => {
    const h = 1e-6;
    for (let i = 1; i < 40; i++) {
      const x = i / 40;
      const numeric = (lawValue(law, x + h) - lawValue(law, x - h)) / (2 * h);
      expect(lawSlope(law, x)).toBeCloseTo(numeric, 5);
    }
  });
});

describe("rise-dwell-fall program", () => {
  const rdf = (over: Partial<CamConfig> = {}): CamConfig => ({
    ...defaultCam(),
    kind: "rdf",
    baseR: 35,
    lift: 25,
    riseDeg: 120,
    dwellDeg: 60,
    fallDeg: 120,
    law: "cycloidal",
    ...over,
  });

  it("hits the program landmarks exactly", () => {
    const c = rdf();
    expect(camLift(c, 0)).toBeCloseTo(0, 12);
    expect(camLift(c, degToRad(120))).toBeCloseTo(25, 12);
    expect(camLift(c, degToRad(150))).toBeCloseTo(25, 12); // high dwell
    expect(camLift(c, degToRad(180))).toBeCloseTo(25, 12);
    expect(camLift(c, degToRad(300))).toBeCloseTo(0, 12);
    expect(camLift(c, degToRad(330))).toBeCloseTo(0, 12); // low dwell
  });

  it("dwells are exactly flat and the fall mirrors the rise", () => {
    const c = rdf();
    for (let d = 120; d <= 180; d += 5) {
      expect(camLift(c, degToRad(d))).toBeCloseTo(25, 12);
      expect(camLiftSlope(c, degToRad(d))).toBeCloseTo(0, 12);
    }
    for (let d = 0; d <= 120; d += 3) {
      expect(camLift(c, degToRad(d))).toBeCloseTo(camLift(c, degToRad(300 - d)), 12);
    }
  });

  it.each(LAWS)("is continuous across every boundary (%s)", (law) => {
    const c = rdf({ law });
    const eps = 1e-9;
    for (const boundary of [0, 120, 180, 300]) {
      const t = degToRad(boundary);
      const before = camLift(c, t - eps);
      const after = camLift(c, t + eps);
      expect(Math.abs(after - before)).toBeLessThan(1e-6);
    }
  });

  it("solves the follower on the axis at baseDist + lift", () => {
    const c = rdf({ center: vec(10, -5) });
    const res = solveCam(c, degToRad(90));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.follower.x).toBeCloseTo(10, 12);
    expect(res.follower.y).toBeCloseTo(-5 + camBaseDist(c) + res.lift, 12);
    expect(res.lift).toBeCloseTo(camLift(c, degToRad(90)), 12);
  });
});

describe("eccentric circular cam (closed forms)", () => {
  const ecc = (over: Partial<CamConfig> = {}): CamConfig => ({
    ...defaultCam(),
    kind: "eccentric",
    discR: 45,
    ecc: 15,
    rollerR: 10,
    ...over,
  });

  it("flat-face follower rides exact simple-harmonic motion", () => {
    const c = ecc({ follower: "flat" });
    for (let i = 0; i <= 360; i += 5) {
      const t = degToRad(i);
      expect(camLift(c, t)).toBeCloseTo(15 * (1 - Math.cos(t)), 12);
    }
    expect(camMaxLift(c)).toBeCloseTo(30, 12);
  });

  it("roller follower matches the two-circle contact condition", () => {
    const c = ecc({ follower: "roller" });
    for (let i = 0; i <= 360; i += 5) {
      const t = degToRad(i);
      const res = solveCam(c, t);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      // Roller center must sit exactly discR + rollerR from the disc center.
      const discCenter = rotate(vec(0, -15), t);
      expect(dist(res.follower, discCenter)).toBeCloseTo(55, 9);
      // And the contact point exactly rollerR from the roller center,
      // discR from the disc center.
      expect(dist(res.contact, res.follower)).toBeCloseTo(10, 9);
      expect(dist(res.contact, discCenter)).toBeCloseTo(45, 9);
    }
  });

  it("flat-face contact offset equals ds/dθ", () => {
    const c = ecc({ follower: "flat" });
    for (let i = 0; i <= 360; i += 15) {
      const t = degToRad(i);
      const res = solveCam(c, t);
      if (!res.ok) continue;
      expect(res.contact.x - c.center.x).toBeCloseTo(camLiftSlope(c, t), 9);
    }
  });
});

describe("profile synthesis", () => {
  it("knife-edge profile radius equals baseR + lift at the follower angle", () => {
    // A roller of zero radius degenerates to a knife edge: the profile IS
    // the polar curve rb + s.
    const c: CamConfig = { ...defaultCam(), kind: "rdf", follower: "roller", rollerR: 1e-9 };
    const samples = 720;
    const profile = camProfile(c, samples);
    for (let i = 0; i < samples; i += 7) {
      const psi = (i / samples) * TWO_PI;
      // Profile point generated at ψ sits at local angle π/2 − ψ, radius rb+rf+s.
      const p = profile[i];
      expect(len(p)).toBeCloseTo(c.baseR + camLift(c, psi), 4);
    }
  });

  it("eccentric profile is the offset disc", () => {
    const c: CamConfig = { ...defaultCam(), kind: "eccentric", discR: 45, ecc: 15 };
    for (const p of camProfile(c, 64)) {
      expect(dist(p, vec(0, -15))).toBeCloseTo(45, 9);
    }
  });

  it("flat-face rdf profile touches the face line and never crosses it", () => {
    const c: CamConfig = { ...defaultCam(), kind: "rdf", follower: "flat" };
    const samples = 720;
    const profile = camProfile(c, samples);
    for (let k = 0; k < samples; k += 11) {
      const theta = (k / samples) * TWO_PI;
      const face = camBaseDist(c) + camLift(c, theta);
      let maxY = -Infinity;
      for (const p of profile) {
        maxY = Math.max(maxY, rotate(p, theta).y);
      }
      // The rotated profile's highest point must lie exactly on the face.
      expect(maxY).toBeCloseTo(face, 3);
    }
  });
});

describe("diagram & validation", () => {
  it("diagram samples the full cycle and tops out at maxLift", () => {
    const d = camDiagram(defaultCam(), 360);
    expect(d.lift.length).toBe(361);
    expect(Math.max(...d.lift)).toBeCloseTo(d.maxLift, 9);
    expect(d.lift[0]).toBeCloseTo(0, 12);
    expect(d.lift[360]).toBeCloseTo(0, 12);
  });

  it.each([
    ["zero base circle", { baseR: 0 }],
    ["negative lift", { lift: -4 }],
    ["overfull program", { riseDeg: 200, dwellDeg: 100, fallDeg: 100 }],
    ["ecc ≥ disc", { kind: "eccentric" as const, ecc: 50, discR: 45 }],
  ])("returns typed degenerate for %s", (_name, over) => {
    const res = solveCam({ ...defaultCam(), ...over }, 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("degenerate");
  });

  it("never returns NaN over a full sweep", () => {
    for (const follower of ["flat", "roller"] as const) {
      for (const kind of ["rdf", "eccentric"] as const) {
        const c: CamConfig = { ...defaultCam(), kind, follower };
        for (let i = 0; i <= 720; i++) {
          const res = solveCam(c, (i / 720) * 2 * TWO_PI);
          expect(res.ok).toBe(true);
          if (res.ok) {
            expect(
              Number.isFinite(res.lift + res.follower.x + res.follower.y + res.contact.x + res.contact.y),
            ).toBe(true);
          }
        }
      }
    }
  });
});