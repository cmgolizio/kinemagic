"use client";

import { dist } from "@/engine";
import { Panel } from "@/components/ui/Panel";
import {
  measurableJoints,
  sliceTrace,
  traceBounds,
  useSimStore,
} from "@/store/simStore";

/**
 * Measure tools: a two-joint dimension picked by clicking on the canvas,
 * the trace point's live coordinates, and the traced curve's bounding box.
 */
export function MeasurePanel() {
  const mech = useSimStore((s) => s.mech);
  const measure = useSimStore((s) => s.measure);
  const showCurveBox = useSimStore((s) => s.showCurveBox);
  const setMeasureActive = useSimStore((s) => s.setMeasureActive);
  const clearMeasure = useSimStore((s) => s.clearMeasure);
  const setShowCurveBox = useSimStore((s) => s.setShowCurveBox);

  const joints = measurableJoints(mech);
  const a = joints.find((j) => j.id === measure.a);
  const b = joints.find((j) => j.id === measure.b);

  // Live trace-point readout (the joint that draws the curve).
  const tracePoint =
    joints.find((j) => j.id === "P") ?? joints.find((j) => j.id === "Q");
  const bounds = traceBounds(mech);
  const hasTrace = sliceTrace(mech) !== null;

  return (
    <Panel title="Measure" defaultOpen={false}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMeasureActive(!measure.active)}
          aria-pressed={measure.active}
          className={`flex-1 border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            measure.active
              ? "border-accent text-accent"
              : "border-panel-border text-ink-muted hover:border-accent hover:text-ink"
          }`}
        >
          {measure.active ? "picking… click 2 joints" : "pick joints"}
        </button>
        <button
          type="button"
          onClick={clearMeasure}
          disabled={!measure.a && !measure.active}
          className="shrink-0 border border-panel-border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-accent hover:text-ink disabled:opacity-40"
        >
          clear
        </button>
      </div>

      <div className="flex flex-col gap-1 font-mono text-[11px] text-ink-muted">
        {a && b ? (
          <>
            <span>
              {a.label}–{b.label}{" "}
              <span className="text-ink">{dist(a.w, b.w).toFixed(2)}</span> mm
            </span>
            <span>
              Δx <span className="text-ink">{(b.w.x - a.w.x).toFixed(2)}</span>{" "}
              Δy <span className="text-ink">{(b.w.y - a.w.y).toFixed(2)}</span> mm
            </span>
          </>
        ) : (
          <span className="text-ink-faint">
            {measure.active
              ? a
                ? `${a.label} picked — click a second joint`
                : "click a joint on the canvas"
              : "dimension between any two joints"}
          </span>
        )}

        {tracePoint && (
          <span>
            {tracePoint.label} (
            <span className="text-ink">{tracePoint.w.x.toFixed(1)}</span>,{" "}
            <span className="text-ink">{tracePoint.w.y.toFixed(1)}</span>) mm
          </span>
        )}

        {bounds && (
          <span>
            curve box{" "}
            <span className="text-ink">
              {(bounds.max.x - bounds.min.x).toFixed(1)}
            </span>{" "}
            ×{" "}
            <span className="text-ink">
              {(bounds.max.y - bounds.min.y).toFixed(1)}
            </span>{" "}
            mm
          </span>
        )}
      </div>

      {hasTrace && (
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
          <input
            type="checkbox"
            checked={showCurveBox}
            onChange={(e) => setShowCurveBox(e.target.checked)}
          />
          show bounding box on canvas
        </label>
      )}
    </Panel>
  );
}