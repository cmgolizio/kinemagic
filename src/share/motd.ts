/**
 * Mechanism-of-the-day — a curated, date-seeded feature with zero
 * infrastructure. The list is static; the pick is the UTC day number
 * modulo the list length, so every visitor sees the same mechanism on a
 * given day and the rotation never repeats two days in a row.
 */

import { degToRad, vec } from "@/engine";
import {
  CAM_PRESETS,
  FOURBAR_PRESETS,
  GEAR_PRESETS,
  GENEVA_PRESETS,
  SLIDERCRANK_PRESETS,
} from "@/engine";
import { defaultPeaucellier, defaultWatt } from "@/engine";
import type { SharedMech } from "./codec";

export interface MechOfTheDay {
  id: string;
  title: string;
  /** one-line caption shown on the landing chip and the OG card */
  note: string;
  mech: SharedMech;
}

const fourbar = (id: string): SharedMech => {
  const p = FOURBAR_PRESETS.find((x) => x.id === id)!;
  return { t: "fourbar", c: p.config, th: p.theta2, br: p.branch };
};

export const MOTD_LIST: MechOfTheDay[] = [
  {
    id: "kite",
    title: "The Kite",
    note: "A balanced crank-rocker tracing a smooth kidney curve — the four-bar at its friendliest.",
    mech: fourbar("kite"),
  },
  {
    id: "peaucellier",
    title: "Peaucellier–Lipkin",
    note: "1864: the first linkage to draw a mathematically exact straight line from rotary joints.",
    // 100° sits inside the cell's reachable input arc (±~104.7° here);
    // out-of-range angles would clamp on load and not round-trip.
    mech: { t: "peaucellier", c: defaultPeaucellier(), th: degToRad(100) },
  },
  {
    id: "figure-eight",
    title: "Figure-eight",
    note: "The coupler point crosses its own path once per cycle — a true mechanical lemniscate.",
    mech: fourbar("figure-eight"),
  },
  {
    id: "film-geneva",
    title: "Projector Geneva",
    note: "The movement that made cinema possible: one frame per turn, held dead still for the shutter.",
    mech: {
      t: "geneva",
      c: GENEVA_PRESETS.find((p) => p.id === "film")!.config,
      th: degToRad(-120),
    },
  },
  {
    id: "chebyshev",
    title: "Chebyshev's straight line",
    note: "A crossed double-rocker whose coupler midpoint runs dead straight for over 100 mm.",
    mech: fourbar("chebyshev"),
  },
  {
    id: "quick-return",
    title: "Quick-return shaper",
    note: "Offset the slider axis and the return stroke outruns the advance — the shaper's trick.",
    mech: {
      t: "slidercrank",
      c: SLIDERCRANK_PRESETS.find((p) => p.id === "quick-return")!.config,
      th: degToRad(70),
      br: 1,
    },
  },
  {
    id: "valve-cam",
    title: "Valve-lift cam",
    note: "A cycloidal rise-dwell-fall program — zero end-of-stroke acceleration, the automotive choice.",
    mech: {
      t: "cam",
      c: CAM_PRESETS.find((p) => p.id === "valve")!.config,
      th: degToRad(30),
    },
  },
  {
    id: "watt",
    title: "Watt's linkage",
    note: "James Watt's proudest invention: a near-perfect straight line guiding a steam piston.",
    mech: { t: "watt", c: defaultWatt(), th: degToRad(16), br: 1 },
  },
  {
    id: "d-curve",
    title: "The D-curve",
    note: "One flat side, one round side — the coupler curve dwell mechanisms are built on.",
    mech: fourbar("d-curve"),
  },
  {
    id: "idler-train",
    title: "Idler pass-through",
    note: "An idler gear flips direction but drops out of the ratio — the middle wheel does no arithmetic.",
    mech: {
      t: "gears",
      c: GEAR_PRESETS.find((p) => p.id === "idler")!.config,
      th: 0,
    },
  },
  {
    id: "grasshopper",
    title: "The Grasshopper",
    note: "A long-legged crank-rocker with a high coupler point — the curve kicks like its namesake.",
    mech: {
      t: "fourbar",
      c: {
        O2: vec(-45, 0),
        O4: vec(55, 0),
        crankLen: 28,
        couplerLen: 120,
        rockerLen: 70,
        couplerPoint: { u: 130, v: 30 },
      },
      th: degToRad(80),
      br: 1,
    },
  },
  {
    id: "eight-station",
    title: "8-station indexer",
    note: "More stations, gentler indexing — a smaller swing per cycle means lower peak acceleration.",
    mech: {
      t: "geneva",
      c: GENEVA_PRESETS.find((p) => p.id === "eight")!.config,
      th: degToRad(-120),
    },
  },
];

/** Days since the Unix epoch, UTC — everyone sees the same pick on a given day. */
export const utcDayNumber = (date: Date): number =>
  Math.floor(date.getTime() / 86_400_000);

export function mechanismOfTheDay(date: Date = new Date()): MechOfTheDay {
  const idx = ((utcDayNumber(date) % MOTD_LIST.length) + MOTD_LIST.length) % MOTD_LIST.length;
  return MOTD_LIST[idx];
}
