# Build log

Sessions append an entry per phase. Verify the previous phase's acceptance
criteria before starting the next — run `npm test` as the gate on Phases 1
and 3.

## 2026-07-07 — Phase 0 (scaffold & design system) + Phase 1 (kinematics engine)

**Phase 1 — `src/engine/` (built first; the shell renders through it):**

- `vec2.ts` — hand-rolled 2D vector math (no gl-matrix; dependency-free engine).
- `intersections.ts` — shared circle–circle and line–circle helpers, every
  degenerate case typed (`separate`/`contained`/`coincident`/`miss`), never NaN.
- `fourbar.ts` — forward solve at θ₂ with **branch continuity** via
  nearest-point continuation from the previous B (`open`/`crossed`
  assemblies), typed `unreachable`/`degenerate` failures, coupler point in
  the coupler frame (u along A→B, v perpendicular), transmission angle,
  **Grashof classification** (crank-rocker / double-crank /
  Grashof-double-rocker / change-point / triple-rocker / non-assemblable),
  reachable-input-range computation, and `traceCouplerCurve` sweep.
- `slidercrank.ts` — slider on an arbitrary world axis with perpendicular
  offset, branch + continuity via `prevT`, stroke extremes helper.
- Tests: 60 Vitest cases — exact hand-computed poses, an independent
  law-of-cosines reference solver cross-checking every 3° on both branches,
  a frozen coupler-curve reference dump, branch-continuity sweeps (no jump
  > 5 mm at 0.5° steps; closure after 360°), Grashof textbook cases,
  > slider-crank vs. the closed-form piston equation, and degenerate-input
  > sweeps asserting typed results with no NaN.

**Phase 0 — scaffold & drafting-table design system:**

- Deps: `zustand`, `zod`, `@vercel/analytics` (wired in root layout),
  `vitest` (dev). Next.js 16 App Router + Tailwind v4 + strict TS scaffold
  was already committed.
- Themes: **Blueprint** (default, deep cyan-blue / white-cyan linework) and
  **Draft** (warm paper / graphite) as semantic `@theme` tokens on
  `html[data-theme]`; persisted to localStorage and applied pre-paint by an
  inline script (no flash, no hydration mismatch). Fonts: IBM Plex Mono
  (dimensions/labels) + IBM Plex Sans (prose) via `next/font`.
- Primitives: `<DimensionLine>` (extension lines, arrowheads, upright mono
  label), `<AngleArc>`, `<JointPin>` (fixed = hatched ground triangle,
  moving = pin with bore), `<LinkBar>` (rounded capsule with bores),
  `<Slider>` (range + numeric entry + unit), `<Panel>` (collapsible),
  `<ThemeToggle>`, `<TitleBlock>` (engineering title block, stamped
  bottom-right of the sheet).
- Shell: header nav (Simulator / Learn / Gallery), `/learn` and `/gallery`
  stubs, and a Phase 0 simulator page — a statically solved four-bar drawn
  with the primitives on a 5 mm/25 mm world grid, scrubbable θ₂, live link
  lengths and coupler point, Grashof badge, reachable-range note, and the
  full coupler curve. Phase 2 replaces the SVG preview with the live canvas
  surface; the control wiring and visual language carry forward.

**Acceptance verified:**

- `npm test` — 60/60 green; `npm run build` and `npm run lint` clean.
- Both themes render (screenshot-verified); toggle persists across reload.
- Lighthouse accessibility **100** on `/`, `/learn`, `/gallery`.
- Unreachable input shows a typed annotation + valid range instead of
  crashing (screenshot-verified with crank 100 mm @ θ₂ = 180°).
- Grid is SVG world-space (mm-true), crisp; full pan/zoom lands in Phase 2.
- Not done here: Vercel project creation/deploy — the repo is
  deploy-ready (`@vercel/analytics` renders in the layout; the script 404s
  locally by design and activates on the Vercel platform).

**Next:** Phase 2 — canvas surface, pan/zoom, drive loop, drag-to-edit,
persistent trace, Zustand store.
