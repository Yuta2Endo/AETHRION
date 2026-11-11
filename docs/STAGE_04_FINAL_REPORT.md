# AETHRION — Stage 04 Final Report

**Project:** AETHRION  
**Stage:** 04 — Technology & Production Engines  
**Repository:** `Yuta2Endo/AETHRION`  
**Branch:** `main`  
**Previous stage:** Stage 03 — Corporation & Employee Engines (`62fa270`)  
**Date:** 2026-11-12

---

## 1. Executive Summary

Stage 04 introduced the first **complete economic gameplay loop** in AETHRION:

```
Research → Technology Unlock → Product Development → Resource Acquisition
        → Manufacturing → Inventory → Market Sales → Revenue → Corporate Growth
```

Five new engines were implemented on top of the Stage 03 backbone: the Technology Research
Engine, the Product Development Engine, the Resource & Supply Chain, the Production Engine and
the Market Integration. The corporation no longer earns revenue only from workforce
productivity — the player now has to research, develop, buy inputs, manufacture and sell.

The Stage 02 **world → economy** dependency and the Stage 03 **seven-day payroll semantics**
were preserved unchanged. The Stage 03 `CorporateMarketSignal` contract — declared but
unconnected — is now consumed by the Economy Engine.

**Headline metrics**

| Metric | Stage 03 | Stage 04 |
|--------|----------|----------|
| Tests | 170 | **285** (115 added) |
| Test files | 13 | 19 |
| Simulation systems per tick | 4 | **9** |
| Domain engines implemented | 4 | **9** |
| Player commands | 3 | **16** |
| Source files | 89 | 120 |
| New dependencies | 0 | **0** |

## 2. Implemented Systems

### Technology Research Engine
- A data-driven tree of **20 technologies** in six categories (computing, materials, energy,
  automation, manufacturing, artificial intelligence) with prerequisites, tier gating, research
  costs, durations and unlock effects.
- Research projects with a deterministic contribution model driven by the **Stage 03 employee
  records** — skill, productivity and profession decide the research speed.
- Duplicate active projects, missing prerequisites, invalid costs and invalid states are
  rejected; the technology unlocks on completion and the effect multipliers apply corporation
  wide; cancellation releases the staff and records the history.

### Product Development Engine
- Six data-driven product blueprints with technology prerequisites, development costs, resource
  requirements per unit, manufacturing complexity, base production cost, base price and demand.
- Development projects staffed by the existing engineers and researchers.
- A **transparent quality formula** — base quality, workforce skill, technology depth, unlocked
  research bonuses, development effort and complexity. No randomness.

### Resource & Supply Chain
- Eight resources (raw materials, metals, electronics, energy, components, advanced materials,
  research data, industrial chemicals) with typed identifiers, units and storage limits.
- Prices derived from the **live market**: `unitPrice = basePrice × (commodity.price / basePrice)`.
- Fully atomic purchase / reserve / release / consume operations and a bounded resource ledger.

### Production Engine
- Four facility types with explicit product-category capabilities, capacity, efficiency and
  operating costs.
- Production orders with resource reservation, deterministic duration, a one-off operating cost
  and progress driven by the simulated time; the finished units enter the product inventory.
- The assigned workforce raises the effective efficiency, bounded so staffing cannot dominate
  the facility design.

### Market Integration
- Demand from the commercial activity of the world, the product quality, the price and the market
  reach of the unlocked technologies; sales are limited by the available inventory.
- Sale revenue reaches the corporate ledger in batches of 1 000 — the cash balance only ever
  changes through a transaction.
- The `CorporateMarketSignal` is produced by the corporation and **consumed by the Economy
  Engine**, modulating the commodity supply and demand by up to 15 %.

## 3. Architecture Decisions

1. **The command layer became a module per domain.** `src/game/commands.ts` would have grown
   past 700 lines with 16 commands. It was split into `corporationCommands`, `technologyCommands`,
   `productCommands`, `resourceCommands`, `productionCommands` and a `shared` helper module,
   re-exported through `src/game/commands/index.ts`. The public `commands` object is unchanged.
2. **Pure domain functions, no rules in the store.** Every engine is a set of
   `(state, context) => state` functions. The store only stores the results.
3. **Resource identifiers live in `src/simulation/contracts.ts`.** The Product, Resource and
   Production engines share the vocabulary without importing each other.
4. **The Corporation Engine does not import the Employee Engine.** Workforce statistics are
   derived through the structural `WorkforceMember` view. The same pattern applies to the
   Resource Engine.
5. **The Economy Engine was extended, not rewritten.** `corporateSignal` is an **optional**
   field of `EconomyContext`; without it both adjustment factors are exactly 1 and the Stage 02
   behaviour is bit-identical. A dedicated test asserts this.
6. **Resource operations are atomic.** A reservation of two resources where one is missing
   leaves the inventory completely untouched — every affected resource is validated before
   anything is applied.
7. **Facility operating costs are charged once per order**, prorated by the expected duration,
   instead of per tick — otherwise the transaction ledger would be flooded with one entry per
   tick.
8. **Sale revenue is written to the ledger in batches.** The lifetime counters stay exact, the
   balance only moves through a transaction, and the transaction list stays readable.
9. **Deterministic identifiers everywhere.** Technologies, products, facilities, orders and
   transactions derive their ids from state counters — never from `Date.now()` or
   `Math.random()`.
10. **No new dependencies and no payroll redesign.** The seven-day payroll semantics of Stage 03
    are untouched.

## 4. Technology Data Model

```ts
interface TechnologyDefinition {
  id: string; name: string; description: string;
  category: 'computing' | 'materials' | 'energy' | 'automation' | 'manufacturing' | 'ai';
  researchCost: number;
  researchDurationMs: number;
  requires: string[];
  requiresTier?: string;
  requiredProfession?: ProfessionId;
  requiredSkill?: number;
  effects: TechnologyEffects;
}

interface TechnologyEffects {
  productionEfficiency?: number;  // multiplier
  researchSpeed?: number;          // multiplier
  qualityBonus?: number;           // additive
  marketReach?: number;            // multiplier
  resourceYield?: number;          // multiplier
}
```

Twenty definitions form a prerequisite tree with no cycles (verified by a test that walks the
graph).

## 5. Research Progression Rules

```
contribution = professionFactor × skillFactor × productivityFactor
professionFactor   = 1.0 for the required profession, 0.4 otherwise
skillFactor        = clamp(employee.skill / requiredSkill, 0, 1)
productivityFactor = clamp(employee.productivity / 100, 0, 1)

progress += contribution × deltaMs × researchSpeedMultiplier / researchDurationMs   (clamped 0..1)
```

A project with no assigned workforce makes no progress. At `progress >= 1` the technology is
unlocked, the project becomes `completed` and the bounded history records it. Cancellation
releases the staff and does **not** refund the research cost.

## 6. Product Data Model

```ts
interface ProductDefinition {
  id: string; name: string; description: string;
  category: 'computing' | 'industrial' | 'energy' | 'automation' | 'software';
  requiresTechnology: string;
  developmentCost: number;
  developmentDurationMs: number;
  resourceCost: ResourceRequirement;   // per produced unit
  complexity: number;                   // 1..5
  baseProductionCost: number;
  basePrice: number;
  baseDemand: number;                   // units per simulated hour at 100 % activity
  productionTimeMs: number;             // time for one facility batch at efficiency 1
}

interface ProductInstance {
  id: string; definitionId: string; name: string;
  status: 'developing' | 'ready' | 'retired';
  progress: number; quality: number; innovation: number; marketReadiness: number;
  assignedEmployeeIds: string[];
  costPaid: number; createdAtSimMs: number; completedAtSimMs: number | null;
  price: number; salesActive: boolean;
  inventory: number; unitsSold: number; revenue: number;
}
```

## 7. Resource and Inventory Model

Eight resources, each with a typed id, a unit, a base price and a storage limit. The price
follows the market of the linked commodity:

```
unitPrice = basePrice × (commodity.price / commodity.basePrice)
```

| Operation | Quantity | Reserved | Ledger |
|-----------|----------|----------|--------|
| Purchase | += amount | — | `purchase` |
| Reserve | — | += amount | `reserve` |
| Release | — | −= amount | `release` |
| Consume | −= amount | −= amount | `consume` |

All four validate **every** affected resource before applying anything. The inventory can never
hold a negative quantity and `reserved` never exceeds `quantity`. The ledger is bounded to 50
entries.

## 8. Production Model

| Facility type | Capabilities | Capacity/batch | Operating cost/h | Construction |
|---------------|--------------|----------------|------------------|--------------|
| Electronics Factory | computing, automation | 40 | 60 | 5 000 |
| Materials Processing Plant | industrial | 60 | 45 | 4 000 |
| Energy Facility | energy | 30 | 80 | 6 500 |
| Assembly Facility | all categories | 50 | 55 | 7 500 |

```
effectiveEfficiency = facility.efficiency × (1 + min(0.5, Σ productivity × 0.002))
durationMs          = (quantity / capacity) × productionTimeMs / effectiveEfficiency
operatingCost       = facility.operatingCost × durationMs / 3 600 000
progress           += deltaMs / durationMs   (clamped 0..1)
```

## 9. Market and Sales Formulas

```
demand = baseDemand
       × (marketActivityIndex / 100)
       × (0.5 + quality × 0.01)
       × clamp((referencePrice / price) ^ 1.5, 0, 2)
       × marketReach

pendingDemand += demand × hours
sold           = min(floor(pendingDemand), availableInventory)
revenue        = sold × price
```

The corporate market signal:

```
demandPressure = clamp(avgWorkforceProductivity × marketReach, 0, 100)
supplyPressure = clamp(totalCapacity × 0.8 + activeProducts × 5, 0, 100)
```

consumed by the Economy Engine as `supplyFactor = 1 + supplyPressure/100 × 0.15` and the same
for the demand. Without a signal both factors are exactly 1.

## 10. Financial Transaction Rules

The corporation has a single ledger; every change of the cash balance goes through a transaction.

| Transaction | Balance | Lifetime counter |
|-------------|---------|------------------|
| `research` | − research cost | `lifetimeResearchExpenses` |
| `development` | − development cost | `lifetimeDevelopmentExpenses` |
| `resource` | − purchase cost | `lifetimeResourceExpenses` |
| `production` | − construction / operating cost | `lifetimeProductionExpenses` |
| `sales` | + sales revenue | `lifetimeSalesRevenue` and `lifetimeRevenue` |
| `hiring` | − hiring fee | `lifetimeHiringCosts` |
| `payroll` | − payroll | `lifetimePayrollExpenses` |
| `operating` | − operating cost | `lifetimeOperatingExpenses` |

`recordFinancialEvent` applies the transaction **and** the matching counter in one atomic step.
A rejected transaction (non-finite amount or overdraft) leaves the corporation unchanged. The
balance is never negative and **no money is created without a recorded transaction** — a
dedicated test verifies that the balance change equals the sum of the transactions of the tick.

## 11. Employee Integration

No employee model was duplicated. The Stage 03 records drive everything:

| System | Employee influence |
|--------|-------------------|
| Research | Skill, productivity and profession decide the research speed |
| Product development | Engineers contribute 100 %, researchers 70 %, others 30 % |
| Manufacturing | The assigned workforce raises the effective facility efficiency |
| Payroll | The weekly salary of every employed employee |
| Market | The average workforce productivity feeds the corporate demand signal |

The employee model was **not** extended with an assignment field: the assignments live on the
research project, the product instance and the facility, which keeps a single authoritative
owner per record and avoids duplicating the employee data.

## 12. Simulation Tick Order

```
1. Game Clock        — advances the simulated time (engine owned, before the systems)
2. World Engine      — order 10
3. Economy Engine    — order 20   ← the world of step 2 and the corporate market signal
4. Employee Engine   — order 30   ← develops the workforce
5. Technology Engine — order 40   ← research uses the workforce of step 4
6. Product Engine    — order 50   ← development uses the unlocked technologies
7. Resource Engine   — order 60   ← resource bookkeeping
8. Production Engine — order 70   ← consumes the reserved resources
9. Market Engine     — order 80   ← sells the finished goods
10. Corporation Engine— order 90   ← accrues the finances, payroll, progression
```

The Stage 02 **world → economy** dependency is preserved unchanged. The Stage 03 payroll
semantics are unchanged. The order is asserted by an integration test.

## 13. UI Implementation

Five new dashboard sections, all reading live simulation state:

| Section | Content | Actions |
|---------|---------|---------|
| Technology & Research | Per category: status badge, cost, prerequisites, research progress, assigned staff | Pick an employee, start research, cancel research |
| Product Development | Per blueprint: required technology, development cost, complexity, reference price, progress, assigned staff | Start the development |
| Resource Inventory | Per resource: owned, reserved, available, market price, storage limit | Purchase with a live cost preview, resource ledger |
| Manufacturing | Facilities with capacity, efficiency, staff and status; the production queue with progress and operating cost | Construct a facility, start and cancel production |
| Products & Market | Per product: quality, innovation, readiness, stock, units sold, revenue | Set the price, offer or withdraw from the market |

The Finance Overview was extended with the research, development, resource, manufacturing and
sales figures plus the lifetime net profit.

No new dependencies were needed — the existing `StatCard`, `IndicatorBar`, `Badge`, `Button`,
`TextField` and `SelectField` primitives were reused. All values come from the simulation
state; there is no placeholder or decorative data. The layout stays responsive down to 320 px
and every control is a real accessible form element.

## 14. Files Created and Modified

### Created (34)

| Area | Files |
|------|-------|
| Command layer | `src/game/commands/{index,shared,corporationCommands,technologyCommands,productCommands,resourceCommands,productionCommands}.ts` |
| Technology Engine | `src/simulation/technology/{technologyState,technologyRules}.ts` |
| Product Engine | `src/simulation/products/{productState,productRules,index}.ts` |
| Resource Engine | `src/simulation/resources/{resourceState,resourceRules,index}.ts` |
| Production Engine | `src/simulation/production/{productionState,productionRules}.ts` |
| Market Engine | `src/simulation/market/{marketState,marketRules,index}.ts` |
| UI sections | `src/ui/screens/sections/{TechnologySection,ProductSection,ResourceSection,ManufacturingSection,MarketSection}.tsx` |
| Tests | `src/tests/simulation/{technology,products,resources,production,market}.test.ts`, `src/tests/integration/stage04.test.ts`, `src/tests/helpers/fixtures.ts` |
| Documentation | `docs/ENGINE_RULES.md`, `docs/STAGE_04_FINAL_REPORT.md` |

### Deleted (1)

`src/game/commands.ts` — replaced by the `src/game/commands/` module directory.

### Modified (24)

`package.json` (version 0.4.0) · `vite.config.ts` (vendor chunk splitting) ·
`src/game/simulationRunner.ts` (nine systems) · `src/game/state/gameStore.ts` (five new slices) ·
`src/game/state/selectors.ts` · `src/game/systems/index.ts` ·
`src/simulation/contracts.ts` (resource identifiers) · `src/simulation/corporation/corporationState.ts`
(new transaction types and finance counters) · `src/simulation/corporation/corporationRules.ts`
(`recordFinancialEvent`) · `src/simulation/corporation/index.ts` ·
`src/simulation/economy/economyRules.ts` (optional corporate signal) ·
`src/simulation/employees/payroll.ts` (uses `recordFinancialEvent`) ·
`src/simulation/technology/index.ts` · `src/simulation/production/index.ts` ·
`src/ui/screens/Dashboard.tsx` · `src/ui/screens/sections/FinanceOverview.tsx` ·
`src/ui/components/index.ts` · `src/index.css` ·
`src/tests/integration/simulation.test.ts` and `src/tests/integration/stage03.test.ts`
(adapted to the new system order) · `docs/TECHNICAL_ARCHITECTURE.md` ·
`docs/DEVELOPMENT_ROADMAP.md` · `docs/GAME_DESIGN_OVERVIEW.md` · `docs/DESIGN_SYSTEM.md`

## 15. Tests Added and Results

**285 tests in 19 files — all passing** (Stage 03: 170 in 13 files).

| File | Tests | Coverage |
|------|-------|----------|
| `src/tests/simulation/technology.test.ts` | 27 | definitions, categories, unique ids, validity, no circular prerequisites, prerequisite validation, project creation, duplicate prevention, unknown technology, invalid cost, cancellation, history, contribution by skill/productivity/profession, departed employees, progress, no progress without staff, completion and unlock, progress bound, determinism, invalid state, effect aggregation |
| `src/tests/simulation/products.test.ts` | 22 | definitions, categories, validity, technology requirement, project creation, duplicate project, duplicate assignment, staffing, completion, quality formula (exact), skill and technology influence, range, innovation and readiness, price, sales activation, determinism |
| `src/tests/simulation/resources.test.ts` | 21 | definitions, initial inventory, pricing from the market, price follows the commodity, purchase, insufficient funds, storage capacity, invalid quantity and price, bounded ledger, reservations, atomic rollback, release, consumption, negative prevention, cost helper |
| `src/tests/simulation/production.test.ts` | 20 | facility types, creation, invalid type and name, compatibility, assignment, effective efficiency, capacity, orders, unfinished product, incompatible facility, invalid quantity, over capacity, resource requirement, duration, progression, single completion, progress bound, cancellation, finished order, invalid state |
| `src/tests/simulation/market.test.ts` | 16 | demand by activity, price and quality, market reach, sales, inventory limit, inactive listing, revenue batching, determinism, economy integration without a signal, supply and demand signal, corporate signal bounds |
| `src/tests/integration/stage04.test.ts` | 9 | **the complete economic chain**, tick order, no money without a transaction, no negative resources, no double completion, pause, determinism, failed command atomicity, definition consistency |

Two Stage 02/03 tests were **adapted** (not weakened): the system registry assertions now cover
the nine systems and keep the original world → economy and employees → corporation ordering
checks.

## 16. Typecheck Results

```
> aethrion@0.4.0 typecheck
> tsc --noEmit
```
**Pass — no output, exit code 0.**

## 17. Lint Results

```
> aethrion@0.4.0 lint
> eslint . --ext ts,tsx --max-warnings 0
```
**Pass — no output, exit code 0.** No `any` was introduced; the ESLint rule for it remains
disabled from Stage 02 because the typed event bus legitimately uses it internally.

## 18. Test Results

```
 Test Files  19 passed (19)
      Tests  285 passed (285)
   Duration  ~7 s
```
**All 285 tests pass, 0 failures.** The Stage 01, Stage 02 and Stage 03 suites continue to
pass unchanged.

## 19. Production Build Results

```
vite v5.4.21 building for production...
✓ 5017 modules transformed.
dist/index.html                 0.81 kB │ gzip:   0.43 kB
dist/assets/index-CyUA_PwW.css 28.57 kB │ gzip:   5.20 kB
dist/assets/state-BUhESDjB.js   3.62 kB │ gzip:   1.60 kB
dist/assets/react-Cl8sjh7p.js   4.16 kB │ gzip:   1.57 kB
dist/assets/motion-DTamthCu.js 120.51 kB │ gzip:  39.73 kB
dist/assets/index-CVMAeUmH.js  449.78 kB │ gzip: 126.97 kB
✓ built in 4.06s
```
**Pass.** The dev server was started and returned **HTTP 200**.

The vendor chunk splitting was added in Stage 04: the application chunk dropped below the
500 kB warning threshold and `framer-motion` is now cached independently.

## 20. Security and Dependency Observations

- **No dependency changes.** Stage 04 added **zero** packages — the dependency set is identical
  to Stage 03.
- **Production runtime: clean.** `npm audit --omit=dev` → **0 vulnerabilities**.
- **Development tooling: unchanged.** `npm audit` → 17 vulnerabilities (3 critical, 2 high,
  12 moderate) across the same 16 dev packages, all reachable through `vitest`, `vite`,
  `@capacitor/cli` and `typescript-eslint`. Every fix requires a semver-major upgrade
  (`vitest@5`, `vite@8`, `@capacitor/cli@8`) and `typescript-eslint` has no fix available.
  **No automatic `npm audit fix` was run**, as required — the assessment is recorded in
  `docs/SECURITY_AUDIT.md` and the upgrade stays a separate maintenance task.
- **No secrets or credentials** were introduced; the `.gitignore` still excludes the local
  `.env.*` files.
- **No real-money transactions and no monetization** — all values are in-game Aether Credits.

## 21. Known Limitations

1. **The product catalogue is small** — six blueprints. A new product is added by extending the
   data table, but the range of viable strategies is still narrow.
2. **The research assignment is one employee per project** in the interface. The command layer
   supports several; the interface picks the first eligible employee.
3. **Sale revenue is batched** — the lifetime counters are exact, but the corporate ledger
   receives the revenue in blocks of 1 000, so a small sale is not visible immediately.
4. **The workforce revenue and the operating costs accrue continuously** into the lifetime
   counters without a transaction. This is the Stage 03 behaviour, kept unchanged — the cash
   balance only ever moves through a transaction, but the accrual is an accounting view rather
   than a cash movement.
5. **Facilities are abstract corporate assets.** There is no city engine yet and nothing is
   rendered.
6. **One facility type per product category in practice** — the assembly facility can build
   everything but is less efficient than a specialised facility.
7. **No product differentiation in the market.** Every unit of a product is identical; the
   quality is a property of the product instance, not of the individual unit.
8. **The bundle grew** with the new engines and the icon set. The vendor split keeps every chunk
   below the warning threshold, but a code-splitting pass would be worth doing before the
   Android release.
9. **Playwright browsers are still not installed**, so no E2E test was executed. E2E was not a
   Stage 04 requirement.

## 22. Deferred Functionality

Explicitly **not** implemented in Stage 04, per the roadmap:

City Engine · full urban simulation · advanced logistics and transport networks · multi-city
supply chains · competitor AI · global events · news and scenario engine · Web Workers ·
IndexedDB persistence · save/load interface · Three.js world rendering · multiplayer · cloud
synchronization · Google Play Billing · AdMob · advanced corporate management hierarchy · a
full employee training system.

## 23. Git Commit Information

| Commit | Content |
|--------|---------|
| `76682b9` | `feat(stage-04): Technology & Production Engines` — implementation, tests and documentation updates |
| *(this commit)* | `docs(stage-04): add final report` — `docs/STAGE_04_FINAL_REPORT.md` |

- Branch: `main`, based on the Stage 03 commit `62fa270`.
- No history was rewritten, no force-push was used, no user changes were discarded (the working
  tree was clean before the stage started).
- The complete diff was reviewed before committing: 34 files created, 1 deleted (the old
  command file, replaced by its module directory), 24 modified.

---

## 24. Final Stage Status

**STAGE 04: COMPLETE**

| Acceptance criterion | Status |
|----------------------|--------|
| Technology research works | ✅ 27 technology tests |
| Technology prerequisites are validated | ✅ locked / available / tier gating tested |
| Research progress is deterministic | ✅ reproducibility test over repeated ticks |
| Employees contribute to research | ✅ skill / productivity / profession model tested |
| Product development works | ✅ 22 product tests |
| Products require appropriate technologies | ✅ prerequisite validation tested |
| Resource inventory works | ✅ 21 resource tests |
| Resource purchases update corporate finances | ✅ charged through the ledger |
| Resource reservations are atomic | ✅ rollback test |
| Manufacturing facilities work | ✅ 20 production tests |
| Production orders work | ✅ creation, reservation, duration, cost |
| Production consumes resources correctly | ✅ consumed on completion, released on cancel |
| Completed products enter inventory | ✅ asserted in the chain test |
| Market sales work | ✅ 16 market tests |
| Product sales create real financial transactions | ✅ `sales` transactions asserted |
| Economy integration is meaningful and tested | ✅ the signal modulates supply and demand; absent signal keeps the Stage 02 behaviour |
| No money is created without a transaction | ✅ balance delta equals the transaction sum |
| No resource quantity becomes negative | ✅ asserted across a simulated run |
| No duplicate transaction or production completion occurs | ✅ both guarded and tested |
| UI uses actual simulation data | ✅ five new sections, no placeholder data |
| The complete economic gameplay chain is covered | ✅ end-to-end integration test |
| All previous tests pass | ✅ 285/285 in total |
| New tests pass | ✅ 115 added, all passing |
| Typecheck passes | ✅ no errors |
| Lint passes | ✅ no errors, no warnings |
| Production build passes | ✅ 4.06 s |
| Documentation is updated | ✅ 4 documents updated, 2 created |
| Final report exists | ✅ this document |

**Stage 05 was not started.** No city, urban, logistics, competitor AI, events, worker,
persistence, rendering, multiplayer or monetization code was introduced.
