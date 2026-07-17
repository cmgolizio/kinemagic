"use client";

import { useEffect, useRef } from "react";
import {
  angleInArc,
  camMotion,
  fourBarMotion,
  fourBarTransmission,
  gearTrainMotion,
  genevaMotion,
  isPoorTransmission,
  normalizeAnglePositive,
  peaucellierMotion,
  radToDeg,
  sliderCrankMotion,
  TWO_PI,
  type MotionSeries,
  type TransmissionSeries,
} from "@/engine";
import { Panel } from "@/components/ui/Panel";
import { useSimStore, type MechSlice } from "@/store/simStore";
import { MONO_FONT, readPalette, type Palette } from "./palette";

/**
 * Motion analysis panel: output position, velocity and acceleration vs.
 * input angle, numerically differentiated across the full cycle, plus the
 * transmission-angle strip for four-bar chains. Series are kinematic
 * coefficients (′ = d/dθ per radian of input), so the plots are independent
 * of motor speed; the cursor rides the live input angle.
 *
 * Drawn to a small canvas driven by a store subscription — series recompute
 * only when the geometry (config reference / branch / reachable arc)
 * changes, so per-frame work is just re-stroking a few polylines.
 */

const ANALYSIS_STEPS = 240;
const STRIP_H = 62;
const STRIP_GAP = 8;

const MU_POOR_LOW_DEG = 30;
const MU_POOR_HIGH_DEG = 150;

// ---------------------------------------------------------------------------
// Per-slice series dispatch
// ---------------------------------------------------------------------------

interface Analysis {
  series: MotionSeries | null;
  trans: TransmissionSeries | null;
  /** short output name for strip titles, e.g. "θ₄" or "s" */
  sym: string;
  posTitle: string;
  /** radian outputs are shown in degrees on the position strip */
  angleOutput: boolean;
}

function computeAnalysis(mech: MechSlice, theta: number): Analysis {
  switch (mech.type) {
    case "fourbar": {
      const opts = { branch: mech.branch, theta, steps: ANALYSIS_STEPS };
      return {
        series: fourBarMotion(mech.config, opts),
        trans: fourBarTransmission(mech.config, opts),
        sym: "θ₄",
        posTitle: "rocker angle θ₄",
        angleOutput: true,
      };
    }
    case "slidercrank":
      return {
        series: sliderCrankMotion(mech.config, {
          branch: mech.branch,
          theta,
          steps: ANALYSIS_STEPS,
        }),
        trans: null,
        sym: "s",
        posTitle: "slider position s",
        angleOutput: false,
      };
    case "cam":
      return {
        series: camMotion(mech.config, ANALYSIS_STEPS),
        trans: null,
        sym: "s",
        posTitle: "follower lift s",
        angleOutput: false,
      };
    case "gears":
      return {
        series: gearTrainMotion(mech.config, ANALYSIS_STEPS),
        trans: null,
        sym: "θ",
        posTitle: "output gear angle",
        angleOutput: true,
      };
    case "geneva":
      return {
        series: genevaMotion(mech.config, ANALYSIS_STEPS),
        trans: null,
        sym: "θ",
        posTitle: "wheel angle",
        angleOutput: true,
      };
    case "straightline": {
      if (mech.variant === "watt") {
        const opts = { branch: mech.branch, theta, steps: ANALYSIS_STEPS };
        return {
          series: fourBarMotion(mech.watt, opts),
          trans: fourBarTransmission(mech.watt, opts),
          sym: "θ₄",
          posTitle: "rocker angle θ₄",
          angleOutput: true,
        };
      }
      return {
        series: peaucellierMotion(mech.peaucellier, {
          theta,
          steps: ANALYSIS_STEPS,
        }),
        trans: null,
        sym: "s",
        posTitle: "travel along line s",
        angleOutput: false,
      };
    }
  }
}

/** Geometry identity — series only depend on these, not on θ frames. */
function analysisKey(mech: MechSlice, theta: number): readonly unknown[] {
  const arcIdx = (range: MechSlice["range"]): number =>
    range.full ? -1 : range.arcs.findIndex((a) => angleInArc(theta, a));
  switch (mech.type) {
    case "fourbar":
      return [mech.type, mech.config, mech.branch, arcIdx(mech.range)];
    case "slidercrank":
      return [mech.type, mech.config, mech.branch, arcIdx(mech.range)];
    case "cam":
    case "gears":
    case "geneva":
      return [mech.type, mech.config];
    case "straightline":
      return mech.variant === "watt"
        ? [mech.type, "watt", mech.watt, mech.branch, arcIdx(mech.range)]
        : [mech.type, "peau", mech.peaucellier, arcIdx(mech.range)];
  }
}

// ---------------------------------------------------------------------------
// Strip rendering
// ---------------------------------------------------------------------------

interface StripSpec {
  title: string;
  /** right-hand caption (unit, or a min-μ readout) */
  caption: string;
  captionColor?: string;
  samples: number[];
  /** dashed zero line when the range spans 0 */
  zeroLine: boolean;
  /** shade below 30° / above 150° (transmission strip) */
  muBands: boolean;
}

const fmt = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

function drawStrip(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  x: number,
  y: number,
  w: number,
  h: number,
  spec: StripSpec,
  cursor: number | null,
): void {
  const { samples } = spec;
  if (samples.length < 2) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of samples) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) return;
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= 1;
  }

  const padT = 13;
  const padB = 3;
  const plotH = h - padT - padB;
  const yAt = (v: number) => y + padT + (1 - (v - lo) / (hi - lo)) * plotH;
  const xAt = (frac: number) => x + frac * w;

  // Frame
  ctx.strokeStyle = palette.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + padT + 0.5, w - 1, plotH - 1);

  // Transmission comfort bands: the linkage binds near 0°/180°.
  if (spec.muBands) {
    ctx.fillStyle = palette.warn;
    ctx.globalAlpha = 0.14;
    if (lo < MU_POOR_LOW_DEG) {
      const top = yAt(Math.min(MU_POOR_LOW_DEG, hi));
      ctx.fillRect(x, top, w, yAt(lo) - top);
    }
    if (hi > MU_POOR_HIGH_DEG) {
      const top = yAt(hi);
      ctx.fillRect(x, top, w, yAt(Math.max(MU_POOR_HIGH_DEG, lo)) - top);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.warn;
    ctx.setLineDash([2, 3]);
    ctx.globalAlpha = 0.6;
    for (const thresh of [MU_POOR_LOW_DEG, MU_POOR_HIGH_DEG]) {
      if (thresh > lo && thresh < hi) {
        ctx.beginPath();
        ctx.moveTo(x, yAt(thresh));
        ctx.lineTo(x + w, yAt(thresh));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Zero line
  if (spec.zeroLine && lo < 0 && hi > 0) {
    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = palette.inkFaint;
    ctx.moveTo(x, yAt(0));
    ctx.lineTo(x + w, yAt(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Curve
  ctx.beginPath();
  samples.forEach((s, i) => {
    const px = xAt(i / (samples.length - 1));
    const py = yAt(s);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = palette.trace;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Live cursor
  if (cursor !== null) {
    const frac = Math.min(1, Math.max(0, cursor));
    const cx = xAt(frac);
    ctx.beginPath();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1;
    ctx.moveTo(cx, y + padT);
    ctx.lineTo(cx, y + padT + plotH);
    ctx.stroke();
    const idx = Math.round(frac * (samples.length - 1));
    ctx.beginPath();
    ctx.arc(cx, yAt(samples[idx]), 2.5, 0, TWO_PI);
    ctx.fillStyle = palette.accent;
    ctx.fill();
  }

  // Labels: title left, caption right, y-extremes inside the frame.
  ctx.font = `9px ${MONO_FONT}`;
  ctx.fillStyle = palette.inkMuted;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(spec.title, x, y + padT - 2);
  ctx.textAlign = "right";
  ctx.fillStyle = spec.captionColor ?? palette.inkFaint;
  ctx.fillText(spec.caption, x + w, y + padT - 2);
  ctx.fillStyle = palette.inkFaint;
  ctx.textBaseline = "top";
  ctx.fillText(fmt(hi), x + w - 2, y + padT + 2);
  ctx.textBaseline = "bottom";
  ctx.fillText(fmt(lo), x + w - 2, y + padT + plotH - 2);
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

function MuBadge() {
  const mu = useSimStore((s) => {
    const m = s.mech;
    if (m.type === "fourbar" && m.pose.ok) return m.pose.transmissionAngle;
    if (m.type === "straightline" && m.variant === "watt" && m.wattPose?.ok)
      return m.wattPose.transmissionAngle;
    return null;
  });
  if (mu === null) return null;
  const poor = isPoorTransmission(mu);
  return (
    // No `uppercase` here — it would capitalize μ into Μ.
    <span
      className="font-mono text-[10px] tracking-wider"
      style={{ color: poor ? "var(--warn)" : "var(--ink-muted)" }}
      title="Transmission angle between coupler and rocker — the linkage binds near 0°/180°"
    >
      μ {radToDeg(mu).toFixed(1)}°{poor ? " ⚠ binds" : ""}
    </span>
  );
}

export function AnalysisPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mechType = useSimStore((s) => s.mech.type);
  const variant = useSimStore((s) =>
    s.mech.type === "straightline" ? s.mech.variant : null,
  );

  const hasTrans = mechType === "fourbar" || variant === "watt";
  const stripCount = hasTrans ? 4 : 3;
  const height = stripCount * STRIP_H + (stripCount - 1) * STRIP_GAP;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let palette = readPalette();
    let width = 0;
    let cache: { key: readonly unknown[]; analysis: Analysis } | null = null;

    const keysEqual = (a: readonly unknown[], b: readonly unknown[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);

    const draw = () => {
      const st = useSimStore.getState();
      const rect = canvas.getBoundingClientRect();
      if (rect.width !== width || canvas.height !== Math.round(rect.height * (window.devicePixelRatio || 1))) {
        width = rect.width;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (width < 40) return;
      ctx.clearRect(0, 0, width, rect.height);

      const key = analysisKey(st.mech, st.theta);
      if (!cache || !keysEqual(cache.key, key)) {
        cache = { key, analysis: computeAnalysis(st.mech, st.theta) };
      }
      const { series, trans, sym, posTitle, angleOutput } = cache.analysis;

      if (!series) {
        ctx.font = `10px ${MONO_FONT}`;
        ctx.fillStyle = palette.warn;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("no analysis — mechanism cannot assemble", width / 2, 40);
        return;
      }

      // Cursor: fraction of the sampled input span at the live angle.
      const span = series.input[series.input.length - 1] - series.input[0];
      let off = normalizeAnglePositive(st.theta - series.input[0]);
      if (off > span) {
        // Outside a limited arc (mid-clamp): snap to the nearer end.
        off = off - span < (TWO_PI - span) / 2 ? span : 0;
      }
      const cursor = span > 0 ? off / span : null;

      const posSamples = angleOutput ? series.position.map(radToDeg) : series.position;
      const posUnit = angleOutput ? "°" : "mm";
      const velUnit = angleOutput ? "rad/rad" : "mm/rad";
      const accUnit = angleOutput ? "1/rad" : "mm/rad²";

      const strips: StripSpec[] = [
        {
          title: `${posTitle}`,
          caption: posUnit,
          samples: posSamples,
          zeroLine: false,
          muBands: false,
        },
        {
          title: `velocity ${sym}′`,
          caption: velUnit,
          samples: series.velocity,
          zeroLine: true,
          muBands: false,
        },
        {
          title: `acceleration ${sym}″`,
          caption: accUnit,
          samples: series.acceleration,
          zeroLine: true,
          muBands: false,
        },
      ];
      if (trans) {
        const minDeg = radToDeg(trans.minMu);
        const poor = isPoorTransmission(trans.minMu) || isPoorTransmission(trans.maxMu);
        strips.push({
          title: "transmission angle μ",
          caption: `min ${minDeg.toFixed(1)}°${poor ? " ⚠" : ""}`,
          captionColor: poor ? palette.warn : undefined,
          samples: trans.mu.map(radToDeg),
          zeroLine: false,
          muBands: true,
        });
      }

      strips.forEach((spec, i) => {
        drawStrip(
          ctx,
          palette,
          0,
          i * (STRIP_H + STRIP_GAP),
          width,
          STRIP_H,
          spec,
          cursor,
        );
      });

      // Input-angle axis caption under the last strip.
      const a0 = radToDeg(series.input[0]);
      const a1 = radToDeg(series.input[series.input.length - 1]);
      ctx.font = `9px ${MONO_FONT}`;
      ctx.fillStyle = palette.inkFaint;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        series.cyclic
          ? "input θ 0–360°"
          : `input θ ${a0.toFixed(0)}°–${a1.toFixed(0)}°`,
        width,
        rect.height - 1,
      );
    };

    const mo = new MutationObserver(() => {
      palette = readPalette();
      draw();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const unsub = useSimStore.subscribe(draw);
    draw();

    return () => {
      mo.disconnect();
      ro.disconnect();
      unsub();
    };
  }, []);

  return (
    <Panel title="Motion analysis" badge={<MuBadge />}>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: height + 12 }}
        aria-label="Output position, velocity and acceleration plotted against the input angle"
        role="img"
      />
      <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
        ′ = d/dθ per radian of input — independent of motor speed. Multiply by
        ω and ω² for time rates.
      </p>
    </Panel>
  );
}