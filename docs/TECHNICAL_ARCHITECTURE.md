# AETHRION — Technical Architecture

**Project:** AETHRION  
**Stage:** 02 — Game Core & Simulation Foundation

## 1. Layered Architecture

Clear separation of responsibilities across layers.

```
┌─────────────────────────────────────┐
│  Platform (Capacitor / Android)     │  ← billing, ads (Stage 10)
├─────────────────────────────────────┤
│  UI System (React + Framer Motion)  │  ← application interface
├─────────────────────────────────────┤
│  App State (Zustand — app store)    │  ← application-facing state
├─────────────────────────────────────┤
│  Rendering Engine (Three.js)        │  ← rendering only, no game rules
├─────────────────────────────────────┤
│  Game Core (engine, state, clock)   │  ← simulation orchestration
├─────────────────────────────────────┤
│  Simulation Engines (domain)        │  ← world, economy, corp, tech, …
├─────────────────────────────────────┤
│  Core (config, events, logging, …)  │  ← cross-cutting concerns
└─────────────────────────────────────┘
```

Dependency direction is strictly downward. The simulation never imports React; the rendering engine never contains game rules.

## 2. Module Responsibilities

| Module | Responsibility | Depends On |
|--------|----------------|------------|
| Application Core | App entry, providers, navigation, shell | React, Zustand |
| Game Core | Game loop, game state, clock, system registry | Core |
| Simulation Runner | Binds engine + clock + state + domain engines | Game Core, Simulation |
| World Engine | Regions, indicators, world-state evolution | Core |
| Economy Engine | Currencies, markets, prices, supply/demand | Core |
| Corporation Engine | Corporations, employees, hiring | Core |
| Technology Engine | Tech tree, research, unlocks | Core |
| Production Engine | Factories, products, supply chains | Core |
| City Engine | Cities, buildings | Core |
| Employee Engine | Hiring, roles, salaries | Core |
| Events Engine | World events, news | Core |
| Competitor AI Engine | AI corporations | Core |
| Save & Archive | IndexedDB persistence | idb |
| Rendering Engine | Three.js scenes, cameras, materials | Three.js |
| UI System | Components, screens, theme, tokens | React, Framer Motion |
| Platform Integration | Capacitor, Android | Capacitor |

## 3. Game Core Engine (`src/game/engine/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | `EngineSystem`, `SimulationContext`, `GameEngineConfig`, `GameEngineSnapshot` |
| `scheduler.ts` | `EngineScheduler` abstraction — frame scheduling and time source are injected |
| `gameEngine.ts` | Lifecycle, tick loop, system registry, error isolation |

### Guarantees

- **Status machine** — `idle → running ⇄ paused → stopped`. `start` is idempotent, so duplicate loops are impossible.
- **Deterministic order** — systems are sorted by ascending `order` (registration index breaks ties).
- **No overlap** — an in-flight tick blocks any further tick; the skipped tick is logged.
- **No uncontrolled catch-up** — at most `maxTicksPerFrame` (default 5) ticks run per frame; a remaining backlog is discarded and logged.
- **Visibility safety** — while the document is hidden nothing accumulates; on return to the foreground the accumulator and the time baseline are reset, so no burst is produced.
- **Error isolation** — a throwing system is recorded in `failedSystems` / `lastError`; the remaining systems still run.
- **Cleanup** — `dispose()` cancels the frame, clears systems and listeners, and removes the `visibilitychange` subscription.

### Tick flow

```
frame → accumulator += realDelta
      → while (accumulator >= tickDurationMs && executed < maxTicksPerFrame)
          accumulator -= tickDurationMs
          runTick(tickDurationMs)
      → runTick: clock.advanceTick() → build context → run systems in order
```

## 4. Game Clock (`src/game/clock/gameClock.ts`)

Tick-driven simulated time. The clock **never reads the system clock** — simulated time is only advanced by `advanceTick()`, which the engine calls once per tick.

| Concept | Value |
|---------|-------|
| `startDateMs` | Simulated epoch of the in-game start (default `2287-01-01 08:00 UTC`) |
| `tickDurationMs` | Real milliseconds between ticks (engine-owned) |
| `baseSimMsPerTick` | Simulated milliseconds per tick at 1x (default 1 simulated hour) |
| `speedMultiplier` | 0.25 … 16, applied to `baseSimMsPerTick` |

Real time and simulated time are separate: the engine measures real elapsed time, the clock accumulates simulated time. Dates are derived in **UTC**, so results never depend on the host timezone. `reset()` restores time, speed and the pause flag.

## 5. State Separation

Two distinct Zustand stores:

- `src/app/providers/AppProvider.tsx` — **application state** (theme, sidebar, version), persisted to `sessionStorage`.
- `src/game/state/gameStore.ts` — **simulation state** (`empire`, `world`, `economy`, `simulation`), **not persisted**.

The game store:
- contains **no domain logic** — it stores the results produced by the domain modules;
- exposes **controlled updates** (`applyWorldState`, `applyEconomyState`, `applySimulationMeta`, `applyEmpire`);
- keeps only plain, serialisable data so it can be snapshotted later;
- does **not** use the zustand `persist` middleware. Persistent storage is an IndexedDB concern reserved for Stage 08.

`src/game/state/selectors.ts` holds typed selectors that return primitives or stable slice references, keeping re-renders narrow. Derived metrics are computed by the domain modules (`getWorldMetrics`, `getEconomyMetrics`) inside `useMemo` — never duplicated in the UI.

## 6. Simulation Runner (`src/game/simulationRunner.ts`)

The single place where the layers are wired together. It registers the domain systems with the engine and mirrors the engine lifecycle into the game store.

```ts
const simulation = new SimulationRunner(); // application-wide instance
simulation.start(); simulation.pause(); simulation.resume(); simulation.stop();
simulation.setSpeed(2); await simulation.step();
```

## 7. Event Communication

`src/core/events/eventBus.ts` — a typed event bus decoupling modules. Simulation events are mirrored there for app-level observers (`simulation:tick`, `simulation:status`), while the engine exposes direct callbacks (`onTick`, `onStatusChange`) for internal wiring — the simulation itself never depends on the bus.

## 8. Error Handling

`src/core/error/errorHandler.ts` — centralized error handler. Installs global `window.onerror` and `unhandledrejection` handlers, logs via the logger, emits `app:error` events and exposes a `tryCatch` Result helper. `AppError` is defined once in `src/core/types/index.ts` and re-exported, so the error handler and the event bus share a single definition without a circular import.

Domain engines reject invalid input safely: `evolveWorld` and `updateEconomy` validate their state and context, log the failure and return the incoming state **unchanged**, so a corrupted state can never propagate through the simulation.

## 9. Logging

`src/core/logging/logger.ts` — centralized logger respecting `VITE_LOG_LEVEL`. Prefix `AETHRION`.

## 10. Environment Configuration

`src/core/config/env.ts` — typed access to Vite env variables. No direct `import.meta.env` reads elsewhere.

## 11. Web Workers

`src/workers/` is reserved for Stage 07. Worker integration is deliberately **not** implemented in Stage 02; `VITE_ENABLE_SIMULATION_WORKER` remains reserved.

## 12. Persistence

`src/services/persistence/indexedDB.ts` — IndexedDB (via `idb`) with `saves` and `settings` object stores. Wired up in Stage 08.

## 13. TypeScript Configuration

Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`). Path alias `@/` → `./src`.

## 14. Dependency Rules

- Avoid circular dependencies.
- Game simulation independent from React.
- Three.js independent from game rules.
- Domain modules expose pure functions — the store and the UI never re-implement them.
- UI depends on design tokens only (no hardcoded brand colors).
