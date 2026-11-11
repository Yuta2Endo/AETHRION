# AETHRION — Development Roadmap

**Project:** AETHRION  
**Stage:** 05 — City Engine (current)  
**Status:** Stage 05 complete — Stage 06 awaiting user approval

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

## Completed — Stage 04: Technology & Production Engines

- **Technology Research Engine**: a data-driven tree of 20 technologies in six categories, prerequisites, tier gating, research projects with a deterministic contribution model driven by the Stage 03 workforce, unlock effects (production efficiency, research speed, quality, market reach, resource yield), cancellation and a bounded research history.
- **Product Development Engine**: six data-driven product blueprints, technology prerequisites, development projects with a deterministic contribution model (engineers 100 %, researchers 70 %), a transparent quality formula, innovation and market readiness.
- **Resource & Supply Chain**: eight resources priced from the live market, an inventory with balances, reservations and a bounded ledger, and fully atomic purchase / reserve / release / consume operations — a failed operation never partially consumes resources.
- **Production Engine**: four facility types with capability checks, production orders with resource reservation, effective efficiency from the assigned workforce, deterministic duration and operating cost, completion into the product inventory and cancellation that releases the reservation.
- **Market Integration**: demand from the commercial activity, quality, price and the unlocked market reach; inventory-limited sales; batched sale transactions; and the `CorporateMarketSignal` now consumed by the Economy Engine.
- **Simulation integration**: the tick order grew to nine systems (world → economy → employees → technology → products → resources → production → market → corporation) while preserving the Stage 02 world → economy dependency.
- **Command layer** split into a focused module per domain — 16 validated player commands in total, every one returning a typed result and leaving the state unchanged on failure.
- **Interface**: Technology & Research, Product Development, Resource Inventory, Manufacturing and Products & Market sections; the finance overview extended with the research, development, resource, manufacturing and sales figures.
- **Tests**: 285 passing (was 170) — including an end-to-end test of the complete economic chain.
- Documentation updated; `docs/ENGINE_RULES.md` and `docs/STAGE_04_FINAL_REPORT.md` created.

**Still deferred to later stages (unchanged):** cities (Stage 05), events and competitor AI (Stage 06), Web Workers (Stage 07), IndexedDB save/load (Stage 08), Three.js world rendering (Stage 09).

---

## Completed — Stage 05: City Engine & Urban Infrastructure

- **City Engine**: one city with five districts (Downtown, Industrial Zone, Research Park, Residential District, Energy District), a finite land map of thirty plots, a data-driven catalogue of thirteen building definitions, a deterministic construction lifecycle, four urban infrastructure networks, an aggregate population and labour model and five bounded urban indicators.
- **Land & construction**: plots are bought and sold through the corporate ledger, the zoning and the district type are two independent restrictions, an occupied plot can neither be sold nor reused, a construction completes exactly once, a cancellation is a documented sunk cost and a demolition releases the plot.
- **Infrastructure**: the capacity (municipal baseline + providers) and the demand (consumers) are aggregated city wide. The weakest network defines the service level; below 25 % the buildings shut down, below 100 % their output is reduced. The operational status therefore responds to a shortage.
- **Population & employment**: the population converges towards the housing capacity, is capped by it at all times, and the unemployment can never become negative. The Employee Engine stays the only authority for the corporate employees — the city only stores references.
- **Corporation integration**: the city has no treasury of its own. The land and the construction are `city` transactions, the disposal is a `city-sale` transaction, and the operating cost of the running buildings is accrued into the operating expenses of the corporation, so expansion has a running price.
- **Economy integration**: the new `CityMarketSignal` raises the commodity demand by at most 15 % and the saturation ceiling by at most 25 %. The city is a consumer and never adds supply. Without a city signal the economy behaves exactly as in Stage 04.
- **Simulation integration**: the tick order grew to ten systems (world → **city** → economy → employees → technology → products → resources → production → market → corporation). The city runs before the economy so that the market signal is consumed in the same tick; the Stage 02 world → economy order is preserved.
- **Command layer**: a new `cityCommands.ts` module with ten validated player commands, every one returning a typed result and leaving the state unchanged on failure.
- **Interface**: City Overview, District Management, Urban Infrastructure, Land Management and Construction & Buildings sections on the dashboard; the finance overview extended with the city investments and the land disposal.
- **Tests**: 360 passing (was 285) — including a complete city gameplay integration test and nine interface tests.
- Documentation updated; `docs/ENGINE_RULES.md` extended and `docs/STAGE_05_FINAL_REPORT.md` created.

**Still deferred to later stages (unchanged):** events and competitor AI (Stage 06), Web Workers (Stage 07), IndexedDB save/load (Stage 08), Three.js world rendering (Stage 09).

---

## Stage 06: Events & Competitor AI Engines (next — pending user approval)

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
