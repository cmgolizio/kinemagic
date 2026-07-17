"use client";

import { normalizeAnglePositive, radToDeg } from "@/engine";
import { useSimStore } from "@/store/simStore";

/** Live instrument readout, bottom-left — per-mechanism numbers. */
export function StatusBar() {
  const mech = useSimStore((s) => s.mech);
  const theta = useSimStore((s) => s.theta);

  const deg = (rad: number) =>
    radToDeg(normalizeAnglePositive(rad)).toFixed(1).padStart(5);

  const box = (children: React.ReactNode) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border border-panel-border bg-panel px-3 py-1.5 text-ink-muted backdrop-blur-sm">
      {children}
    </div>
  );
  const warnBox = (text: string) => (
    <div
      className="border border-panel-border bg-panel px-3 py-1.5 backdrop-blur-sm"
      style={{ color: "var(--warn)" }}
    >
      {text}
    </div>
  );

  let content: React.ReactNode;
  let note: string | null = null;

  switch (mech.type) {
    case "fourbar": {
      const pose = mech.pose;
      const impossible = !mech.range.full && mech.range.arcs.length === 0;
      if (!pose.ok) {
        content = warnBox(
          impossible
            ? "× links cannot assemble — lengthen the coupler or rocker"
            : "× unreachable crank angle — driver clamped to its limits",
        );
        break;
      }
      const mu = radToDeg(pose.transmissionAngle);
      content = box(
        <>
          <span>
            θ₂ <span className="text-ink">{deg(pose.theta2)}°</span>
          </span>
          <span>
            P (<span className="text-ink">{pose.P.x.toFixed(1)}</span>,{" "}
            <span className="text-ink">{pose.P.y.toFixed(1)}</span>) mm
          </span>
          <span>
            μ{" "}
            <span
              className="text-ink"
              style={mu < 30 || mu > 150 ? { color: "var(--warn)" } : undefined}
            >
              {mu.toFixed(1)}°
            </span>
          </span>
        </>,
      );
      if (!mech.range.full && !impossible)
        note = "limited input — the crank sways between the marked limits";
      break;
    }

    case "slidercrank": {
      const pose = mech.pose;
      if (!pose.ok) {
        content = warnBox("× rod cannot reach the track — driver clamped to its limits");
        break;
      }
      const stroke = mech.stroke ? mech.stroke.max - mech.stroke.min : null;
      content = box(
        <>
          <span>
            θ₂ <span className="text-ink">{deg(pose.theta2)}°</span>
          </span>
          <span>
            slider <span className="text-ink">{pose.sliderPos.toFixed(1)}</span> mm
          </span>
          {stroke !== null && (
            <span>
              stroke <span className="text-ink">{stroke.toFixed(1)}</span> mm
            </span>
          )}
        </>,
      );
      break;
    }

    case "cam": {
      const pose = mech.pose;
      if (!pose.ok) {
        content = warnBox(`× ${pose.detail}`);
        break;
      }
      content = box(
        <>
          <span>
            θ <span className="text-ink">{deg(theta)}°</span>
          </span>
          <span>
            lift <span className="text-ink">{pose.lift.toFixed(2)}</span> /{" "}
            {mech.diagram.maxLift.toFixed(1)} mm
          </span>
          <span>
            {mech.config.follower === "roller" ? "roller" : "flat-face"} follower
          </span>
        </>,
      );
      break;
    }

    case "gears": {
      const pose = mech.pose;
      if (!pose.ok) {
        content = warnBox(`× ${pose.detail}`);
        break;
      }
      const out = pose.gears[pose.gears.length - 1];
      content = box(
        <>
          <span>
            input <span className="text-ink">{deg(theta)}°</span>
          </span>
          <span>
            output <span className="text-ink">{deg(out.angle)}°</span>
          </span>
          <span>
            ω ratio <span className="text-ink">{pose.overallRatio.toFixed(3)}</span>
          </span>
        </>,
      );
      break;
    }

    case "geneva": {
      const pose = mech.pose;
      if (!pose.ok) {
        content = warnBox(`× ${pose.detail}`);
        break;
      }
      content = box(
        <>
          <span>
            driver <span className="text-ink">{deg(theta)}°</span>
          </span>
          <span>
            wheel <span className="text-ink">{deg(pose.wheelAngle)}°</span>
          </span>
          <span
            style={pose.engaged ? { color: "var(--trace)" } : undefined}
            className="text-ink"
          >
            {pose.engaged ? "indexing" : "dwell"}
          </span>
        </>,
      );
      break;
    }

    case "straightline": {
      if (mech.variant === "watt") {
        const pose = mech.wattPose;
        if (!pose?.ok) {
          content = warnBox("× links cannot assemble here");
          break;
        }
        content = box(
          <>
            <span>
              θ <span className="text-ink">{deg(pose.theta2)}°</span>
            </span>
            <span>
              P (<span className="text-ink">{pose.P.x.toFixed(1)}</span>,{" "}
              <span className="text-ink">{pose.P.y.toFixed(1)}</span>) mm
            </span>
            {mech.refDev !== null && (
              <span>
                run dev <span className="text-ink">{mech.refDev.toFixed(2)}</span> mm
              </span>
            )}
          </>,
        );
      } else {
        const pose = mech.peauPose;
        if (!pose?.ok) {
          content = warnBox("× cell cannot close — driver clamped to its limits");
          break;
        }
        content = box(
          <>
            <span>
              θ <span className="text-ink">{deg(pose.theta)}°</span>
            </span>
            <span>
              Q (<span className="text-ink">{pose.Q.x.toFixed(1)}</span>,{" "}
              <span className="text-ink">{pose.Q.y.toFixed(1)}</span>) mm
            </span>
            {mech.refDev !== null && (
              <span>
                line dev <span className="text-ink">{mech.refDev.toExponential(1)}</span> mm
              </span>
            )}
          </>,
        );
        note = "an exact straight line from rotary joints only — Peaucellier, 1864";
      }
      break;
    }
  }

  return (
    <div className="pointer-events-none flex flex-col gap-1 font-mono text-[11px] leading-tight">
      {content}
      {note && (
        <div className="self-start border border-panel-border bg-panel px-3 py-1.5 text-ink-faint backdrop-blur-sm">
          {note}
        </div>
      )}
    </div>
  );
}