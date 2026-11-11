# AETHRION — Game Design Overview

**Project:** AETHRION  
**Stage:** 06 — Events & Competitor AI Engines  
**Status:** World, Economy, Corporation, Employee, Technology, Product, Resource, Production, Market, City, Events and Competitor systems implemented; the remaining gameplay systems stay in later stages.

> The exact rules of the Stage 04, Stage 05 and Stage 06 engines are documented in `docs/ENGINE_RULES.md`.

## 1. Genre & Vision

Hybrid Empire Simulator combining Business Tycoon, Economic Strategy, City Builder, Life Simulation, Technology Simulator, and Global Empire Management.

The player starts with a small technology corporation and builds a global empire. The world evolves in response to player decisions.

## 2. Core Player Activities

- Establish corporations *(Stage 03 — implemented)*
- Hire and manage employees *(Stage 03 — implemented)*
- Develop technologies (research tree) *(Stage 04 — implemented)*
- Build factories and research centers *(Stage 04 — manufacturing facilities implemented)*
- Manufacture products *(Stage 04 — implemented)*
- Manage supply chains *(Stage 04 — baseline: resources, reservations, production)*
- Develop cities *(Stage 05 — implemented)*
- Influence global markets *(Stage 02 baseline, Stage 04 product sales, Stage 05 urban demand)*
- Compete against AI corporations *(Stage 06 — implemented)*
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
| Technology Engine | Technology tree, research projects, unlocks | **Implemented (Stage 04)** |
| Product Engine | Product catalogue, development projects, quality | **Implemented (Stage 04)** |
| Resource Engine | Resource inventory, pricing, reservations | **Implemented (Stage 04)** |
| Production Engine | Facilities, production orders, manufacturing | **Implemented (Stage 04)** |
| Market Engine | Listings, demand, sales, corporate market signal | **Implemented (Stage 04)** |
| City Engine | City, districts, land, buildings, infrastructure, population | **Implemented (Stage 05)** |
| Events Engine | Global events, their effects, the event history and the news | **Implemented (Stage 06)** |
| Competitor AI Engine | AI corporations, their decisions, finances and market presence | **Implemented (Stage 06)** |
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

## 10. The Economic Gameplay Loop (Stage 04)

Stage 04 introduces the first complete economic loop. Every step is driven by the simulated clock
and by real employee contributions — nothing is granted.

```
Research → Technology Unlock → Product Development → Resource Acquisition
        → Manufacturing → Inventory → Market Sales → Revenue → Corporate Growth
```

| Step | What the player does | What the simulation does |
|------|----------------------|--------------------------|
| **Research** | Picks a technology, assigns a researcher, pays the research cost | The researcher's skill and productivity drive the progress; the technology unlocks and its effects apply to the whole corporation |
| **Technology Unlock** | — | The production efficiency, research speed, quality bonus, market reach and resource yield multipliers become active |
| **Product Development** | Picks a product blueprint that the unlocked technology allows, assigns engineers, pays the development cost | The engineers' skill and productivity drive the progress; on completion the quality, innovation and market readiness are computed from transparent factors |
| **Resource Acquisition** | Buys raw materials, metals, electronics, energy, components, advanced materials, research data and industrial chemicals from the market | The price follows the linked market commodity; the purchase is charged to the corporate ledger and the inventory grows |
| **Manufacturing** | Builds a facility, picks a finished product, sets a quantity | The resources are reserved, the duration and the operating cost are computed from the facility efficiency and the assigned workforce; the order progresses with the simulated time |
| **Inventory** | — | The reserved resources are consumed and the finished units enter the product inventory |
| **Market Sales** | Sets a price and offers the product on the market | The demand follows the commercial activity, the quality, the price and the market reach; the sales are limited by the inventory; the revenue reaches the corporate ledger in batches |
| **Corporate Growth** | — | The revenue, the expenses and the ledger update the balance, the net profit, the reputation and the corporate tier |

**Design guarantees**

- No money is created without a recorded transaction.
- No resource quantity ever becomes negative and a failed operation never partially consumes.
- A production order can never complete twice and a payroll period can never be paid twice.
- Quality and prices are computed from documented formulas — there is no hidden randomness.
- The world still influences the market: a more developed world raises the commercial activity,
  which raises the demand for the corporation's products.

## 11. The Urban Gameplay Loop (Stage 05)

Stage 05 turns the corporation into a presence in a living city. Every step is driven by the
simulated clock and by real city conditions — nothing is granted.

```
Land Acquisition → Construction → Infrastructure → Housing → Population
                → Industry → Commercial Activity → Urban Growth → Corporate Expansion
```

| Step | What the player does | What the simulation does |
|------|----------------------|--------------------------|
| **Land Acquisition** | Buys a plot of the thirty available | The price is charged to the corporate ledger; the plot becomes owned and can never be resold to anybody else after a disposal |
| **Construction** | Picks a building and a compatible plot, pays the construction cost | The construction progresses with the simulated time and completes exactly once; the plot becomes occupied |
| **Infrastructure** | Builds power stations, water plants, logistics centers and commercial centers | The capacity and the demand of the four networks are aggregated city wide; a shortage reduces the output of the buildings and, below the minimum service level, shuts them down |
| **Housing** | Builds residential complexes and high-density housing | The housing capacity rises, the population converges towards it and is capped by it |
| **Population** | — | The residents fill the positions the city offers; the unemployment is derived and never negative |
| **Industry** | Builds factories, plants and assembly facilities | The city industrial capacity rises and the environment degrades with the pollution of the industry |
| **Urban Growth** | — | Prosperity, infrastructure, environment, public services and the development level converge towards targets derived from the actual city conditions |
| **Corporate Expansion** | — | The city raises the commodity demand of the economy and the operating cost of the city reduces the corporate net profit |

### The five districts

| District | Type | Role |
|----------|------|------|
| Downtown | commercial | Corporate offices and commercial activity |
| Industrial Zone | industrial | Manufacturing and the logistics network |
| Research Park | research | Research facilities and technology development |
| Residential District | residential | Housing and the workforce of the city |
| Energy District | energy | Power generation and the water network |

### Design guarantees

- The city is **deterministic** — the same inputs always produce the same city. There is no
  randomness anywhere in the urban simulation.
- The city has **no treasury**: every payment goes through the corporate ledger, and a failed
  operation changes neither the city nor the corporation.
- The **Employee Engine stays the only authority** for the corporate employees. The city stores
  references only, and the city population, the available workforce and the occupied positions are
  three separate figures that are never counted twice.
- The city is a **consumer**, never a producer: it raises the commodity demand by at most 15 %
  and never adds supply to the market.
- Expansion is **never free**: the construction is a capital expenditure, the operating cost of the
  running buildings reduces the corporate net profit, and the infrastructure must keep up.
- The Stage 04 Production Engine remains the only authority for manufacturing — the city never
  creates a production order.

## 12. The Living World (Stage 06)

Stage 06 makes the world **alive**. Global events change the conditions of the sector, three
independent AI corporations react to those conditions and compete for the same commodities, and
the player has to live with the consequences.

```
World Conditions → Global Events → Competitor Decisions → Market Changes
                → Player Consequences → Strategic Response
```

### 12.1 The global events

Seventeen events in six categories — economic, technology, industrial, energy, environment and
geopolitical. A recession empties the order books, a scientific breakthrough accelerates every
research programme, an energy crisis multiplies the operating costs and presses on the
infrastructure of the city, a supply chain disruption slows the factories down.

Every event:

- has a **bounded effect** — a multiplier between 0.5 and 2 or a pressure between 0 and 1;
- **stacks** with the other active events, multiplicatively and with a documented clamp;
- **expires exactly once** and stops influencing the simulation;
- is scheduled **deterministically** — the same run always produces the same sequence.

Seven events offer the player a **real choice** with a real cost and a measurable result:
invest in energy efficiency, stockpile materials during a shortage, cut the operating expenses
during a recession, fund compliance during a regulation, localise the supply chain during a
trade war.

### 12.2 The AI corporations

| Corporation | Focus | Strategy | Personality |
|-------------|-------|----------|-------------|
| NEXORA INDUSTRIES | Computing and frontier technology | Technology leadership | Innovative |
| VANTEX GLOBAL | Industry, materials and logistics | Operational efficiency | Conservative |
| HELION DYNAMICS | Energy, infrastructure and advanced materials | Resource control | Defensive |

Each of them has its **own capital**, its **own objectives**, its **own research**, its **own
market presence** and its **own relationship with the player**. They read the world, they
compete for the same commodities and they publish their decisions in the news.

The AI is deterministic, affordable and can fail: a corporation without a market presence earns
nothing, a recession drives it into the defensive and a badly managed corporation runs out of
money.

### 12.3 The competitive market

The AI is a **producer** in the commodity market — its bounded production capacity raises the
supply by at most 12 % and its demand by at most 12 %. A corporation that undercuts the market
adds more effective supply than one that pushes the prices up. The city remains a **consumer**.

The player sees the pressure per commodity category in the market section.

### Design guarantees

- **No randomness in the simulation.** The event sequence comes from a seeded generator whose
  state lives in the simulation state; the AI decides with explicit weights.
- **No second economy, market or ledger.** The AI reports its pressure through a typed
  contract; the Economy Engine applies it.
- **The absence of a signal preserves the previous behaviour exactly** — the same rule that
  already governed the corporate and the city signals.
- **The AI never touches the player finances.** The player may only inspect a corporation.
- **The news is never invented** — every headline refers to a real simulation event.
