export interface AngleArcProps {
  /** Arc center, parent-SVG screen coordinates (y-down). */
  center: { x: number; y: number };
  radius: number;
  /**
   * Angles in radians measured in screen coordinates (+x right, +y down),
   * so increasing angle sweeps visually clockwise. Callers working in a
   * y-up world flip signs when mapping to screen.
   */
  startAngle: number;
  endAngle: number;
  /** Label placed at the arc's mid-angle, e.g. "θ₂ = 65°". */
  label?: string;
  fontSize?: number;
}

/** Drafting angle arc with optional mono label. Pure SVG, server-renderable. */
export function AngleArc({
  center,
  radius,
  startAngle,
  endAngle,
  label,
  fontSize = 11,
}: AngleArcProps) {
  const at = (angle: number, r: number) => ({
    x: center.x + r * Math.cos(angle),
    y: center.y + r * Math.sin(angle),
  });

  const start = at(startAngle, radius);
  const end = at(endAngle, radius);
  const delta = endAngle - startAngle;
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;

  const mid = at(startAngle + delta / 2, radius + 12);

  return (
    <g fill="none">
      <path
        d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`}
        stroke="var(--accent)"
        strokeWidth={1}
      />
      {label && (
        <text
          x={mid.x}
          y={mid.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--accent)"
          fontSize={fontSize}
          fontFamily="var(--font-plex-mono), monospace"
        >
          {label}
        </text>
      )}
    </g>
  );
}