/**
 * Canvas 2D can't consume CSS variables, so the renderer reads the active
 * theme's tokens from the document root once per theme change.
 */

export interface Palette {
  gridMinor: string;
  gridMajor: string;
  gridAxis: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  accent: string;
  accentSoft: string;
  trace: string;
  traceGlow: string;
  linkFill: string;
  linkStroke: string;
  ground: string;
  warn: string;
  selection: string;
  panelBorder: string;
}

const VAR_MAP: Record<keyof Palette, string> = {
  gridMinor: "--grid-minor",
  gridMajor: "--grid-major",
  gridAxis: "--grid-axis",
  ink: "--ink",
  inkMuted: "--ink-muted",
  inkFaint: "--ink-faint",
  accent: "--accent",
  accentSoft: "--accent-soft",
  trace: "--trace",
  traceGlow: "--trace-glow",
  linkFill: "--link-fill",
  linkStroke: "--link-stroke",
  ground: "--ground",
  warn: "--warn",
  selection: "--selection",
  panelBorder: "--panel-border",
};

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<keyof Palette, string>;
  for (const key of Object.keys(VAR_MAP) as Array<keyof Palette>) {
    out[key] = cs.getPropertyValue(VAR_MAP[key]).trim();
  }
  return out;
}

export const MONO_FONT = '"IBM Plex Mono", ui-monospace, monospace';