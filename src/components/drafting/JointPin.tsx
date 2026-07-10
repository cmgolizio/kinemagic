export interface JointPinProps {
  /** Pin center, parent-SVG screen coordinates (y-down). */
  at: { x: number; y: number };
  /** Pin radius, px. */
  r?: number;
  /**
   * fixed — ground pivot: pin on a hatched support triangle;
   * pin — moving joint: filled circle with a visible bore.
   */
  variant?: "fixed" | "pin";
  /** Optional mono label, e.g. "O2" or "A". */
  label?: string;
  labelDx?: number;
  labelDy?: number;
}

/** Joint pin that reads as real hardware. Pure SVG, server-renderable. */
export function JointPin({
  at,
  r = 6,
  variant = "pin",
  label,
  labelDx = 10,
  labelDy = -8,
}: JointPinProps) {
  const boreR = Math.max(1.5, r * 0.4);
  const triHalf = r * 1.9;
  const triDepth = r * 2.5;
  const groundY = at.y + triDepth;
  const hatchCount = 4;
  const hatchSpan = triHalf * 2.4;
  const hatches = Array.from({ length: hatchCount }, (_, i) => {
    const x = at.x - hatchSpan / 2 + (hatchSpan * (i + 0.5)) / hatchCount;
    return { x1: x, y1: groundY, x2: x - r * 0.9, y2: groundY + r * 0.9 };
  });

  return (
    <g>
      {variant === "fixed" && (
        <g stroke="var(--line)" strokeWidth={1.2} fill="none">
          <path
            d={`M ${at.x} ${at.y} L ${at.x - triHalf} ${groundY} L ${at.x + triHalf} ${groundY} Z`}
            fill="var(--line-faint)"
            fillOpacity={0.25}
          />
          <line
            x1={at.x - hatchSpan / 2}
            y1={groundY}
            x2={at.x + hatchSpan / 2}
            y2={groundY}
            strokeWidth={1.4}
          />
          {hatches.map((h, i) => (
            <line key={i} x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} strokeWidth={1} />
          ))}
        </g>
      )}
      <circle
        cx={at.x}
        cy={at.y}
        r={r}
        fill={variant === "fixed" ? "var(--surface)" : "var(--line)"}
        stroke="var(--line-strong)"
        strokeWidth={1.4}
      />
      <circle
        cx={at.x}
        cy={at.y}
        r={boreR}
        fill="var(--ground)"
        stroke="var(--line-strong)"
        strokeWidth={1}
      />
      {label && (
        <text
          x={at.x + labelDx}
          y={at.y + labelDy}
          fill="var(--ink-muted)"
          fontSize={11}
          fontFamily="var(--font-plex-mono), monospace"
        >
          {label}
        </text>
      )}
    </g>
  );
}