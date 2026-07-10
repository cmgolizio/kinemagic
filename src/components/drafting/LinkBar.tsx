export interface LinkBarProps {
  /** Pivot centers, parent-SVG screen coordinates (y-down). */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Bar width, px. */
  width?: number;
  /** Pivot bore radius, px. */
  boreR?: number;
  /** Optional stroke override (defaults to the theme line color). */
  stroke?: string;
  /** Faint rendering for the ground/frame link. */
  faint?: boolean;
}

/**
 * Rounded capsule link bar with pivot bores at both ends — the standard
 * visual for a rigid link. Pure SVG, server-renderable.
 */
export function LinkBar({ from, to, width = 14, boreR = 3, stroke, faint = false }: LinkBarProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;

  const R = width / 2;
  const nx = (-dy / len) * R;
  const ny = (dx / len) * R;

  const d = [
    `M ${from.x + nx} ${from.y + ny}`,
    `L ${to.x + nx} ${to.y + ny}`,
    `A ${R} ${R} 0 0 1 ${to.x - nx} ${to.y - ny}`,
    `L ${from.x - nx} ${from.y - ny}`,
    `A ${R} ${R} 0 0 1 ${from.x + nx} ${from.y + ny}`,
    "Z",
  ].join(" ");

  const strokeColor = stroke ?? (faint ? "var(--line-faint)" : "var(--line)");

  return (
    <g>
      <path
        d={d}
        fill="var(--line-faint)"
        fillOpacity={faint ? 0.12 : 0.3}
        stroke={strokeColor}
        strokeWidth={faint ? 1 : 1.5}
      />
      {[from, to].map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={boreR}
          fill="var(--ground)"
          stroke={strokeColor}
          strokeWidth={1}
        />
      ))}
    </g>
  );
}