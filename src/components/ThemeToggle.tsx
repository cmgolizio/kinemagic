"use client";

const STORAGE_KEY = "kinemagic-theme";
type Theme = "blueprint" | "draft";

/**
 * Blueprint / Draft theme switch. The active-state styling is driven
 * entirely by `html[data-theme]` CSS (see globals.css), so the server can
 * render this without knowing the persisted choice — no hydration mismatch,
 * no flash.
 */
export function ThemeToggle() {
  const setTheme = (theme: Theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Persistence is best-effort (private browsing etc.).
    }
  };

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="ml-2 flex overflow-hidden rounded-sm border border-surface-edge font-mono text-[10px] uppercase"
    >
      <button
        type="button"
        onClick={() => setTheme("blueprint")}
        className="theme-option theme-option-blueprint px-2.5 py-1 tracking-widest"
      >
        Blueprint
      </button>
      <button
        type="button"
        onClick={() => setTheme("draft")}
        className="theme-option theme-option-draft px-2.5 py-1 tracking-widest"
      >
        Draft
      </button>
    </div>
  );
}