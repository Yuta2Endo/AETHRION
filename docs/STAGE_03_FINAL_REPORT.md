# AETHRION — Stage 03 Final Report

**Project:** AETHRION  
**Stage:** 03 — Corporation & Employee Engines  
**Repository:** `Yuta2Endo/AETHRION`  
**Branch:** `main`  
**Previous stage:** Stage 02 — Game Core & Simulation Foundation (`b3c5646`)  
**Implementation commit:** `36f6afa`  
**Date:** 2026-11-12

---

## 1. Executive Summary

Stage 03 added the **Corporation Engine** and the **Employee Engine** to the Stage 02 simulation backbone. The player can now establish a corporation, hire and dismiss staff, pay periodic payroll and watch how the workforce drives corporate revenue, reputation and progression.

The work stayed strictly inside the roadmap scope. The Stage 02 architecture was extended, not replaced: the Game Core, the Game Clock, the World Engine, the Economy Engine and the Simulation Runner are untouched in their responsibilities, and the world → economy tick order is preserved.

**Headline metrics**

| Metric | Stage 02 | Stage 03 |
|--------|----------|----------|
| Tests | 85 | **170** (85 added) |
| Test files | 8 | 13 |
| Simulation engines implemented | 2 (World, Economy) | **4** (+ Corporation, Employee) |
| New domain modules | — | 6 |
| New dependencies | — | **0** |

---

## 2. Implemented Functionality

### Corporation Engine
- **Creation** — a player corporation with a unique id, a name (2–48 characters), the simulated founding date, a tier, a status, an initial balance of 50 000 AΞ, an initial reputation of 10 and an employee capacity taken from the tier. A second player corporation is refused; duplicate ids and invalid names are rejected with typed errors.
- **Structure** — six flat departments (management, research, engineering, production, marketing, finance) with typed identifiers. Each tier exposes the departments it may staff.
- **Finances** — available balance, revenue, operating expenses, payroll expenses, net profit, a bounded transaction ledger (50) and bounded financial history (24 periods). The balance can never go negative; a transaction that would overdraw it is rejected.
- **Progression** — a data-driven tier table (Startup → Growth → Established → Enterprise) with capacity, revenue/cost factors, available departments and revenue/reputation/headcount requirements. Reputation drifts toward a target derived from lifetime revenue and net profit; the status (`active`, `thriving`, `strained`, `insolvent`) is derived from cash, profitability and missed payrolls.

### Employee Engine
- **Model** — id, name, profession, department, skill, experience, salary, productivity, satisfaction, morale, employment status, hiring date and a bounded development history.
- **Professions** — Manager, Researcher, Engineer, Production Worker, Marketer, each with configurable baseline attributes (salary, skill, experience rate, productivity weight, hiring-cost factor, satisfaction target). New professions are added by extending the table.
- **Hiring** — validated in order: profession → department → department availability at the tier → employee capacity → salary range → available funds. A failed requirement returns a typed error and changes nothing. Identifiers (`emp_0001`) and names are derived from a sequence — no randomness anywhere.
- **Development** — deterministic: experience accrues, skill converges toward an experience-based target, satisfaction toward the profession target adjusted by salary fairness, morale toward a satisfaction-derived target, and productivity from skill and satisfaction. The convergence factor is capped, so a value can never overshoot its target.
- **Payroll** — a seven in-game-day period derived from the simulated clock, settled at most once, paid in full or not at all.

### Command layer
`src/game/commands.ts` is the only entry point for player actions — establish corporation, hire, dismiss. Every rule is validated and applied there, and every failure carries a message the interface can display.

### Interface
The dashboard now contains a Corporation Overview, an Employee Management list, a Hiring panel and a Finance Overview with the transaction ledger. All values come from the live simulation state.

---

## 3. Architecture and Module Structure

```
src/simulation/
  contracts.ts                  # cross-engine contracts (currency, departments, market signal)
  corporation/
    corporationState.ts         # model, tier table, validation
    corporationRules.ts         # creation, transactions, accrual, progression, statistics
    index.ts
  employees/
    employeeState.ts            # model, profession table, deterministic naming, validation
    employeeRules.ts            # creation, hiring, dismissal, development
    payroll.ts                  # period model, calculation, processing
    index.ts
src/game/
  commands.ts                   # the only entry point for player actions
  simulationRunner.ts           # system registry and tick order
  state/gameStore.ts            # corporation + employees slices
  state/selectors.ts            # typed selectors
src/ui/
  components/                   # TextField, SelectField, EmployeeRow, TransactionRow
  screens/sections/             # CorporationOverview, EmployeeManagement, HiringPanel, FinanceOverview
```

### Key architecture decisions

1. **The command layer sits between the interface and the simulation.** React components never execute simulation rules — they call `commands.*`, which validate, apply the domain rules and write the state once. This was a new layer in Stage 03.
2. **Cross-engine contracts live in `src/simulation/contracts.ts`.** The department model and the base currency are shared by both new engines without either importing the other, and without the domain layer importing the game layer.
3. **The Corporation Engine never stores employee data.** Headcount and workforce statistics are derived by `getCorporationStatistics(corporation, workforce)`, which takes a minimal structural `WorkforceMember` view. The Corporation Engine therefore does not import the Employee Engine — the dependency runs one way only (employees → corporation).
4. **Payroll is bound to the simulated clock, not to a calendar.** The period identifier is derived from `elapsedSimMs` (added to `SimulationContext`), which keeps the domain layer free of any dependency on the game layer and makes the period fully deterministic.
5. **Deterministic identifiers.** `generateId` from `core/utils` uses `Date.now()`/`Math.random()` and is therefore unusable inside the simulation. Corporation, employee and transaction ids come from state counters instead.
6. **The economy boundary is defined but deliberately not connected.** `CorporateMarketSignal` is a typed contract in `contracts.ts`. The Economy Engine does not consume it yet — the market model has no goods to sell until products arrive in Stage 04, so wiring it now would be an artificial economic effect.
7. **No persistence and no workers.** The game store still has no `persist` middleware (Stage 08) and no worker code was added (Stage 07).

---

## 4. Corporation Data Model

```ts
interface Corporation {
  id: string;                     // stable, deterministic ('corp_001')
  name: string;
  foundedAtSimMs: number;         // simulated time — never a wall-clock date
  tierId: string;
  level: number;
  status: 'active' | 'thriving' | 'strained' | 'insolvent';
  reputation: number;             // 0..100
  finances: CorporationFinances;
  transactions: CorporationTransaction[];   // bounded to 50
  financialHistory: FinancialSnapshot[];    // bounded to 24 periods
  lastPayrollPeriodId: string | null;       // duplicate-payroll guard
  missedPayrollCount: number;
  transactionSequence: number;              // deterministic transaction ids
}

interface CorporationFinances {
  balance: number;                       // never negative
  lifetimeRevenue: number;
  lifetimeOperatingExpenses: number;
  lifetimePayrollExpenses: number;
  lifetimeHiringCosts: number;
  periodRevenue: number;                 // reset when a period closes
  periodOperatingExpenses: number;
  periodPayrollExpenses: number;
}
```

**Tiers (data driven)**

| Tier | Level | Capacity | Departments | Requirements |
|------|-------|----------|-------------|--------------|
| Startup | 1 | 5 | management, research, engineering | — |
| Growth | 2 | 12 | + marketing | 120 000 revenue, 25 reputation, 4 employees |
| Established | 3 | 25 | + production | 500 000 revenue, 45 reputation, 10 employees |
| Enterprise | 4 | 45 | all six | 2 000 000 revenue, 65 reputation, 20 employees |

---

## 5. Employee Data Model

```ts
interface Employee {
  id: string;                     // 'emp_0001' — deterministic sequence
  name: string;                   // derived from the sequence
  profession: ProfessionId;
  department: DepartmentId;
  skill: number;                  // 0..100
  experience: number;             // simulated hours
  salary: number;                 // paid per payroll period
  productivity: number;           // 0..100
  satisfaction: number;           // 0..100
  morale: number;                 // 0..100
  status: 'active' | 'at-risk' | 'departed';
  hiredAtSimMs: number;
  lastDevelopmentPeriodId: string | null;
  development: EmployeeDevelopment[];   // bounded to 12 entries
}
```

**Professions**

| Profession | Base salary | Base skill | Experience/h | Productivity weight | Hiring factor | Satisfaction target |
|------------|-------------|------------|--------------|---------------------|---------------|---------------------|
| Manager | 2 400 | 55 | 0.90 | 0.90 | 0.40 | 65 |
| Researcher | 1 800 | 50 | 1.20 | 1.05 | 0.35 | 70 |
| Engineer | 2 000 | 52 | 1.10 | 1.00 | 0.35 | 68 |
| Production Worker | 1 300 | 45 | 0.80 | 1.10 | 0.30 | 62 |
| Marketer | 1 600 | 40 | 0.95 | 0.85 | 0.30 | 66 |

---

## 6. Payroll and Financial Rules

### Revenue and cost model (per simulated hour)

```
revenue           = totalWorkforceProductivity × 1.2 × hours × tier.revenueFactor
operatingExpenses = (20 + employeeCount × 6) × hours × tier.operatingCostFactor
netProfit         = revenue − operatingExpenses − payrollExpenses
```

### Transaction rules

- The amount must be a finite number — otherwise the transaction is rejected and logged.
- The resulting balance must not be negative — otherwise the transaction is rejected and the corporation is returned unchanged. **No money is ever created.**
- Every accepted transaction is appended to the ledger (bounded to 50 entries) with the resulting balance and the simulated timestamp.

### Payroll rules

- A period lasts `PAYROLL_PERIOD_MS` = seven in-game days of simulated time.
- The period identifier (`period_0000`, `period_0001`, …) is derived from the elapsed simulated time — never from the wall clock.
- `lastPayrollPeriodId` on the corporation guarantees a period is settled **at most once**; a repeated period is skipped and reported as `alreadyProcessed`.
- The payroll amount is the sum of the salaries of every employed employee.
- **Sufficient funds:** the payroll is paid in full, a `payroll` transaction of the negative amount is recorded, the lifetime and period payroll expenses grow, the workforce returns to `active`, and the period is closed with a financial snapshot.
- **Insufficient funds:** the payroll is **not** paid in part and no money is created. A `payroll-missed` transaction with the shortfall is recorded, `missedPayrollCount` grows, the workforce is put on `at-risk` and satisfaction (−15) and morale (−20) drop. The period is still closed, so it is never retried.
- **No workforce:** the period is marked as processed without a transaction.

---

## 7. Simulation Integration

**Tick execution order (deterministic):**

```
1. Game Clock        — advances simulated time (engine-owned, before the systems)
2. World Engine      — order 10
3. Economy Engine    — order 20   ← consumes the world produced in step 2
4. Employee Engine   — order 30   ← develops the workforce
5. Corporation Engine— order 40
      ├─ accrues revenue and operating costs from the workforce productivity
      ├─ processes the payroll of the current period (at most once)
      └─ updates reputation, tier and status
```

- The Stage 02 **world → economy** order is preserved unchanged.
- The workforce developed in the same tick feeds the corporation in that tick — verified by an integration test that recomputes the expected revenue independently.
- A system that throws is isolated by the Game Core: the failure is recorded and the remaining systems still run.
- Pause stops the tick loop; the corporation and the workforce are untouched while paused.

---

## 8. UI Implementation

### Sections added to the dashboard

| Section | Content |
|---------|---------|
| Corporation Overview | Name, tier, status badge, balance, revenue, operating expenses, net profit, employee count vs. capacity, reputation, workforce productivity, founding date, missed payrolls. Before a corporation exists it shows the **establishment form**. |
| Employee Management | One card per employee: identity, profession · department, status badge, skill, productivity, satisfaction, morale, salary and a dismiss action. Empty state when there is no staff. |
| Hire Personnel | Profession select, department select (limited to the tier), salary input with a live hiring-fee preview, and a hire button. Success and validation-error feedback. |
| Finance Overview | Cash balance, period revenue, operating expenses, payroll expenses, period net profit, the countdown to the next payroll and the most recent transactions. |

### New UI primitives

`TextField`, `SelectField`, `EmployeeRow`, `TransactionRow` — all built from the existing design tokens, no hardcoded brand colors, no duplicated business logic.

### Design-system compliance

Premium Neon Sci-Fi with the Deep Space background, Neon Cyan primary accents and Imperial Purple secondary accents. Numeric values use the mono typeface. Responsive down to 320 px: the establishment form stacks, the transaction table collapses to a two-column card layout, the metric and employee grids reflow to a single column.

### Accessibility

Real `<input>` / `<select>` / `<button>` elements bound to their labels, validation messages with `role="alert"` and `aria-describedby`, `aria-invalid` on invalid fields, `role="status"` for hiring feedback, labelled `section` regions and a single `h1`.

---

## 9. Tests Added

**170 tests in 13 files — all passing** (Stage 02: 85 tests in 8 files).

| File | Tests | Coverage |
|------|-------|----------|
| `src/tests/simulation/corporation.test.ts` | 20 | creation, name/id/date validation, duplicate ids, a second player corporation, state validation, tier initialisation and resolution, transaction application, overdraw rejection, non-finite rejection, bounded ledger, accrual, net profit, progression, derived statistics |
| `src/tests/simulation/employees.test.ts` | 24 | employee creation, profession and department validation, salary boundaries, the profession table, deterministic names and ids, hiring, unique ids, department availability, capacity limit, insufficient funds, hiring cost, dismissal, experience/skill/productivity/satisfaction development, salary fairness, bounded history, reproducibility, workforce summary |
| `src/tests/simulation/payroll.test.ts` | 17 | period identifiers and boundaries, progress, the wall-clock independence, salary totals, departed staff, processing, transaction creation, duplicate prevention, the next period, the financial snapshot, insufficient funds (no money created), the alert status, recovery, an empty workforce, determinism |
| `src/tests/integration/stage03.test.ts` | 15 | the system order, corporation creation through the command layer, hiring and the hiring fee, hiring without a corporation, workforce development and revenue accrual, the same-tick workforce → corporation dependency, one payroll per period, the next period, state synchronisation, pause/resume, determinism across identical runs, error isolation, no implicit corporation, the frame scheduler |
| `src/tests/components/CorporationUi.test.tsx` | 9 | the establishment form, establishing a corporation, a validation error, hiring through the interface, the real balance and figures, the empty state, the hiring fee and capacity hint, the capacity error, the sections hidden before a corporation exists |

**Two Stage 02 tests were adapted** (not weakened):
- `src/tests/integration/simulation.test.ts` — the system registry now contains four systems; the original world → economy assertions are preserved and the new order is asserted in addition.
- `src/tests/components/Dashboard.test.tsx` — the "Empire overview" section was replaced by the corporation section; the test now asserts the establishment form is shown instead of any placeholder statistics.

No test merely asserts that a function exists — every test asserts observable behaviour.

---

## 10. Commands Actually Executed

All commands were executed in `G:\Developing\AETHRION` on Node v26.13.0 / npm 11.20.0.

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ **Pass** — no errors |
| `npm run lint` | ✅ **Pass** — no errors, no warnings (`--max-warnings 0`) |
| `npm test` | ✅ **Pass** — 13 files, **170/170 tests passed**, 0 failed (~5.7 s) |
| `npm run build` | ✅ **Pass** — typecheck + `vite build`, 4991 modules, built in 3.67 s |
| Dev server (`npm run dev`) | ✅ **Pass** — Vite ready, `http://localhost:5173` returned **HTTP 200** |
| `npm audit --omit=dev` | ✅ **0 vulnerabilities** (production runtime) |
| `npm audit` | ⚠️ 17 vulnerabilities — all in devDependencies, unchanged from Stage 02 |

## 11. Typecheck Results

```
> aethrion@0.3.0 typecheck
> tsc --noEmit
```
**Pass — no output, exit code 0.**

## 12. Lint Results

```
> aethrion@0.3.0 lint
> eslint . --ext ts,tsx --max-warnings 0
```
**Pass — no output, exit code 0.**

## 13. Test Results

```
 Test Files  13 passed (13)
      Tests  170 passed (170)
   Duration  5.72 s
```
**All 170 tests pass, 0 failures.** The Stage 01 and Stage 02 suites continue to pass.

## 14. Production Build Results

```
> aethrion@0.3.0 build
> npm run typecheck && vite build

vite v5.4.21 building for production...
✓ 4991 modules transformed.
dist/index.html                 0.58 kB │ gzip:   0.37 kB
dist/assets/index-Bdx-hevN.css 25.06 kB │ gzip:   4.79 kB
dist/assets/index-t47on4R8.js 490.84 kB │ gzip: 148.66 kB
✓ built in 3.67s
```
**Pass.**

---

## 15. Known Limitations

1. **A payroll period is settled the first time the simulation observes it.** With one simulated hour per tick and a seven-day period, the first payroll happens on the first tick after the corporation exists. This is deterministic and never paid twice, but it means a hire is charged a full period's salary almost immediately.
2. **Revenue is a proxy, not a business model.** Revenue is derived from total workforce productivity. There are no products, contracts or customers yet — those arrive in Stage 04.
3. **The corporate market signal is not connected to the Economy Engine.** The typed contract exists; the connection is deferred to Stage 04 because the market model has no goods to offer. No artificial economic effect was forced.
4. **One player corporation only.** The state model supports a list, but a second player corporation is refused by design — a competitor corporation model is a Stage 06 concern.
5. **Departed employees stay in the record** with the status `departed` (they are excluded from the payroll and from the capacity count). There is no purge yet.
6. **The simulation runs on the main thread.** The tick cost is negligible at this scale; the worker split remains a Stage 07 task.
7. **No persistence.** The simulation state is lost on reload — deliberately, save/load is Stage 08.
8. **The corporation tier is driven by lifetime revenue, reputation and headcount.** It cannot fall back to a lower tier — the progression is monotonic by design at this stage.
9. **Playwright browsers are still not installed.** The E2E configuration exists, but no browser binary is available on the machine, so no E2E test was executed. E2E was not a Stage 03 requirement.

---

## 16. Deferred Functionality

Explicitly **not** implemented in Stage 03, per the roadmap:

Technology Research Engine · Product Development Engine · Production Engine · City Engine · Competitor AI · Global events · Web Workers · IndexedDB persistence · Save/load interface · Three.js world rendering · Advanced 3D city · Multiplayer · Cloud synchronization · Google Play Billing · AdMob · a full corporate progression tree · a complex employee training system.

---

## 17. Security and Dependency Observations

- **No dependency changes.** Stage 03 added **zero** packages — the dependency set is identical to Stage 02.
- **Production runtime: clean.** `npm audit --omit=dev` → **0 vulnerabilities**. The runtime bundle is unaffected.
- **Development tooling: unchanged.** `npm audit` → 17 vulnerabilities (3 critical, 2 high, 12 moderate) across the same 16 packages, all reachable through `vitest`, `vite`, `@capacitor/cli` and `typescript-eslint`. Every fix requires a semver-major upgrade (`vitest@5`, `vite@8`, `@capacitor/cli@8`) and `typescript-eslint` has no fix available. Per the stage rules **no automatic `npm audit fix` was run**; the remediation paths remain documented in `docs/SECURITY_AUDIT.md` and are scheduled as a separate maintenance task with mandatory re-validation.
- **No secrets or credentials** were introduced. The `.gitignore` still excludes the local `.env.*` files (only `.env.example` is tracked).
- **No real-money transactions and no monetization.** All monetary values are in-game Aether Credits.

---

## 18. Git Commit Information

| Commit | Content |
|--------|---------|
| `36f6afa` | `feat(stage-03): Corporation & Employee Engines` — implementation, tests and documentation updates |
| *(this commit)* | `docs(stage-03): add final report` — `docs/STAGE_03_FINAL_REPORT.md` |

- Branch: `main`, based on the Stage 02 commit `b3c5646`.
- No history was rewritten, no force-push was used, no user changes were discarded (the working tree was clean before the stage started).

### Files created (21)

| File | Purpose |
|------|---------|
| `src/simulation/contracts.ts` | Cross-engine contracts: base currency, department model, corporate market signal |
| `src/simulation/corporation/corporationState.ts` | Corporation model, tier table, validation |
| `src/simulation/corporation/corporationRules.ts` | Creation, transactions, accrual, progression, statistics |
| `src/simulation/employees/employeeState.ts` | Employee model, profession table, deterministic naming, validation |
| `src/simulation/employees/employeeRules.ts` | Creation, hiring, dismissal, development |
| `src/simulation/employees/payroll.ts` | Payroll period model, calculation, processing |
| `src/game/commands.ts` | Command layer — the only entry point for player actions |
| `src/ui/components/TextField.tsx` | Labelled text input with hint and validation |
| `src/ui/components/SelectField.tsx` | Labelled select with hint and validation |
| `src/ui/components/EmployeeRow.tsx` | Employee card |
| `src/ui/components/TransactionRow.tsx` | Ledger entry row |
| `src/ui/screens/sections/CorporationOverview.tsx` | Corporation overview and the establishment form |
| `src/ui/screens/sections/EmployeeManagement.tsx` | Employee list and dismiss action |
| `src/ui/screens/sections/HiringPanel.tsx` | Hiring form with feedback |
| `src/ui/screens/sections/FinanceOverview.tsx` | Financial figures, payroll countdown and transactions |
| `src/tests/simulation/corporation.test.ts` | Corporation Engine tests |
| `src/tests/simulation/employees.test.ts` | Employee Engine tests |
| `src/tests/simulation/payroll.test.ts` | Payroll tests |
| `src/tests/integration/stage03.test.ts` | Simulation integration tests |
| `src/tests/components/CorporationUi.test.tsx` | Interface tests |
| `docs/STAGE_03_FINAL_REPORT.md` | This report |

### Files modified (16)

| File | Change |
|------|--------|
| `src/simulation/corporation/index.ts` | Barrel over the new corporation modules |
| `src/simulation/employees/index.ts` | Barrel over the new employee modules |
| `src/game/state/gameStore.ts` | `corporation` and `employees` slices, `elapsedSimMs` in the simulation meta |
| `src/game/state/selectors.ts` | Corporation and employee selectors |
| `src/game/systems/index.ts` | Exports the command layer and the new selectors |
| `src/game/simulationRunner.ts` | Employee (30) and corporation (40) systems, documented tick order |
| `src/game/engine/types.ts` | `elapsedSimMs` in `SimulationContext` |
| `src/game/engine/gameEngine.ts` | Provides `elapsedSimMs` to the systems |
| `src/core/events/eventBus.ts` | `elapsedSimMs` in the tick event |
| `src/ui/screens/Dashboard.tsx` | The four new sections; the placeholder empire section removed |
| `src/ui/components/index.ts` | Exports the new primitives |
| `src/app/navigation/MainNavigation.tsx` | Corporation and Employees marked as implemented |
| `src/index.css` | Styles for the corporation, employee, hiring and finance sections, incl. responsive rules |
| `src/tests/components/Dashboard.test.tsx` | Adapted to the new dashboard structure |
| `src/tests/integration/simulation.test.ts` | Adapted to the new system order |
| `package.json` | Version `0.2.0` → `0.3.0` |

### Documentation updated

`docs/TECHNICAL_ARCHITECTURE.md` · `docs/DEVELOPMENT_ROADMAP.md` · `docs/GAME_DESIGN_OVERVIEW.md` · `docs/DESIGN_SYSTEM.md` · `docs/STAGE_03_FINAL_REPORT.md` (new)

---

## 19. Final Stage Status

**STAGE 03: COMPLETE**

| Acceptance criterion | Status |
|----------------------|--------|
| Corporation creation works | ✅ 20 corporation tests |
| Corporation financial state is valid | ✅ overdraw, non-finite and out-of-range rejection tested |
| Employees can be hired | ✅ hiring validated and tested end to end |
| Employee professions and departments are validated | ✅ 24 employee tests |
| Payroll is integrated with simulated time | ✅ seven-day period derived from `elapsedSimMs` |
| Duplicate payroll processing is prevented | ✅ `lastPayrollPeriodId` guard, tested |
| Employee development is deterministic | ✅ reproducibility test over 20 ticks |
| Corporation and employee data remain synchronized | ✅ integration test on the closed period |
| The UI uses real simulation state | ✅ 9 interface tests, no placeholder data |
| All new automated tests pass | ✅ 85 added, all passing |
| All previous tests pass | ✅ 170/170 in total |
| Typecheck passes | ✅ no errors |
| Lint passes | ✅ no errors, no warnings |
| Production build passes | ✅ 3.67 s |
| Architecture and roadmap documentation updated | ✅ 4 documents updated, 1 created |
| Final report created | ✅ this document |

**Stage 04 was not started.** No technology, research, production, manufacturing, supply chain, city, competitor AI, events, worker, persistence or monetization code was introduced.
