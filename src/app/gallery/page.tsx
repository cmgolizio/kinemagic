import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery — Kinemagic",
  description: "A gallery of shared mechanisms.",
};

export default function GalleryPage() {
  return (
    <div className="graph-paper flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg border border-surface-edge bg-surface p-6">
        <h1 className="font-mono text-lg font-semibold uppercase tracking-[0.2em]">Gallery</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Shared mechanisms live in the URL — no accounts, no database. A curated gallery is
          deferred until after v1.
        </p>
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-accent">
          Sheet reserved — deferred backlog
        </p>
      </div>
    </div>
  );
}