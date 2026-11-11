# AETHRION — Engine Rules

**Project:** AETHRION  
**Stage:** 04 — Technology & Production Engines  
**Scope:** focused documentation of the Stage 04 gameplay engines.

This document is the companion of `docs/TECHNICAL_ARCHITECTURE.md` (architecture and layering)
and `docs/GAME_DESIGN_OVERVIEW.md` (player-facing gameplay). Here are the exact rules of the
new engines.

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

---

## 7. Final Simulation Tick Order

```
1. Game Clock         — advances the simulated time (engine owned, before the systems)
2. World Engine       — order 10
3. Economy Engine     — order 20   ← consumes the world of step 2 and the corporate market signal
4. Employee Engine    — order 30   ← develops the workforce
5. Technology Engine  — order 40   ← research uses the workforce of step 4
6. Product Engine     — order 50   ← development uses the unlocked technologies
7. Resource Engine    — order 60   ← resource bookkeeping
8. Production Engine  — order 70   ← consumes the reserved resources
9. Market Engine      — order 80   ← sells the finished goods
10. Corporation Engine — order 90   ← accrues the finances, payroll, progression
```

Dependencies respected by the order:
- the clock advances before every system;
- **world → economy** is preserved unchanged from Stage 02;
- research uses the workforce developed in the same tick;
- product development uses the technologies unlocked in the same tick;
- production uses the products completed and the resources reserved before it;
- sales use the finished goods and the current market conditions;
- the corporate finances reflect the recorded transactions of the same tick without double
  counting.

Pause stops every system. A failing system is isolated by the Game Core: the failure is recorded
and the remaining systems still run.
