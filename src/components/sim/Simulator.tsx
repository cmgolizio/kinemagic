"use client";

import dynamic from "next/dynamic";
import { TitleBlock } from "@/components/TitleBlock";
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
        <SheetStamp />
      </div>
    </div>
  );
}