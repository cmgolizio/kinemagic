# Mechanism Simulator — Full Build Plan

A browser-based, physics-accurate planar mechanism simulator. Place and drag the joints of a four-bar linkage (and other mechanisms), drive the crank, and watch coupler curves trace in real time as link lengths re-solve live. Tune a mechanism you like, then **export it to fabricate** — laser-ready SVG or a 3D-printable STL with pivot holes placed. The bridge from browser-designed motion to a part you hold in your hand is the whole point.

New repo. TypeScript, Next.js App Router, Tailwind v4. Client-heavy; no backend required for v1 (state travels in the URL).

## Locked decisions

- **Stack**: Next.js App Router + TypeScript (strict) + Tailwind v4. Simulation is entirely client-side.
- **Kinematics is a standalone, framework-free module.** Pure TS math with zero React/DOM imports, fully unit-tested, before any rendering exists. This is the product's spine — if the solver is wrong, nothing else matters.
- **Rendering**: Canvas 2D for the simulation surface (handles thousands of trace points at 60fps; SVG chokes on long coupler paths). A parallel SVG *serializer* exists purely for export — the same geometry, drawn to SVG on demand. Do NOT render the live sim in SVG.
- **No accounts, no database in v1.** A mechanism's entire definition (type, link lengths, coupler point, joint positions) encodes into the URL. Sharing = copying a link. Backend/gallery is deferred and optional.
- **Aesthetic**: engineering-drawing / drafting-table. Graph-paper ground, blueprint or clean-white theme toggle, dimension lines, monospace annotations, joint pins that read as real hardware. Precise, not skeuomorphic-kitsch.
- **Fabrication export is a v1 headline feature, not backlog.** SVG (laser/plotter) and STL (3D print) both ship in v1.
- **Units are real.** The user works in millimeters; the sim is dimensionally honest so exports are physically correct.
- **State**: a single simulation store (Zustand — the sim state is genuinely shared across canvas, control panel, export, and URL sync, so context prop-drilling would hurt here). This is the one project where reaching for Zustand up front is correct.

---

## Phase 0 — Scaffold & Drafting-Table Design System

**Objective**: Empty repo → deployable themed shell.

Tasks:
1. `create-next-app`: TypeScript, App Router, Tailwind v4, ESLint, `src/`, `@/*` alias, strict TS.
2. Install: `zustand zod @vercel/analytics`. (No sim/rendering libs — the engine is hand-rolled. A math micro-helper like `gl-matrix` is optional and only if it earns its place.)
3. Design tokens (`@theme`):
   - Two themes: **Blueprint** (deep cyan-blue ground, white/cyan lines, classic drafting) and **Draft** (warm graph-paper white, graphite lines). Toggle persists in localStorage.
   - Type: a technical mono (IBM Plex Mono / JetBrains Mono) for dimensions, coordinates, and labels; a clean sans for prose.
   - Reusable visual language: dimension lines with arrowheads and offset extension lines, angle arcs, joint-pin component (fixed pivot = hatched ground triangle; moving pin = filled circle with bore), link component (rounded capsule bar).
4. UI primitives: `<DimensionLine>`, `<AngleArc>`, `<JointPin>`, `<Slider>` (with numeric entry + unit), `<Panel>` (collapsible drafting-panel styling), `<ThemeToggle>`.
5. Layout: header (project title as a title-block stamp, bottom-right like a real engineering drawing), main sim area, side control panel. Routes stubbed: `/` (the simulator), `/learn`, `/gallery` (deferred, stub only).
6. Vercel + Analytics wired.

Acceptance: deploys; both themes render; graph-paper ground draws crisply at all zoom levels (see Phase 2 for pan/zoom); Lighthouse a11y ≥ 95 on shell.

---

## Phase 1 — Kinematics Engine (pure TS, no rendering)

**Objective**: A correct, tested solver module (`src/engine/`) that knows nothing about React or canvas. Everything downstream depends on this being right.

Core: the **four-bar linkage** solver.

Setup and conventions:
- Ground pivot O2 (crank/input pivot) at a defined point; ground pivot O4 (output/rocker pivot) at distance `groundLen` from O2. Store both in world coords so the mechanism can be positioned/rotated freely.
- Links: `crankLen` (r2, input), `couplerLen` (r3), `rockerLen` (r4), `groundLen` (r1).
- **Forward solve** given input angle θ2:
  1. Crank end `A = O2 + crankLen · (cos θ2, sin θ2)`.
  2. Coupler-rocker joint `B` satisfies `|B − A| = couplerLen` and `|B − O4| = rockerLen` → **circle–circle intersection** (two solutions in general).
  3. **Branch consistency**: the two intersections are the "open" and "crossed" assemblies. Pick a branch and hold it across frames — switching branches mid-rotation is the classic bug that makes linkages "snap." Track the chosen branch in state; on each solve pick the intersection matching the previous B (nearest-point continuation), not a fixed formula.
  4. Handle the **no-intersection case** (circles too far apart / contained): the mechanism cannot reach that input angle. Return a well-typed "unreachable" result so the UI can show valid input ranges (a non-Grashof rocker only sways within limits; don't crash or NaN).
- **Coupler point P**: a point rigidly fixed to the coupler link, defined in the coupler's local frame as `(couplerPointU, couplerPointV)` — distance along A→B and perpendicular offset. Transform into world coords each frame. This point traces the **coupler curve**; the perpendicular offset is what makes the curves interesting (a point on line AB traces boring arcs).
- **Grashof classification**: given the four lengths, compute shortest `s`, longest `l`, other two `p,q`. Grashof condition `s + l ≤ p + q`. Classify: crank-rocker, double-crank (drag-link), double-rocker, and the change-point/special cases. Expose which link can fully rotate — this drives whether the input crank is a full 360° driver or a limited-range rocker.

Also implement (same module, same rigor):
- **Slider-crank** solver (crank + coupler + a slider constrained to a line with optional offset) — piston motion. Solve slider position from crank angle.
- A generic **circle–circle** and **line–circle** intersection helper (shared, tested independently).

Testing (Vitest):
- Known four-bar configurations with hand-verified joint positions.
- Grashof classification against textbook examples.
- Branch continuity: sweep θ2 through 360° on a crank-rocker and assert B never jumps discontinuously.
- Slider-crank against the closed-form piston equation.
- Degenerate/unreachable inputs return typed results, never NaN.

Acceptance: `npm test` green; sweeping the input angle produces smooth, continuous joint tracks; a scripted dump of a four-bar's coupler curve matches an expected reference set of points.

---

## Phase 2 — Rendering, Drive & the Coupler Trace

**Objective**: Make the engine visible and interactive. This is where it becomes mesmerizing.

Tasks:
1. **Canvas surface** with pan (drag background) and zoom (wheel/pinch), a world↔screen transform, and the graph-paper grid drawn in world space (grid stays put as you pan; minor/major lines; origin marker). Grid spacing labeled in mm.
2. **Draw the mechanism**: ground pivots as hatched fixed supports, links as capsule bars with visible pivot bores, moving joints as pins. Ground link drawn faintly (it's the frame). Clean, legible, dimensioned on hover.
3. **Drive loop**: a play/pause "motor" that advances θ2 at an adjustable speed (deg/s), plus a scrubber to set the angle by hand. `requestAnimationFrame`, decoupled from solve rate; solve is cheap so this is trivially 60fps.
4. **Coupler trace**: as the crank turns, accumulate the coupler point P into a path and draw the full closed coupler curve. Persistent trace (the whole loop) with the live point riding along it. This is the hero visual — make it beautiful (subtle glow/gradient along the path, fade older segments optionally).
5. **Direct manipulation**: drag any joint or ground pivot to change the geometry; the link lengths recompute from the dragged positions and the whole thing re-solves live. Dragging the coupler point moves P in the coupler frame and the trace redraws instantly. This "grab it and watch the curve morph" interaction is the thing people will play with for minutes.
6. **Invalid-geometry feedback**: when lengths can't assemble (or a rocker's input is driven past its limit), show the reachable range visually — ghost the unreachable arc, clamp the driver, annotate limits — rather than snapping or blanking.
7. Zustand store holds: mechanism definition, current angle, branch, drive state, view transform, selected element.

Acceptance: 60fps with a full coupler trace on a mid laptop and a phone; dragging any joint re-solves with no snap/flicker; the crank-rocker vs. drag-link distinction is visibly correct when you change lengths.

---

## Phase 3 — The Mechanism Library

**Objective**: Breadth. Each is a real solver + renderer, selectable from a mechanism menu, each with a sensible default and a short "what it's for" blurb.

Ship these:
1. **Four-bar** (done) — with a preset drawer of famous coupler curves (e.g. a figure-eight, a straight-ish segment, a D-curve).
2. **Slider-crank** (solver done in P1) — render the slider/track and connecting rod; the piston-motion classic. Toggle offset (in-line vs. offset slider-crank).
3. **Cam & follower**: define a cam profile (circular-arc, then a parametric rise-dwell-fall via simple motion laws), rotate it, and solve follower displacement; plot the follower's displacement diagram alongside. Support flat-face and roller followers.
4. **Gear train**: 2–3 meshing spur gears with correct radii ratios; visualize rotation direction and speed ratio; annotate the gear ratio. (Involute-tooth *rendering* can be schematic in v1; the *kinematics* — ratios, directions — must be exact.)
5. **Geneva drive**: the intermittent-motion mechanism; driver pin engaging the slotted wheel, correct dwell/index behavior. Genuinely satisfying to watch and rare to see done well.
6. **Straight-line linkages**: Watt's linkage (approximate straight line) and **Peaucellier–Lipkin** (exact straight line). These are the "wow, a rotating linkage produces a perfectly straight line" showpieces and set up the Phase 6 challenge.

Each mechanism: its own solver file under `src/engine/mechanisms/`, unit-tested against known behavior (gear ratios exact, Geneva index angle correct, Peaucellier traces a straight line within tolerance).

Acceptance: all six selectable and animating; each has a default that looks good immediately; Peaucellier's output point deviates from a true line by < tolerance across its range.

---

## Phase 4 — Control Panel & Motion Analysis

**Objective**: Precise tuning, plus the analysis layer that signals real engineering depth.

Tasks:
1. **Parameter panel**: sliders + numeric mm entry for every length/offset/angle of the active mechanism, live-linked to the sim. Grashof status shown as a live badge ("Crank-rocker — crank fully rotates").
2. **Presets**: curated starting mechanisms per type; "randomize (valid)" that only produces assemblable geometry.
3. **Motion analysis** (the depth flex): for the driven mechanism, plot output **position, velocity, and acceleration** vs. crank angle (numerical differentiation of the solve across a full cycle). For the four-bar, also show the **transmission angle** and flag when it enters a poor range (near 0/180°, where the mechanism binds) — this is exactly the kind of detail a mechanical engineer notices and a typical web dev has never heard of.
4. **Measure tools**: click two joints for a live dimension; show the coupler point's coordinates and the curve's bounding box.
5. **Snapshot compare**: pin the current coupler curve as a ghost, tweak lengths, and see the new curve overlaid on the old — instant visual feedback on how a length change reshapes the motion.

Acceptance: velocity/acceleration plots update live and are smooth; transmission-angle warning fires on a deliberately bad four-bar; numeric entry and sliders stay in sync.

---

## Phase 5 — Fabrication Export (headline feature)

**Objective**: Turn on-screen motion into a physical part. This is the most on-brand feature in the project and the one a maker audience shares.

Tasks:
1. **SVG export** (laser/plotter/CNC): serialize the *links* (not the animation) as real geometry — each link a rounded bar sized to its length, with correctly placed pivot **bore holes** at each joint. User sets bar width, hole diameter (for a chosen pin/bolt, e.g. M3), and end fillet radius. Output true-to-scale in mm, one link per outline (or nested on a sheet), ready to cut. Include the ground link and a suggested pin schedule.
2. **STL export** (3D print): extrude those same link outlines to a set thickness → watertight mesh; write binary STL. Holes become through-bores. Offer per-link files or a printable set. Keep the mesher simple and correct (triangulate the filleted bar with holes; verify manifold/watertight). No CAD kernel needed — the geometry is simple 2D-extruded shapes.
3. **Pin/clearance settings**: global hole clearance so printed/cut parts actually assemble (e.g. +0.2mm on bores); a note on layer stack-up for a working printed linkage (links on different Z-levels + spacers/pins).
4. **Print/cut preview**: show the flat layout with dimensions and a bill of materials (link count, hole count, suggested fasteners) before download.
5. **Export the coupler curve itself** as an SVG path — useful for those who want the *curve* (e.g. to CNC a slot or make art).

Acceptance: an exported four-bar's SVG, measured in a vector editor, matches the on-screen mm dimensions exactly; an exported STL opens watertight in a slicer; the clearance setting visibly changes bore diameter. (Bonus validation: actually print a linkage and confirm it articulates — the ultimate portfolio proof shot.)

---

## Phase 6 — Sharing, Mechanism-of-the-Day & Challenges

**Objective**: Retention and shareability with no backend.

Tasks:
1. **URL-encoded state**: full mechanism definition serializes to a compact, versioned URL param (zod-validated on load, with a version tag so future format changes don't break old links). Copy-link button. Loading a link reconstructs the exact mechanism. This is the entire "gallery/save" system for v1 — free, permanent, no DB.
2. **Share card**: `next/og` route renders a mechanism's coupler curve + title-block as an OG image so shared links unfurl beautifully in Slack/Discord/Twitter.
3. **Mechanism-of-the-day**: a curated, date-seeded mechanism (from a static list in the repo) featured on the landing page — a reason to return, zero infrastructure.
4. **Challenges** (`/learn` ties in): design-goal puzzles with automatic checking, e.g. *"make the coupler point trace a straight segment ≥ 60mm long"* (check deviation-from-line tolerance), *"achieve a full-rotation crank"* (Grashof check), *"get a quick-return ratio ≥ 1.4"* (slider-crank timing). Auto-graded against the live geometry. The Peaucellier straight-line challenge is the marquee one.

Acceptance: a shared URL perfectly reconstructs a tuned mechanism on another device; OG cards render; at least three auto-graded challenges pass/fail correctly.

---

## Phase 7 — Education Layer, Landing & Polish

**Objective**: Everything around the sim that makes it a showcase rather than a tech demo.

Tasks:
1. **Landing (`/`)**: the simulator *is* the landing page — land straight into a beautiful, already-animating four-bar (the mechanism-of-the-day), with an unobtrusive intro overlay ("Drag a joint. Watch the curve.") that dismisses on first interaction. No marketing wall between the visitor and the toy.
2. **Learn section (`/learn`)**: short, interactive explainers — "what is a four-bar," "why coupler curves," "Grashof in one paragraph," "how a Geneva drive indexes," each with a live embedded mini-sim. This is where the teardown-explainer instinct lands. Keep it tight and visual.
3. **Onboarding**: a 3-step first-run coach-mark tour (drag joint → hit play → export), skippable, shown once.
4. **Motion polish**: ease the drive, tasteful trace rendering, satisfying joint-drag feel, `prefers-reduced-motion` respected (auto-drive off, no trace animation — show the static curve instead).
5. **A11y**: full keyboard control (select joint, nudge with arrows, numeric entry for everything), ARIA on controls, contrast verified on both themes (blueprint cyan-on-blue is a contrast trap — check every pair).
6. **README + case study**: architecture notes (framework-free solver, branch-continuity handling, transmission-angle analysis, browser→STL pipeline), a demo GIF of a coupler curve morphing and an export→print shot. People will read this repo; make the hard parts legible.

Acceptance: a first-time visitor understands what to do within seconds; `/learn` mini-sims all run; reduced-motion path is fully usable; README tells the engineering story.

---

## Phase 8 — Hardening & Launch

1. **Testing**: Vitest across all solvers (this is a math app — the test suite is the credibility); Playwright smoke for load-from-URL, drive, export-downloads-a-file, challenge-grading.
2. **Perf**: dynamic-import the canvas layer; verify 60fps on a mid phone with a full trace + live plots; cap trace point count with decimation on very slow mechanisms.
3. **Cross-device**: pointer + touch + pen; pinch-zoom; export downloads work on mobile browsers.
4. **Numerical robustness pass**: hammer degenerate geometries (zero-length links, coincident pivots, exactly-change-point Grashof) and confirm graceful handling everywhere.
5. **SEO/meta/OG**, sitemap, custom domain.
6. Launch checklist: both themes verified, all six mechanisms shipping, SVG+STL exports validated against a ruler and a slicer, at least one physically fabricated proof shot in the README.

---

## Deferred backlog (post-v1)

- **Optional Supabase gallery**: opt-in public mechanism gallery with likes (URL-state means the data is tiny — just store the encoded string + a title). Adds a light moderation surface, hence deferred.
- **Six-bar and geared five-bar** linkages (more exotic coupler curves).
- **Path synthesis** (the hard, flashy one): "draw a target curve, and the tool searches link lengths whose coupler curve best matches it" — inverse design. Genuinely research-grade; a standout v2 headline.
- **Force/torque analysis**: input torque needed across the cycle, mechanical advantage.
- **Belt/pulley and chain-sprocket** systems.
- **Assembly animation export**: an animated GIF/MP4 of the mechanism cycling, for embedding elsewhere.
- **Fusion 360 round-trip**: export parameters your CAD pipeline can consume — closes the loop to your existing toolchain.

## Build order & sizing

Strictly sequential through Phase 2 (nothing renders until the engine is right). After Phase 2, Phase 3 (more mechanisms) and Phase 5 (export) can run in parallel branches — export only needs link geometry, which the four-bar already provides. Rough sizing with Claude Code: P0 half a day; **P1 a full day and worth every hour — do not rush the solver**; P2 two days (the interaction/trace polish is the magic); P3 two to three days (one mechanism at a time); P4 a day and a half; P5 two days (STL meshing is the fiddly part); P6 a day; P7 two days; P8 a day. ~2 weeks focused part-time.

## Session strategy (same as before)

One Claude Code session per phase (P0+P1 can pair; P3 is naturally several sub-sessions, one per mechanism). Keep this file at `docs/mechanism-simulator-plan.md`, a `CLAUDE.md` at root pointing to it, and a `docs/build-log.md` the sessions append to. Verify each phase's acceptance criteria yourself before starting the next — and for this project, **run the test suite as the gate on Phases 1 and 3**, since correctness is invisible until something moves wrong.

---

## Open forks (I made the call; flip freely)

1. **Theme default** — I set Blueprint as default, Draft as toggle. Pure taste.
2. **gl-matrix vs. hand-rolled vec math** — I lean hand-rolled (the math is small, and a dependency-free engine reads better in a portfolio). If you'd rather move fast, gl-matrix is fine.
3. **Cam profile authoring depth** — v1 does circular + parametric rise-dwell-fall. Full spline-drawn cam profiles are a natural stretch; I left them at "parametric" to bound scope. Easy to expand.
4. **STL now vs. fast-follow** — it's in v1 as a headline, but it's the single fiddliest phase. If you want to launch sooner, SVG-only at launch with STL as the first post-launch drop is a clean split. I kept both in v1 because "export and print it" is the story.
