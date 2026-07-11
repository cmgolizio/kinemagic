"use client";

import { useId, useState } from "react";

/**
 * Slider + numeric entry pair. The range input is the coarse control, the
 * number field is the precise one; both stay in sync with the driven value.
 * Typing is buffered locally so half-typed numbers don't fight the store.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = "mm",
  precision = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  precision?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  // While the field is focused the local buffer wins; otherwise mirror the
  // driven value. Fully derived — no state-syncing effect needed.
  const display = editing ? text : value.toFixed(precision);

  const commitText = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setEditing(false);
  };

  return (
    <div className={disabled ? "opacity-45" : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="font-mono text-[11px] uppercase tracking-wider text-ink-muted"
        >
          {label}
        </label>
        <span className="flex items-baseline gap-1">
          <input
            type="number"
            aria-label={`${label} value`}
            className="w-16 border border-panel-border bg-transparent px-1 py-0.5 text-right text-xs text-ink focus:border-accent focus:outline-none"
            value={display}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onFocus={() => {
              setText(value.toFixed(precision));
              setEditing(true);
            }}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commitText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText((e.target as HTMLInputElement).value);
            }}
          />
          <span className="font-mono text-[10px] text-ink-faint">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="mt-1 w-full"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
    </div>
  );
}