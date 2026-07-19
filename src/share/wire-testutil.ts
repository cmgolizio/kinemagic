/** Test helper: the wire format's documented 1e-4 rounding, for comparisons. */
export function roundedForWire<T>(value: T): T {
  if (typeof value === "number") return (Math.round(value * 1e4) / 1e4) as T;
  if (Array.isArray(value)) return value.map(roundedForWire) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = roundedForWire(v);
    return out as T;
  }
  return value;
}
