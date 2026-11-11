# AETHRION — Stage 02 Final Report

**Project:** AETHRION  
**Stage:** 02 — Game Core & Simulation Foundation  
**Repository:** `Yuta2Endo/AETHRION`  
**Branch:** `main`  
**Previous stage:** Stage 01 — Project Foundation & Architecture (`79d9006`)  
**Date:** 2026-11-12

---

## 1. Stage Summary

Stage 02 converted the Stage 01 scaffold into a **working simulation backbone**. The Game Core now runs a real, deterministic tick loop; the Game Clock provides a simulated in-game calendar; the World and Economy engines evolve the world and its markets; and the Empire Dashboard renders live simulation state instead of placeholders.

The stage stayed strictly inside the roadmap scope: no corporation, employee, technology, production, city, competitor or event system was implemented, and worker/IndexedDB integration was left for Stages 07 and 08.

**Headline metrics**

| Metric | Stage 01 | Stage 02 |
|--------|----------|----------|
| Tests | 3 | **85** (82 added) |
| Files under `src/` | 48 | **69** |
| Simulation modules implemented | 0 | 2 (World, Economy) + Game Core/Clock/State |
| Dashboard | placeholder | live simulation dashboard |

---

## 2. Implemented Functionality

### Game Core Engine
- `start()`, `stop()`, `pause()`, `resume()` with an explicit `idle → running ⇄ paused → stopped` status machine.
- `step(realDeltaMs?)` for controlled, single-tick advancement.
- Idempotent `start()` — duplicate loops are impossible (verified by test).
- Deterministic system execution order (`order` ascending, registration index as tie-breaker).
- In-flight tick guard — asynchronous ticks can never overlap.
- Per-frame tick cap (`maxTicksPerFrame = 5`) — a long stall never produces an uncontrolled catch-up; the remaining backlog is discarded and logged.
- `visibilitychange` handling — nothing accumulates while backgrounded; on return to the foreground the accumulator and time baseline are reset.
- Per-system error isolation — a throwing system is recorded in `failedSystems`/`lastError`, the remaining systems still run.
- `dispose()` cancels the frame, clears systems and listeners and removes the document subscription.
- Injectable `EngineScheduler` — the engine never touches `requestAnimationFrame` directly, which makes it fully deterministic and testable without fake timers.

### Game Clock
- Tick-driven simulated time — the clock never reads the system clock.
- In-game calendar date and time (UTC-derived, timezone independent).
- Configurable speed multiplier (0.25 – 16) with validation.
- Pause / resume; `advanceTick()` returns `0` while paused.
- `reset()` restores time, speed and the pause flag.
- Formatting helpers `formatGameDate` / `formatGameDateShort` / `toGameDate`.

### Game State
- Simulation state (`empire`, `world`, `economy`, `simulation`) separated from application state.
- Controlled update actions; **no domain logic inside Zustand**.
- **localStorage persistence removed** — the `persist` middleware is gone; persistent storage stays an IndexedDB concern for Stage 08.
- Typed selectors (`src/game/state/selectors.ts`) returning primitives or stable slice references to keep re-renders narrow.
- State remains plain and serialisable so it can be snapshotted later.

### World Engine (baseline)
- Five fictional regions with stable identifiers and a tier model.
- Four normalised indicators per region: development, infrastructure, research capacity, market activity.
- Deterministic evolution rules with per-simulated-hour rates.
- Region metrics and a commercial activity index consumed by the Economy Engine.
- Validation that rejects invalid states and leaves them untouched.

### Economy Engine (baseline)
- Two currencies (Aether Credits `AΞ`, Volt Standard `V`).
- Four traded commodities across compute, energy, materials and logistics.
- Market prices with floor and ceiling, supply/demand levels, growth rates and a bounded price history.
- Deterministic price model driven by supply/demand imbalance.
- Demand scaled by the world's commercial activity — world development influences the market.
- Numeric validation on every state and context.

### Simulation Integration
- `SimulationRunner` binds the engine, the clock, the game state and the domain engines.
- Explicit tick execution order with the world feeding the economy within the same tick.
- Engine lifecycle mirrored into the game store, so the UI always reflects the real status.

### Empire Dashboard
- Replaced the Stage 01 placeholder with a live simulation dashboard.

### UI Library
- New primitives: `StatCard`, `IndicatorBar`, `TrendIndicator`, `MarketValue`.

---

## 3. Architecture Decisions

1. **Tick-driven simulated time.** The Stage 01 clock was wall-clock based (`Date.now()`), which made the simulation non-deterministic. It was rewritten so that only the engine's ticks advance simulated time. Real time and simulated time are now separate concerns.
2. **Injected scheduler.** `EngineScheduler` abstracts frame scheduling and the time source. The engine is therefore testable without fake timers and without touching `requestAnimationFrame` directly.
3. **Pure domain functions.** `evolveWorld` and `updateEconomy` are pure `(state, context) => state` functions. The store only persists their results, which keeps Zustand free of business logic and makes every rule unit-testable in isolation.
4. **Store owns state, engine owns lifecycle.** The Game Core knows nothing about state ownership; the `SimulationRunner` wires them together. This avoids a circular dependency between engine and store.
5. **Reject invalid input, never repair it.** Domain engines validate state and context, log the failure and return the incoming state **unchanged**. A corrupted state can never propagate into the next tick.
6. **No localStorage for simulation state.** The Stage 01 game store used the zustand `persist` middleware with `localStorage`. That was removed: persistence is an IndexedDB concern reserved for Stage 08, and the state is kept plain and serialisable so it can be snapshotted later.
7. **Single `AppError` definition.** `AppError` was duplicated in `src/core/types` and `src/core/error/errorHandler`. It now lives in `src/core/types` (which imports nothing) and is re-exported by the error handler — one definition, no circular import.
8. **Derived metrics computed once, in the domain layer.** `getWorldMetrics` / `getEconomyMetrics` live in the simulation modules and are wrapped in `useMemo` in the UI, so no business logic is duplicated in components and no unstable object is returned from a Zustand selector.
9. **Single `h1` and labelled regions.** The dashboard was rewritten with proper document structure and `aria-label` regions.
10. **No new dependencies.** Stage 02 added zero packages. The Stage 01 dependency set was left untouched (including the known devDependency advisories recorded in `docs/SECURITY_AUDIT.md`).

---

## 4. Files Created (21 source + 1 report)

| File | Purpose |
|------|---------|
| `src/game/engine/types.ts` | `EngineSystem`, `SimulationContext`, engine config and snapshot types |
| `src/game/engine/scheduler.ts` | `EngineScheduler` abstraction, rAF / timeout / default schedulers |
| `src/game/simulationRunner.ts` | Binds engine + clock + store + domain engines; app-wide `simulation` instance |
| `src/game/state/selectors.ts` | Typed Zustand selectors |
| `src/simulation/world/worldState.ts` | Region model, initial world, validation, metrics |
| `src/simulation/world/worldRules.ts` | Deterministic world evolution rules |
| `src/simulation/economy/economyState.ts` | Currency / commodity model, initial economy, validation, metrics |
| `src/simulation/economy/economyRules.ts` | Deterministic market and price rules |
| `src/ui/components/StatCard.tsx` | Statistic card primitive |
| `src/ui/components/IndicatorBar.tsx` | Development indicator bar (`role="meter"`) |
| `src/ui/components/TrendIndicator.tsx` | Signed change indicator |
| `src/ui/components/MarketValue.tsx` | Commodity market row |
| `src/tests/helpers/manualScheduler.ts` | Deterministic scheduler for tests |
| `src/tests/game/gameEngine.test.ts` | Engine unit tests |
| `src/tests/game/gameClock.test.ts` | Clock unit tests |
| `src/tests/simulation/world.test.ts` | World Engine unit tests |
| `src/tests/simulation/economy.test.ts` | Economy Engine unit tests |
| `src/tests/integration/simulation.test.ts` | Simulation integration tests |
| `src/tests/components/Dashboard.test.tsx` | Dashboard component tests |
| `src/tests/components/AppShell.test.tsx` | Application shell bootstrap tests |
| `src/platform/android/index.ts` | Stage 01 file that was silently ignored by `.gitignore` — now tracked (see Known Issues #5) |
| `docs/STAGE_02_FINAL_REPORT.md` | This report |

**22 new files in total** (21 under `src/`, plus this report).

## 5. Files Modified (18 code/config + 6 documentation = 24)

| File | Change |
|------|--------|
| `src/game/engine/gameEngine.ts` | Full rewrite — lifecycle, tick loop, system registry, error isolation |
| `src/game/clock/gameClock.ts` | Full rewrite — tick-driven simulated time |
| `src/game/state/gameStore.ts` | Rewritten — simulation state, no domain logic, no persistence |
| `src/game/systems/index.ts` | Updated barrel for the new game layer |
| `src/simulation/world/index.ts` | Now a barrel over `worldState` / `worldRules` |
| `src/simulation/economy/index.ts` | Now a barrel over `economyState` / `economyRules` |
| `src/core/types/index.ts` | Canonical `AppError`, added `SimulationStatus` |
| `src/core/error/errorHandler.ts` | Imports the canonical `AppError` instead of redefining it |
| `src/core/events/eventBus.ts` | Typed simulation tick / status events |
| `src/core/utils/index.ts` | Added `isFiniteNumber`, `roundTo`; hardened `clamp` |
| `src/ui/screens/Dashboard.tsx` | Replaced the placeholder with the live Empire Dashboard |
| `src/ui/components/Button.tsx` | **Bug fix** — native props and event handlers were never forwarded to the `<button>` |
| `src/ui/components/index.ts` | Exports the new primitives |
| `src/app/layouts/AppShell.tsx` | Boots the simulation; loading screen waits for the first real tick |
| `src/app/navigation/MainNavigation.tsx` | World / Economy marked as implemented (`baseline`) |
| `src/index.css` | Styles for the simulation dashboard and the new primitives, incl. responsive rules |
| `package.json` | Version `0.1.0` → `0.2.0` |
| `.gitignore` | `android/` → `/android/` so `src/platform/android/` is tracked again |
| `docs/TECHNICAL_ARCHITECTURE.md` | Rewritten for the Stage 02 architecture |
| `docs/DEVELOPMENT_ROADMAP.md` | Stage 02 marked complete |
| `docs/GAME_DESIGN_OVERVIEW.md` | World and economy rules documented |
| `docs/DESIGN_SYSTEM.md` | New primitives and dashboard layout documented |
| `docs/PROJECT_OVERVIEW.md` | Stage objectives updated |
| `docs/STAGE_01_FINAL_REPORT.md` | Corrected the `src/workers/` inventory inaccuracy |

---

## 6. Simulation Lifecycle

```
        ┌────────┐  start()   ┌─────────┐  pause()   ┌────────┐
        │  idle  │──────────▶│ running │──────────▶│ paused │
        └────────┘           └─────────┘◀──────────└────────┘
                                │  stop()                 │ stop()
                                ▼            ┌───────────▼──┐
                            ┌─────────┐     │   stopped   │
                            │ stopped │     └──────────────┘
                            └─────────┘
```

- `start()` is idempotent — calling it while running is a no-op, so duplicate loops are impossible.
- `pause()` / `resume()` are only valid from `running` / `paused` respectively; otherwise they are ignored.
- `stop()` releases the frame and retains all state so the simulation can be restarted.
- `reset()` returns the engine to `idle` with the tick counter cleared, keeping the registered systems and listeners.
- `dispose()` releases every resource: frame, systems, listeners and the document subscription.

---

## 7. Tick Execution Order

```
frame (rAF)
  └─ realDelta = now - lastFrameTime
     ├─ if document hidden → accumulator = 0, re-schedule, return
     ├─ accumulator += realDelta
     └─ while (accumulator >= tickDurationMs && executed < maxTicksPerFrame)
          accumulator -= tickDurationMs
          runTick()
             ├─ guard: if a tick is still in flight → skip and log
             ├─ clock.advanceTick()            ← simulated time advances first
             ├─ tick += 1
             ├─ build SimulationContext { tick, simTimeMs, deltaMs, realDeltaMs }
             ├─ 1. WORLD    (order 10)  ← regions evolve from the new simulated time
             ├─ 2. ECONOMY  (order 20)  ← markets consume the world produced above
             └─ notify listeners + event bus
```

- The order is fixed by `SIMULATION_SYSTEM_ORDER` (`world: 10`, `economy: 20`).
- The economy observes the world **as updated in the same tick** — verified by an integration test that recomputes the expected demand independently.
- A system that throws is isolated: the failure is recorded and the remaining systems still run.

---

## 8. Game Clock Behaviour

| Property | Value |
|----------|-------|
| Start date | `2287-01-01 08:00 UTC` (simulated epoch) |
| Tick duration | 1000 real ms (engine-owned) |
| Base simulated advance | 1 simulated hour per tick |
| Speed multipliers | 0.25 – 16; the interface offers 0.5x / 1x / 2x / 4x |
| Date derivation | UTC — independent of the host timezone |
| Pause | `advanceTick()` returns `0`, simulated time frozen |
| Reset | Restores elapsed time, tick count, speed and the pause flag |

Real time and simulated time are strictly separated: the engine measures real elapsed milliseconds between frames, the clock accumulates simulated milliseconds. `advanceTick()` advances `baseSimMsPerTick × speedMultiplier` simulated milliseconds.

---

## 9. World Engine Rules

Five regions: Aurora Basin (core), Nova Reach (developed), Helion Rift (emerging), Cyther Peaks (emerging), Vanta March (frontier).

Per simulated hour:

1. `development += developmentTrend × stability`
2. `infrastructure += (development − infrastructure) × 0.08`
3. `researchCapacity` converges toward `infrastructure` at 5 %/h when infrastructure ≥ 40, otherwise decays toward it at 2 %/h
4. `marketActivity += (infrastructure − marketActivity) × 0.06`
5. `stability` drifts toward `0.55 + development / 250` at 2 %/h of the gap

Indicators are clamped to 0..100, stability to 0..1, and all values are rounded to 4 decimals to avoid floating-point drift. Invalid states (duplicate ids, non-finite or out-of-range values, dangling `activeRegionId`) are rejected: the state is returned unchanged and the failure is logged.

---

## 10. Economy Engine Rules

Two currencies (Aether Credits `AΞ`, Volt Standard `V`) and four commodities: Quantum Core (compute), Helion Cell (energy), Nano Lattice (materials), Orbital Freight (logistics).

```
imbalance   = (demand − supply) / max(demand + supply, 1)
targetPrice = basePrice × (1 + imbalance × 0.45)
newPrice    = price + (targetPrice − price) × 0.15 × hours
price       = clamp(newPrice, priceFloor, priceCeiling)
```

- Supply and demand grow proportionally to their reference level, so growth compounds.
- `demandFactor = 1 + (marketActivityIndex / 100) × 0.5` — a more developed world raises demand and therefore prices.
- Demand saturates at 3× its reference level.
- A bounded price history (24 samples) is kept per commodity.
- Non-finite values, out-of-band prices and invalid contexts are rejected; the state is returned unchanged.

---

## 11. Dashboard Functionality

The Stage 01 placeholder ("System 1..4 — Planned — future stage") was removed entirely. Every value on the dashboard is read from the live game state.

| Section | Content |
|---------|---------|
| Header | AETHRION brand identity, simulated date and time |
| Simulation control panel | Status badge, tick counter, current speed, **Start / Pause / Resume / Stop**, speed chips 0.5x / 1x / 2x / 4x |
| Empire Overview | Empire name, charter, in-game founding date, home region, world region count |
| World Overview | Average development / infrastructure / research / stability, plus a card per region with tier badge, stable identifier and four indicator bars |
| Economy Overview | Market value, average price change, supply and demand indices, plus a row per commodity with price, change and market pressure |

Design-system compliance: Deep Space background, Neon Cyan primary accents, Imperial Purple secondary accents, mono typeface for all numeric values, token-based CSS only, responsive down to 320 px, labelled `section` regions, `role="meter"` indicator bars, `aria-pressed` speed toggles, `aria-hidden` decorative icons.

---

## 12. Tests Added

**85 tests in 8 files — all passing** (Stage 01: 3 tests).

| File | Tests | Coverage |
|------|-------|----------|
| `src/tests/game/gameEngine.test.ts` | 17 | start, pause, resume, stop, duplicate-loop prevention, deterministic order, error isolation, no overlapping async ticks, backlog cap, visibility handling, notifications, reset, disposal |
| `src/tests/game/gameClock.test.ts` | 11 | time advance, speed multipliers, pause blocks advancement, resume continues, UTC date derivation, invalid speed/config rejection, determinism, reset |
| `src/tests/simulation/world.test.ts` | 14 | valid initial world, unique identifiers, indicator ranges, determinism, reproducibility over 50 ticks, trend direction, convergence, invalid state/context rejection, metrics |
| `src/tests/simulation/economy.test.ts` | 16 | valid initial economy, unique ids, price up/down on imbalance, documented formula, floor/ceiling clamping, supply/demand evolution, activity scaling, reproducibility, bounded history, invalid values, imbalance, metrics |
| `src/tests/integration/simulation.test.ts` | 11 | system order, world/economy updated through the lifecycle, same-tick world→economy dependency, store sync, pause/resume, speed multiplier, invalid speed, frame scheduler, reset, no localStorage persistence |
| `src/tests/components/Dashboard.test.tsx` | 10 | simulated date, empire overview, every region and identifier, market rows and prices, status, start/pause/resume, speed, live date update, no placeholder content |
| `src/tests/components/AppShell.test.tsx` | 3 | loading screen until the first tick, brand identity, simulation stopped on unmount |
| `src/tests/components/Button.test.tsx` | 3 | Stage 01 regression test (unchanged) |

No test merely asserts that a function exists — every test asserts observable behaviour.

---

## 13. Actual Command Results

All commands were executed in `G:\Developing\AETHRION` on Node v26.13.0 / npm 11.20.0.

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ **Pass** — no errors |
| `npm run lint` | ✅ **Pass** — no errors, no warnings (`--max-warnings 0`) |
| `npm test` | ✅ **Pass** — 8 files, **85/85 tests passed**, 0 failed (~5 s) |
| `npm run build` | ✅ **Pass** — typecheck + `vite build`, 4974 modules, built in 3.82 s |
| Dev server (`npm run dev`) | ✅ **Pass** — Vite ready in 297 ms, `http://localhost:5173` returned **HTTP 200** |

Production build output:

```
dist/index.html                 0.58 kB │ gzip:  0.37 kB
dist/assets/index-C9bQT3ly.css 18.43 kB │ gzip:  3.89 kB
dist/assets/index-CB3tt0GW.js 450.46 kB │ gzip: 137.94 kB
✓ built in 3.82s
```

Pre-existing failures: **none**. All Stage 01 checks that passed before still pass.

---

## 14. Known Issues

1. **Stage 01 bug found and fixed:** the `Button` primitive never forwarded native props to the `<button>` element, so `onClick` and every other handler were silently dropped. Stage 01 tests did not catch it because the only assertion was on class names. Fixed in Stage 02 and now covered by the Dashboard control tests.
2. **Playwright browsers are not installed.** `playwright.config.ts` is configured, but the Chromium binary is absent from the machine, so no E2E test was executed. E2E was not a Stage 02 requirement; browser binaries must be installed (`npx playwright install`) before the E2E suite can run.
3. **DevDependency advisories remain unchanged.** 17 vulnerabilities in dev tooling (3 critical, 2 high, 12 moderate); `npm audit --omit=dev` still reports **0** for the production runtime. Per the stage rules, `npm audit fix` was **not** run automatically — the upgrade paths are documented in `docs/SECURITY_AUDIT.md`.
4. **Stage 01 documentation inaccuracy corrected.** The Stage 01 report listed a `src/workers/` directory that was never created. The inventory and known-issues section of `docs/STAGE_01_FINAL_REPORT.md` have been corrected.
5. **Stage 01 `.gitignore` defect found and fixed.** The pattern `android/` (added in Stage 01 for the Capacitor native project) matched **any** directory named `android` at any depth — including `src/platform/android/`. The Android platform integration source was therefore silently never committed. The pattern is now anchored to the repository root (`/android/`, `/ios/`), the root-level Capacitor project is still ignored, and `src/platform/android/index.ts` is now tracked.
6. **The simulation runs on the main thread.** Tick cost is negligible today, but the worker split remains a Stage 07 task.
7. **No persistence.** The simulation state is lost on reload. This is deliberate — save/load is Stage 08.
8. **The world and economy are baselines.** There is no player-driven economic pressure yet: prices move because of world development, not because of player actions. Player impact arrives with the Corporation, Production and City engines.

---

## 15. Deferred Work

Explicitly **not** implemented in Stage 02, per the roadmap:

Corporation creation · corporate hierarchy · employee hiring · employee management · technology tree · research progression · factories · manufacturing · supply chains · city construction · competitor AI · world events system · Web Worker / Comlink integration · IndexedDB save/load · save slots and archives · Three.js world rendering · Android monetization · Google Play Billing · AdMob.

---

## 16. Stage Completion Status

**STAGE 02: COMPLETE**

| Criterion | Status |
|-----------|--------|
| Game Core works | ✅ 17 engine tests |
| Game Clock works | ✅ 11 clock tests |
| World Engine baseline works | ✅ 14 world tests |
| Economy Engine baseline works | ✅ 16 economy tests |
| Simulation integration works | ✅ 11 integration tests, documented tick order verified |
| Dashboard uses actual game data | ✅ 10 dashboard tests, no placeholder content remains |
| Required tests pass | ✅ 85/85 |
| Typecheck passes | ✅ no errors |
| Lint passes | ✅ no errors, no warnings |
| Production build passes | ✅ 3.82 s |
| Documentation updated | ✅ 5 documents updated + 1 created |
| Final report created | ✅ this document |

---

## 17. Recommended Next Stage

**Stage 03 — Corporation & Employee Engines** (per `docs/DEVELOPMENT_ROADMAP.md`), pending user approval.

Suggested tasks:
1. Corporation model: creation, charter, tier, balance sheet — extending `src/simulation/corporation`.
2. Employee model: roles, salaries, skills, performance — extending `src/simulation/employees`.
3. Corporation ↔ Employee integration, and their connection to the economy (payroll pressure on the market).
4. Player-facing corporation and hiring screens replacing the current empire placeholder identity.
5. Registry for the new systems in `SIMULATION_SYSTEM_ORDER`, keeping the documented tick order.
6. Unit, integration and component tests following the Stage 02 patterns.

**Do not begin Stage 03 automatically — awaiting explicit user approval.**
