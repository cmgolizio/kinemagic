"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { TitleBlock } from "@/components/TitleBlock";
import { decodeShare, SHARE_PARAM } from "@/share/codec";
import { mechanismOfTheDay } from "@/share/motd";
import { MECHANISMS, mechMeta, useSimStore } from "@/store/simStore";
import { ControlsPanel } from "./ControlsPanel";
import { StatusBar } from "./StatusBar";

// The canvas layer is browser-only; skip SSR for it.
const SimCanvas = dynamic(
  () => import("./SimCanvas").then((m) => m.SimCanvas),
  { ssr: false },
);

function SheetStamp() {
  const type = useSimStore((s) => s.mech.type);
  const index = MECHANISMS.findIndex((m) => m.type === type);
  const meta = mechMeta(type);
  return (
    <TitleBlock
      title={meta.label.toLowerCase()}
      drawingNo={`KM-${String(index + 1).padStart(3, "0")}`}
      sheet={`${String(index + 1).padStart(3, "0")}`}
    />
  );
}

function MotdChip() {
  const motd = useSimStore((s) => s.motd);
  const dismissMotd = useSimStore((s) => s.dismissMotd);
  if (!motd) return null;
  return (
    <div className="pointer-events-auto flex max-w-xs items-start gap-2 border border-panel-border bg-panel px-3 py-2 font-mono text-[11px] leading-snug backdrop-blur-sm">
      <div>
        <span className="uppercase tracking-widest text-accent">
          ★ mechanism of the day
        </span>
        <span className="mt-0.5 block text-ink">{motd.title}</span>
        <span className="mt-0.5 block text-[10px] text-ink-faint">{motd.note}</span>
      </div>
      <button
        type="button"
        onClick={dismissMotd}
        aria-label="Dismiss mechanism of the day"
        className="text-ink-faint transition-colors hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

/**
 * One-time landing bootstrap: a `?m=` share link reconstructs the exact
 * mechanism; otherwise the date-seeded mechanism-of-the-day loads. Skipped
 * when something (a challenge start, an earlier visit) already loaded a
 * mechanism this session.
 */
function useShareBootstrap() {
  useEffect(() => {
    const store = useSimStore.getState();
    if (store.bootstrapped) return;
    const param = new URLSearchParams(window.location.search).get(SHARE_PARAM);
    const shared = param ? decodeShare(param) : null;
    if (shared) store.loadShared(shared);
    else store.loadMotd(mechanismOfTheDay());
  }, []);
}

export function Simulator() {
  useShareBootstrap();
  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0">
        <SimCanvas />
      </div>

      {/* Control column, right side; scrolls independently, capped on phones
          so the mechanism stays visible */}
      <div className="pointer-events-none absolute top-3 right-3 flex max-h-[55%] w-60 flex-col sm:bottom-3 sm:max-h-none sm:w-72">
        <div className="pointer-events-auto overflow-y-auto pr-0.5">
          <ControlsPanel />
        </div>
      </div>

      <div className="absolute top-3 left-3">
        <MotdChip />
      </div>

      <div className="absolute bottom-3 left-3">
        <StatusBar />
      </div>

      <div className="absolute bottom-3 right-80 hidden lg:block">
        <SheetStamp />
      </div>
    </div>
  );
}