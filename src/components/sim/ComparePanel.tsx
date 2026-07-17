"use client";

import { Panel } from "@/components/ui/Panel";
import { sliceTrace, useSimStore } from "@/store/simStore";

/**
 * Snapshot compare: pin the current coupler curve as a dashed ghost, then
 * tweak lengths and watch the new curve morph against the old one.
 */
export function ComparePanel() {
  const hasTrace = useSimStore((s) => sliceTrace(s.mech) !== null);
  const ghost = useSimStore((s) => s.ghost);
  const pinGhost = useSimStore((s) => s.pinGhost);
  const clearGhost = useSimStore((s) => s.clearGhost);

  if (!hasTrace && !ghost) return null;

  return (
    <Panel title="Compare" defaultOpen={false}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={pinGhost}
          disabled={!hasTrace}
          className="flex-1 border border-panel-border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {ghost ? "re-pin curve" : "pin current curve"}
        </button>
        <button
          type="button"
          onClick={clearGhost}
          disabled={!ghost}
          className="shrink-0 border border-panel-border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-accent hover:text-ink disabled:opacity-40"
        >
          clear
        </button>
      </div>
      <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
        {ghost
          ? "Ghost pinned — tweak a length or drag a joint and watch the new curve against the dashed old one."
          : "Pin the curve, then change the geometry: the pinned shape stays as a dashed ghost for before/after comparison."}
      </p>
    </Panel>
  );
}