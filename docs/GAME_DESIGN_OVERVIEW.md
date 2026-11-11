# AETHRION — Game Design Overview

**Project:** AETHRION  
**Stage:** 03 — Corporation & Employee Engines  
**Status:** World, Economy, Corporation and Employee systems implemented; all other gameplay systems remain in later stages.

## 1. Genre & Vision

Hybrid Empire Simulator combining Business Tycoon, Economic Strategy, City Builder, Life Simulation, Technology Simulator, and Global Empire Management.

The player starts with a small technology corporation and builds a global empire. The world evolves in response to player decisions.

## 2. Core Player Activities

- Establish corporations *(Stage 03 — implemented)*
- Hire and manage employees *(Stage 03 — implemented)*
- Develop technologies (research tree) *(Stage 04)*
- Build factories and research centers *(Stage 04)*
- Manufacture products *(Stage 04)*
- Manage supply chains *(Stage 04)*
- Develop cities *(Stage 05)*
- Influence global markets *(Stage 02 baseline)*
- Compete against AI corporations *(Stage 06)*
- Expand across world regions *(Stage 02 baseline)*
- Shape the future of civilization

## 3. Domain Modules

| Module | Responsibility | Status |
|--------|----------------|--------|
| Game Core | Tick loop, lifecycle, deterministic system order | **Implemented (Stage 02)** |
| Game Clock | Simulated in-game date and time | **Implemented (Stage 02)** |
| Game State | Canonical simulation state, controlled updates | **Implemented (Stage 02)** |
| World Engine | Global regions, indicators, world-state evolution | **Baseline (Stage 02)** |
| Economy Engine | Currencies, markets, prices, supply/demand | **Baseline (Stage 02)** |
| Corporation Engine | Corporation, departments, tiers, finances, ledger | **Implemented (Stage 03)** |
| Employee Engine | Employees, professions, hiring, development | **Implemented (Stage 03)** |
| Payroll | Periodic settlement bound to the simulated clock | **Implemented (Stage 03)** |
| Technology Engine | Technology tree, research, unlocks | Typed interface only |
| Production Engine | Factories, products, manufacturing, supply chains | Typed interface only |
| City Engine | Cities, buildings, urban development | Typed interface only |
| Events Engine | World events, news, scenario triggers | Typed interface only |
| Competitor AI Engine | AI corporations, competitive behavior | Typed interface only |
| Save & Archive Engine | Persistence (IndexedDB) | Stage 08 |

## 4. World Rules (Stage 02 baseline)

The world consists of **five fictional regions**, each with a stable identifier, a tier and four normalised indicators (0..100).

| Region | Id | Tier | Role in the world |
|--------|----|------|-------------------|
| Aurora Basin | `aurora-basin` | core | Mature hub — highest development and market activity |
| Nova Reach | `nova-reach` | developed | Industrial and commercial centre |
| Helion Rift | `helion-rift` | emerging | Fastest growing region, energy research base |
| Cyther Peaks | `cyther-peaks` | emerging | Materials and mining frontier |
| Vanta March | `vanta-march` | frontier | Barely developed outer region |

**Indicators:** `development`, `infrastructure`, `researchCapacity`, `marketActivity`.

**Evolution rules** (all rates per simulated hour, deterministic, no randomness):

1. `development += developmentTrend × stability`
2. `infrastructure` converges toward `development` (8 % of the gap per hour)
3. `researchCapacity` converges toward `infrastructure` (5 % per hour) once infrastructure ≥ 40, otherwise it decays toward it (2 % per hour)
4. `marketActivity` converges toward `infrastructure` (6 % of the gap per hour)
5. `stability` drifts toward `0.55 + development / 250` (2 % of the gap per hour)

All indicators are clamped to 0..100 and stability to 0..1. An invalid world state (duplicate identifiers, non-finite or out-of-range values, a dangling `activeRegionId`) is rejected: the engine logs the failure and leaves the state untouched.

## 5. Economy Rules (Stage 02 baseline)

**Currencies:** `aeth` — Aether Credits (AΞ), base value 1; `volt` — Volt Standard (V), base value 0.18.

**Traded commodities:** Quantum Core (compute), Helion Cell (energy), Nano Lattice (materials), Orbital Freight (logistics). Each has a reference price, a price floor and ceiling, a reference supply/demand level and per-hour growth rates.

**Price model:**

```
imbalance   = (demand - supply) / max(demand + supply, 1)        →  -1 … 1
targetPrice = basePrice × (1 + imbalance × 0.45)
newPrice    = price + (targetPrice - price) × 0.15 × hours
price       = clamp(newPrice, priceFloor, priceCeiling)
```

**Supply and demand** grow proportionally to their reference level, so growth compounds instead of running away. Demand is additionally scaled by the world's commercial activity:

```
demandFactor = 1 + (marketActivityIndex / 100) × 0.5
```

Demand is saturated at 3× its reference level. A bounded price history (24 samples) is kept per commodity.

The world therefore influences the market: a more developed world raises commercial activity, which raises demand, which pushes prices up.

**Validation:** non-finite values, prices outside their band and invalid tick contexts are rejected — the economy is returned unchanged and the failure is logged.

## 6. Corporation Rules (Stage 03)

The player establishes **one** corporation. Its name must be 2–48 characters; a second player corporation is refused.

**Departments:** `management`, `research`, `engineering`, `production`, `marketing`, `finance`. Each tier exposes the departments it may staff — the Startup tier can staff management, research and engineering only.

**Tiers** (data driven, extended by adding a row to the table):

| Tier | Level | Capacity | Departments | Requirements |
|------|-------|----------|-------------|--------------|
| Startup | 1 | 5 | management, research, engineering | — |
| Growth | 2 | 12 | + marketing | 120 000 lifetime revenue, 25 reputation, 4 employees |
| Established | 3 | 25 | + production | 500 000 revenue, 45 reputation, 10 employees |
| Enterprise | 4 | 45 | all six | 2 000 000 revenue, 65 reputation, 20 employees |

**Financial rules** (per simulated hour):

```
revenue           = totalWorkforceProductivity × 1.2 × hours × tier.revenueFactor
operatingExpenses = (20 + employees × 6) × hours × tier.operatingCostFactor
netProfit         = revenue − operatingExpenses − payrollExpenses
```

- The cash balance is never negative: a transaction that would overdraw is rejected.
- Reputation drifts toward `10 + lifetimeRevenue/50 000 × 0.5 + lifetimeNetProfit/25 000 × 0.5`.
- The status is derived: `insolvent` (no cash), `strained` (a missed payroll or a loss), `thriving` (profit and reputation ≥ 40), otherwise `active`.
- The transaction ledger is capped at 50 entries and the financial history at 24 periods.

**Hiring fee:** `200 + salary × profession.hiringCostFactor`, charged from the cash balance.

## 7. Employee Rules (Stage 03)

| Profession | Base salary | Base skill | Experience/h | Productivity weight | Hiring factor |
|------------|-------------|------------|--------------|---------------------|---------------|
| Manager | 2 400 | 55 | 0.90 | 0.90 | 0.40 |
| Researcher | 1 800 | 50 | 1.20 | 1.05 | 0.35 |
| Engineer | 2 000 | 52 | 1.10 | 1.00 | 0.35 |
| Production Worker | 1 300 | 45 | 0.80 | 1.10 | 0.30 |
| Marketer | 1 600 | 40 | 0.95 | 0.85 | 0.30 |

Salaries are configurable per hire between 300 and 10 000.

**Development** (deterministic, no randomness):

```
experience  += profession.experienceRate × hours
skill        ← converge(skill, baseSkill + experience × 0.35, 5 %/h)
satisfaction ← converge(satisfaction, profession.target + salaryFairness, 4 %/h)
morale       ← converge(morale, 30 + satisfaction × 0.7, 3 %/h)
productivity  = clamp(skill × profession.weight + (satisfaction − 50) × 0.2, 0, 100)
```

`salaryFairness` is `(salary / baseSalary − 1) × 20`, clamped to ±20 — paying above the market rate improves satisfaction, paying below erodes it. The convergence factor is capped so a value can never overshoot its target.

**Employment status:** `active`, `at-risk` (a payroll period was missed) or `departed`.

## 8. Payroll Rules (Stage 03)

- A payroll period lasts **seven in-game days** of simulated time.
- The period identifier is derived from the elapsed simulated time, so the payroll follows the game calendar and never the wall clock.
- Each period is settled **at most once** — the last settled period is stored on the corporation.
- The payroll is paid in full or not at all. **No money is ever created.**
- When the balance is insufficient, a `payroll-missed` entry records the shortfall, the workforce is put on `at-risk` and satisfaction (−15) and morale (−20) drop. A later successful payroll restores `active`.
- Every payroll produces a financial snapshot for the closed period and resets the period counters.

## 9. Simulation Principles

- Game simulation does **not** depend on React components.
- The interface never executes simulation rules — it calls the command layer.
- Three.js is responsible for rendering only — never game rules.
- Simulated time is tick-driven and never reads the system clock.
- Domain rules are pure functions: same input → same output.
- Expensive simulation tasks run in Web Workers (via Comlink) when justified *(Stage 07)*.
- Typed interfaces between modules; no circular dependencies.
- All modules testable in isolation.
