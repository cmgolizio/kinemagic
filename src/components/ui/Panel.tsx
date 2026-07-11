"use client";

import { useState, type ReactNode } from "react";

/**
 * Collapsible drafting-panel: a titled block with a thin rule, styled like a
 * section of an engineering drawing's notes column.
 */
export function Panel({
  title,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border border-panel-border bg-panel backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {badge}
          <span
            aria-hidden
            className="font-mono text-xs text-ink-faint"
          >
            {open ? "−" : "+"}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-panel-border px-3 py-3 flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}