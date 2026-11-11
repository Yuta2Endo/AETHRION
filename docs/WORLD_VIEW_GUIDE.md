# AETHRION — World View Guide

**Project:** AETHRION  
**Stage:** 09 — Rendering Engine & World View

This guide describes how to use the 3D World View and how it relates to the simulation.

## 1. Opening the World View

- The **World View** section appears in the main Dashboard (above the City Engine management sections). It renders the current, authoritative city simulation state.
- The sidebar navigation includes a **World View** entry (visual/navigation aid consistent with existing shell).

## 2. What you see

- **Districts:** five districts (Downtown, Industrial Zone, Research Park, Residential District, Energy District) shown as distinct ground areas with boundaries and color identity.
- **Plots:** all land plots in each district, colored/toned by status (available, owned, occupied, sold).
- **Buildings:** actual city buildings placed on their plots. Appearance reflects category and state:
  - **Constructing/planned:** reduced/incomplete form with construction progress indicator.
  - **Operational/completed:** finished form; subdued appearance can indicate infrastructure not satisfied (where applicable).
  - **Suspended:** visually subdued.
  - **Demolished:** removed from view.
- The view updates live as the simulation advances, and reflects restored state after save/load.

## 3. Camera controls

| Action | Desktop | Touch |
|--------|---------|-------|
| Orbit / rotate | Left-drag | One-finger drag |
| Pan | Right-drag (or modifier drag, per OrbitControls) | Two-finger drag |
| Zoom | Mouse wheel | Pinch |
| Reset camera | **Reset** button | **Reset** button |
| Focus selection | **Focus** button (when selected) | **Focus** button |
| Clear selection | **Clear** button | **Clear** button |

Zoom and camera movement are constrained to sensible bounds. The viewport prevents accidental page scrolling while interacting with the 3D canvas.

## 4. Selection and inspection

- Click/tap a **district**, **plot**, or **building** to select it. The selected object is highlighted.
- The **Inspector** panel shows read-only information from the actual simulation state (IDs, district/type/zoning/status, building category/status/progress/capacity/costs/infra satisfaction/assignments, etc., when available).
- If a value is not present in the engine state, it is omitted or shown as unavailable. No values are fabricated.
- Selection is read-only in Stage 09 and does not invoke gameplay commands.

## 5. Fallbacks and errors

- **WebGL unavailable:** a clear message is shown with a basic 2D/textual city overview using real simulation data. All existing city management controls remain available.
- **Rendering error / context loss:** an error message is shown in the viewport; the simulation continues running.
- **No city data:** an empty-state message is shown until city state is available.

## 6. Notes

- The World View visualizes simulation data; it never changes simulation rules or authoritative state.
- Visual placement is a deterministic mapping from stable district/plot identifiers (the simulation model has no 3D coordinates).
- Performance is tuned for mobile/Android constraints (capped pixel ratio, restrained effects). Actual Android device verification is documented separately in the stage report.