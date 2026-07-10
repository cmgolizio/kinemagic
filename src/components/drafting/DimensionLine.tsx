export interface DimensionLineProps {
  /** Measured points, in the parent SVG's screen coordinates (y-down). */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /**
   * Perpendicular displacement of the dimension line from the measured
   * edge, px. Positive displaces along the CCW perpendicular of from->to
   * (which points visually "down-left" in screen coords for a left-to-right
   * edge).
   */
  offset?: number;
  /** Dimension text, e.g. "100 mm". */
  label: string;
  fontSize?: number;
}

const ARROW_LEN = 8;
const ARROW_HALF_WIDTH = 2.6;
const EXTENSION_GAP = 3; // gap between measured point and extension line
const EXTENSION_OVERSHOOT = 4; // extension line runs past the dimension line

/**
 * Engineering dimension: offset extension lines, a dimension line with
 * filled arrowheads at both ends, and a mono label riding the line.
 * Pure SVG geometry — composes inside any <svg>, server-renderable.
 */
export function DimensionLine({ from, to, offset = 24, label, fontSize = 11 }: DimensionLineProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;

  const ux = dx / len;
  const uy = dy / len;
  // CCW perpendicular (in math terms); visually this is the y-down screen's
  // clockwise side, but callers only care that sign of `offset` flips sides.
  const nx = -uy;
  const ny = ux;

  const d1 = { x: from.x + nx * offset, y: from.y + ny * offset };
  const d2 = { x: to.x + nx * offset, y: to.y + ny * offset };
  const sign = Math.sign(offset) || 1;

  const ext = (p: { x: number; y: number }) => {
    const start = { x: p.x + nx * EXTENSION_GAP * sign, y: p.y + ny * EXTENSION_GAP * sign };
    const end = {
      x: p.x + nx * (offset + EXTENSION_OVERSHOOT * sign),
      y: p.y + ny * (offset + EXTENSION_OVERSHOOT * sign),
    };
    return { start, end };
  };
  const e1 = ext(from);
  const e2 = ext(to);

  // Arrowheads point outward along the dimension line.
  const arrow = (tip: { x: number; y: number }, dirX: number, dirY: number) => {
    const bx = tip.x - dirX * ARROW_LEN;
    const by = tip.y - dirY * ARROW_LEN;
    return `${tip.x},${tip.y} ${bx + nx * ARROW_HALF_WIDTH},${by + ny * ARROW_HALF_WIDTH} ${
      bx - nx * ARROW_HALF_WIDTH
    },${by - ny * ARROW_HALF_WIDTH}`;
  };

  // Keep the label upright.
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angleDeg > 90 || angleDeg <= -90) angleDeg += 180;
  const mid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };

  return (
    <g stroke="var(--line)" strokeWidth={1} fill="none">
      <line x1={e1.start.x} y1={e1.start.y} x2={e1.end.x} y2={e1.end.y} />
      <line x1={e2.start.x} y1={e2.start.y} x2={e2.end.x} y2={e2.end.y} />
      <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} />
      <polygon points={arrow(d1, -ux, -uy)} fill="var(--line)" stroke="none" />
      <polygon points={arrow(d2, ux, uy)} fill="var(--line)" stroke="none" />
      <text
        transform={`translate(${mid.x} ${mid.y}) rotate(${angleDeg})`}
        y={-4}
        textAnchor="middle"
        fill="var(--ink)"
        stroke="none"
        fontSize={fontSize}
        fontFamily="var(--font-plex-mono), monospace"
      >
        {label}
      </text>
    </g>
  );
}