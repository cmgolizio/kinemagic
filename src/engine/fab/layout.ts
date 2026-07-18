/**
 * Cut-sheet layout: shelf-pack part bounding boxes onto a sheet with a
 * margin between parts. Parts keep their local orientation (hole axis along
 * X); rows wrap at a target sheet width chosen to keep the sheet roughly
 * square. All mm.
 */

import type { FabPart } from "./parts";

export interface Placement {
  part: FabPart;
  /** sheet position of the part's local origin (Y up, origin bottom-left) */
  x: number;
  y: number;
}

export interface SheetLayout {
  placements: Placement[];
  /** finished sheet size, mm (includes the outer margin) */
  width: number;
  height: number;
}

export function layoutParts(parts: FabPart[], spacing = 5): SheetLayout {
  const margin = spacing;
  const widths = parts.map((p) => p.bbox.max.x - p.bbox.min.x);
  const totalArea = parts.reduce(
    (acc, p, i) => acc + widths[i] * (p.bbox.max.y - p.bbox.min.y),
    0,
  );
  const maxW = Math.max(0, ...widths);
  // Aim square-ish, but never narrower than the widest part.
  const targetW = Math.max(maxW, Math.sqrt(totalArea) * 1.6);

  // Tallest-first keeps rows dense.
  const order = [...parts].sort(
    (a, b) => (b.bbox.max.y - b.bbox.min.y) - (a.bbox.max.y - a.bbox.min.y),
  );

  const placements: Placement[] = [];
  let cursorX = margin;
  let cursorY = margin;
  let rowH = 0;
  let sheetW = 0;

  for (const part of order) {
    const w = part.bbox.max.x - part.bbox.min.x;
    const h = part.bbox.max.y - part.bbox.min.y;
    if (cursorX > margin && cursorX + w > targetW) {
      cursorX = margin;
      cursorY += rowH + spacing;
      rowH = 0;
    }
    // Place so the part's bbox lands at (cursorX, cursorY).
    placements.push({
      part,
      x: cursorX - part.bbox.min.x,
      y: cursorY - part.bbox.min.y,
    });
    cursorX += w + spacing;
    rowH = Math.max(rowH, h);
    sheetW = Math.max(sheetW, cursorX - spacing + margin);
  }

  return {
    placements,
    width: sheetW,
    height: cursorY + rowH + margin,
  };
}