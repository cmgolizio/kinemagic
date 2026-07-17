/**
 * Curated four-bar presets — famous coupler-curve shapes. Every entry was
 * verified numerically (see presets.test.ts): it assembles at its starting
 * pose, matches the advertised Grashof class, and traces the advertised
 * shape (self-intersection for the figure-eight, flat-run length for the
 * straight-line and D-curve).
 */

import { vec } from "../vec";
import type { BranchSign, FourBarConfig } from "./fourbar";

export interface FourBarPreset {
  id: string;
  label: string;
  blurb: string;
  config: FourBarConfig;
  /** starting input angle, radians */
  theta2: number;
  branch: BranchSign;
}

export const FOURBAR_PRESETS: FourBarPreset[] = [
  {
    id: "kite",
    label: "Kite",
    blurb: "A balanced crank-rocker — the default. Smooth kidney-shaped curve.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 35,
      couplerLen: 110,
      rockerLen: 85,
      couplerPoint: { u: 55, v: 48 },
    },
    theta2: (65 * Math.PI) / 180,
    branch: 1,
  },
  {
    id: "figure-eight",
    label: "Figure-eight",
    blurb: "The coupler point crosses its own path once per cycle — a true lemniscate loop.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 40,
      couplerLen: 80,
      rockerLen: 80,
      couplerPoint: { u: 40, v: -80 },
    },
    theta2: (65 * Math.PI) / 180,
    branch: 1,
  },
  {
    id: "chebyshev",
    label: "Straight-line (Chebyshev)",
    blurb: "Chebyshev's crossed double-rocker: the coupler midpoint runs dead straight for over 100 mm.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 125,
      couplerLen: 50,
      rockerLen: 125,
      couplerPoint: { u: 25, v: 0 },
    },
    theta2: Math.PI / 2,
    branch: -1,
  },
  {
    id: "d-curve",
    label: "D-curve",
    blurb: "One flat side, one round side — the shape dwell mechanisms are built on.",
    config: {
      O2: vec(-50, 0),
      O4: vec(50, 0),
      crankLen: 50,
      couplerLen: 100,
      rockerLen: 70,
      couplerPoint: { u: 100, v: 70 },
    },
    theta2: (65 * Math.PI) / 180,
    branch: 1,
  },
];

export const fourBarPreset = (id: string): FourBarPreset | undefined =>
  FOURBAR_PRESETS.find((p) => p.id === id);