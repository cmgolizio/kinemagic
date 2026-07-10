"use client";

import { useId } from "react";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Unit suffix shown next to the numeric entry, e.g. "mm" or "deg". */
  unit?: string;
  onChange: (value: number) => void;
}

/**
 * Range slider with a synced numeric entry and unit suffix — every mechanism
 * parameter is editable both by feel and by exact value.
 */
export function Slider({ label, value, min, max, step = 1, unit, onChange }: SliderProps) {
  const id = useId();
  const numberId = `${id}-num`;

  const commit = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    onChange(Math.min(max, Math.max(min, raw)));
  };

  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          {label}
        </label>
        <span className="flex items-baseline gap-1">
          <label htmlFor={numberId} className="sr-only">
            {label} (numeric entry{unit ? `, ${unit}` : ""})
          </label>
          <input
            id={numberId}
            type="number"
            inputMode="decimal"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => commit(e.target.valueAsNumber)}
            className="w-16 border border-surface-edge bg-ground px-1 py-0.5 text-right font-mono text-xs text-ink focus:border-accent focus:outline-none"
          />
          {unit && <span className="font-mono text-xs text-ink-muted">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => commit(e.target.valueAsNumber)}
        className="w-full accent-(--accent)"
      />
    </div>
  );
}