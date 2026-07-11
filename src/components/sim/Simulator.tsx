"use client";

import dynamic from "next/dynamic";
import { TitleBlock } from "@/components/TitleBlock";
import { ControlsPanel } from "./ControlsPanel";
import { StatusBar } from "./StatusBar";

// The canvas layer is browser-only; skip SSR for it.
const SimCanvas = dynamic(
  () => import("./SimCanvas").then((m) => m.SimCanvas),
  { ssr: false },
);

export function Simulator() {
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

      <div className="absolute bottom-3 left-3">
        <StatusBar />
      </div>

      <div className="absolute bottom-3 right-80 hidden lg:block">
        <TitleBlock sheet="001 — four-bar linkage" />
      </div>
    </div>
  );
}