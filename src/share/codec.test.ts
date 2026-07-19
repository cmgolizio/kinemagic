import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, sharedMechLabel, type SharedMech } from "./codec";
import { roundedForWire } from "./wire-testutil";

const fourbar: SharedMech = {
  t: "fourbar",
  c: {
    O2: { x: -50, y: 0 },
    O4: { x: 50, y: 0 },
    crankLen: 35,
    couplerLen: 110,
    rockerLen: 85,
    couplerPoint: { u: 55, v: 48 },
  },
  th: 1.134464,
  br: 1,
};

const samples: SharedMech[] = [
  fourbar,
  {
    t: "slidercrank",
    c: {
      O2: { x: -60, y: 0 },
      crankLen: 32,
      rodLen: 95,
      axisAngle: 0,
      offset: 38,
      rodPoint: { u: 48, v: 22 },
    },
    th: 1.2217,
    br: -1,
  },
  {
    t: "cam",
    c: {
      center: { x: 0, y: 0 },
      kind: "rdf",
      follower: "roller",
      rollerR: 10,
      discR: 45,
      ecc: 15,
      baseR: 35,
      lift: 25,
      riseDeg: 120,
      dwellDeg: 60,
      fallDeg: 120,
      law: "cycloidal",
    },
    th: 0.5236,
  },
  {
    t: "gears",
    c: {
      center: { x: -80, y: 0 },
      module: 4,
      teeth: [16, 24, 16],
      meshAngles: [0, -0.6109],
    },
    th: 0,
  },
  {
    t: "geneva",
    c: { center: { x: -40, y: 0 }, slots: 4, centerDist: 80, wheelDir: 0 },
    th: -2.0944,
  },
  {
    t: "watt",
    c: {
      O2: { x: -84, y: -49 },
      O4: { x: 84, y: 49 },
      crankLen: 87.5,
      couplerLen: 49,
      rockerLen: 87.5,
      couplerPoint: { u: 24.5, v: 0 },
    },
    th: 0.2793,
    br: 1,
  },
  {
    t: "peaucellier",
    c: { O: { x: -65, y: 0 }, crankLen: 45, armLen: 110, cellSide: 55, axisAngle: 0 },
    th: 2.618,
  },
];

describe("share codec round-trip", () => {
  it.each(samples.map((s) => [s.t, s] as const))("%s survives encode → decode", (_, mech) => {
    const decoded = decodeShare(encodeShare(mech));
    expect(decoded).not.toBeNull();
    // 1e-4 rounding is part of the format; everything else must be exact.
    expect(decoded).toEqual(roundedForWire(mech));
  });

  it("preserves numbers to the documented 1e-4 resolution", () => {
    const noisy: SharedMech = {
      ...fourbar,
      th: 1.23456789,
      c: { ...fourbar.c, crankLen: 35.00123456 },
    };
    const decoded = decodeShare(encodeShare(noisy));
    expect(decoded?.t).toBe("fourbar");
    if (decoded?.t !== "fourbar") return;
    expect(decoded.th).toBe(1.2346);
    expect(decoded.c.crankLen).toBe(35.0012);
  });

  it("emits only URL-safe characters (no escaping needed)", () => {
    for (const s of samples) {
      expect(encodeShare(s)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("decodeShare rejects malformed input", () => {
  const b64 = (v: unknown): string =>
    Buffer.from(JSON.stringify(v)).toString("base64url");

  it("garbage strings", () => {
    expect(decodeShare("")).toBeNull();
    expect(decodeShare("not base64 at all!!")).toBeNull();
    expect(decodeShare("AAAA")).toBeNull(); // valid b64, not JSON
    expect(decodeShare("x".repeat(10_000))).toBeNull(); // over the size cap
  });

  it("wrong shape / version / type tag", () => {
    expect(decodeShare(b64({ hello: "world" }))).toBeNull();
    expect(decodeShare(b64({ v: 99, m: fourbar }))).toBeNull();
    expect(decodeShare(b64({ v: 1, m: { ...fourbar, t: "hexapod" } }))).toBeNull();
  });

  it("non-finite and out-of-range numbers", () => {
    const withCrank = (crankLen: unknown) =>
      b64({ v: 1, m: { ...fourbar, c: { ...fourbar.c, crankLen } } });
    expect(decodeShare(withCrank(null))).toBeNull(); // JSON's spelling of NaN
    expect(decodeShare(withCrank(-5))).toBeNull();
    expect(decodeShare(withCrank(0))).toBeNull();
    expect(decodeShare(withCrank(1e12))).toBeNull();
    expect(decodeShare(withCrank("35"))).toBeNull();
  });

  it("structural constraints", () => {
    const gears = samples.find((s) => s.t === "gears")!;
    const bad = { ...gears, c: { ...gears.c, meshAngles: [0] } }; // 3 gears, 1 mesh
    expect(decodeShare(b64({ v: 1, m: bad }))).toBeNull();

    const geneva = samples.find((s) => s.t === "geneva")!;
    const twoSlots = { ...geneva, c: { ...geneva.c, slots: 2 } };
    expect(decodeShare(b64({ v: 1, m: twoSlots }))).toBeNull();

    const noBranch = { t: "fourbar", c: fourbar.c, th: 0 }; // br missing
    expect(decodeShare(b64({ v: 1, m: noBranch }))).toBeNull();
  });
});

describe("sharedMechLabel", () => {
  it("names every mechanism type", () => {
    for (const s of samples) {
      expect(sharedMechLabel(s).length).toBeGreaterThan(0);
    }
  });
});
