"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { encodeShare, SHARE_PARAM } from "@/share/codec";
import { sliceToShare, useSimStore } from "@/store/simStore";

/**
 * Copy-link sharing. The whole mechanism definition — no backend — encodes
 * into the `?m=` param; the button snapshots the current geometry + crank
 * angle, syncs the address bar, and copies the link.
 */
export function SharePanel() {
  const [copied, setCopied] = useState<"ok" | "manual" | null>(null);
  const [manualUrl, setManualUrl] = useState("");

  const buildUrl = (): string => {
    const st = useSimStore.getState();
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = `${SHARE_PARAM}=${encodeShare(sliceToShare(st.mech, st.theta))}`;
    return url.toString();
  };

  const onCopy = async () => {
    const link = buildUrl();
    // Keep the address bar in sync with what was copied, so a browser-bar
    // copy or a refresh carries the same design.
    window.history.replaceState(null, "", link);
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
      setManualUrl("");
    } catch {
      // Clipboard can be blocked (permissions, http) — show the link instead.
      setCopied("manual");
      setManualUrl(link);
    }
    if (typeof window !== "undefined") {
      window.setTimeout(() => setCopied((c) => (c === "ok" ? null : c)), 2000);
    }
  };

  return (
    <Panel title="Share" defaultOpen={false}>
      <button
        type="button"
        onClick={onCopy}
        className="border border-panel-border px-1.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-muted transition-colors hover:border-accent hover:text-accent"
      >
        {copied === "ok" ? "✓ link copied" : "⎘ copy link to this mechanism"}
      </button>
      {copied === "manual" && (
        <input
          readOnly
          aria-label="Share link"
          value={manualUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full border border-panel-border bg-panel px-2 py-1 font-mono text-[10px] text-ink"
        />
      )}
      <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
        The entire design — every length, position and the crank angle —
        lives in the link itself. No account, no server; opening it rebuilds
        the mechanism exactly.
      </p>
    </Panel>
  );
}
