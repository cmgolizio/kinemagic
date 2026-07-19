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

---

> **Note on missing entries:** Phases 2–5 shipped (see the commit history —
> canvas rendering + coupler trace, the six-mechanism library, control
> panel + motion analysis, and SVG/STL fabrication export) but their
> sessions did not append log entries here. The Phase 6 entry below picks
> the log back up; the gap is a bookkeeping hole, not a build one.

## 2026-07-19 — Phase 6 (sharing, mechanism-of-the-day & challenges)

**URL-encoded state — the whole save/share system, no backend:**

- `src/share/codec.ts` — versioned wire format (`{v: 1, m: …}` → JSON with
  short keys → base64url) in the `?m=` param, ~250 chars for a four-bar.
  Numbers round to 1e-4 (documented format behavior). Decoding
  zod-validates everything — types, enums, finite numbers, sane bounds,
  structural rules (mesh angles = gears − 1, slots ≥ 3, branch ∈ {±1}) —
  and returns `null` for anything mangled, so a hostile link can never
  produce NaN geometry. `watt`/`peaucellier` are separate wire types the
  store folds into its single straight-line slice.
- Store: `sliceToShare` / `loadShared` map slices ↔ wire form through the
  existing derive functions; a `bootstrapped` flag stops the landing-page
  bootstrap from clobbering explicit loads (challenge starts, earlier
  visits). Share panel button snapshots geometry + crank angle, syncs the
  address bar via `replaceState`, and copies the link (readonly-input
  fallback when the clipboard is blocked).
- Loading is graceful even off the happy path: out-of-range starting
  angles clamp through the solver (the Peaucellier MOTD entry carries an
  in-range angle for this reason — see motd.ts).

**Share card (`/api/og`)** — `next/og` `ImageResponse`, 1200×630: the
route decodes `?m=`, re-solves the mechanism server-side with the engine
(the solver being framework-free pays off here), and draws the coupler
curve + linkage skeleton + graph grid + an engineering title block as
inline SVG. Per-family rendering: four-bar/Watt skeleton at the shared θ,
slider-crank with block + stroke axis, Peaucellier cell, cam profile +
follower, gear pitch circles, Geneva wheel + slots + pin. Bad/absent
params fall back to the mechanism of the day. `generateMetadata` on `/`
awaits the Next 16 `searchParams` promise and points OG/Twitter images at
the route; `metadataBase` derives from the Vercel env. Shared cards cache
immutable (a given `m` never changes); the bare card caches short so the
daily mechanism rolls over.

**Mechanism-of-the-day** — `src/share/motd.ts`: 12 curated entries
(presets plus a couple of originals), picked by UTC day number modulo the
list, so everyone sees the same feature on a given day with zero
infrastructure. Lands as the default mechanism when no `?m=` is present,
with a dismissible title chip; any explicit load suppresses it.

**Challenges (`/learn`)** — four design-goal puzzles auto-graded live
against the store (the sim and the board share the Zustand store across
client navigation, so you tune on the sheet and watch verdicts flip):

1. *The straightaway* — trace a straight segment ≥ 60 mm within ±0.5 mm.
   Graded by `longestStraightRun`: two-pointer window over the decimated
   trace with a total-least-squares refit per step, wrap-aware on closed
   curves.
2. *Full circle* — turn a swaying triple-rocker into a full-rotation
   crank (live Grashof classification).
3. *Quick return* — time ratio ≥ 1.4 on a slider-crank.
   `quickReturnRatio` added to the engine (dead-center sweep asymmetry);
   tested against the collinearity closed form.
4. *The perfect line* (marquee) — ≥ 100 mm of exact line from the
   Peaucellier cell. Start uses stroke = 2·√((L+s)² − ((L²−s²)/2r)²) ≈
   70 mm near the fold; growing the crank opens it up.

Every start is verified by test to *fail* its own challenge (a puzzle,
not a gift) with a reachable fix. Solved stamps persist in localStorage
but require having loaded the challenge's starting point first — the
default kite trivially passing "full circle" earns nothing (caught in
browser verification; the live badge stays honest either way).

**Tests: 233 passing** (was 60 after P1; P2–P5 additions plus this
phase's codec round-trip/rejection suites, MOTD determinism, store ↔
share round-trip over the whole curated list, straight-run geometry
cases, and quick-return closed-form checks). Lint and `next build` clean.

**Acceptance verified (production build + headless Chromium):**

- Share URL rebuilds the exact mechanism on a cold load —
  screenshot-verified panel values (Chebyshev 125/50/125/100), badge, and
  curve; copy-link syncs `?m=` into the address bar.
- OG cards render for the daily mechanism, a shared `?m=`, and a garbage
  param (falls back to daily); PNGs eyeballed — curve, skeleton, grid,
  title block all present.
- MOTD chip shows on a bare landing, suppressed on share links.
- All four challenge cards grade live; wrong-mechanism handling works;
  the attempted-gate flow (pass-no-stamp → attempt → fail → solve →
  stamp → stamp survives reload) verified end-to-end.
- Known local-only noise: `/_vercel/insights/script.js` 404s off-Vercel
  by design (Phase 0 note). OG text uses satori's default font — IBM
  Plex in the card is a Phase 7 polish candidate.

**Next:** Phase 7 — education layer, landing polish, onboarding, a11y.
