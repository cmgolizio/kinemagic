"use client";

import { useMemo, useState } from "react";
import {
  billOfMaterials,
  curveToSvg,
  defaultFabSettings,
  extrudePart,
  fabricationPlan,
  layoutParts,
  meshesToBinaryStl,
  planMeshes,
  sheetToSvg,
  type FabSettings,
  type FabSource,
  type Vec2,
} from "@/engine";
import { Panel } from "@/components/ui/Panel";
import { Slider } from "@/components/ui/Slider";
import { mechMeta, sliceTrace, useSimStore, type MechSlice } from "@/store/simStore";

/**
 * Fabrication export: turn the tuned mechanism into parts you can cut or
 * print — a true-scale SVG cut sheet, watertight STLs, and the traced curve
 * itself — with a preview, bill of materials and pin schedule up front.
 */

function download(filename: string, data: string | ArrayBuffer, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What the active mechanism offers the exporter. */
function fabSourceOf(mech: MechSlice): FabSource | null {
  switch (mech.type) {
    case "fourbar":
      return { kind: "fourbar", config: mech.config };
    case "slidercrank":
      return { kind: "slidercrank", config: mech.config };
    case "straightline":
      return mech.variant === "watt"
        ? { kind: "fourbar", config: mech.watt }
        : { kind: "peaucellier", config: mech.peaucellier };
    default:
      return null;
  }
}

/** The exportable curve of the active mechanism, if it has one. */
function curveOf(mech: MechSlice): { points: Vec2[]; label: string; closed: boolean } | null {
  if (mech.type === "cam") {
    return mech.profile.length > 2
      ? { points: mech.profile, label: "cam profile", closed: true }
      : null;
  }
  const trace = sliceTrace(mech);
  if (!trace || trace.points.length < 2) return null;
  const label = mech.type === "straightline" ? "traced line" : "coupler curve";
  return { points: trace.points, label, closed: trace.closed };
}

function ExportButton({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex-1 border border-panel-border px-1.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}

export function ExportPanel() {
  const mech = useSimStore((s) => s.mech);
  const [settings, setSettings] = useState<FabSettings>(defaultFabSettings);
  const [labels, setLabels] = useState(true);
  const [partId, setPartId] = useState<string>("");

  const patch = (p: Partial<FabSettings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...p };
      // The end fillet can never exceed the bar's half-width.
      return { ...next, fillet: Math.min(next.fillet, next.barWidth / 2) };
    });

  const source = fabSourceOf(mech);
  const kind = source?.kind;
  const config = source?.config;
  // Config references are stable across drive ticks, so the plan (and the
  // preview SVG below) only recompute when geometry or settings change.
  const plan = useMemo(
    () =>
      kind && config
        ? fabricationPlan({ kind, config } as FabSource, settings)
        : null,
    [kind, config, settings],
  );
  const layout = useMemo(
    () => (plan ? layoutParts(plan.parts, settings.spacing) : null),
    [plan, settings.spacing],
  );
  const sheetSvg = useMemo(
    () =>
      plan && layout ? sheetToSvg(plan, settings, { labels, layout }) : null,
    [plan, layout, settings, labels],
  );
  const bom = useMemo(
    () => (plan ? billOfMaterials(plan, settings) : null),
    [plan, settings],
  );

  const curve = curveOf(mech);
  const meta = mechMeta(mech.type);
  const stem = `kinemagic-${plan?.mechanism ?? mech.type}`;

  const selectedPart =
    plan?.parts.find((p) => p.id === partId) ?? plan?.parts[0] ?? null;

  const downloadSheet = () => {
    if (plan && sheetSvg) download(`${stem}-links.svg`, sheetSvg, "image/svg+xml");
  };
  const downloadCurve = () => {
    if (!curve) return;
    const svg = curveToSvg(curve.points, curve.closed, {
      title: `${meta.label} — ${curve.label}`,
    });
    if (svg) download(`${stem}-curve.svg`, svg, "image/svg+xml");
  };
  const downloadStlSet = () => {
    if (!plan) return;
    const meshes = planMeshes(plan.parts, settings.thickness, settings.spacing);
    download(`${stem}-set.stl`, meshesToBinaryStl(meshes, stem), "model/stl");
  };
  const downloadStlPart = () => {
    if (!plan || !selectedPart) return;
    const mesh = extrudePart(selectedPart, settings.thickness);
    download(
      `${stem}-${selectedPart.id}.stl`,
      meshesToBinaryStl([mesh], `${stem}-${selectedPart.id}`),
      "model/stl",
    );
  };

  return (
    <Panel title="Fabricate" defaultOpen={false}>
      {!plan && (
        <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
          Link export covers pin-jointed linkages — four-bar, slider-crank and
          the straight-line cells. {meta.label} parts are profile work
          (teeth, cams, slots) rather than plain bars, so they are not
          exported{curve ? ", but the profile curve below is" : ""}.
        </p>
      )}

      {plan && (
        <>
          <Slider
            label="bar width"
            value={settings.barWidth}
            min={4}
            max={30}
            step={0.5}
            onChange={(v) => patch({ barWidth: v })}
          />
          <Slider
            label="pin ⌀ (M3 = 3)"
            value={settings.pinDia}
            min={1.5}
            max={8}
            step={0.5}
            onChange={(v) => patch({ pinDia: v })}
          />
          <Slider
            label="bore clearance"
            value={settings.clearance}
            min={0}
            max={1}
            step={0.05}
            precision={2}
            onChange={(v) => patch({ clearance: v })}
          />
          <Slider
            label="end fillet"
            value={settings.fillet}
            min={0}
            max={settings.barWidth / 2}
            step={0.5}
            onChange={(v) => patch({ fillet: v })}
          />
          <Slider
            label="thickness (print)"
            value={settings.thickness}
            min={1.5}
            max={12}
            step={0.5}
            onChange={(v) => patch({ thickness: v })}
          />
          <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
            Bores are cut at {bom!.boreDia.toFixed(2)} mm — pin ⌀ plus
            clearance — so parts assemble instead of binding.
          </p>

          {plan.warnings.map((w) => (
            <p
              key={w}
              className="font-mono text-[10px] leading-relaxed"
              style={{ color: "var(--warn)" }}
            >
              ⚠ {w}
            </p>
          ))}

          {/* Cut preview — exactly the file that downloads, on white like the sheet */}
          {sheetSvg && layout && (
            <figure className="flex flex-col gap-1">
              <div
                aria-label="Cut sheet preview"
                role="img"
                className="border border-panel-border bg-white p-1.5 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: sheetSvg }}
              />
              <figcaption className="font-mono text-[10px] text-ink-faint">
                sheet {layout.width.toFixed(0)} × {layout.height.toFixed(0)} mm
                — {bom!.partCount} parts, {bom!.holeCount} bores
              </figcaption>
            </figure>
          )}

          {/* Bill of materials */}
          <div className="flex flex-col gap-0.5 font-mono text-[10px] text-ink-muted">
            <span className="uppercase tracking-wider text-ink-faint">
              bill of materials
            </span>
            {bom!.rows.map((r) => (
              <span key={`${r.name}-${r.span}`} className="flex justify-between gap-2">
                <span>
                  {r.qty > 1 ? `${r.qty} × ` : ""}
                  {r.name}
                </span>
                <span className="text-ink">
                  {r.span.toFixed(1)} mm · {r.holes}⌀ · L{r.layer}
                </span>
              </span>
            ))}
            <span className="mt-1 uppercase tracking-wider text-ink-faint">
              pin schedule
            </span>
            {bom!.pins.map((p) => (
              <span key={p.joint} className="flex justify-between gap-2">
                <span>
                  {p.joint}: {p.parts.join(" + ")}
                </span>
                <span className="text-ink">{p.suggestion ?? "mount"}</span>
              </span>
            ))}
          </div>

          <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
            Stack-up: assemble by the L-numbers above — L0 against the base,
            each next level one washer up. Two parts sharing a pin on the same
            level need a spacer between them. Bolts thread last, nyloc or
            double-nutted so the joints stay free.
          </p>
          {plan.notes.map((n) => (
            <p key={n} className="font-mono text-[10px] leading-relaxed text-ink-faint">
              {n}
            </p>
          ))}

          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            <input
              type="checkbox"
              checked={labels}
              onChange={(e) => setLabels(e.target.checked)}
            />
            part labels on the sheet (blue = no-cut)
          </label>

          <div className="flex gap-2">
            <ExportButton
              onClick={downloadSheet}
              title="True-scale SVG cut sheet for laser, plotter or CNC — 1 unit = 1 mm"
            >
              cut sheet · svg
            </ExportButton>
            <ExportButton
              onClick={downloadStlSet}
              title="All parts as one watertight binary STL, laid out flat for the print bed"
            >
              print set · stl
            </ExportButton>
          </div>

          <div className="flex gap-2">
            <select
              aria-label="Single part to export as STL"
              value={selectedPart?.id ?? ""}
              onChange={(e) => setPartId(e.target.value)}
              className="min-w-0 flex-1 border border-panel-border bg-panel px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted focus:border-accent focus:outline-none"
            >
              {plan.parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.span.toFixed(0)} mm
                </option>
              ))}
            </select>
            <ExportButton onClick={downloadStlPart} title="Just this part as a binary STL">
              part · stl
            </ExportButton>
          </div>
        </>
      )}

      {curve && (
        <ExportButton
          onClick={downloadCurve}
          title="The traced curve as a true-scale SVG path — CNC a slot, plot it, frame it"
        >
          {curve.label} · svg
        </ExportButton>
      )}
    </Panel>
  );
}