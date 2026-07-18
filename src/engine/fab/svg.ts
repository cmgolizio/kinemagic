/**
 * SVG serialization for fabrication export. True to scale: 1 SVG user unit
 * = 1 mm, with the physical size pinned by width/height in mm. Outlines are
 * exact arcs (`A` commands) and exact circles — measure the file in a vector
 * editor and you get the configured dimensions, not a tessellation.
 *
 * Conventions for cutters: black hairline strokes are cut lines; the
 * optional label layer is blue reference text (engrave or delete).
 */

import type { Vec2 } from "../vec";
import { arcSweep, segStart, type Contour } from "./contour";
import type { FabPlan, FabSettings } from "./parts";
import { boreDia } from "./parts";
import { layoutParts, type SheetLayout } from "./layout";

/** µm-precision coordinate, trailing zeros trimmed. */
const fmt = (n: number): string => {
  const r = Math.round(n * 1000) / 1000;
  // Avoid "-0"
  return (Object.is(r, -0) ? 0 : r).toString();
};

const CUT_STROKE = 0.1;
const LABEL_COLOR = "#1d63d1";

/**
 * Contour → SVG path `d`, mapping local Y-up geometry into the SVG's Y-down
 * frame via y ↦ flipY − y and x ↦ x + dx.
 */
export function contourToPathD(contour: Contour, dx: number, flipY: number): string {
  if (contour.segs.length === 0) return "";
  const map = (p: Vec2) => `${fmt(p.x + dx)} ${fmt(flipY - p.y)}`;
  let d = `M ${map(segStart(contour.segs[0]))}`;
  for (const seg of contour.segs) {
    if (seg.kind === "line") {
      d += ` L ${map(seg.b)}`;
    } else {
      const sweep = arcSweep(seg);
      const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
      // Y-flip reverses orientation: a CCW arc in the part frame is drawn
      // with sweep-flag 0 in SVG's Y-down frame.
      const sweepFlag = seg.ccw ? 0 : 1;
      const end = {
        x: seg.c.x + seg.r * Math.cos(seg.a1),
        y: seg.c.y + seg.r * Math.sin(seg.a1),
      };
      d += ` A ${fmt(seg.r)} ${fmt(seg.r)} 0 ${largeArc} ${sweepFlag} ${map(end)}`;
    }
  }
  return `${d} Z`;
}

export interface SheetSvgOptions {
  /** include the blue reference-label layer (default true) */
  labels?: boolean;
  /** precomputed layout; computed from the plan when omitted */
  layout?: SheetLayout;
}

/**
 * The cut sheet: every part outline with its bores, one closed path per
 * part, at true mm scale.
 */
export function sheetToSvg(
  plan: FabPlan,
  settings: FabSettings,
  opts: SheetSvgOptions = {},
): string {
  const layout = opts.layout ?? layoutParts(plan.parts, settings.spacing);
  const H = layout.height;
  const labels = opts.labels ?? true;

  const cuts: string[] = [];
  const texts: string[] = [];
  for (const { part, x, y } of layout.placements) {
    // Part outline. The whole-sheet Y flip maps a sheet point sy to H − sy;
    // for a part-local point that is H − (y + p.y) = (H − y) − p.y.
    const flipY = H - y;
    let d = contourToPathD(part.outline, x, flipY);
    for (const hole of part.holes) {
      const r = hole.dia / 2;
      const cx = hole.p.x + x;
      const cy = flipY - hole.p.y;
      // Bores as exact circle subpaths (two arcs), wound opposite the outline.
      d +=
        ` M ${fmt(cx - r)} ${fmt(cy)}` +
        ` A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx + r)} ${fmt(cy)}` +
        ` A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx - r)} ${fmt(cy)} Z`;
    }
    cuts.push(`    <path id="${part.id}" d="${d}"/>`);

    if (labels) {
      const cx = x + (part.bbox.min.x + part.bbox.max.x) / 2;
      const cy = flipY - (part.bbox.min.y + part.bbox.max.y) / 2;
      texts.push(
        `    <text x="${fmt(cx)}" y="${fmt(cy + 1)}" text-anchor="middle">` +
          `${escapeXml(part.name)} — ${part.span.toFixed(1)}</text>`,
      );
    }
  }

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(layout.width)}mm" height="${fmt(H)}mm" viewBox="0 0 ${fmt(layout.width)} ${fmt(H)}">`,
    `  <desc>kinemagic ${escapeXml(plan.mechanism)} cut sheet — units mm, 1 unit = 1 mm. ` +
      `Black paths are cut lines (bore ⌀ ${boreDia(settings).toFixed(2)} mm = ` +
      `M${fmt(settings.pinDia)} pin + ${settings.clearance.toFixed(2)} mm clearance). ` +
      `Blue text is reference only.</desc>`,
    `  <g fill="none" stroke="#000" stroke-width="${CUT_STROKE}" stroke-linejoin="round">`,
    ...cuts,
    `  </g>`,
  ];
  if (labels && texts.length > 0) {
    lines.push(
      `  <g fill="${LABEL_COLOR}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="2.6">`,
      ...texts,
      `  </g>`,
    );
  }
  lines.push(`</svg>`, ``);
  return lines.join("\n");
}

export interface CurveSvgOptions {
  /** name written into the file's <desc> */
  title?: string;
  /** padding around the curve, mm (default 5) */
  padding?: number;
}

/**
 * A traced curve (coupler curve, cam profile) as a true-scale SVG polyline
 * path — for CNC-ing a slot, plotting, or art.
 */
export function curveToSvg(
  points: Vec2[],
  closed: boolean,
  opts: CurveSvgOptions = {},
): string | null {
  if (points.length < 2) return null;
  const pad = opts.padding ?? 5;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;

  // World Y-up → SVG Y-down.
  const map = (p: Vec2) =>
    `${fmt(p.x - minX + pad)} ${fmt(maxY - p.y + pad)}`;
  let d = `M ${map(points[0])}`;
  for (let i = 1; i < points.length; i++) d += ` L ${map(points[i])}`;
  if (closed) d += " Z";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">`,
    `  <desc>kinemagic ${escapeXml(opts.title ?? "traced curve")} — units mm, true scale. ` +
      `Curve box ${(maxX - minX).toFixed(1)} × ${(maxY - minY).toFixed(1)} mm.</desc>`,
    `  <path d="${d}" fill="none" stroke="#000" stroke-width="${CUT_STROKE}" stroke-linejoin="round"/>`,
    `</svg>`,
    ``,
  ].join("\n");
}

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");