# AETHRION — Technical Architecture

**Project:** AETHRION  
**Stage:** 09 — Rendering Engine & World View

> The exact rules of the Stage 04, Stage 05 and Stage 06 engines are documented in
> `docs/ENGINE_RULES.md`. This document describes the architecture and the layering.

## 1. Layered Architecture

Clear separation of responsibilities across layers.

```
┌─────────────────────────────────────┐
│  Platform (Capacitor / Android)     │  ← billing, ads (Stage 10)
├─────────────────────────────────────┤
│  UI System (React + Framer Motion)  │  ← application interface
├─────────────────────────────────────┤
│  Command Layer (game/commands.ts)   │  ← the only entry point for actions
├─────────────────────────────────────┤
│  App State (Zustand — app store)    │  ← application-facing state
├─────────────────────────────────────┤
│  Game State (Zustand — game store)  │  ← canonical simulation state
├─────────────────────────────────────┤
│  Rendering Engine (Three.js)        │  ← rendering only, no game rules
├─────────────────────────────────────┤
│  Game Core (engine, state, clock)   │  ← simulation orchestration
├─────────────────────────────────────┤
│  Simulation Engines (domain)        │  ← world, economy, corporation, …
├─────────────────────────────────────┤
│  Core (config, events, logging, …)  │  ← cross-cutting concerns
└─────────────────────────────────────┘
```

Dependency direction is strictly downward. The simulation never imports React; the rendering engine never contains game rules; the domain engines never import the game layer.

## 2. Module Responsibilities

| Module | Responsibility | Depends On |
|--------|----------------|------------|
| Application Core | App entry, providers, navigation, shell | React, Zustand |
| Command Layer | Validates and applies player actions | Game State, Simulation |
| Game Core | Tick loop, game state, clock, system registry | Core |
| Simulation Runner | Binds engine + clock + state + domain engines | Game Core, Simulation |
| World Engine | Regions, indicators, world-state evolution | Core |
| Economy Engine | Currencies, markets, prices, supply/demand | Core, Contracts |
| **Corporation Engine** | Corporation, departments, tiers, finances, ledger | Core, Contracts |
| **Employee Engine** | Employees, professions, hiring, development, payroll | Core, Contracts, Corporation |
| **Technology Engine** | Technology tree, research projects, unlocks | Core, Employee Engine |
| **Product Engine** | Product catalogue, development projects, quality | Core, Technology Engine, Contracts |
| **Resource Engine** | Resource inventory, pricing, reservations, ledger | Core, Economy Engine, Contracts |
| **Production Engine** | Facilities, production orders, manufacturing | Core, Product Engine, Contracts |
| **Market Engine** | Listings, demand, sales, corporate market signal | Core, Product Engine, Contracts |
| **City Engine** | City, districts, land, buildings, infrastructure, population | Core, Contracts |
| **Events Engine** | Global events, their effects, the event history and the news | Core, Contracts |
| **Competitor AI Engine** | AI corporations, their decisions, their finances and their market presence | Core, Contracts, Technology Engine |
| Events Engine | World events, news | Core |
| Competitor AI Engine | AI corporations | Core |
| Save & Archive | IndexedDB persistence | idb |
| Rendering Engine | Three.js scenes, cameras, materials | Three.js |
| UI System | Components, screens, theme, tokens | React, Framer Motion |
| Platform Integration | Capacitor, Android | Capacitor |

## 3. Cross-Engine Contracts (`src/simulation/contracts.ts`)

Plain, dependency-free types shared by two or more engines: the base currency, the corporate department model and the **three** integration boundaries — the `CorporateMarketSignal` (Stage 04), the `CityMarketSignal` (Stage 05) and the `CompetitorMarketSignal` (Stage 06). The module also owns the shared vocabulary of the commodity categories, the news categories and the event modifier snapshot.

This module holds **no engine logic** — it only provides the vocabulary that lets the engines talk to each other without importing each other.

## 4. Game Core Engine (`src/game/engine/`)

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

### SimulationContext

```ts
interface SimulationContext {
  readonly tick: number;
  readonly simTimeMs: number;     // simulated epoch milliseconds
  readonly deltaMs: number;       // simulated milliseconds advanced by this tick
  readonly realDeltaMs: number;   // real milliseconds since the previous tick
  readonly elapsedSimMs: number;  // simulated milliseconds since the simulation started
}
```

`elapsedSimMs` (added in Stage 03) is the deterministic basis for period-based rules such as payroll — it never depends on the wall clock.

## 5. Game Clock (`src/game/clock/gameClock.ts`)

Tick-driven simulated time. The clock **never reads the system clock** — simulated time is only advanced by `advanceTick()`, which the engine calls once per tick.

| Concept | Value |
|---------|-------|
| `startDateMs` | Simulated epoch of the in-game start (default `2287-01-01 08:00 UTC`) |
| `tickDurationMs` | Real milliseconds between ticks (engine-owned) |
| `baseSimMsPerTick` | Simulated milliseconds per tick at 1x (default 1 simulated hour) |
| `speedMultiplier` | 0.25 … 16, applied to `baseSimMsPerTick` |

Dates are derived in **UTC**, so results never depend on the host timezone. `reset()` restores time, speed and the pause flag.

## 6. State Separation

Two distinct Zustand stores:

- `src/app/providers/AppProvider.tsx` — **application state** (theme, sidebar, version), persisted to `sessionStorage`.
- `src/game/state/gameStore.ts` — **simulation state**, **not persisted**:

| Slice | Owner | Content |
|-------|-------|---------|
| `empire` | game store | Global empire identity |
| `world` | World Engine | Regions and indicators |
| `economy` | Economy Engine | Currencies, commodities, prices |
| `corporation` | Corporation Engine | Corporation record, finances, ledger |
| `employees` | Employee Engine | Employee records |
| `technology` | Technology Engine | Unlocked technologies, research projects, history |
| `products` | Product Engine | Product instances and their development state |
| `resources` | Resource Engine | Resource balances, reservations, ledger |
| `production` | Production Engine | Facilities and production orders |
| `market` | Market Engine | Market listings and their sales results |
| `city` | City Engine | The city, its districts, its land and its buildings |
| `events` | Events Engine | The global events, their history and the news feed |
| `competitors` | Competitor AI Engine | The AI corporations |
| `simulation` | Game Core | Status, tick, simulated time, date, speed |

The game store contains **no domain logic** — it stores the results produced by the domain modules and exposes controlled update actions. It does **not** use the zustand `persist` middleware; persistent storage is an IndexedDB concern reserved for Stage 08.

**Ownership rule:** the Corporation Engine never stores employee data. Headcount and workforce statistics are *derived* by `getCorporationStatistics(corporation, workforce)`, which accepts a minimal structural `WorkforceMember` view — so the Corporation Engine does not import the Employee Engine. The same principle applies to the Resource Engine (it never stores product or production data) and to the Product Engine (it never stores resource balances). The **City Engine** never stores employee data either — a city building only holds *references* to the corporate employees that are assigned to it, exactly like the Production Engine does for its facilities. The city also has **no treasury of its own**: every payment uses the balance and the ledger of the player corporation.

`src/game/state/selectors.ts` holds typed selectors returning primitives or stable slice references, keeping re-renders narrow.

## 7. Command Layer (`src/game/commands/`)

The **only** entry point for player actions. The interface calls commands; commands validate, apply the domain rules and write the result to the game state exactly once. No simulation rule is ever executed inside a React component.

Stage 04 split the single `commands.ts` file into a focused module per domain — the file would otherwise have grown past 700 lines:

| Module | Commands |
|--------|----------|
| `corporationCommands.ts` | `createCorporation`, `hireEmployee`, `dismissEmployee` |
| `technologyCommands.ts` | `startResearch`, `cancelResearch` |
| `productCommands.ts` | `startProductDevelopment`, `assignProductEmployees`, `setProductPrice`, `setProductSalesActive` |
| `resourceCommands.ts` | `purchaseResource` |
| `productionCommands.ts` | `createFacility`, `assignFacilityEmployees`, `startProduction`, `cancelProduction` |
| `cityCommands.ts` | `purchaseLand`, `sellLand`, `startConstruction`, `cancelConstruction`, `assignBuilding`, `unassignBuilding`, `suspendBuilding`, `resumeBuilding`, `demolishBuilding`, `renameCity` |
| `eventCommands.ts` | `respondToEvent`, `markNewsRead`, `getAvailableResponses` |
| `competitorCommands.ts` | `getCompetitor` (read-only inspection) |
| `shared.ts` | `failure`, `requireCorporation`, `chargeCorporation`, `storeCorporation`, `validateEmployeeAssignment` |
| `index.ts` | The aggregated `commands` object |

Every command returns a `Result<T, AppError>` so the interface can display a precise validation message. **A failed command leaves the game state unchanged** — including the case where a production order cannot be charged: the resource reservation is rolled back, and the case where a plot or a building cannot be paid for: the city state is not written at all.

## 8. Corporation Engine (`src/simulation/corporation/`)

| File | Responsibility |
|------|----------------|
| `corporationState.ts` | Corporation record, tier table, finances, transactions, validation |
| `corporationRules.ts` | Creation, transactions, accrual, progression, statistics |

### Data model

```ts
interface Corporation {
  id: string;                    // stable, deterministic
  name: string;
  foundedAtSimMs: number;        // simulated time, not a wall-clock date
  tierId: string; level: number;
  status: 'active' | 'thriving' | 'strained' | 'insolvent';
  reputation: number;            // 0..100
  finances: CorporationFinances;
  transactions: CorporationTransaction[];   // bounded to 50
  financialHistory: FinancialSnapshot[];    // bounded to 24 periods
  lastPayrollPeriodId: string | null;       // duplicate-payroll guard
  missedPayrollCount: number;
  transactionSequence: number;              // deterministic transaction ids
}
```

### Departments

`management`, `research`, `engineering`, `production`, `marketing`, `finance` — defined in `src/simulation/contracts.ts`. Each tier exposes the departments it may staff.

### Tiers

The tier table is **data driven** (`CORPORATION_TIERS`): id, level, name, employee capacity, revenue and operating-cost factors, available departments and the revenue / reputation / headcount requirements to reach it. A new tier is added by extending the table — no engine code changes.

### Financial rules

- `balance` is never negative. A transaction that would overdraw is **rejected** and the corporation is returned unchanged.
- Non-finite amounts are rejected.
- Revenue accrues from the total workforce productivity; operating costs from the base cost plus a cost per employee, both scaled by the elapsed simulated time and the tier factors.
- Reputation drifts toward a target derived from lifetime revenue and lifetime net profit.
- Ledger and history are bounded — no unbounded growth.

## 9. Employee Engine (`src/simulation/employees/`)

| File | Responsibility |
|------|----------------|
| `employeeState.ts` | Employee record, profession table, validation, deterministic naming |
| `employeeRules.ts` | Creation, hiring, dismissal, development |
| `payroll.ts` | Payroll period model, calculation, processing |

### Data model

```ts
interface Employee {
  id: string;                    // 'emp_0001' — deterministic sequence
  name: string;                  // derived from the sequence
  profession: ProfessionId;
  department: DepartmentId;
  skill: number;                 // 0..100
  experience: number;            // simulated hours
  salary: number;                // paid per payroll period
  productivity: number;          // 0..100
  satisfaction: number;          // 0..100
  morale: number;                // 0..100
  status: 'active' | 'at-risk' | 'departed';
  hiredAtSimMs: number;
  lastDevelopmentPeriodId: string | null;
  development: EmployeeDevelopment[];   // bounded to 12 entries
}
```

### Professions

`manager`, `researcher`, `engineer`, `production-worker`, `marketer` — a data-driven table with base salary, base skill, experience rate, productivity weight, hiring-cost factor and satisfaction target. New professions are added by extending the table and the `ProfessionId` union.

### Development rules (deterministic, no randomness)

```
experience += profession.experienceRate × hours
skill        ← converge(skill, baseSkill + experience × 0.35, 0.05/h)
satisfaction ← converge(satisfaction, profession.target + salaryFairness, 0.04/h)
morale       ← converge(morale, 30 + satisfaction × 0.7, 0.03/h)
productivity  = clamp(skill × profession.weight + (satisfaction − 50) × 0.2, 0, 100)
```

`converge` clamps its factor to 0..1, so a long simulated step can never overshoot the target.

### Hiring

Validated in order: profession → department → department availability at the tier → employee capacity → salary → available funds. A failed requirement returns a typed error and changes nothing. The hiring fee is `200 + salary × profession.hiringCostFactor`.

## 10. Payroll Model (`src/simulation/employees/payroll.ts`)

- A payroll **period** is a fixed slice of simulated time: `PAYROLL_PERIOD_MS` = 7 in-game days.
- The period identifier is derived from `elapsedSimMs` (`period_0000`, `period_0001`, …) — it never depends on the wall clock.
- The corporation stores `lastPayrollPeriodId`. A period that has already been processed is **skipped** — a period can never be paid twice.
- A period is settled the first time the simulation observes it; the financial snapshot of the period is written when it closes and the period counters are reset.
- **Insufficient funds:** the payroll is not paid in part. No money is created. A `payroll-missed` transaction with the shortfall is recorded, `missedPayrollCount` is incremented, the workforce is put on `at-risk` and satisfaction (−15) and morale (−20) are reduced. A later successful payroll restores the `active` status.

## 11. Simulation Integration

`src/game/simulationRunner.ts` binds the Game Core, the clock, the state and the simulation. The domain logic lives in the **simulation kernel** (`src/game/simulation/kernel.ts`), which is bound to an injected store so that the very same implementations run on the main thread and inside a Web Worker.

The kernel registers twelve systems in a fixed order:

```
1. Game Clock        — advances simulated time (engine-owned, before the systems)
2. World Engine      — order 10
3. Events Engine     — order 11   ← schedules the global events, expires them
4. City Engine       — order 15   ← consumes the event pressures
5. Economy Engine    — order 20   ← consumes the world and the three market signals
6. Employee Engine   — order 30   ← develops the workforce
7. Technology Engine — order 40   ← research uses the workforce of step 6
8. Product Engine    — order 50   ← development uses the unlocked technologies
9. Resource Engine   — order 60   ← resource bookkeeping
10. Production Engine — order 70  ← consumes the reserved resources
11. Market Engine    — order 80   ← sells the finished goods
12. Competitor Engine — order 85  ← the AI decisions and the competitive activity
13. Corporation Engine— order 90
      ├─ accrues revenue and operating costs from the workforce productivity,
      │  from the operating cost of the running city buildings and from the
      │  operating cost modifier of the active global events
      ├─ processes the payroll of the current period (at most once)
      └─ updates reputation, tier and status
```

The Stage 02 **world → economy** order is preserved. The Stage 05 dependency is **city →
economy**: the City Engine runs before the Economy Engine, so the economy consumes the city
market signal of the **same** tick. The Stage 06 dependencies are **events → every affected
engine** (the Events Engine runs first, so the modifiers apply in the same tick) and
**market → competitors** (the AI reacts to the market of the tick it is in; its own signal
reaches the economy with the next tick, so nothing that was already calculated is ever changed
retroactively).

### Execution modes (Stage 07)

- **Inline** — the twelve systems are registered on the Game Core and run on the main thread.
- **Worker** — one Game Core system delegates the tick to a Web Worker. The Worker runs the same kernel over a plain snapshot and returns the delta of the changed slices; the main thread applies only the confirmed delta.

The clock, the scheduler, the tick counter and the lifecycle stay on the main thread. The same initial state, commands, simulated time and tick sequence produce the same result in both modes, and a Worker failure never executes a tick twice (the simulation falls back to the main thread and the last confirmed state is preserved). The full architecture is documented in `docs/WORKER_ARCHITECTURE.md`.

The workforce developed in the same tick feeds the corporation in that tick — verified by an
integration test that recomputes the expected revenue independently. The full chain
**research → unlock → development → resource purchase → production → inventory → market sale →
revenue** is covered by an end-to-end integration test, the chain **land → construction →
housing → population → industry → economy → finances** by the Stage 05 integration test and the
chain **event → effect → economy → AI decision → market activity → player response → expiry**
by the Stage 06 integration test.

The exact rules of every engine are documented in `docs/ENGINE_RULES.md`.

## 12. Economy Integration Boundary

The Corporation Engine produces a `CorporateMarketSignal` (demand pressure, supply pressure, productivity) and the Economy Engine **now consumes it**: the signal modulates the commodity supply and demand by up to 15 %. Without a signal both factors are exactly 1 and the market behaves exactly as in Stage 02 — this is covered by a test.

The City Engine produces a second, independent boundary — the `CityMarketSignal`. A growing city consumes more commodities, so the signal raises the commodity demand by at most 15 % and raises the saturation ceiling of the demand by at most 25 %. The city never adds supply to the market. The signal is only produced while the city runs something, so an untouched city leaves the economy exactly as it was — this is covered by a test as well.

The Competitor AI Engine produces the third boundary — the `CompetitorMarketSignal`. The AI is a **producer**: its bounded production capacity adds up to 12 % to the commodity supply, its demand up to 12 %. A corporation that undercuts the market adds more effective supply than one that pushes the prices up. The signal is only produced while there is at least one corporation.

Every one of the three boundaries follows the same rule: **the absence of the signal preserves the previous behaviour exactly**.

## 13. City Engine (`src/simulation/city/`)

| File | Responsibility |
|------|----------------|
| `cityState.ts` | The city record, the district and building tables, the land map, validation |
| `cityRules.ts` | Land, construction, infrastructure, population, indicators, the market signal |
| `index.ts` | The public surface of the module |

### Data model

The city owns **one** city with five districts, a finite land map of thirty plots and the
building instances of the corporation. The districts, the zoning mix, the plot prices and the
thirteen building definitions are **tables** — a new district or a new building never requires an
engine code change.

### Derived values

The housing capacity, the employment capacity, the infrastructure balance, the building counts and
the district metrics are **computed, never stored**. `city.statistics` is a snapshot that is
recomputed from the authoritative state on every change — it is never a second source of truth.
The city state stays plain and serialisable, and no `Date.now()` or `Math.random()` ever enters
it: every identifier comes from a deterministic sequence.

### Boundaries

- The City Engine imports **no other domain engine**. The integration with the economy happens
  through the `CityMarketSignal` contract; the integration with the corporation happens through
  the existing ledger; the integration with the employees happens through **references** only.
- The city has **no treasury**. Every payment uses the balance of the player corporation.
- The Stage 04 Production Engine remains the only authority for manufacturing. A city building
  contributes to the *city* industrial capacity, which is reported through the city signal — it
  never creates a production order.

## 14. Events Engine (`src/simulation/events/`)

| File | Responsibility |
|------|----------------|
| `eventState.ts` | The event catalogue, the active instances, the news and the validation |
| `eventRules.ts` | Scheduling, activation, expiration, the effect aggregation and the news |
| `index.ts` | The public surface of the module |

### Design

- The catalogue is a **data driven table** of seventeen definitions. An event is a plain,
  serialisable record — there is not a single function inside the data.
- The effects are **typed and bounded**: every multiplier is clamped to 0.5 … 2 and every
  pressure to 0 … 1. Overlapping events stack multiplicatively and the aggregate is clamped
  again, so an event can never produce an unbounded effect.
- The engine publishes an `EventEnvironmentModifiers` snapshot. The affected engines read
  **only** the modifier they care for, and every one of them clamps it again.
- The random sequence comes from a **seeded xorshift generator** whose state lives in the
  events state — the whole event sequence of a run is reproducible and the state stays
  serialisable.
- The engine owns the **news feed** (40 items). Every item refers to a real simulation event.

## 15. Competitor AI Engine (`src/simulation/competitors/`)

| File | Responsibility |
|------|----------------|
| `competitorState.ts` | The AI corporations, the personality profiles, the financial model and the validation |
| `competitorRules.ts` | The decision engine, the research, the financial accrual and the market signal |
| `index.ts` | The public surface of the module |

### Design

- The corporations and the **five personality profiles** are tables. A personality is a weight
  profile — it never introduces random behaviour.
- The AI has its **own compact financial model**. It has no employees, no payroll and no
  ledger, and it never touches the ledger of the player corporation.
- The decisions are **deterministic**: the objectives are evaluated in a fixed order at a
  bounded interval, the tie is always broken the same way and the action type is blocked by a
  cooldown.
- The AI reuses the **existing Stage 04 technology tree** — the same definitions, the same
  prerequisites and the same durations. There is no second tree.
- The AI reports its pressure through the `CompetitorMarketSignal`; it never touches the market
  directly and its influence is bounded.

## 16. Event Communication
`src/core/events/eventBus.ts` — a typed event bus decoupling modules. Simulation events are mirrored there for app-level observers, while the engine exposes direct callbacks (`onTick`, `onStatusChange`) for internal wiring — the simulation itself never depends on the bus.

## 17. Error Handling

`src/core/error/errorHandler.ts` — centralized error handler. Installs global `window.onerror` and `unhandledrejection` handlers, logs via the logger, emits `app:error` events and exposes a `tryCatch` Result helper. `AppError` is defined once in `src/core/types/index.ts` and re-exported.

Domain engines reject invalid input safely: an invalid state or context is logged and the incoming state is returned **unchanged**, so a corrupted state can never propagate through the simulation.

## 18. Logging

`src/core/logging/logger.ts` — centralized logger respecting `VITE_LOG_LEVEL`. Prefix `AETHRION`.

## 19. Environment Configuration

`src/core/config/env.ts` — typed access to Vite env variables. No direct `import.meta.env` reads elsewhere.

## 20. Web Workers (Stage 07)

The simulation can execute off the main thread through a Web Worker:

| Module | Responsibility |
|--------|----------------|
| `src/game/simulation/kernel.ts` | The pure, injected-store simulation kernel — the twelve systems in their documented order |
| `src/game/simulation/types.ts` | The serialisable snapshot/delta, the store interface and the local store |
| `src/game/simulation/protocol.ts` | The typed, versioned request/response contract and the sequence guards |
| `src/game/simulation/workerApi.ts` | The pure Worker API (handshake and tick), unit-testable without a browser |
| `src/game/simulation/worker.ts` | The module Worker entry point (Comlink transport only) |
| `src/game/simulation/transport.ts` | The transport boundary and the Comlink-backed implementation |
| `src/game/simulation/workerClient.ts` | The main-thread adapter: lifecycle, handshake, timeout, sequence validation and fallback |
| `src/game/simulation/metrics.ts` | The bounded performance instrumentation |

The kernel imports no React, DOM, Zustand or rendering code. The clock, the scheduler, the lifecycle and the application of the confirmed delta stay on the main thread. If the Worker is unavailable or fails, the same kernel runs inline and the last confirmed state is preserved.

The full message protocol, the transfer strategy, the determinism guarantees and the recovery rules are documented in `docs/WORKER_ARCHITECTURE.md`. The generic `src/workers/` directory remains reserved for future worker uses.

## 21. Persistence (Stage 08)

`src/game/persistence/` implements the Save & Archive Engine (IndexedDB via `idb`, database `aethrion-save` v1).

| Module | Responsibility |
|--------|----------------|
| `saveTypes.ts` | Versioned payload/metadata/record/archive, slot and autosave config |
| `saveErrors.ts` | Typed recoverable errors |
| `saveValidation.ts` | Structural validation (pre-save, post-migration, pre-load) |
| `saveSerialization.ts` | Explicit allowlist capture/apply of authoritative state and clock |
| `saveIntegrity.ts` | SHA-256 checksum of canonical payload, size measurement |
| `saveMigration.ts` | Sequential, typed migrations |
| `database.ts` | IndexedDB open/upgrade/availability and stores |
| `saveRepository.ts` | Low-level CRUD, slot index, backups |
| `saveBackup.ts` | Portable JSON archive export/import |
| `saveService.ts` | Orchestration, concurrency control, autosave, status |
| `index.ts` | Public API and singleton `saveService` |

- **Allowlist:** 13 authoritative slices + simulation meta + clock snapshot; transient/runtime/UI/Worker state excluded. RNG state persists in `events`.
- **Safety:** confirmed-state saves, non-overlapping writes, backup of previous record, atomic application perspective, failed load preserves active game, restore to paused state, worker reset on restore.
- **Autosave:** simulated-time interval (default 5 sim minutes), post-tick, rotating `autosave` slot.
- **Integrity/migration/archives:** SHA-256 when available (not encryption/anti-cheat), sequential migrations, portable JSON archives imported into new slots by default.

`src/services/persistence/indexedDB.ts` remains a legacy Stage 01 stub. Details: `docs/SAVE_ARCHITECTURE.md`, `docs/SAVE_FORMAT.md`.

## 22. Rendering Engine & World View (Stage 09)

`src/rendering/` implements a rendering-only 3D visualization layer (Three.js `^0.171.0`). It reads authoritative simulation state and never mutates it or contains gameplay rules.

| Module | Responsibility |
|--------|----------------|
| `types/` | Rendering-only types (selection, layout, visual state, quality) |
| `adapters/cityLayout.ts` | Deterministic visual placement from stable district/plot IDs |
| `adapters/cityAdapter.ts` | Read-only mapping from `City` state to visual model |
| `city/palette.ts` | District/category/status visual mapping (colors, height, opacity) |
| `city/CityWorld.ts` | Scene content, incremental sync, selection highlight, disposal |
| `core/quality.ts` | WebGL detection and mobile-conscious render quality settings |
| `core/WorldRenderer.ts` | Renderer/camera/OrbitControls, render loop, resize/visibility/context handling, raycast selection, lifecycle |
| `index.ts` | Public rendering API (legacy Stage 01 exports retained) |

- **Integration:** `src/ui/screens/sections/WorldViewSection.tsx` mounts the renderer, subscribes narrowly to city state, provides camera/focus/clear controls, read-only inspection, and WebGL/error/empty fallbacks with 2D/textual overview.
- **Synchronization:** incremental, ID/state-keyed updates reflecting live simulation and save/load restores; compatible with inline/worker execution (store-driven). No Three.js objects in save format.
- **Performance/safety:** DPR cap and restrained effects, visibility-aware rendering, resize observer, safe dispose, context-loss handling. Three.js split into a dedicated build chunk.

Details: `docs/RENDERING_ARCHITECTURE.md`, `docs/WORLD_VIEW_GUIDE.md`.

## 22. TypeScript Configuration

Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`). Path alias `@/` → `./src`.

## 23. Dependency Rules

- Avoid circular dependencies.
- Game simulation independent from React.
- Three.js independent from game rules.
- Domain modules expose pure functions — the store and the UI never re-implement them.
- UI depends on design tokens only (no hardcoded brand colors).
- The UI never executes simulation rules — it calls the command layer.
