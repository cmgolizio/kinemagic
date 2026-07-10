import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn — Kinemagic",
  description: "Short, interactive explainers on linkages, coupler curves, and mechanisms.",
};

export default function LearnPage() {
  return (
    <div className="graph-paper flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg border border-surface-edge bg-surface p-6">
        <h1 className="font-mono text-lg font-semibold uppercase tracking-[0.2em]">Learn</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Short, interactive explainers — what a four-bar is, why coupler curves matter, Grashof in
          one paragraph — each with a live mini-sim.
        </p>
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-accent">
          Sheet reserved — arrives in Phase 7
        </p>
      </div>
    </div>
  );
}