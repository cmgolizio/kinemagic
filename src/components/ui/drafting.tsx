/**
 * SVG drafting primitives — the reusable visual language of the app.
 * The live simulation draws these same shapes on canvas; these components
 * exist for panels, legends, and the /learn explainers.
 * All coordinates are in the parent <svg>'s user space.
 */

/** Moving pin: filled circle with a visible bore. Fixed pivot: hatched ground triangle. */
export function JointPin({
  x,
  y,
  r = 6,
  fixed = false,
}: {
  x: number;
  y: number;
  r?: number;
  fixed?: boolean;
}) {
  if (fixed) {
    const w = r * 2.2;
    const h = r * 2;
    return (
      <g stroke="var(--ink)" fill="none" strokeWidth={1.2}>
        <circle cx={x} cy={y} r={r * 0.55} fill="var(--ground)" />
        <path d={`M ${x} ${y} L ${x - w} ${y + h} L ${x + w} ${y + h} Z`} />
        {/* hatching under the ground line */}
        {Array.from({ length: 5 }, (_, i) => {
          const hx = x - w + (i + 0.5) * ((2 * w) / 5);
          return (
            <line
              key={i}
              x1={hx}
              y1={y + h}
              x2={hx - r * 0.7}
              y2={y + h + r * 0.7}
            />
          );
        })}
        <line x1={x - w * 1.15} y1={y + h} x2={x + w * 1.15} y2={y + h} />
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="var(--link-stroke)" />
      <circle cx={x} cy={y} r={r * 0.4} fill="var(--ground)" />
    </g>
  );
}

/** Dimension line with arrowheads and offset extension lines, engineering-drawing style. */
export function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  offset = 14,
  label,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offset?: number;
  label: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // unit normal, offset side
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  const mx = (ax1 + ax2) / 2;
  const my = (ay1 + ay2) / 2;
  const arrow = 5;
  const ux = dx / len;
  const uy = dy / len;
  const head = (px: number, py: number, dir: 1 | -1) =>
    `M ${px} ${py} l ${dir * arrow * ux - arrow * 0.4 * -uy} ${
      dir * arrow * uy - arrow * 0.4 * ux
    } M ${px} ${py} l ${dir * arrow * ux + arrow * 0.4 * -uy} ${
      dir * arrow * uy + arrow * 0.4 * ux
    }`;

  return (
    <g stroke="var(--ink-muted)" fill="none" strokeWidth={1}>
      {/* extension lines from the measured points, with a small gap */}
      <line x1={x1 + nx * 0.15} y1={y1 + ny * 0.15} x2={x1 + nx * 1.2} y2={y1 + ny * 1.2} />
      <line x1={x2 + nx * 0.15} y1={y2 + ny * 0.15} x2={x2 + nx * 1.2} y2={y2 + ny * 1.2} />
      <line x1={ax1} y1={ay1} x2={ax2} y2={ay2} />
      <path d={head(ax1, ay1, 1)} />
      <path d={head(ax2, ay2, -1)} />
      <text
        x={mx}
        y={my - 4}
        textAnchor="middle"
        stroke="none"
        fill="var(--ink)"
        className="font-mono"
        fontSize={10}
      >
        {label}
      </text>
    </g>
  );
}

/** Angle arc between two rays from a vertex, with a label at mid-arc. */
export function AngleArc({
  cx,
  cy,
  r = 18,
  startAngle,
  endAngle,
  label,
}: {
  cx: number;
  cy: number;
  r?: number;
  /** radians, SVG screen convention (y down) */
  startAngle: number;
  endAngle: number;
  label?: string;
}) {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  let sweep = endAngle - startAngle;
  while (sweep < 0) sweep += Math.PI * 2;
  const large = sweep > Math.PI ? 1 : 0;
  const mid = startAngle + sweep / 2;

  return (
    <g stroke="var(--ink-muted)" fill="none" strokeWidth={1}>
      <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`} />
      {label && (
        <text
          x={cx + (r + 9) * Math.cos(mid)}
          y={cy + (r + 9) * Math.sin(mid) + 3}
          textAnchor="middle"
          stroke="none"
          fill="var(--ink)"
          className="font-mono"
          fontSize={10}
        >
          {label}
        </text>
      )}
    </g>
  );
}