# AETHRION — Technical Architecture

**Project:** AETHRION  
**Stage:** 04 — Technology & Production Engines

> The exact rules of the Stage 04 engines are documented in `docs/ENGINE_RULES.md`.
> This document describes the architecture and the layering.

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
| City Engine | Cities, buildings | Core |
| Events Engine | World events, news | Core |
| Competitor AI Engine | AI corporations | Core |
| Save & Archive | IndexedDB persistence | idb |
| Rendering Engine | Three.js scenes, cameras, materials | Three.js |
| UI System | Components, screens, theme, tokens | React, Framer Motion |
| Platform Integration | Capacitor, Android | Capacitor |

## 3. Cross-Engine Contracts (`src/simulation/contracts.ts`)

Plain, dependency-free types shared by two or more engines: the base currency, the corporate department model and the `CorporateMarketSignal` integration boundary. This module holds **no engine logic** — it only provides the vocabulary that lets the engines talk to each other without importing each other.

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
| `simulation` | Game Core | Status, tick, simulated time, date, speed |

The game store contains **no domain logic** — it stores the results produced by the domain modules and exposes controlled update actions. It does **not** use the zustand `persist` middleware; persistent storage is an IndexedDB concern reserved for Stage 08.

**Ownership rule:** the Corporation Engine never stores employee data. Headcount and workforce statistics are *derived* by `getCorporationStatistics(corporation, workforce)`, which accepts a minimal structural `WorkforceMember` view — so the Corporation Engine does not import the Employee Engine. The same principle applies to the Resource Engine (it never stores product or production data) and to the Product Engine (it never stores resource balances).

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
| `shared.ts` | `failure`, `requireCorporation`, `chargeCorporation`, `storeCorporation`, `validateEmployeeAssignment` |
| `index.ts` | The aggregated `commands` object |

Every command returns a `Result<T, AppError>` so the interface can display a precise validation message. **A failed command leaves the game state unchanged** — including the case where a production order cannot be charged: the resource reservation is rolled back.

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

`src/game/simulationRunner.ts` registers nine systems in a fixed order:

```
1. Game Clock        — advances simulated time (engine-owned, before the systems)
2. World Engine      — order 10
3. Economy Engine    — order 20   ← consumes the world of step 2 and the corporate market signal
4. Employee Engine   — order 30   ← develops the workforce
5. Technology Engine — order 40   ← research uses the workforce of step 4
6. Product Engine    — order 50   ← development uses the unlocked technologies
7. Resource Engine   — order 60   ← resource bookkeeping
8. Production Engine — order 70   ← consumes the reserved resources
9. Market Engine     — order 80   ← sells the finished goods
10. Corporation Engine— order 90
      ├─ accrues revenue and operating costs from the workforce productivity
      ├─ processes the payroll of the current period (at most once)
      └─ updates reputation, tier and status
```

The Stage 02 **world → economy** order is preserved. The workforce developed in the same tick feeds the corporation in that tick — verified by an integration test that recomputes the expected revenue independently. The full chain **research → unlock → development → resource purchase → production → inventory → market sale → revenue** is covered by an end-to-end integration test.

The exact rules of every engine are documented in `docs/ENGINE_RULES.md`.

## 12. Economy Integration Boundary

The Corporation Engine produces a `CorporateMarketSignal` (demand pressure, supply pressure, productivity) and the Economy Engine **now consumes it**: the signal modulates the commodity supply and demand by up to 15 %. Without a signal both factors are exactly 1 and the market behaves exactly as in Stage 02 — this is covered by a test.

## 13. Event Communication

`src/core/events/eventBus.ts` — a typed event bus decoupling modules. Simulation events are mirrored there for app-level observers, while the engine exposes direct callbacks (`onTick`, `onStatusChange`) for internal wiring — the simulation itself never depends on the bus.

## 14. Error Handling

`src/core/error/errorHandler.ts` — centralized error handler. Installs global `window.onerror` and `unhandledrejection` handlers, logs via the logger, emits `app:error` events and exposes a `tryCatch` Result helper. `AppError` is defined once in `src/core/types/index.ts` and re-exported.

Domain engines reject invalid input safely: an invalid state or context is logged and the incoming state is returned **unchanged**, so a corrupted state can never propagate through the simulation.

## 15. Logging

`src/core/logging/logger.ts` — centralized logger respecting `VITE_LOG_LEVEL`. Prefix `AETHRION`.

## 16. Environment Configuration

`src/core/config/env.ts` — typed access to Vite env variables. No direct `import.meta.env` reads elsewhere.

## 17. Web Workers

`src/workers/` is reserved for Stage 07. Worker integration is deliberately **not** implemented in Stage 03.

## 18. Persistence

`src/services/persistence/indexedDB.ts` — IndexedDB (via `idb`). Wired up in Stage 08.

## 19. TypeScript Configuration

Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`). Path alias `@/` → `./src`.

## 20. Dependency Rules

- Avoid circular dependencies.
- Game simulation independent from React.
- Three.js independent from game rules.
- Domain modules expose pure functions — the store and the UI never re-implement them.
- UI depends on design tokens only (no hardcoded brand colors).
- The UI never executes simulation rules — it calls the command layer.
