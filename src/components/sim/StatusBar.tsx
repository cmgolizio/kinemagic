"use client";

import { normalizeAnglePositive, radToDeg } from "@/engine";
import { useSimStore } from "@/store/simStore";

/** Live instrument readout, bottom-left: θ₂, coupler point, transmission angle. */
export function StatusBar() {
  const pose = useSimStore((s) => s.pose);
  const range = useSimStore((s) => s.range);

  const impossible = !range.full && range.arcs.length === 0;
  const limited = !range.full && !impossible;

  return (
    <div className="pointer-events-none flex flex-col gap-1 font-mono text-[11px] leading-tight">
      {pose.ok ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border border-panel-border bg-panel px-3 py-1.5 text-ink-muted backdrop-blur-sm">
          <span>
            θ₂ <span className="text-ink">{radToDeg(normalizeAnglePositive(pose.theta2)).toFixed(1).padStart(5)}°</span>
          </span>
          <span>
            P (<span className="text-ink">{pose.P.x.toFixed(1)}</span>,{" "}
            <span className="text-ink">{pose.P.y.toFixed(1)}</span>) mm
          </span>
          <span>
            μ{" "}
            <span
              className="text-ink"
              style={
                radToDeg(pose.transmissionAngle) < 30 ||
                radToDeg(pose.transmissionAngle) > 150
                  ? { color: "var(--warn)" }
                  : undefined
              }
            >
              {radToDeg(pose.transmissionAngle).toFixed(1)}°
            </span>
          </span>
        </div>
      ) : (
        <div className="border border-panel-border bg-panel px-3 py-1.5 backdrop-blur-sm" style={{ color: "var(--warn)" }}>
          {impossible
            ? "× links cannot assemble — lengthen the coupler or rocker"
            : "× unreachable crank angle — driver clamped to its limits"}
        </div>
      )}
      {limited && pose.ok && (
        <div className="self-start border border-panel-border bg-panel px-3 py-1.5 text-ink-faint backdrop-blur-sm">
          limited input — the crank sways between the marked limits
        </div>
      )}
    </div>
  );
}