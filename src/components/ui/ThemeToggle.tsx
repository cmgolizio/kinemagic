"use client";

import { useSyncExternalStore } from "react";

type Theme = "blueprint" | "draft";

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "draft"
    ? "draft"
    : "blueprint";
}

// The <html data-theme> attribute is the source of truth (set before first
// paint by the inline script in the root layout); subscribe to it directly.
function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => mo.disconnect();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "blueprint");

  const toggle = () => {
    const next: Theme = readTheme() === "blueprint" ? "draft" : "blueprint";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("kinemagic-theme", next);
    } catch {
      // private browsing — theme just won't persist
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "draft" ? "blueprint" : "draft"} theme`}
      className="flex items-center gap-2 border border-panel-border px-2.5 py-1 font-mono text-xs uppercase tracking-widest text-ink-muted hover:text-ink hover:border-ink-faint transition-colors"
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 border border-current"
        style={{
          background:
            theme === "draft"
              ? "repeating-linear-gradient(45deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)"
              : "currentColor",
        }}
      />
      {theme}
    </button>
  );
}