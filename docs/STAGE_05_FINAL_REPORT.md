# AETHRION — Stage 05 Final Report: City Engine

**Project:** AETHRION — Premium Neon Sci-Fi Hybrid Empire Simulator
**Repository:** `Yuta2Endo/AETHRION`
**Branch:** `main`
**Stage:** 05 — City Engine & Urban Infrastructure
**Status:** **COMPLETE**

---

## 1. Executive Summary

Stage 05 turns AETHRION from a corporate management game into a game with a **living city**.
AETHRION now owns its first functional urban environment — a deterministic, data-driven city of
five districts, thirty land plots and thirteen building types — that is economically connected to
the corporation that already existed from Stages 03 and 04.

The direction of the loop is the one the vision demands:

```
Corporation → Investment → Land Acquisition → Construction → Infrastructure
            → Employment → Economic Activity → Urban Growth → Corporate Expansion
```

Nothing in Stage 05 is a dashboard decoration. Every number rendered in the interface comes
from the simulation state, every button performs a real action through the command layer, and
every cost moves the corporate balance through the existing financial ledger.

The stage was completed with **no architectural rewrite**. The City Engine follows the
conventions established by the World, Economy, Corporation, Employee, Technology, Product,
Resource, Production and Market engines: a `*State.ts` data model with the tables and the
validation, a `*Rules.ts` module of pure deterministic rules, a public `index.ts`, a slice in the
game store, a module in the command layer and a system in the simulation runner.

**Validation at the time of writing:** 360 tests pass (285 before the stage), `tsc --noEmit` is
clean, ESLint passes with `--max-warnings 0`, the production build succeeds and `npm audit`
reports **0 vulnerabilities**.

---

## 2. Initial Repository State and Commit

| Item | Value |
|------|-------|
| Branch | `main` (tracking `origin/main`) |
| HEAD commit at the start | `c428ec2d4cd05e88006c57f26b2a14ff53b66d2d` (`c428ec2`) |
| HEAD subject | `chore(deps): upgrade toolchain to close all dev advisories` |
| Working tree | **clean** — no user changes to preserve, nothing discarded |
| Version | `0.4.0` |
| Prior stage | Stage 04 — Technology & Production Engines (`76682b9`) |

The baseline was validated before any change was made: 285 tests passing, typecheck clean, lint
clean.

---

## 3. Architecture Audit Findings

The repository was inspected in full before implementation: the documentation (`DEVELOPMENT_ROADMAP`,
`TECHNICAL_ARCHITECTURE`, `GAME_DESIGN_OVERVIEW`, `DESIGN_SYSTEM`, `ENGINE_RULES`, the four
stage reports), every simulation engine, the game core, the clock, the state, the selectors, the
command layer, the interface and the full test suite.

### 3.1 What the audit established

| Finding | Consequence for Stage 05 |
|---------|---------------------------|
| The City Engine existed as a **Stage 01 placeholder** (`src/simulation/city/index.ts`, 23 lines, three empty types). | It was replaced in place — the module path and the export name stay the same, so nothing else had to move. |
| The domain convention is **`xxxState.ts` (model + tables + validation) + `xxxRules.ts` (pure rules) + `index.ts` (public surface)**. | The City Engine follows it exactly. |
| The command layer was **already split per domain** in Stage 04 — there is no monolithic `commands.ts` to restore. | A new `cityCommands.ts` was added next to the five existing modules. |
| Every financial change goes through `recordFinancialEvent` and the typed `TransactionType` union. | Two transaction types (`city`, `city-sale`) and two lifetime counters were **added to the existing model**; no second financial state was created. |
| The Production Engine owns manufacturing (facilities, orders, reservations, inventory). | The city does **not** create facilities or production orders. The safe integration is a city-level industrial capacity that is reported through the city signal. |
| The Employee Engine owns the employee records; the Corporation Engine only holds *references* (`assignedEmployeeIds`) on its facilities. | The city follows the same pattern — a city building holds references only. |
| The World Engine stores its indicators and converges them toward targets; `getWorldMetrics` derives the aggregates. | The city stores its indicators and converges them toward targets; `computeCityStatistics` and `getDistrictMetrics` derive the aggregates. **The specification's model was adapted to this convention**: values that can be derived safely are computed, not stored. |
| The economy already consumed one optional signal (`CorporateMarketSignal`) with the documented rule "without a signal the behaviour is exactly as before". | The city signal was built as the second, independent instance of exactly that pattern. |
| The simulation runner registers systems with an explicit numeric `order`; `stage04.test.ts` asserts the exact system list. | The City Engine was inserted at **order 15**, between the world (10) and the economy (20), because the economy consumes the city signal. The three tick-order assertions were updated — a documented, legitimate architecture change (see §15.3). |

### 3.2 The conflict that was avoided

The specification proposed a city order of 7 (after the products). Adopting it blindly would have
made the economy consume a **stale** city signal. The real data dependency is **city → economy**,
so the city runs *before* the economy and the market reacts to the city in the same tick. The
Stage 02 **world → economy** dependency is untouched.

### 3.3 The coupling that was avoided

A second financial state (a city treasury), a second employee authority (city staff records), a
second production authority (city factories) and a second market model (city prices) were all
explicitly rejected. The city uses the corporate balance and ledger, references the corporate
employees, reports a city-level industrial capacity instead of manufacturing, and signals demand
to the existing economy instead of pricing anything itself.

---

## 4. Implemented Systems

| # | System | Location |
|---|--------|----------|
| 1 | City state and City Engine | `src/simulation/city/cityState.ts`, `src/simulation/city/cityRules.ts`, `src/simulation/city/index.ts` |
| 2 | Land and District Management | `cityState.ts` (districts, plots, map), `cityRules.ts` (`purchasePlot`, `sellPlot`) |
| 3 | Building definitions and construction | `cityState.ts` (`BUILDING_DEFINITIONS`), `cityRules.ts` (`startConstruction`, `cancelConstruction`, …) |
| 4 | Urban infrastructure | `cityRules.ts` (`computeInfrastructureBalance`, `getInfrastructureShare`, `getOperationalFactor`) |
| 5 | Population and workforce demand | `cityRules.ts` (`advanceCity`, `computeCityStatistics`) |
| 6 | City services and urban indicators | `cityRules.ts` (the indicator targets of `advanceCity`) |
| 7 | Corporation ↔ City integration | `src/game/commands/cityCommands.ts`, `corporationState.ts`, `corporationRules.ts` |
| 8 | Economy integration | `src/simulation/contracts.ts` (`CityMarketSignal`), `src/simulation/economy/economyRules.ts` |
| 9 | Simulation integration | `src/game/simulationRunner.ts` (the `city` system, order 15) |
| 10 | Player commands | `src/game/commands/cityCommands.ts` (10 commands), `src/game/commands/index.ts` |
| 11 | City Management UI | `src/ui/screens/sections/CityOverviewSection.tsx`, `CityLandSection.tsx`, `CityConstructionSection.tsx` |
| 12 | Tests and documentation | `src/tests/simulation/city.test.ts`, `src/tests/integration/stage05.test.ts`, `src/tests/components/CityUi.test.tsx`, `docs/*` |

---

## 5. City and District Data Model

### 5.1 The city record

```ts
interface City {
  id: string;
  name: string;
  foundedAtSimMs: number;        // simulated time, never a wall-clock date
  level: number;                 // 1..5, derived from the development
  development: number;           // 0..100
  population: number;
  employment: number;
  unemployment: number;          // 0..100 (percent of the population)
  prosperity: number;            // 0..100
  infrastructure: number;        // 0..100
  environment: number;           // 0..100
  publicServices: number;        // 0..100
  districts: District[];
  plots: LandPlot[];
  buildings: CityBuilding[];
  baselineInfrastructure: InfrastructureCapacity;
  baselineHousingCapacity: number;
  baselineEmploymentCapacity: number;
  statistics: CityStatistics;
  sequence: number;              // deterministic identifier sequence
  tick: number;
}
```

### 5.2 The five districts

| District | Id | Type | Plots | Base development | Price factor |
|----------|----|------|-------|------------------|--------------|
| Downtown | `district_downtown` | commercial | 6 | 55 | 1.35 |
| Industrial Zone | `district_industrial` | industrial | 6 | 40 | 1.00 |
| Research Park | `district_research` | research | 6 | 45 | 1.15 |
| Residential District | `district_residential` | residential | 6 | 35 | 0.85 |
| Energy District | `district_energy` | energy | 6 | 30 | 0.95 |

The districts are **rows of a table** (`CITY_DISTRICT_DEFINITIONS`). There is exactly one
simulation engine — the district type only drives the building compatibility, the plot prices
and the development target.

### 5.3 State versus derived data

The specification asked for the district infrastructure capacity, the population capacity and the
building count, and for `statistics` on the city. These values are **derived**, not stored —
§5 of the specification explicitly requires that "values that can be derived safely from
authoritative state" are not duplicated. The same principle the World Engine follows with
`getWorldMetrics`.

| Value | Where it lives |
|-------|----------------|
| District plot references, type, name, development | `District` (stored) |
| District plot counts, building counts, housing and employment capacity, provided capacity | `getDistrictMetrics(city, district)` (derived) |
| Housing capacity, employment capacity, employment, available workforce, infrastructure balance, commercial activity, research and industrial capacity, energy demand, operating cost | `computeCityStatistics(city)` (derived) |
| `city.statistics` | a **snapshot** recomputed from the authoritative state on every change — never a second source of truth |

### 5.4 Determinism

`createInitialCityState()` is a pure function: the same call always produces the same city, the
same districts and the same land map. No `Date.now()` and no `Math.random()` ever enters the
simulation state — the identifiers come from deterministic sequences (`plot_001` … `plot_030`,
`bld_001`, `district_downtown`). The `AppError.timestamp` uses `Date.now()`, exactly like every
existing engine — it is an error annotation and never influences the state.

---

## 6. Land and Building Definitions

### 6.1 The finite land map

Thirty plots, six per district, `plot_001` … `plot_030`. There is no procedural generation.

```ts
interface LandPlot {
  id: PlotId;
  districtId: DistrictId;
  zoning: ZoningCategory;        // commercial | industrial | research | residential | energy | mixed-use
  price: number;                 // PLOT_BASE_PRICES[zoning] × district.priceFactor
  ownerId: string | null;
  buildingId: BuildingId | null;
  infrastructureAvailable: boolean;
  status: PlotStatus;            // available | owned | occupied | sold
  soldAtSimMs: number | null;
}
```

The zoning mix is deliberately varied — the downtown district contains one industrially zoned
plot, the industrial zone two energy zoned plots. The zoning and the district type are therefore
**two independent restrictions** and both are enforced.

### 6.2 The building catalogue

Thirteen data-driven blueprints in `BUILDING_DEFINITIONS`:

| Building | Category | Districts | Zoning | Cost | Duration | Jobs | Op. /h |
|----------|----------|-----------|--------|------|----------|------|--------|
| Corporate Headquarters | corporate | commercial | commercial, mixed-use | 24 000 | 96 h | 120 | 180 |
| Regional Office | corporate | commercial | commercial, mixed-use | 9 500 | 48 h | 40 | 60 |
| Electronics Factory | industrial | industrial | industrial, mixed-use | 12 000 | 60 h | 70 | 95 |
| Materials Processing Plant | industrial | industrial | industrial, mixed-use | 10 500 | 54 h | 60 | 80 |
| Assembly Facility | industrial | industrial | industrial, mixed-use | 15 500 | 72 h | 85 | 110 |
| Research Laboratory | research | research | research, mixed-use | 11 000 | 60 h | 45 | 95 |
| Advanced Technology Center | research | research | research, mixed-use | 19 000 | 90 h | 80 | 160 |
| Residential Complex | residential | residential | residential, mixed-use | 8 500 | 48 h | 12 | 35 |
| High-Density Housing | residential | residential | residential, mixed-use | 14 000 | 66 h | 18 | 50 |
| Power Station | infrastructure | energy, industrial | energy, industrial, mixed-use | 13 500 | 72 h | 35 | 120 |
| Logistics Center | infrastructure | industrial, commercial | industrial, commercial, mixed-use | 9 000 | 48 h | 45 | 85 |
| Commercial Center | infrastructure | commercial | commercial, mixed-use | 11 500 | 60 h | 55 | 95 |
| Water Treatment Facility | infrastructure | energy, industrial, commercial | energy, industrial, commercial, mixed-use | 10 500 | 54 h | 28 | 70 |

Every effect is a plain number (or a plain capacity record) — no building needs a special case
in the engine: `populationCapacity`, `productionCapacity`, `researchCapacity`,
`commercialActivity`, `prosperity`, `environmentImpact` (signed) and `infrastructureProvided`.

The unlock requirements reuse the existing Stage 04 systems: `robotic-assembly` (Assembly
Facility), `helion-fusion` (Power Station), `photonic-cores` (Commercial Center), `neural-array`
plus the *established* tier (Advanced Technology Center), the *growth* tier (Corporate
Headquarters, High-Density Housing).

### 6.3 The relationship with the Production Engine

The Stage 04 Production Engine remains the **only** authority for manufacturing: production
orders, resource reservations and the product inventory are untouched. A city building
contributes to the **city** industrial capacity, which is reported through the city signal and
never turns into a production order. There is no duplicated production logic and no second
facility model.

---

## 7. Construction Lifecycle

```
planned → constructing → completed ⇄ operational
                ↓            ↓         ↓
             demolished   suspended  demolished
```

1. **Validation** (in this order): the definition exists → the plot exists → the plot is not
   sold → the plot is not occupied → the plot is owned by the corporation → the district type is
   compatible → the zoning is compatible → the cost and the duration are valid.
2. **Unlock requirements** (technology, corporation tier) are validated by the command layer.
3. **The cost is charged once** through the corporate ledger (`city` transaction).
4. The construction record is created (`bld_00n`), the plot becomes `occupied`.
5. **Progress** uses the simulated time: `progress += deltaMs / constructionDurationMs`, clamped
   to 0..1.
6. **Completion happens exactly once** — at `progress >= 1` the status becomes `completed` and
   the completion is stamped. Because the status changes, the building can never complete twice.
7. The **operational status** is then evaluated against the infrastructure (§8).

**Cancellation policy** — `cancelConstruction` is allowed for a `planned` or `constructing`
building only. The construction cost is **not refunded**: it is a sunk cost, exactly like the
cancellation of a Stage 04 research project. The record is kept with the status `demolished`, the
plot is released and **stays owned** by the corporation. Nothing is reserved, because the city
never reserves resources.

**Demolition** — releases the plot (it stays owned), refunds nothing, and stops the operating
cost of the building.

**Suspension** — stops the effects; `resumeBuilding` evaluates the operational status
immediately.

---

## 8. Infrastructure Calculations

Four networks: `electricity`, `water`, `logistics`, `publicServices`. Each building declares a
demand, each provider declares a contribution.

```
capacity = baseline + Σ provided by the finished buildings
demand   =           Σ demanded by the finished buildings
shortage = max(0, demand − capacity)   per network
```

The municipal baseline that exists before the player builds anything is
`{ electricity: 60, water: 50, logistics: 40, publicServices: 30 }`.

**Service level** — the weakest network decides:

```
share_c = min(1, capacity_c / demand_c)    (1 when the network has no demand)
share   = min over the four networks
factor  = clamp(share, 0.25, 1)
```

- A building is **operational** while `share >= 0.25`; below that it stays `completed` and
  contributes nothing — the **operational status responds to a shortage**.
- The effects of the operational buildings are scaled by `factor` — a strained city works at a
  reduced output.
- The capacity is never negative, and a provider is counted **exactly once**: the capacity is
  aggregated from the building records, never from an accumulator.

No transport routes, traffic, pipe networks or grid topology are simulated — those are out of
scope for this stage.

---

## 9. Population and Employment Rules

```
housingCapacity    = baselineHousingCapacity + Σ populationCapacity of the operational buildings
employmentCapacity = baselineEmploymentCapacity + Σ workforceCapacity of the operational buildings
population         → converges towards housingCapacity
employment         = min(employmentCapacity, population)
unemployment       = (population − employment) / population × 100      (0 when there is no population)
availableWorkforce = population − employment
```

The population converges with the **exponential** form
`population += (housingCapacity − population) × (1 − (1 − growthRate × attractiveness)^hours)`
with `growthRate = 0.05` and `attractiveness = 0.5 + prosperity / 200`; when the housing is lost
the population decays at 0.1 per hour. The exponential form guarantees that a single long tick
can never overshoot the housing capacity — the population is additionally hard-clamped to the
housing capacity at all times.

**Four distinct populations, never counted twice:**

| Figure | Owner |
|--------|-------|
| Corporate employees | Employee Engine (Stage 03) — the city holds references only |
| City population | City Engine — the residents of the city |
| Available workforce | City Engine — the residents that are not employed |
| Occupied positions | City Engine — the positions filled by the residents |

The city never creates, transfers or duplicates a corporate employee. The assignment of
corporate employees to a city building is validated against the existing
`validateEmployeeAssignment` helper and the building's own workforce capacity.

---

## 10. Corporation Integration

- The city has **no treasury**. Every payment uses the balance and the ledger of the player
  corporation.
- **Two new transaction types** were added to the existing typed financial model:
  `city` (land acquisition and construction) and `city-sale` (the disposal of a plot).
- **Two new lifetime counters** were added: `lifetimeCityExpenses` and `lifetimeCityRevenue`.
- The land acquisition and the construction are **capital expenditure** — like the Stage 04
  facility construction, they are tracked separately and are **not** subtracted from the net
  profit.
- The **operating cost** of the running city buildings is accrued into the existing operating
  expenses of the corporation (`accrueFinances`, new optional `cityOperatingCostPerHour` field).
  It therefore reduces the net profit and the tier progression — expansion is never free.
- A command that cannot be afforded fails **completely**: neither the city nor the corporation is
  changed. The balance is never negative.
- The resale policy is explicit and documented: an unoccupied plot is sold back for **60 %** of
  its purchase price and is retired afterwards.

The extension of the financial model is additive: the two new counters default to `0`, the new
`cityOperatingCostPerHour` context field is optional and defaults to `0` — a corporation without
a city behaves **exactly** as it did in Stage 04.

---

## 11. Economy Integration

The new boundary is the `CityMarketSignal` in `src/simulation/contracts.ts`:

```ts
interface CityMarketSignal {
  commercialActivity: number;        // 0..100
  researchCapacity: number;          // 0..100
  industrialCapacity: number;        // units per batch
  energyDemand: number;              // MWh per simulated hour
  population: number;
  infrastructureUtilization: number; // 0..100
}
```

The city produces the signal; the economy consumes it. The economy derives the urban activity
index and applies two **bounded** factors:

```
urbanIndex = commercialActivity × 0.4 + researchCapacity × 0.3
           + min(1, industrialCapacity / 500) × 100 × 0.2
           + min(1, population / 5 000) × 100 × 0.1

demandFactor     = 1 + (urbanIndex / 100) × categoryWeight × 0.15     (≤ 1.15)
saturationFactor = 1 + (urbanIndex / 100) × categoryWeight × 0.25     (≤ 1.25)
```

`categoryWeight` is 1.0 for compute and logistics, 0.9 for materials, 0.6 for energy. The energy
commodity additionally reacts to the urban energy demand (≤ 1.10). The city is a **consumer**:
it never adds supply to the market.

- **Bounded** — the demand factor is capped at 1.15, the saturation factor at 1.25.
- **Deterministic** — a pure function of the signal.
- **Documented** — `docs/ENGINE_RULES.md` §7.9 and §12 of the architecture document.
- **Tested** — §18 lists the dedicated tests.
- **Applied once per tick** — both factors are computed once per `updateEconomy` call and passed
  into the per-commodity update.

**The absence of a city signal preserves the previous behaviour exactly.** The signal is only
produced while the city runs at least one operational building; an untouched city therefore
leaves the economy byte-for-byte as it was in Stage 04. A dedicated test recomputes the
expected demand with the Stage 02/04 formula and asserts the equality.

**No positive feedback loop.** The city raises the demand (and therefore the prices) by at most
15 %, while the construction is a capital expenditure and the running buildings cost money every
simulated hour.

---

## 12. Simulation Tick Order

```
1. Game Clock         — advances the simulated time (engine owned, before the systems)
2. World Engine       — order 10
3. City Engine        — order 15   ← produces the city market signal
4. Economy Engine     — order 20   ← consumes the world and the two market signals
5. Employee Engine    — order 30   ← develops the workforce
6. Technology Engine  — order 40   ← research uses the workforce of step 5
7. Product Engine     — order 50   ← development uses the unlocked technologies
8. Resource Engine    — order 60   ← resource bookkeeping
9. Production Engine  — order 70   ← consumes the reserved resources
10. Market Engine     — order 80   ← sells the finished goods
11. Corporation Engine — order 90   ← accrues the finances, payroll, progression
```

**Why the city runs before the economy.** The only dependency between the two is the city market
signal, and the economy must consume the signal of the *current* tick. Placing the city at order
15 (between the world at 10 and the economy at 20) makes the reaction immediate and avoids a
circular dependency — nothing in the city depends on the economy.

**Preserved dependencies:** clock → everything; world → economy (Stage 02, unchanged);
employees → technology; technology → products; resources → production; production → market;
market → corporation; the corporate finances reflect the transactions of the same tick.

**Every system:** is deterministic, respects the simulation delta time, never overlaps (the Game
Core guards it), respects the pause and the stop, preserves the error isolation and disposes
correctly. The Game Core lifecycle was **not** modified.

---

## 13. UI Implementation

Three new sections on the Empire Dashboard, all built from the existing AETHRION primitives
(`StatCard`, `IndicatorBar`, `Badge`, `Button`, `TextField`, `SelectField`) and the existing CSS
conventions (`section-block`, `stat-grid`, `region-grid`/`region-card`, `facility-grid`,
`tech-grid`/`tech-card`, `resource-table`, `hiring-panel`, `empty-state`).

| Section | File | Content |
|---------|------|---------|
| **City Overview** | `CityOverviewSection.tsx` | City name and level, population, housing capacity, employment, unemployment, prosperity, infrastructure, environment, public services, industrial and research capacity, commercial activity, the operating cost — all from the live state. A working **rename** action. |
| **District Management** | `CityOverviewSection.tsx` | The five districts with their identifiers, type, free and owned plots, running buildings, housing capacity, positions and development. |
| **Urban Infrastructure** | `CityOverviewSection.tsx` | Per network: capacity, demand, utilisation and the shortage; the infrastructure buildings are visible in the building list. |
| **Land Management** | `CityLandSection.tsx` | All thirty plots with their identifier, district, zoning, price and ownership state, a working district filter, and **Buy** / **Sell** actions. |
| **Construction** | `CityConstructionSection.tsx` | The whole catalogue with cost, duration, workforce, operating cost, compatible districts and zoning, the effects and the unlock requirements; a working building + plot form that starts the construction. |
| **Buildings** | `CityConstructionSection.tsx` | Every city building with its district, plot, lifecycle state, construction progress, positions, operating cost, infrastructure status and effects, plus **Cancel**, **Suspend**, **Resume** and **Demolish** controls. |

Design system compliance: the deep-space and empire-blue surfaces, the neon-cyan and
imperial-purple accents and the stellar-white text come from the existing tokens
(`src/ui/theme/tokens.ts` and the CSS custom properties) — **no hardcoded brand colours** were
introduced. Orbitron, Inter and Roboto Mono are inherited from the existing typography. Two
small additions to `src/index.css` (`.city-row-actions`, `.tech-prereq--locked`) and two
transaction-type colours (`.transaction-type--city`, `.transaction-type--city-sale`) are the
only new CSS rules.

**Readability down to 320 px:** the existing responsive rules apply — the stat grids collapse to
a single column, the land table switches to the stacked layout below 720 px and the action
column compacts below 480 px.

**Accessibility:** every control is a semantic `button` or a labelled form control, the
indicator bars expose `role="meter"` with the value bounds, the feedback messages use
`role="status"` and the sections carry their `aria-label`.

---

## 14. Files Created, Modified and Deleted

### Created (9)

| File | Purpose |
|------|---------|
| `src/simulation/city/cityState.ts` | The city model, the district and building tables, the land map, the validation |
| `src/simulation/city/cityRules.ts` | The deterministic rules: land, construction, infrastructure, population, indicators, the market signal |
| `src/game/commands/cityCommands.ts` | The ten player commands of the city |
| `src/ui/screens/sections/CityOverviewSection.tsx` | City Overview, District Management, Urban Infrastructure |
| `src/ui/screens/sections/CityLandSection.tsx` | Land Management |
| `src/ui/screens/sections/CityConstructionSection.tsx` | Construction and Buildings |
| `src/tests/simulation/city.test.ts` | 52 unit tests of the City Engine |
| `src/tests/integration/stage05.test.ts` | 14 integration tests, including the complete gameplay chain |
| `src/tests/components/CityUi.test.tsx` | 9 interface tests |

### Modified (21)

| File | Change |
|------|--------|
| `src/simulation/city/index.ts` | Replaced the Stage 01 placeholder with the public surface of the engine |
| `src/simulation/contracts.ts` | Added the `CityMarketSignal` integration boundary |
| `src/simulation/corporation/corporationState.ts` | Added the `city` and `city-sale` transaction types and the `lifetimeCityExpenses` / `lifetimeCityRevenue` counters (with validation) |
| `src/simulation/corporation/corporationRules.ts` | Added the initial counter values, the counter updates and the optional `cityOperatingCostPerHour` in `accrueFinances` |
| `src/simulation/economy/economyRules.ts` | Added the optional `citySignal`, the urban activity index and the two bounded demand factors |
| `src/game/state/gameStore.ts` | Added the `city` slice and `applyCityState` (including the reset) |
| `src/game/state/selectors.ts` | Added the city selectors |
| `src/game/simulationRunner.ts` | Registered the `city` system (order 15), fed the city signal into the economy and the city operating cost into the corporation |
| `src/game/commands/index.ts` | Exported and aggregated the ten city commands |
| `src/ui/screens/Dashboard.tsx` | Added the three city sections and updated the version line |
| `src/ui/screens/sections/FinanceOverview.tsx` | Added the city investments and the land disposal figures |
| `src/app/navigation/MainNavigation.tsx` | The City Engine is now `ready`; the footer names Stage 05 |
| `src/index.css` | The city layout rules and the two new transaction-type colours |
| `docs/TECHNICAL_ARCHITECTURE.md` | The City Engine module, the state slice, the commands, the tick order, the economy boundary |
| `docs/ENGINE_RULES.md` | The complete Stage 05 rule set (section 7) and the updated tick order (section 8) |
| `docs/GAME_DESIGN_OVERVIEW.md` | The urban gameplay loop (section 11) and the updated module table |
| `docs/DEVELOPMENT_ROADMAP.md` | Stage 05 marked complete |
| `src/tests/integration/simulation.test.ts` | The tick-order assertion (see §15.3) |
| `src/tests/integration/stage03.test.ts` | The tick-order assertion (see §15.3) |
| `src/tests/integration/stage04.test.ts` | The tick-order assertion (see §15.3) |
| `src/tests/components/Dashboard.test.tsx` | The simulation control queries are now scoped to their panel (see §15.3) |

### Deleted

**None.** The Stage 01 placeholder was replaced in place — the module path and the exported name
are unchanged, so no consumer had to move.

---

## 15. Tests Added

### 15.1 City Engine — 52 unit tests (`src/tests/simulation/city.test.ts`)

- **Deterministic initialization** — the same city on every call; a valid state; five districts
  with unique identifiers; a finite land map of thirty plots with unique identifiers; every plot
  assigned to an existing district; the indicators inside their range; an invalid state rejected
  and left unchanged; an invalid tick context rejected; the city name validated; the city
  renamed.
- **Land** — an available plot is bought; an unknown plot is rejected without a change; a
  duplicate purchase is rejected; an invalid owner and an invalid time are rejected; an
  unoccupied plot is sold and refunded at the documented resale value; an occupied plot cannot
  be sold; a plot that was never owned cannot be sold; a sold plot can never be re-bought.
- **Buildings** — at least ten valid definitions with unique identifiers; an unknown type is
  rejected; a plot that is not owned is rejected; an incompatible district is rejected; an
  incompatible zoning is rejected; a duplicate placement is rejected; the deterministic building
  record; the construction progresses and completes **exactly once**; a cancellation releases the
  plot without a refund; a finished construction cannot be cancelled; a demolition releases the
  plot; suspend and resume; more employees than the capacity is rejected; a duplicated
  assignment is rejected.
- **Infrastructure** — the capacity and the demand are aggregated; the capacity and the shortage
  are never negative; a provider is counted exactly once; a shortage is detected and the
  operational factor is reduced; the buildings are shut down when the service level collapses.
- **Population** — the housing capacity grows with an operational residential building; the
  population grows deterministically and is capped by the housing; the population never exceeds
  the housing capacity; the employment never exceeds the population and the unemployment is never
  negative; the population is released when the housing is demolished; the corporate employee
  records are untouched.
- **Indicators** — every indicator stays inside its range over 200 ticks; the industry erodes the
  environment; the district figures are reported.
- **Statistics and the market signal** — the statistics agree with the authoritative state; no
  signal while the city runs nothing; a bounded signal once it does.
- **Determinism** — two identical runs produce an identical state; the district definitions match
  the city; the buildings and the plots are found by their identifiers.

### 15.2 Integration — 14 tests (`src/tests/integration/stage05.test.ts`)

- **The complete city gameplay integration test** — the chain required by the specification:

  ```
  Existing Corporation → Purchase Land → Construct Residential Building
    → Construction Completion → Housing Capacity Increase → Population Growth
    → Construct Industrial Building → Infrastructure Demand
    → Industrial Capacity Increase → Economy Integration
    → Corporate Financial State Remains Valid
  ```

  Every step is asserted against the live state, including the ledger entries, the construction
  cost, the housing capacity, the population growth, the rising infrastructure demand, the
  industrial capacity and the validity of the corporate financial state.
- **The documented tick order** — the exact system list and the ordering constraints.
- **The city signal and the economy** — without a signal the demand matches the Stage 02/04
  formula exactly; with a signal the demand rises and stays within the 15 % bound.
- **The economy is untouched while the city runs nothing.**
- **A failed command changes nothing** — the whole store is compared byte for byte.
- **The balance never becomes negative.**
- **Every transaction is recorded exactly once** — and the balance difference is fully explained
  by the transactions.
- **A construction never completes twice** — and the plot still carries exactly one building.
- **No resource is ever created.**
- **No violation of the employee ownership** — the employee record is untouched and the city
  never counts corporate employees as city residents.
- **No regression in the payroll** — the payroll is paid, the expenses grow and no period is
  missed.
- **Determinism across identical runs** — the city, the corporation and the economy are identical.
- **Pause and resume** — the construction does not progress while the simulation is paused.
- **The payroll period is independent of the city.**

### 15.3 Adapted existing tests (justified)

| Test | Adaptation | Reason |
|------|------------|--------|
| `simulation.test.ts` — "registers the world and economy systems in the documented order" | `city` inserted between `world` and `economy` in the expected list, plus the new ordering assertions | The tick order legitimately changed — the documented architecture of Stage 05. The intent of the test (the order is deterministic and the Stage 02 dependency is preserved) is strengthened, not weakened. |
| `stage03.test.ts` — the same assertion | identical | identical |
| `stage04.test.ts` — "keeps the documented tick order" | identical | identical |
| `Dashboard.test.tsx` — "starts / pauses / resumes the simulation from the interface" | the queries are now scoped to the `Simulation controls` panel with `within()` | The dashboard now hosts a city section with a "Start construction" button, so the previous unscoped `getByRole('button', { name: /start/i })` matched several elements. The test now asserts **more** precisely — that it is the simulation control that is clicked. |

No existing assertion was weakened, removed or relaxed. All 285 pre-existing tests still pass.

### 15.4 Interface — 9 tests (`src/tests/components/CityUi.test.tsx`)

The city overview renders the real state; the five districts render with their identifiers; the
city is renamed through the interface; the land map renders the real plots; a plot is bought
through the interface and the corporation is charged; the building catalogue renders with its real
costs; a construction is started through the interface; the city buildings render with their
lifecycle controls; an incompatible construction reports a validation error.

---

## 16. Full Test Results

```
> aethrion@0.4.0 test
> vitest run

 Test Files  22 passed (22)
      Tests  360 passed (360)
   Duration  8.98s
```

**360 passing, 0 failing** — 285 before the stage, **+75 new tests** (52 unit, 14 integration,
9 interface). The full suite was executed after the final change.

---

## 17. Typecheck Results

```
> aethrion@0.4.0 typecheck
> tsc --noEmit

(exit code 0 — no output)
```

Strict TypeScript with `strict`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch` and `isolatedModules`. **No errors, no warnings, no suppression
comments and no `any` casts were added.**

---

## 18. Lint Results

```
> aethrion@0.4.0 lint
> eslint . --ext ts,tsx --max-warnings 0

(exit code 0 — no output)
```

ESLint with `typescript-eslint` and the React hooks plugin, `--max-warnings 0`. **Zero errors and
zero warnings.**

---

## 19. Production Build Results

```
> aethrion@0.4.0 build
> npm run typecheck && vite build

✓ 5000 modules transformed.
dist/index.html                             0.90 kB │ gzip:   0.45 kB
dist/assets/index-R5Bi48mg.css             28.54 kB │ gzip:   5.14 kB
dist/assets/rolldown-runtime-BWaJ3C7D.js    0.91 kB │ gzip:   0.51 kB
dist/assets/state-DTU5yBsG.js               5.66 kB │ gzip:   2.09 kB │ map:  39.35 kB
dist/assets/motion-CNJiYd5h.js            117.65 kB │ gzip:  38.90 kB │ map: 636.72 kB
dist/assets/index-C3KUrrxB.js             174.51 kB │ gzip:  41.43 kB │ map: 700.39 kB
dist/assets/react-CNEVH0B1.js             352.35 kB │ gzip: 101.48 kB │ map: 1,230.77 kB

✓ built in 297ms
```

The build succeeds. The bundle grew by roughly 12 kB of application code — the city engine, the
commands and the three interface sections. **No new dependency was added**, so no new chunk was
created.

---

## 20. Dependency Audit Results

```
> npm audit
found 0 vulnerabilities

> npm audit --omit=dev
found 0 vulnerabilities
```

**Zero vulnerabilities** — in the full tree and in the production tree.

`npm outdated` reports twelve packages with newer versions (`@types/node`, `@types/three`,
`eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `framer-motion`, `globals`,
`jsdom`, `three`, `typescript`, `zustand`, `@testing-library/jest-dom`). **None of them were
upgraded** — the upgrades are unrelated to Stage 05 and the stage explicitly forbids risky
dependency upgrades. No dependency was added, removed or changed by this stage.

---

## 21. Known Limitations

1. **One city.** The MVP is a single city with a single player corporation. Multi-city management
   is a Stage 06+ concern.
2. **City-wide infrastructure.** The capacity is aggregated over the whole city; there is no
   district-level network, no routing, no traffic, no pipe or grid topology. A shortage anywhere
   in the city affects the whole city.
3. **Aggregate population.** There are no individual citizens, no personal schedules and no
   family simulation — by design.
4. **The corporate employees and the city residents are two separate pools.** A corporate
   employee is not a resident of the city, and a resident is not a corporate employee. The
   city exposes the employment capacity and the workforce demand; the actual staffing of a city
   building is a reference list, not a simulation of commuters.
5. **The city is a consumer, not a producer.** A city factory raises the urban industrial
   capacity and the environmental load, but it does not manufacture the Stage 04 products — the
   Production Engine remains the single authority.
6. **The city signal is coarse.** The urban activity index blends four figures into one index;
   the economy reacts with a single bounded factor per commodity category.
7. **The World Engine has the same latent convergence issue that the city engine does not.**
   `evolveWorld` uses a linear `+ gap × rate × hours` form, which can overshoot its target when
   a tick is much longer than one simulated hour. The City Engine uses the exponential form
   (`1 − (1 − rate)^hours`) and can never overshoot. The World Engine was **not** modified — it is
   out of the scope of this stage and its behaviour is unchanged.
8. **The navigation still labels Technology and Production as `planned`** although both have been
   implemented since Stage 04. This is a pre-existing inconsistency that was deliberately left
   untouched to keep the Stage 05 diff strictly scoped; only the City Engine entry was updated.
9. **The city state is not persisted.** IndexedDB save/load remains a Stage 08 concern.

---

## 22. Deferred Functionality

The following were explicitly **not** implemented in Stage 05, as required:

Three.js city rendering · 3D buildings · camera controls · real-time citizen simulation ·
individual citizens and personal schedules · family simulation · traffic simulation · road
networks · physical electricity grids · water pipe networks · logistics route simulation ·
multi-city management · a global map · competitor AI · global events · a news and scenario engine ·
Web Workers · IndexedDB persistence · a save/load interface · multiplayer · cloud synchronisation ·
Google Play Billing · AdMob · monetisation · new technology research trees · a redesign of the
economy, the corporation or the employee engines.

No out-of-scope system was introduced.

---

## 23. Git Commit Information

The work was committed to `main` in two logically separated commits:

| Commit | Subject | Content |
|--------|---------|---------|
| `97a3b42` (`97a3b4235676f3720de6b2503885d43d6c4bc671`) | `feat(stage-05): City Engine & urban infrastructure` | The City Engine, the commands, the simulation integration, the interface, the tests and the documentation updates (30 files, +6 029 / −99) |
| *(this commit)* | `docs(stage-05): add final report` | `docs/STAGE_05_FINAL_REPORT.md` |

- Branch: `main`, based on the Stage 04 commit `c428ec2`.
- The commit order mirrors the convention of Stage 04: the implementation first, the final report
  afterwards.
- The full diff was reviewed before the commits. No file was force-added, no history was
  rewritten, no force-push was performed and no secret, key or credential was committed. The
  only changes to the existing tree are the ones listed in §14.
- The working tree is **clean** after the final commit.

---

## 24. Final Stage Status

# **COMPLETE**

### Acceptance criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| City Engine implemented | ✅ | `src/simulation/city/` — 3 modules, the public surface in `index.ts` |
| The city initializes deterministically | ✅ | `createInitialCityState()` is pure; a unit test asserts two calls are identical |
| Five districts implemented | ✅ | `CITY_DISTRICT_DEFINITIONS`; the unit test asserts five unique ids |
| Land plots are finite and validated | ✅ | 30 plots, `isValidLandPlot`, `isValidCity` |
| Land purchasing works | ✅ | `purchaseLandCommand` + 8 land unit tests + the integration chain |
| Building definitions are data-driven | ✅ | `BUILDING_DEFINITIONS` — 13 entries, no special cases in the engine |
| At least 10 functional building definitions | ✅ | 13 definitions, all constructible |
| Construction lifecycle works | ✅ | planned → constructing → completed ⇄ operational → suspended/demolished |
| Infrastructure capacity and demand are calculated | ✅ | `computeInfrastructureBalance`, 6 unit tests |
| Infrastructure shortages affect the operational status | ✅ | below a service level of 0.25 the buildings are shut down; tested |
| Population and housing capacity work | ✅ | 6 population unit tests + the integration chain |
| Employment capacity is consistent | ✅ | `employment = min(capacity, population)`; tested |
| Existing employee ownership is preserved | ✅ | references only; the integration test asserts the employee record is untouched |
| Corporation finances use the existing ledger | ✅ | `city` / `city-sale` transactions; the balance is explained by the transactions |
| City integration with the economy works | ✅ | `CityMarketSignal`; the integration test asserts the demand rises |
| A missing city signal preserves the previous economy behaviour | ✅ | the signal is only produced while the city runs something; the test recomputes the Stage 02/04 formula |
| The tick ordering is documented and tested | ✅ | `docs/ENGINE_RULES.md` §8 + three ordering assertions |
| The dashboard city sections use real simulation state | ✅ | three new sections, nine interface tests |
| All player controls perform real actions | ✅ | every button calls a command; no placeholder statistics |
| The complete city gameplay integration test passes | ✅ | `stage05.test.ts` — the full chain |
| All existing Stage 01–04 tests continue to pass | ✅ | 285 pre-existing tests, all passing |
| Typecheck passes | ✅ | `tsc --noEmit` — exit 0 |
| Lint passes | ✅ | `eslint --max-warnings 0` — exit 0 |
| The production build passes | ✅ | `vite build` — built in 297 ms |
| The documentation is updated | ✅ | 4 documents updated, `docs/ENGINE_RULES.md` extended by ~350 lines |
| `docs/STAGE_05_FINAL_REPORT.md` exists | ✅ | this document |
| No out-of-scope future-stage systems were introduced | ✅ | see §22 |

### Verified vs. not verified

- **Verified:** the tests, the typecheck, the lint and the production build were **actually
  executed** and their real output is reproduced above. The dependency audit was actually run.
- **Not verified:** **Android compatibility was not verified.** No Android project was generated
  (`npx cap add android` was not run), no Gradle build was executed and no device or emulator
  test was performed. The Capacitor configuration is unchanged by this stage and the web build is
  verified, but nothing about the Android artefact was tested.
- **Not verified:** the interface was verified through the automated component tests in jsdom and
  by the production build. It was **not** manually tested on a physical Android device, and the
  320 px readability claim is based on the CSS rules, not on a device measurement.

### Stage 05 is complete. Stage 06 has **not** been started — it waits for the explicit approval
of the user.
