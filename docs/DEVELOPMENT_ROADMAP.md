# AETHRION — Development Roadmap

**Project:** AETHRION  
**Stage:** 03 — Corporation & Employee Engines (current)  
**Status:** Stage 03 complete — Stage 04 awaiting user approval

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

## Completed — Stage 02: Game Core & Simulation Foundation

- **Game Core engine** rewritten: start / stop / pause / resume, controlled `step()`, idempotent start (no duplicate loops), deterministic system order, in-flight tick guard (no overlapping asynchronous ticks), per-frame tick cap (no uncontrolled catch-up), visibility-change handling, per-system error isolation, full resource cleanup.
- **Game Clock** rewritten as a tick-driven simulated clock: in-game date/time, configurable speed multipliers, pause/resume, UTC-derived dates, no dependency on the system clock.
- **Game state** reworked: simulation state separated from application state, controlled update actions, no domain logic inside Zustand, **localStorage persistence removed** (IndexedDB is a Stage 08 concern).
- **World Engine baseline**: five fictional regions with stable identifiers, four development indicators, tier model, deterministic evolution rules, invalid-state rejection.
- **Economy Engine baseline**: two currencies, four traded commodities, market prices, supply/demand indicators, deterministic price rules, numeric validation.
- **Simulation integration**: `SimulationRunner` binds engine + clock + state + world + economy with an explicit tick execution order.
- **Empire Dashboard** replaced the placeholder with a live simulation dashboard (empire overview, simulated date, status, speed, world regions, market prices and trends, start/pause/resume/stop and speed controls).
- **UI library** extended with `StatCard`, `IndicatorBar`, `TrendIndicator`, `MarketValue`.
- **Tests**: 85 passing (was 3) — engine, clock, world, economy, integration and component coverage.
- Documentation updated; `docs/STAGE_02_FINAL_REPORT.md` created.

**Still deferred to later stages (unchanged):** corporation creation and employee hiring (Stage 03), Web Worker integration (Stage 07), IndexedDB save/load (Stage 08).

---

## Completed — Stage 03: Corporation & Employee Engines

- **Corporation Engine**: creation with validation, a single player corporation, a flat six-department structure, a data-driven tier table, complete financial model (balance, revenue, operating expenses, payroll expenses, net profit), a bounded transaction ledger and bounded financial history.
- **Employee Engine**: employee model with skill, experience, salary, productivity, satisfaction, morale and employment status; five data-driven professions; deterministic hiring with department availability, capacity and funds checks; deterministic development model (experience, skill, satisfaction, morale, productivity) with a bounded development history.
- **Payroll model**: a fixed seven in-game day period derived from the simulated clock, at-most-once processing per period, a full payroll or a recorded miss — never partial payment and never created money.
- **Simulation integration**: the employee and corporation systems were added to the runner (orders 30 and 40), preserving the world → economy order; the workforce developed in a tick feeds the corporation in the same tick.
- **Command layer** (`src/game/commands.ts`): the single entry point for player actions — establish corporation, hire, dismiss. All validation errors are surfaced to the interface.
- **Game state**: `corporation` and `employees` slices added, typed selectors extended, still no persistence and no domain logic inside Zustand.
- **Interface**: Corporation Overview, Employee Management, Hiring and Finance Overview sections added to the dashboard; new primitives `TextField`, `SelectField`, `EmployeeRow`, `TransactionRow`; empty, error and success states.
- **Tests**: 170 passing (was 85) — corporation, employee, payroll, integration and interface coverage.
- Documentation updated; `docs/STAGE_03_FINAL_REPORT.md` created.

**Still deferred to later stages (unchanged):** technology tree, production and manufacturing (Stage 04), cities (Stage 05), events and competitor AI (Stage 06), Web Workers (Stage 07), IndexedDB save/load (Stage 08), Three.js world rendering (Stage 09).

---

## Stage 04: Technology & Production Engines (next — pending user approval)

- Technology tree, research progress, unlocks.
- Factories, products, manufacturing.
- Supply chains and logistics.
- Research and factory management screens.
- Connection of the corporate market signal to the Economy Engine.

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
