import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Challenges } from "@/components/learn/Challenges";

export const metadata: Metadata = {
  title: "Learn & challenges — Kinemagic",
  description:
    "Design-goal challenges graded live against your mechanism: straight-line coupler curves, Grashof cranks, quick-return timing and the Peaucellier exact line.",
};

export default function LearnPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="graph-paper flex-1 p-6 sm:p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <header className="border border-surface-edge bg-surface p-5">
            <h1 className="font-mono text-lg font-semibold uppercase tracking-[0.2em]">
              Challenges
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Design-goal puzzles, graded automatically against the mechanism
              currently in your simulator. Load a starting point, tune the
              geometry on the sim sheet, and the verdicts here update live —
              no submit button, the geometry itself is the answer.
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-accent">
              Interactive explainers arrive in Phase 7 — this sheet holds the
              challenge board.
            </p>
          </header>

          <Challenges />
        </div>
      </main>
    </div>
  );
}
