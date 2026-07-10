"use client";

import { useId, useState } from "react";

export interface PanelProps {
  title: string;
  children: React.ReactNode;
  /** Collapsed/expanded initial state. Default: open. */
  defaultOpen?: boolean;
  className?: string;
}

/** Collapsible drafting-panel: mono title strip, thin rule, quiet body. */
export function Panel({ title, children, defaultOpen = true, className }: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section
      className={`border border-surface-edge bg-surface ${className ?? ""}`}
      aria-label={title}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border-b border-surface-edge px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink hover:text-accent"
      >
        <span>{title}</span>
        <span aria-hidden="true" className="font-mono text-ink-muted">
          {open ? "−" : "+"}
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="px-3 py-3">
        {children}
      </div>
    </section>
  );
}