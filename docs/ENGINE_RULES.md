# AETHRION — Engine Rules

**Project:** AETHRION  
**Stage:** 06 — Events & Competitor AI Engines  
**Scope:** focused documentation of the Stage 04, Stage 05 and Stage 06 gameplay engines.

This document is the companion of `docs/TECHNICAL_ARCHITECTURE.md` (architecture and layering)
and `docs/GAME_DESIGN_OVERVIEW.md` (player-facing gameplay). Here are the exact rules of the
new engines. The catalogue of the global events lives in `docs/EVENT_SYSTEM.md`, the details of
the AI in `docs/COMPETITOR_AI.md`.

---

## 1. Technology Research Engine

**Module:** `src/simulation/technology/` · `technologyState.ts` (model, table) · `technologyRules.ts` (rules)

### 1.1 The technology tree

The tree is a **data driven table** (`TECHNOLOGIES`, 20 entries). A new technology is added by
extending the table and the `TechnologyId` union — the engine never hardcodes individual
technologies.

| Field | Meaning |
|-------|---------|
| `id` | Stable identifier |
| `name`, `description` | Player facing |
| `category` | computing · materials · energy · automation · manufacturing · ai |
| `researchCost` | Charged once when the project starts |
| `researchDurationMs` | Simulated milliseconds of work at full contribution |
| `requires` | Technology identifiers that must be unlocked first |
| `requiresTier` | Optional minimum corporation tier |
| `requiredProfession` | Profession that contributes efficiently |
| `requiredSkill` | Skill level that yields a full contribution |
| `effects` | Multipliers / bonuses granted on unlock |

**Unlock effects** (`TechnologyEffects`):

| Effect | Type | Meaning |
|--------|------|---------|
| `productionEfficiency` | multiplier | Multiplies the manufacturing output |
| `researchSpeed` | multiplier | Multiplies the research and development speed |
| `qualityBonus` | additive | Added to the quality of developed products |
| `marketReach` | multiplier | Multiplies the market demand |
| `resourceYield` | multiplier | Multiplies the resource yield of purchases |

Effects of all unlocked technologies are **aggregated**: multipliers multiply, bonuses are summed.

### 1.2 Research progression

**Start** — validated in order: known technology → not already unlocked → no active project for
the same technology → all prerequisites unlocked → tier requirement met → valid cost and duration →
no duplicated employee.

**Contribution** — per assigned employee, per tick:

```
contribution = professionFactor × skillFactor × productivityFactor

professionFactor  = 1.0 for the required profession, 0.4 otherwise
skillFactor       = clamp(employee.skill / requiredSkill, 0, 1)
productivityFactor= clamp(employee.productivity / 100, 0, 1)
```

A departed employee contributes nothing.

**Progress** — `progress += contribution × deltaMs × researchSpeedMultiplier / researchDurationMs`,
clamped to 0..1. A project with no assigned workforce makes **no** progress.

**Completion** — at `progress >= 1` the technology is unlocked, the project becomes `completed`
and an entry is appended to the bounded research history.

**Cancellation** — the project becomes `cancelled`, the employees are released and the history is
updated. The research cost is **not** refunded — it is a sunk cost.

**Guards** — a duplicate active project, missing prerequisites, an invalid cost, an invalid
duration, a non-finite progress value and an invalid state are all rejected. An invalid state is
returned unchanged.

---

## 2. Product Development Engine

**Module:** `src/simulation/products/` · `productState.ts` (model, table) · `productRules.ts` (rules)

### 2.1 The product catalogue

Six data driven definitions (`PRODUCT_DEFINITIONS`). A definition is the blueprint; a *product
instance* is the corporation's own development project of that blueprint.

| Product | Category | Requires | Dev cost | Complexity | Prod. cost | Price | Demand/h | Resources / unit |
|---------|----------|----------|----------|------------|-------------|-------|----------|------------------|
| Helix Workstation | computing | photonic-cores | 9 000 | 2 | 180 | 900 | 1.5 | electronics 1, components 1 |
| Nova Fabricator | industrial | precision-fabrication | 11 000 | 3 | 240 | 1 100 | 1.0 | metals 2, industrial-chemicals 2 |
| Arc Reactor | energy | helion-fusion | 14 000 | 4 | 300 | 1 600 | 0.8 | energy 6, advanced-materials 1 |
| Sentinel Automaton | automation | robotic-assembly | 16 000 | 4 | 380 | 2 400 | 0.6 | components 3, electronics 2, metals 2 |
| Oracle Suite | software | neural-array | 12 000 | 3 | 120 | 900 | 2.0 | research-data 2, electronics 1 |
| Atlas Forge | industrial | molecular-assembly | 22 000 | 5 | 420 | 2 600 | 0.5 | advanced-materials 2, metals 4 |

### 2.2 Development progression

**Start** — validated: known product, technology unlocked, no project in development for the same
product, valid cost and duration, no duplicated employee. The development cost is charged once.

**Contribution** — engineers contribute fully, researchers at 70 %, every other profession at 30 %:

```
contribution = professionFactor × (skill / 100) × (productivity / 100)
```

**Progress** — `progress += contribution × deltaMs × researchSpeedMultiplier / developmentDurationMs`,
clamped to 0..1.

**Completion** — the product becomes `ready` and the quality, innovation and market readiness are
computed.

### 2.3 Product quality — transparent formula

```
quality = clamp(
  35                                  // base
  + averageSkill × 0.35               // the assigned workforce
  + (technologyDepth − 1) × 2         // relevant technology level
  + unlockedQualityBonus × 100        // research breakthroughs
  + 8                                 // completed development effort
  − complexity × 4,                   // manufacturing difficulty
  0, 100
)
```

`technologyDepth` is the number of technologies in the ancestry chain of the required technology
(including itself). There is **no randomness** — the same inputs always yield the same quality.

```
innovation      = clamp(quality × 0.5 + technologyDepth × 8 + complexity × 2, 0, 100)
marketReadiness = clamp(quality × 0.4 + unitsSold × 0.1, 0, 100)
```

**Guards** — a development project cannot exceed 100 % progress, an unfinished product cannot be
produced, and an invalid project is rejected without changing the state.

---

## 3. Resource & Inventory Model

**Module:** `src/simulation/resources/` · `resourceState.ts` (model, table) · `resourceRules.ts` (operations)

### 3.1 The resources

Eight resources with typed identifiers, a unit and a storage limit.

| Resource | Category | Market reference | Base price | Unit | Max storage |
|----------|----------|------------------|-----------|------|-------------|
| Raw Materials | raw | orbital-freight | 40 | t | 10 000 |
| Metals | metal | nano-lattice | 120 | t | 10 000 |
| Electronics | electronic | quantum-core | 260 | u | 5 000 |
| Energy | energy | helion-cell | 55 | MWh | 20 000 |
| Components | component | quantum-core | 180 | u | 5 000 |
| Advanced Materials | advanced | nano-lattice | 420 | t | 2 500 |
| Research Data | data | quantum-core | 90 | TB | 4 000 |
| Industrial Chemicals | chemical | helion-cell | 70 | L | 8 000 |

### 3.2 Pricing

The price of one unit follows the market:

```
unitPrice = basePrice × (commodity.price / commodity.basePrice)
```

The commodity is the one linked to the resource, so a resource price moves with the market trend
of its commodity without the resource engine importing the economy engine's internals.

### 3.3 Inventory operations — all atomic

| Operation | Effect | Guards |
|-----------|--------|--------|
| **Purchase** | `quantity += amount`, lifetime acquired grows, a `purchase` transaction is recorded | valid state, known resource, positive quantity, valid price, storage capacity, sufficient funds |
| **Reserve** | `reserved += amount`, the owned quantity is unchanged, a `reserve` transaction is recorded | valid state, known resource, enough **available** quantity |
| **Release** | `reserved -= amount`, a `release` transaction is recorded | enough reserved |
| **Consume** | `quantity -= amount`, `reserved -= amount`, lifetime consumed grows, a `consume` transaction is recorded | enough reserved and enough owned |

Every operation validates **all** affected resources before applying anything: a failed
reservation of two resources where one is missing leaves the inventory completely untouched.
The inventory can never contain a negative quantity and `reserved` never exceeds `quantity`.

The transaction ledger is bounded to 50 entries.

---

## 4. Production Engine

**Module:** `src/simulation/production/` · `productionState.ts` (model, table) · `productionRules.ts` (rules)

### 4.1 Facilities

Facilities are abstract corporate assets — there is no city engine yet and nothing is rendered.

| Type | Capabilities | Capacity / batch | Operating cost / h | Construction |
|------|--------------|-------------------|---------------------|--------------|
| Electronics Factory | computing, automation | 40 | 60 | 5 000 |
| Materials Processing Plant | industrial | 60 | 45 | 4 000 |
| Energy Facility | energy | 30 | 80 | 6 500 |
| Assembly Facility | all five categories | 50 | 55 | 7 500 |

**Effective efficiency** — the assigned workforce improves the facility, bounded so that staffing
can never dominate the facility design:

```
effectiveEfficiency = facility.efficiency × (1 + min(0.5, Σ productivity × 0.002))
```

### 4.2 Production orders

**Start** — validated: valid state, known and operational facility, known product, the product is
`ready`, the facility supports the product category, a positive whole quantity, the quantity is at
most `capacity × 5`, and a finite duration.

```
durationMs     = (quantity / facility.capacity) × productionTimeMs / effectiveEfficiency
operatingCost  = facility.operatingCost × durationMs / 3 600 000
```

The operating cost is charged **once**, when the order is created, prorated by the expected
duration. The resources of the order are reserved by the command layer.

**Progress** — `progress += deltaMs / durationMs`, clamped to 0..1. `produced = floor(progress × quantity)`.

**Completion** — the reserved resources are consumed, the finished units enter the product
inventory, and the order becomes `completed`. A finished order can never complete again.

**Cancellation** — the order becomes `cancelled`, the reservation is released and the facility
queue is updated.

### 4.3 Guards

Production of an unfinished product, a negative or fractional quantity, a quantity beyond the
capacity, an incompatible facility, a production without sufficient resources, a double
completion and a double resource consumption are all prevented.

---

## 5. Market Integration

**Module:** `src/simulation/market/` · `marketState.ts` (listings) · `marketRules.ts` (sales, signal)

### 5.1 Demand

```
demand = baseDemand
       × (marketActivityIndex / 100)
       × qualityFactor
       × priceFactor
       × marketReach

qualityFactor = 0.5 + quality × 0.01              // 0.5 … 1.5
priceFactor   = clamp((referencePrice / price) ^ 1.5, 0, 2)
```

A higher price reduces the demand, a higher quality increases it, and the commercial activity of
the world (Stage 02) scales the whole market.

### 5.2 Sales

The accumulated fractional demand is converted into whole units:

```
pendingDemand += demand × hours
sold           = min(floor(pendingDemand), availableInventory)
revenue        = sold × price
```

The sold units leave the product inventory. The revenue accumulates in the listing and is written
to the corporate ledger in **batches of 1 000** — the cash balance only ever changes through a
transaction, and the transaction list stays readable.

### 5.3 The corporate market signal

The documented integration boundary between the corporation and the economy (defined in
`src/simulation/contracts.ts` as `CorporateMarketSignal`):

```
demandPressure = clamp(avgWorkforceProductivity × marketReach, 0, 100)
supplyPressure = clamp(totalCapacity × 0.8 + activeProducts × 5, 0, 100)
productivity   = clamp(avgWorkforceProductivity, 0, 100)
```

The Economy Engine consumes the signal and modulates the commodity supply and demand:

```
supplyFactor = 1 + (supplyPressure / 100) × 0.15
demandFactor = 1 + (demandPressure / 100) × 0.15
```

**Without a signal both factors are exactly 1** and the market behaves exactly as in Stage 02 —
this is covered by a test.

The Stage 05 **city market signal** is the second integration boundary of the economy. It is
documented in section 7.9.

---

## 6. Financial Transaction Rules

The corporation has a single ledger. Every change of the cash balance goes through a transaction.

| Transaction type | Effect on the balance | Lifetime counter |
|------------------|-----------------------|------------------|
| `research` | − research cost | `lifetimeResearchExpenses` |
| `development` | − development cost | `lifetimeDevelopmentExpenses` |
| `resource` | − purchase cost | `lifetimeResourceExpenses` |
| `production` | − construction / operating cost | `lifetimeProductionExpenses` |
| `sales` | + sales revenue | `lifetimeSalesRevenue` and `lifetimeRevenue` |
| `hiring` | − hiring fee | `lifetimeHiringCosts` |
| `payroll` | − payroll | `lifetimePayrollExpenses` |
| `operating` | − operating cost | `lifetimeOperatingExpenses` |
| `city` | − land acquisition / construction cost | `lifetimeCityExpenses` |
| `city-sale` | + proceeds of a land disposal | `lifetimeCityRevenue` |

`recordFinancialEvent(corporation, event)` applies the transaction **and** updates the matching
counter in one atomic step. A rejected transaction (a non-finite amount or an overdraft) leaves
the corporation completely unchanged.

**Accounting rules:**
- The cash balance is **never negative** — an unaffordable transaction is rejected.
- The balance only ever changes through a transaction. **No money is created without a recorded
  transaction.**
- The workforce revenue and the operating expenses accrue continuously into the lifetime counters
  (Stage 03 behaviour, unchanged). They are an accounting view of the simulation, not cash
  movements.
- `lifetimeRevenue` is the total of the workforce revenue and the sales revenue — the two streams
  are never counted twice.
- **City investments are capital expenditure.** Like the Stage 04 facility construction, the land
  acquisitions and the constructions of the city are tracked in `lifetimeCityExpenses` and are
  **not** subtracted from the net profit. The **operating** cost of the running city buildings is
  an operating expense and *is* part of the net profit — expansion is never free.

---

## 7. City Engine

**Module:** `src/simulation/city/` · `cityState.ts` (model, tables) · `cityRules.ts` (rules)

The city is the first functional urban environment. It is a **data driven** simulation domain:
the districts, the land map and the building catalogue are tables — no engine code changes when
a district or a building is added.

### 7.1 The city record

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

**Derived values are never stored.** The housing capacity, the employment capacity, the
infrastructure balance, the building counts and the district metrics are computed by pure
functions of the authoritative state (`computeCityStatistics`, `getDistrictMetrics`,
`computeInfrastructureBalance`). `statistics` is a **snapshot** that is recomputed from that state
on every change — it is never a second source of truth.

The initial city is created deterministically by `createInitialCityState()`: the same call always
produces the same city, the same districts and the same land map. No `Date.now()` and no
`Math.random()` ever enters the simulation state — identifiers are derived from a sequence
(`plot_001`, `bld_001`, `district_downtown`).

### 7.2 The five districts

| District | Id | Type | Plots | Base development | Price factor |
|----------|----|------|-------|------------------|--------------|
| Downtown | `district_downtown` | commercial | 6 | 55 | 1.35 |
| Industrial Zone | `district_industrial` | industrial | 6 | 40 | 1.00 |
| Research Park | `district_research` | research | 6 | 45 | 1.15 |
| Residential District | `district_residential` | residential | 6 | 35 | 0.85 |
| Energy District | `district_energy` | energy | 6 | 30 | 0.95 |

The district type drives the building compatibility and the plot prices. There is exactly one
simulation engine — the districts are rows of a table, never separate engines.

The zoning mix of the districts is deliberately varied: the downtown district contains one
industrially zoned plot and the industrial zone two energy zoned plots. The zoning and the
district are therefore **two independent restrictions** — a building must satisfy both.

### 7.3 The finite land map

Thirty plots, six per district, `plot_001` … `plot_030`. There is no procedural land generation.

| Field | Meaning |
|-------|---------|
| `id` | Deterministic identifier |
| `districtId` | Owning district |
| `zoning` | commercial · industrial · research · residential · energy · mixed-use |
| `price` | Purchase price in Aether Credits |
| `ownerId` | Owner, or `null` |
| `buildingId` | Building standing on the plot, or `null` |
| `infrastructureAvailable` | Connection to the municipal networks |
| `status` | available · owned · occupied · sold |
| `soldAtSimMs` | Simulated time of the disposal, or `null` |

The **price** is `PLOT_BASE_PRICES[zoning] × district.priceFactor`, rounded to a whole number.
The base prices are 6 000 (commercial), 5 500 (research), 5 000 (industrial), 4 800 (mixed-use),
4 500 (energy) and 4 000 (residential).

**Rules**

- A plot can only be bought when its status is `available`. A sold plot is retired for ever.
- An **occupied** plot can neither be sold nor reused — one plot never carries two buildings.
- A plot that is sold returns 60 % of its purchase price (`PLOT_RESALE_RATE`); the refund goes
  through the ledger as a `city-sale` transaction.
- Every financial cost goes through the existing transaction system. A failed purchase changes
  neither the city nor the corporation.

### 7.4 The building catalogue

Thirteen data driven blueprints (`BUILDING_DEFINITIONS`). Every blueprint declares its category,
the compatible districts, the compatible zoning, the construction cost, the construction duration,
the workforce capacity, the operating cost, the infrastructure demand and the effects.

| Building | Category | Districts | Zoning | Cost | Duration | Jobs | Op. cost /h |
|----------|----------|-----------|--------|------|----------|------|-------------|
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

**Effects** (`BuildingEffects`) — every field is a plain number or a plain capacity record, so no
building needs a special case in the engine:

| Effect | Meaning |
|--------|---------|
| `populationCapacity` | Residents the building houses |
| `productionCapacity` | Units per batch of city industrial capacity |
| `researchCapacity` | Research capacity points |
| `commercialActivity` | Commercial activity points |
| `prosperity` | Prosperity points |
| `environmentImpact` | Signed contribution to the environment target (negative is pollution) |
| `infrastructureProvided` | Capacity the building contributes to the four networks |

**Unlock requirements** reuse the existing Stage 04 technology tree and the corporation tiers:
the Assembly Facility needs `robotic-assembly`, the Power Station needs `helion-fusion`, the
Commercial Center needs `photonic-cores`, the Advanced Technology Center needs `neural-array` and
the *established* tier, the Corporate Headquarters and the High-Density Housing need the *growth*
tier.

**Relationship to the Production Engine.** The city does **not** create a second production
authority. The Stage 04 Production Engine remains the single model for manufacturing orders,
resource reservations and the product inventory. A city building contributes to the **city**
industrial capacity, which is reported through the city signal and never turns into a production
order.

### 7.5 The construction lifecycle

```
planned → constructing → completed ⇄ operational
                 ↓            ↓         ↓
              demolished   suspended  demolished
```

1. `startConstruction` validates in this order: the definition exists → the plot exists → the plot
   is not sold → the plot is not occupied → the plot is owned by the corporation → the district is
   compatible → the zoning is compatible → the cost and the duration are valid.
2. The unlock requirements (technology, tier) are validated by the command layer.
3. The construction cost is charged **once** through the corporate ledger (`city` transaction).
4. The construction record is created with the deterministic id `bld_00n` and the plot becomes
   `occupied`.
5. The progress advances with the **simulated** time:
   `progress += deltaMs / constructionDurationMs`, clamped to 0..1.
6. At `progress >= 1` the building becomes `completed` and the completion is stamped. Because the
   status changes, a building **can never complete twice**.
7. The operational status is then evaluated against the infrastructure (see 7.6).

**Cancellation** — `cancelConstruction` is only allowed for a `planned` or `constructing` building.
The construction cost is **not** refunded — it is a sunk cost, exactly like the cancellation of a
research project. The building record is kept with the status `demolished`, the plot is released
and stays owned by the corporation.

**Demolition** — `demolishBuilding` removes a finished building, releases the plot (it stays
owned) and refunds nothing. The operating cost of the building stops.

**Suspension** — `suspendBuilding` stops the effects of a running building; `resumeBuilding`
evaluates the operational status immediately.

### 7.6 The infrastructure model

Four networks, all aggregated city wide:

| Network | Provided by | Consumed by |
|---------|-------------|-------------|
| `electricity` | Power Station | every building |
| `water` | Water Treatment Facility | every building |
| `logistics` | Logistics Center | every building |
| `publicServices` | Residential Complex, High-Density Housing, Commercial Center | every building |

The city starts with a **municipal baseline** of `{ electricity: 60, water: 50, logistics: 40,
publicServices: 30 }` — the infrastructure that exists before the player builds anything.

```
capacity = baseline + Σ provided by the finished buildings
demand   =             Σ demanded by the finished buildings
shortage = max(0, demand − capacity) per network
```

**Service level** — the weakest network decides:

```
share_c = min(1, capacity_c / demand_c)      (1 when the network has no demand)
share   = min over the four networks
factor  = clamp(share, 0.25, 1)
```

- A building is **operational** while `share >= 0.25`; otherwise it stays `completed` and
  contributes nothing. The operational status therefore *responds* to an infrastructure shortage.
- The effects of the operational buildings are scaled by `factor` — a strained city works at a
  reduced output.
- The capacity is never negative and a provider is counted exactly once — the capacity is
  aggregated from the building records, not from an accumulator.

There is no transport route, traffic, pipe or grid topology simulation in this stage.

### 7.7 Population and employment

```
housingCapacity    = baselineHousingCapacity + Σ populationCapacity of the operational buildings
employmentCapacity = baselineEmploymentCapacity + Σ workforceCapacity of the operational buildings
population         → converges towards housingCapacity
employment         = min(employmentCapacity, population)
unemployment       = (population − employment) / population × 100     (0 when there is no population)
availableWorkforce = population − employment
```

The population converges with the **exponential** form

```
population += (housingCapacity − population) × (1 − (1 − growthRate × attractiveness)^hours)
```

with `growthRate = 0.05` and `attractiveness = 0.5 + prosperity / 200`. When the housing is lost,
the population decays at `0.1` per hour towards the remaining capacity. The exponential form
guarantees that a single long tick can never overshoot the housing capacity.

The population is **capped by the housing capacity at all times** and the unemployment can never
become negative.

**Four distinct populations** — they are never mixed up and never counted twice:

| Figure | Owner |
|--------|-------|
| Corporate employees | Employee Engine (Stage 03) — the city only stores references |
| City population | City Engine — the residents of the city |
| Available workforce | City Engine — the residents that are not employed |
| Occupied positions | City Engine — the positions filled by the residents |

The city never creates, moves or duplicates a corporate employee. The Employee Engine stays the
only authority for the employee records.

### 7.8 The urban indicators

Every indicator is normalised to 0..100 and converges towards a target that is derived from the
actual city conditions. The convergence uses the exponential form
`value += (target − value) × (1 − (1 − rate)^hours)` with `rate = 0.08` per simulated hour, so a
long tick can never overshoot the target.

| Indicator | Target |
|-----------|--------|
| `prosperity` | `10 + commercialActivity × 0.30 + employmentRate × 25 + environment × 0.15 + publicServices × 0.15 + infrastructure × 0.05` |
| `infrastructure` | the lowest utilisation of the four networks |
| `environment` | `80 + Σ environmentImpact of the operational buildings` |
| `publicServices` | `(publicServiceCapacity / population) × 200` |
| `development` | `10 + prosperity × 0.30 + infrastructure × 0.25 + environment × 0.15 + publicServices × 0.10 + populationBonus` |

`populationBonus` is `10` at 2 000 residents. The city level is `1 + floor(development / 20)`,
so it ranges from 1 to 5. A district converges towards
`baseDevelopment + operationalBuildings × 7 + housingCapacity / 40 + employmentCapacity / 60`
with a rate of 0.06 per hour.

There is **no randomness** anywhere — the same inputs always produce the same city.

### 7.9 The city market signal

The City Engine produces the signal that the Economy Engine consumes
(`CityMarketSignal` in `src/simulation/contracts.ts`):

```
commercialActivity        = Σ commercialActivity of the operational buildings × factor   (0..100)
researchCapacity          = Σ researchCapacity of the operational buildings × factor     (0..100)
industrialCapacity        = Σ productionCapacity of the operational buildings × factor
energyDemand              = Σ electricity demand of the operational buildings (MWh/h)
population                = the population of the city
infrastructureUtilization = the lowest utilisation of the four networks
```

The signal is only produced while the city **runs something** — an untouched city leaves the
economy exactly as it was.

The Economy Engine derives the urban activity index and applies two bounded factors:

```
urbanIndex = commercialActivity × 0.4 + researchCapacity × 0.3
           + min(1, industrialCapacity / 500) × 100 × 0.2
           + min(1, population / 5 000) × 100 × 0.1

demandFactor    = 1 + (urbanIndex / 100) × categoryWeight × 0.15      (≤ 1.15)
saturationFactor= 1 + (urbanIndex / 100) × categoryWeight × 0.25      (≤ 1.25)
```

`categoryWeight` is 1.0 for compute and logistics, 0.9 for materials and 0.6 for energy. The
energy commodity additionally reacts to the urban energy demand (≤ 1.10). The city is a
**consumer** — it never adds supply to the market. Both factors are deterministic, bounded and
applied exactly once per tick. **Without a city signal both factors are exactly 1** and the market
behaves exactly as in Stage 04 — this is covered by a test.

### 7.10 The city and the corporation

- The city has **no treasury of its own**. Every payment uses the balance and the ledger of the
  player corporation.
- The land acquisition and the construction are `city` transactions, the disposal is a
  `city-sale` transaction.
- The **operating cost** of the running city buildings is accrued into the operating expenses of
  the corporation, exactly like the Stage 03 operating costs — it reduces the net profit and the
  tier progression. Expansion therefore has a running price.
- A command that cannot be afforded fails completely: neither the city nor the corporation is
  changed.

---

## 8. Final Simulation Tick Order

```
1. Game Clock         — advances the simulated time (engine owned, before the systems)
2. World Engine       — order 10
3. Events Engine      — order 11  ← schedules the global events, expires them
4. City Engine        — order 15  ← consumes the event pressures
5. Economy Engine     — order 20  ← consumes the world and the three market signals
6. Employee Engine    — order 30  ← develops the workforce
7. Technology Engine  — order 40  ← research uses the workforce of step 6
8. Product Engine     — order 50  ← development uses the unlocked technologies
9. Resource Engine    — order 60  ← resource bookkeeping
10. Production Engine — order 70  ← consumes the reserved resources
11. Market Engine     — order 80  ← sells the finished goods
12. Competitor Engine — order 85  ← the AI decisions and the competitive activity
13. Corporation Engine— order 90  ← accrues the finances, payroll, progression
```

Dependencies respected by the order:
- the clock advances before every system;
- **world → economy** is preserved unchanged from Stage 02;
- **events → city / economy / technology / production / market / corporation** is the
  Stage 06 dependency: the Events Engine runs first, so every engine that is affected by an
  event consumes the modifiers of the **same** tick;
- **city → economy** is preserved unchanged from Stage 05;
- research uses the workforce developed in the same tick;
- product development uses the technologies unlocked in the same tick;
- production uses the products completed and the resources reserved before it;
- sales use the finished goods and the current market conditions;
- **market → competitors** is the Stage 06 dependency: the AI reacts to the results of the
  market of the tick it is in. Its signal reaches the economy with the **next** tick — no
  result that was already calculated is ever changed retroactively;
- the corporate finances reflect the recorded transactions of the same tick without double
  counting.

Pause stops every system. A failing system is isolated by the Game Core: the failure is recorded
and the remaining systems still run.

---

## 9. Global Events Engine

**Module:** `src/simulation/events/` · `eventState.ts` (model, catalogue) · `eventRules.ts` (rules)

The Events Engine produces the **global conditions** of the world: recessions, breakthroughs,
crises and regulations. It is a data-driven table of seventeen definitions — no JavaScript
callbacks, no functions inside the data.

### 9.1 The event definition

```ts
interface EventDefinition {
  id: string;
  name: string;
  description: string;
  category: 'economic' | 'technology' | 'industrial' | 'energy' | 'environment' | 'geopolitical';
  severity: 'low' | 'medium' | 'high';
  durationMs: number;        // how long the event lasts
  cooldownMs: number;        // how long it has to be absent before it may trigger again
  minElapsedMs: number;      // the earliest point in time at which it may trigger
  triggers: EventTrigger;    // the conditions of the world
  effects: EventEffectDefinition[];
  responses?: EventResponseDefinition[];
  weight: number;            // the weight of the deterministic selection
  newsHeadline: string;
}
```

The **catalogue** — all seventeen events with their effects and their responses — is documented
in `docs/EVENT_SYSTEM.md`.

### 9.2 The effect types

Every effect is one of ten typed kinds. A multiplier is bounded to 0.5 … 2, a pressure to
0 … 1 and a commodity effect may be restricted to a single commodity category.

| Effect | Target | Value |
|--------|--------|-------|
| `commodity-demand` | The demand of a commodity category | multiplier |
| `commodity-supply` | The supply of a commodity category | multiplier |
| `operating-cost` | The operating costs of the corporation | multiplier |
| `research-speed` | The research speed of the corporation | multiplier |
| `production-efficiency` | The output of the production orders | multiplier |
| `market-demand` | The demand of the products on the market | multiplier |
| `city-infrastructure-pressure` | The infrastructure load of the city | pressure |
| `city-environment-pressure` | The environment of the city | pressure |
| `city-commercial-activity` | The commercial activity of the city | multiplier |
| `competitor-activity` | The activity of the AI corporations | multiplier |

### 9.3 Scheduling — deterministic and bounded

- The scheduler evaluates the catalogue at most every `EVENT_SCHEDULE_INTERVAL_MS`
  (12 simulated hours) of the **elapsed** simulated time.
- An event is a candidate only when its `minElapsedMs` has passed, its cooldown has expired,
  it is not already active and its trigger conditions are met.
- The candidates are selected with a **deterministic weighted selection**: the roll comes from
  the seeded xorshift generator of `@/core/utils`, whose state lives in the events state. The
  same state always selects the same event.
- At most `MAX_ACTIVE_EVENTS` (3) events are active at the same time.
- A long tick can therefore never trigger a burst of events — one evaluation per tick at most.

### 9.4 Activation and expiration

- The activation creates the instance `evt_00n`, stamps the start and the end of the event and
  sets the cooldown of the definition.
- The expiry happens **exactly once**: the instance leaves the active list and is written into
  the bounded history (24 entries).
- An expired event has **no influence** any more — the modifiers are recomputed from the
  active events on every tick.

### 9.5 Stacking and the bounds

The modifiers of the active events stack **multiplicatively**, the pressures **additively**:

```
multiplier = clamp(Π effect.multiplier, 0.5, 2)
pressure   = clamp(Σ effect.pressure,   0,   1)
```

The result is the `EventEnvironmentModifiers` snapshot that the affected engines consume. Every
engine that receives the snapshot applies **only** the modifier it cares about, and clamps it
again before use. The relief a player response grants multiplies the effects of **its own
event instance** and never leaves it.

### 9.6 The player responses

A response has a **real cost** and a **real effect**:

- The cost is charged through the corporate ledger — a `resource` transaction when the response
  also buys resources, an `operating` transaction otherwise.
- The relief multiplies the effects of the event instance for a bounded duration
  (`reliefDurationMs`), never longer than the event itself.
- Some responses buy resources through the Resource Engine — the purchase is atomic.
- A response may only be applied **once** per event and only while the event is active.

Seven events offer responses, three of them with three options each.

### 9.7 The news feed

The Events Engine owns the news feed (40 items). A news item is created for every activation,
every expiration, every significant decision of an AI corporation and every technology
breakthrough of a competitor. The identifier sequence is shared with the events, so every
identifier is unique and monotonic. The news is never invented — it always refers to a real
simulation event.

---

## 10. Competitor AI Engine

**Module:** `src/simulation/competitors/` · `competitorState.ts` (model, tables) ·
`competitorRules.ts` (rules)

The Competitor AI Engine produces **independent economic actors**: their own capital, their own
objectives, their own research and their own market presence. It never touches the ledger of
the player corporation and it never uses `Math.random()`.

### 10.1 The three AI corporations

| Corporation | Id | Specialisation | Strategy | Base personality | Tier | Capital |
|-------------|----|----------------|----------|------------------|------|---------|
| NEXORA INDUSTRIES | `nexora-industries` | Advanced computing, electronics and frontier technology | Technology leadership | innovative | growth | 120 000 |
| VANTEX GLOBAL | `vantex-global` | Industrial production, materials and logistics | Operational efficiency and market share | conservative | growth | 150 000 |
| HELION DYNAMICS | `helion-dynamics` | Energy generation, infrastructure and advanced materials | Resource control and long-term investment | defensive | established | 135 000 |

The definitions are rows of the `COMPETITOR_DEFINITIONS` table — the decision engine never
hardcodes a corporation.

### 10.2 The personality profiles

Five profiles are implemented. A profile changes the **weights** of the decision scoring — it
never introduces random behaviour.

| Profile | Character | Highest weights |
|---------|-----------|-----------------|
| `aggressive` | Takes the market | expand production, market presence, cut prices |
| `innovative` | Buys its future with research | research, then the market |
| `conservative` | Protects the balance | reduce expenses, accumulate resources, raise prices |
| `opportunistic` | Reads the market | enter category, accumulate resources |
| `defensive` | Guards what it has | recover finances, reduce expenses, accumulate |

The **current** personality of a corporation may shift from its base personality — always
deterministically, never randomly:

```
stability < 35                     → defensive
an active shortage                  → opportunistic
the market leader with stability 60 → aggressive
otherwise                           → the base personality
```

### 10.3 The decision cycle

1. Every `COMPETITOR_DECISION_INTERVAL_MS` (24 simulated hours) a corporation evaluates its nine
   objectives. The first decision never happens before a full interval has passed; the three
   corporations are offset by 0, 8 and 16 hours.
2. The score of an objective is the **personality weight × the need of the corporation**:

   ```
   score = clamp(weight × need × affordability × modifier, 0, 1)
   ```

   A score below `COMPETITOR_DECISION_THRESHOLD` (0.25) is never taken.
3. The objectives are evaluated in a fixed order, so a tie is always broken the same way.
4. The action has to be **affordable** — a corporation never spends money it does not have.
5. The action type is blocked for `COMPETITOR_ACTION_COOLDOWN_MS` (72 simulated hours), so the
   same action cannot repeat every tick.
6. The objective, the priority and the action are recorded in the bounded history
   (12 entries) and published into the news feed.

The nine objectives: `invest-research`, `expand-production`, `increase-market-presence`,
`enter-category`, `cut-prices`, `raise-prices`, `reduce-expenses`, `accumulate-resources` and
`recover-financials`.

### 10.4 The financial model

The AI has its **own** compact financial model. It is not the Corporation Engine of the player:
the AI has no employees, no payroll and no ledger.

```
revenue per hour = (marketPresence / 100) × 70 × (1 + marketActivity / 100) × eventFactor
operating cost    = (25 + marketPresence × 0.35) × costReductionFactor
balance          += revenue − operating cost − research − investment      (never negative)
```

- The revenue is **bounded** by the market presence and by the commercial activity of the world —
  there is no unlimited artificial income.
- The presence carries a part of the operating cost, so the profit of a corporation stays
  bounded even at a maximum presence.
- A corporation **can lose money**: a recession, a missing presence or an expensive research
  programme drive the balance down.
- The **stability** (0..100) is derived from the capital and the profit:

  ```
  stability = clamp(50 + (balance / startingCapital − 1) × 25 + profitScore, 0, 100)
  profitScore = clamp(netResultPerHour / operatingCostPerHour, −1, 1) × 25
  ```

  A corporation that lost its capital becomes defensive and recovers by cutting its costs.

### 10.5 The technology competition

The AI reuses the **existing Stage 04 technology tree** — there is no second tree.

- A corporation only researches a technology of its own specialisation whose prerequisites it
  has already unlocked.
- A research programme costs the `researchCost` of the definition and is charged to the
  corporation's own balance. A corporation never spends more than half of its balance on one
  programme.
- The progress advances with the simulated time:

  ```
  progress += (deltaMs / researchDurationMs) × (0.6 + reputation / 100 × 0.4) × eventFactor
  ```

- On completion the technology joins the unlocked technologies of the corporation, its
  reputation grows by three points and the achievement is published into the news feed.
- A corporation that unlocks a technology never removes it.

### 10.6 The market integration

The AI reports its competitive pressure through the `CompetitorMarketSignal`:

```
supplyPressure[category] = clamp(Σ categoryCapacity × presence, 0, 100)
demandPressure[category] = clamp(Σ presence × 50 (of the categories it operates in), 0, 100)
pricePressure[category]  = clamp(weighted average of the price pressure, −1, 1)
```

The Economy Engine applies it per commodity category:

```
effectiveSupply = clamp(supplyPressure × (1 − pricePressure), 0, 150)
effectiveDemand = clamp(demandPressure × (1 + pricePressure), 0, 150)
supplyFactor    = 1 + effectiveSupply / 100 × 0.12
demandFactor    = 1 + effectiveDemand / 100 × 0.12
```

A corporation that undercuts the market (a negative price pressure) adds more effective supply,
one that pushes the prices up adds less. The city is a consumer, the AI is a **producer** — the
AI may add supply, but only its own bounded production capacity.

The signal is only produced while there is at least one corporation — an empty competitor state
leaves the economy exactly as it was in Stage 05.

### 10.7 The competitive relationship

Every corporation keeps a relationship with the player: a **standing** (−100 … 100, negative is
hostile), the **competitive pressure** it puts on the player (0 … 100) and the simulated time of
the last interaction. The player may only **inspect** a corporation — there is deliberately no
command that lets the player steer the AI.
