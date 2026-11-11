# AETHRION — Rendering Architecture

**Project:** AETHRION  
**Stage:** 09 — Rendering Engine & World View

This document describes the Stage 09 rendering subsystem: boundaries, modules, lifecycle, simulation synchronization, and performance/fallback strategy.

## 1. Architectural boundaries

- **Simulation layer (authoritative):** owns all gameplay rules and city/building state (`src/simulation/**`, `src/game/**`). The rendering layer never mutates it.
- **Rendering layer (`src/rendering/**`):** owns Three.js scene/camera/renderer/materials/meshes, visual mapping, deterministic layout, selection picking, and lifecycle/cleanup. No gameplay rules, no React UI logic.
- **UI layer (`src/ui/**`):** React components, viewport container, controls, inspection panel, loading/error/WebGL fallback states. Uses read-only selectors/derived visual models.
- **Command layer (`src/game/commands/**`):** unchanged; remains the only entry point for player gameplay actions. Rendering interactions are read-only in Stage 09.

Three.js is used for visualization only. Simulation remains correct if WebGL is unavailable or the World View is unmounted.

## 2. Module structure

| Module | Responsibility |
|--------|----------------|
| `src/rendering/types/` | Rendering-only types (selection, layout, visual state, quality) |
| `src/rendering/adapters/cityLayout.ts` | Deterministic visual placement derived from stable district/plot IDs (no sim-state mutation) |
| `src/rendering/adapters/cityAdapter.ts` | Read-only mapping from authoritative `City` state to visual model |
| `src/rendering/city/palette.ts` | Visual identity mapping (district/category/status colors, height/opacity) |
| `src/rendering/city/CityWorld.ts` | Scene content: district grounds, plot tiles, procedural building meshes, incremental sync, selection highlight, resource disposal |
| `src/rendering/core/quality.ts` | WebGL detection and mobile-conscious render quality settings (DPR cap, antialias heuristic) |
| `src/rendering/core/WorldRenderer.ts` | Three.js renderer/camera/controls/render loop, resize/context/visibility handling, raycast selection, focus/reset, safe mount/unmount |
| `src/rendering/index.ts` | Public rendering API + legacy Stage 01 exports |
| `src/ui/screens/sections/WorldViewSection.tsx` | React integration: viewport, camera/focus controls, inspector panel, WebGL/error/empty fallback, live subscription |

Legacy placeholders under `src/rendering/three/*` and `WorldScene` are retained for compatibility.

## 3. Deterministic layout

The city simulation model has no 3D coordinates. `buildCityLayout` derives stable positions from existing identifiers:

- Districts placed by canonical district IDs (`downtown` center, industrial/research/residential/energy around it) with deterministic fallback ordering.
- Plots arranged in a fixed grid per district based on `district.plotIds` order/index.
- Same `City` input ⇒ same `CityLayout` every time.

## 4. Scene composition and building visualization

- **Districts:** ground planes + borders, distinct district colors, selectable grounds.
- **Plots:** tiles per plot reflecting status (`available/owned/occupied/sold`) and district identity; selectable.
- **Buildings:** procedural box-based meshes (shared/simple geometry patterns, reusable materials per instance as needed) with category-driven color/height, status-driven height/opacity (planned/constructing/completed/operational/suspended), construction progress indicator, and infrastructure-satisfaction visual cue (subdued when unsatisfied where applicable).
- **Selection:** ring/highlight and emissive emphasis for selected district/plot/building.

All visuals are derived from actual simulation data (districts, plots, buildings, statuses, progress, capacities, infra flags). Missing fields are omitted/unavailable in UI.

## 5. Camera and interaction

- **Controls:** `OrbitControls` (orbit/rotate, zoom, pan), damping, zoom/polar limits, target clamping to scene; `touch-action: none` on canvas to avoid accidental page scroll in viewport.
- **UI actions:** reset camera, focus selection, clear selection.
- **Selection:** raycast picking on pointer down → district/plot/building selection; React inspector shows read-only actual simulation data and supports focus/clear. No gameplay commands are invoked.

## 6. Synchronization model

- React subscribes narrowly to `selectCity` from Zustand. On change, `WorldRenderer.syncCity(city)` updates `CityWorld`.
- `CityWorld` performs **incremental synchronization** keyed by stable IDs and state keys (district/plot/building): unchanged objects are retained, changed objects are updated/recreated, removed/demolished objects are pruned.
- No full-scene rebuild per React render; no separate authoritative simulation copy in rendering. `sync(null)` clears visuals (empty state).
- Tolerates rapid updates, pause/resume, mount/unmount, repeated init, and save/load restores (restored store state drives fresh visual sync).

## 7. Lifecycle and safety

- `WorldRenderer`: creates renderer/camera/controls/lights once per mount, starts/stops rAF loop, resizes via `ResizeObserver`/window events, pauses render work when tab hidden, handles `webglcontextlost`, and disposes geometries/materials/controls/renderer/listeners on unmount.
- `CityWorld`: disposes created meshes/geometries/materials and clears pickables on clear/dispose.
- WebGL detection gates initialization; failures surface to UI error state without breaking simulation.

## 8. Performance strategy (Android-conscious)

- Procedural geometry and restrained materials; no heavy textures/post-processing by default.
- Capped device pixel ratio (quality heuristic based on cores/memory), antialias tuned, shadows disabled.
- Incremental updates to avoid unnecessary allocations/rebuilds; no object creation in render loop beyond controls damping update.
- Visibility-aware rendering (skip frames when hidden) and resize throttling via observer.
- Three.js split into separate build chunk (`vite` manualChunks) to keep app chunk smaller.

## 9. Fallback and accessibility

- If WebGL unsupported or init/render fails: clear fallback/error UI with basic 2D/textual city overview using real simulation data; existing management sections remain usable.
- Accessible labels/roles for viewport, toolbar, inspector; visible focus/controls; reduced-motion preference not specifically animated beyond restrained controls (damping minimal).

## 10. Known limitations

- No 3D coordinates in sim state; layout is deterministic visual mapping (documented).
- Procedural/simple geometry (not high-fidelity assets); no instanced mesh optimization for buildings in this initial pass.
- Raycast selection prioritizes intersected object; dense overlaps may favor building/plot depending on hit order.
- No gameplay actions from 3D selection (read-only inspection).
- Android device/WebView runtime and GPU performance not verified in this stage.
- Production build reports chunk size warnings (Three.js/vendor/app chunks); build succeeds.