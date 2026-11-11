# AETHRION — Development Roadmap

**Project:** AETHRION  
**Stage:** 01 — Project Foundation & Architecture (current)  
**Status:** Stage 02 awaiting user approval

---

## Completed — Stage 01: Project Foundation & Architecture

- Project initialized with target stack (Capacitor, React 19, TypeScript, Vite, Three.js, Zustand, Framer Motion, Phosphor Icons, Web Workers/Comlink, IndexedDB/idb, Vitest, Playwright).
- Directory structure created per architecture.
- Branded application shell (dark theme, navigation, responsive layout).
- Loading screen + dashboard placeholder (no fake gameplay).
- Centralized design tokens (CSS + JS).
- Centralized error handling + logging + env config.
- Typed interfaces for all 15 planned modules.
- TypeScript, ESLint, Vitest, Playwright configured.
- Production build validated.
- All stage documentation created.

---

## Stage 02: Game Core & Simulation Foundation (next — pending user approval)

Scope is limited to the simulation backbone. Business gameplay systems are explicitly out of scope for this stage.

- Game Core engine: game loop, tick scheduling, pause/resume, deterministic tick order.
- Game clock integration (simulated time, speed control) wired into the engine.
- Game state store (separate from application state) with typed selectors.
- World Engine baseline: regions, world state evolution.
- Economy Engine baseline: markets, currencies, pricing.
- React screens bound to game state (empire overview dashboard replacing the placeholder).
- Expand the UI component library with real data bindings.
- Unit tests for game core, clock and simulation modules.

**Explicitly NOT in Stage 02:** corporation creation, employee hiring, Web Worker integration, IndexedDB save/load. These are scheduled in Stages 03, 07 and 08 respectively.

---

## Stage 03: Corporation & Employee Engines

- Corporation creation and corporate structure.
- Employee hiring, roles, salaries, performance.
- Employee Engine ↔ Corporation Engine integration.
- Player-facing corporation management screens.

---

## Stage 04: Technology & Production Engines

- Technology tree, research progress, unlocks.
- Factories, products, manufacturing.
- Supply chains and logistics.
- Research and factory management screens.

---

## Stage 05: City Engine

- Cities, buildings, urban development.
- City ↔ Corporation ↔ Economy integration.
- City development screens.

---

## Stage 06: Events & Competitor AI Engines

- World events, news feed, dynamic scenario triggers.
- AI corporations and competitive behaviour.
- Market competition and reaction to player actions.

---

## Stage 07: Performance & Web Workers

- Off-main-thread simulation ticks via Web Workers + Comlink.
- Simulation cost profiling and optimisation.
- Worker fallback for unsupported environments.

---

## Stage 08: Save & Archive Engine

- IndexedDB persistence wiring (`src/services/persistence/indexedDB.ts`).
- Save slots, named saves, archives.
- Autosave and restore flow, save/load UI.

---

## Stage 09: Rendering Engine / World View

- Three.js world view (scenes, cameras, materials, lighting) driven by simulation state.
- Empire visualisation, region rendering, interactive camera.
- Rendering ↔ simulation boundary hardening (render-only guarantee).

---

## Stage 10: Android Native Integration & Monetization

- Android SDK setup and native project generation (`npx cap add android`).
- Google Play Billing integration.
- Google AdMob integration.
- Release build configuration for Google Play.

---

## Stage 11+: Polish & Commercial Release

- Balance pass, performance tuning, accessibility.
- Localization, store assets, privacy policy, age rating.
- Play Store submission preparation.

---

## Rules (all stages)

- No monetization before gameplay foundations exist.
- No production deployment.
- No secrets or credentials committed.
- Strict TypeScript; rendering and simulation independent.
- Each stage ends with a verified build, passing type checks, lint and tests, plus updated documentation.
