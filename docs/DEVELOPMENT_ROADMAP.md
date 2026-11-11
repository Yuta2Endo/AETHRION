# AETHRION — Development Roadmap

**Project:** AETHRION  
**Stage:** 08 — Save & Archive Engine (current)  
**Status:** Stage 08 complete — Stage 09 awaiting user approval

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

## Completed — Stage 06: Events & Competitor AI Engines

- **Global Events Engine**: seventeen data-driven events in six categories (economic, technology, industrial, energy, environment, geopolitical) with typed, bounded and serialisable effects — no callbacks inside the data.
- **Event scheduling**: a deterministic, seeded xorshift generator whose state lives in the events state; a weighted selection every twelve simulated hours, cooldowns per event, at most three simultaneous events and a maximum of one evaluation per tick.
- **Event lifecycle**: an event activates exactly once and expires exactly once; the effects stack multiplicatively with an explicit clamp (0.5 … 2) and the pressures additively (0 … 1); an expired event has no influence any more.
- **Player responses**: seven events offer a real choice — the cost is charged through the corporate ledger, some responses buy resources through the Resource Engine, the relief scales the effects of its own event instance and it may only be applied once.
- **World, city and economy integration**: the events modulate the commodity demand and supply, the operating costs, the research speed, the production output, the market demand, the infrastructure and the environment of the city and the activity of the competitors — every modifier bounded and applied in the same tick.
- **Competitor AI Engine**: three independent AI corporations (NEXORA INDUSTRIES, VANTEX GLOBAL, HELION DYNAMICS) with five personality profiles, their own compact financial model, their own research programmes, their own market presence and their own relationship with the player.
- **Decision engine**: nine weighted objectives, a deterministic evaluation order, a twenty-four hour decision interval, a seventy-two hour action cooldown, an affordability check and a bounded action history.
- **Technology competition**: the AI reuses the existing Stage 04 technology tree — the same definitions, the same prerequisites and the same durations. No second tree.
- **Market integration**: the new `CompetitorMarketSignal` raises the commodity supply and demand by at most 12 %; the AI never touches the market directly and never touches the player finances.
- **News system**: a bounded feed of forty items, generated exclusively from real simulation events — the activations, the expirations, the decisions of the AI and the technology breakthroughs.
- **Simulation integration**: the tick order grew to twelve systems (world → **events** → city → economy → employees → technology → products → resources → production → market → **competitors** → corporation). The events run first so their modifiers apply in the same tick; the AI runs after the market so nothing that was already calculated is changed retroactively.
- **Command layer**: a new `eventCommands.ts` (respond to an event, mark a news item as read) and a new `competitorCommands.ts` (read-only inspection of an AI corporation). No command exists that has no gameplay purpose.
- **Interface**: Global Events, News Feed and Competitor Overview sections with the dossier of a corporation; the market section extended with the competitive pressure per commodity.
- **Tests**: 464 passing (was 360) — including the complete event and competitor gameplay chain.
- Documentation updated; `docs/EVENT_SYSTEM.md` and `docs/COMPETITOR_AI.md` created, `docs/ENGINE_RULES.md` extended and `docs/STAGE_06_FINAL_REPORT.md` created.

**Still deferred to later stages (unchanged):** Web Workers (Stage 07), IndexedDB save/load (Stage 08), Three.js world rendering (Stage 09).

---

## Completed — Stage 07: Performance & Web Workers

- **Simulation kernel** (`src/game/simulation/kernel.ts`): the twelve domain systems extracted into a pure, injected-store kernel that imports no React, DOM, Zustand or rendering code — the same implementations run on the main thread and inside a Web Worker.
- **Worker architecture**: a module Worker (`src/game/simulation/worker.ts`) wired through Comlink over a narrow transport boundary, a versioned handshake, a typed tick protocol returning the delta of the changed slices, and a main-thread adapter (`workerClient.ts`) that owns the lifecycle, the sequence validation and the timeout.
- **Determinism & state integrity**: the Worker runs the same kernel with the same snapshot, context and seeded RNG state, so identical runs produce identical results in inline and worker mode; responses carry a monotonic sequence number, stale or invalid responses are rejected, and a tick is never executed twice after an uncertain failure.
- **Fallback & recovery**: if the Worker is unavailable, fails the handshake, times out or errors at runtime, the simulation falls back to the main thread and the last confirmed state is preserved. The fallback is explicit and observable.
- **Game Core integration**: the clock, the scheduler, the tick counter and the lifecycle (start / stop / pause / resume / reset / speed / step) remain on the main thread; the worker path never overlaps ticks.
- **Performance instrumentation**: a bounded metrics layer (average/max tick, slow ticks, round-trip and worker time, fallback activations) exposed through a compact developer diagnostics section. Honest benchmarks recorded the measured inline and worker costs at the current state size.
- **Tests**: 487 passing (was 464) — worker protocol and lifecycle, determinism/equivalence, ordering and no-duplication, pause/resume/reset/speed, stale/invalid response handling, fallback and benchmarks, with all existing Stage 01–06 tests still passing.
- Documentation updated; `docs/WORKER_ARCHITECTURE.md` and `docs/STAGE_07_FINAL_REPORT.md` created.

**Still deferred to later stages (unchanged):** IndexedDB save/load (Stage 08), Three.js world rendering (Stage 09).

---

## Completed — Stage 08: Save & Archive Engine

- **Persistence subsystem** (`src/game/persistence/`): typed, versioned save format and explicit allowlist of authoritative simulation state (13 slices + simulation meta + clock snapshot, including deterministic RNG state); validation, stable SHA-256 integrity (when available), sequential migrations, and portable JSON archives.
- **Database & repository:** IndexedDB via `idb` (`aethrion-save` v1) with `saves` (unique per-slot index, metadata listing) and `backups` stores; atomic-per-slot writes, previous-record backup on overwrite, recoverable typed errors.
- **Save/Load:** manual saves to independent slots (configurable capacity, default 10), rename/delete with confirmation, metadata inspection, export/import (validated, import into empty slot by default). Loads validate/verify/migrate, restore clock/tick/RNG and apply atomically, leave the game paused, and never mutate the active game on failure.
- **Autosave:** configurable (enabled by default, 5 simulated minutes), simulated-time driven, post-tick, debounced and non-overlapping, rotating autosave slot.
- **Determinism & Worker compatibility:** save → continue → restore → continue equivalence verified in inline and worker modes; restore stops/resets the Worker client and reinitialises against fresh state (IndexedDB on main thread only).
- **Clock/Runner hooks:** serialisable `GameClock` snapshot/restore and runner/engine hydration/reset support for safe, atomic restores.
- **UI:** `SaveLoadSection` (slot manager, autosave settings, confirmations, import/export, status/errors) integrated into the dashboard, responsive and accessible, using existing design tokens/primitives.
- **Tests:** 502 passing (was 487) — save/load/slots/rename/delete, concurrency, backups, integrity, validation, migration pipeline, archives, autosave, determinism (inline/worker), failed-load preservation; all existing Stage 01–07 tests passing.
- Documentation: `docs/SAVE_ARCHITECTURE.md`, `docs/SAVE_FORMAT.md`, updated architecture/roadmap/engine rules, and `docs/STAGE_08_FINAL_REPORT.md`.

**Still deferred to later stages (unchanged):** Three.js world rendering (Stage 09).

---

## Stage 09: Rendering Engine / World View (next — pending user approval)

- Three.js world view (scenes, cameras, materials, lighting) driven by simulation state.
- Empire visualisation, region rendering, interactive camera.
- Rendering ↔ simulation boundary hardening (render-only guarantee).

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
