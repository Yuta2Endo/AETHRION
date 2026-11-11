# AETHRION — Stage 06 Final Report: Events & Competitor AI Engines

**Project:** AETHRION — Premium Neon Sci-Fi Hybrid Empire Simulator
**Repository:** `Yuta2Endo/AETHRION`
**Branch:** `main`
**Version:** 0.4.0 → **0.6.0**
**Stage:** 06 — Events & Competitor AI Engines
**Status:** **COMPLETE**

---

## 1. Executive Summary

Stage 06 turns AETHRION from a market the player inhabits into a **world the player competes
in**. Two new domain engines were added:

- The **Global Events Engine** produces seventeen data-driven events — recessions,
  breakthroughs, crises, regulations — that change the conditions of the whole sector.
- The **Competitor AI Engine** produces three independent AI corporations with their own
  capital, their own objectives, their own research and their own market presence.

The gameplay loop the stage was built around:

```
World Conditions → Global Events → Competitor Decisions → Market Changes
                → Player Consequences → Strategic Response
```

Nothing here is a rubber stamp or a random event generator. The event sequence comes from a
**seeded** generator whose state lives in the simulation state, so two identical runs produce
the same sequence of crises. The AI decides with **explicit weights** — five personality
profiles, nine objectives, a documented scoring formula, a decision interval and a cooldown.
Every event effect is a **typed, bounded and serialisable** record: there is not a single
JavaScript callback inside the event data.

The architecture of Stages 01–05 was preserved. The new engines follow the established
convention (`*State.ts` + `*Rules.ts` + `index.ts`), the three market boundaries follow the
optional-signal pattern that already existed, and the AI reuses the **existing Stage 04
technology tree** — there is no second tree, no second economy, no second market and no second
corporate ledger.

**Validation at the time of writing:** 464 tests pass (360 before the stage), `tsc --noEmit` is
clean, ESLint passes with `--max-warnings 0`, the production build succeeds and `npm audit`
reports **0 vulnerabilities** in both the full and the production tree.

---

## 2. Initial Repository State and Commit

| Item | Value |
|------|-------|
| Branch | `main` (tracking `origin/main`) |
| HEAD commit at the start | `a010539a9326274512e6e93c308aea874a5d9189` (`a010539`) |
| HEAD subject | `docs(stage-05): add final report` |
| Working tree | **clean** — no user changes to preserve, nothing discarded |
| Version | `0.4.0` (the dashboard already announced `v0.5.0` for Stage 05) |
| Prior stage | Stage 05 — City Engine (`97a3b42`) |

The baseline was validated before any change was made: 360 tests passing, typecheck clean,
lint clean.

---

## 3. Architecture Audit

### 3.1 What the audit established

| Finding | Consequence for Stage 06 |
|---------|--------------------------|
| `src/simulation/events/` and `src/simulation/competitors/` were **Stage 01 placeholders** (25 and 24 lines, three empty types each). | Both were replaced in place — the module paths and the exported names stay the same, so no consumer had to move. |
| **No seeded random mechanism existed anywhere.** `generateId` in `@/core/utils` uses `Date.now()` + `Math.random()` and is explicitly unsuitable for the simulation. | A deterministic 32-bit xorshift generator (`nextRandom`) was added to `@/core/utils` — a pure function of its state, so the whole random sequence of the simulation is reproducible and the state stays serialisable. |
| The economy already consumed **two optional signals** (`CorporateMarketSignal`, `CityMarketSignal`) with the documented rule "without a signal the market behaves exactly as before". | The third boundary (`CompetitorMarketSignal`) follows the identical pattern, so "the absence of a signal preserves the previous behaviour" is provable and tested. |
| The Production Engine is the sole authority for manufacturing; the Employee Engine the sole authority for the employee records. | The AI **reuses** `TECHNOLOGIES` (20 definitions with prerequisites) and stores only references — no second tree, no second employee authority. |
| The World Engine stores its indicators and converges them; `getWorldMetrics` derives the aggregates. | The new engines follow the same split: the events store the active instances, the AI stores its corporations, and every aggregate is a pure derivation. |
| The Stage 01 placeholder for the events engine declared its scope as "world events, **news**, and dynamic scenario triggers". | The news feed lives in the events slice — the module keeps the scope it was designed for. |
| The `CorporateMarketSignal` and the `CityMarketSignal` are documented in `src/simulation/contracts.ts`, a module with no engine logic. | The third signal, the event modifier snapshot and the news vocabulary were added to the same module. |

### 3.2 The conflict that was avoided

The specification proposed placing the competitors **before** the economy, so their signal would
reach the economy in the same tick. That would have made the AI decide on a stale market — or,
alternatively, have retroactively changed a market result that had already been calculated.

The actual dependency is **market → competitors**: the AI should react to the results of the
market it is in, and its own influence must reach the economy **afterwards**. The Competitor
Engine therefore runs at **order 85**, after the Market Engine. The AI reacts to the market of
the current tick; its signal reaches the economy with the next tick. Nothing that was already
calculated is ever changed retroactively — exactly the constraint the specification set.

The events engine runs at **order 11**, before every engine that consumes its modifiers, so an
event that activates in a tick affects the economy, the city, the research, the production and
the market **of that same tick**.

### 3.3 The couplings that were avoided

A second economy, a second market, a second corporate ledger for the player, a second employee
database, a second technology tree and a second set of city or world state were all explicitly
rejected. The AI has its **own compact financial model** — it is not the Corporation Engine of
the player and it never touches the player ledger. The competitor signal is applied by the
**existing** Economy Engine.

---

## 4. Implemented Systems

| # | System | Location |
|---|--------|----------|
| 1 | Global Events Engine | `src/simulation/events/eventState.ts`, `eventRules.ts`, `index.ts` |
| 2 | The event catalogue (17 definitions) | `eventState.ts` (`EVENT_DEFINITIONS`) |
| 3 | The event scheduler and effect system | `eventRules.ts` (`selectNextEvent`, `aggregateModifiers`, `expireEvents`) |
| 4 | The player responses | `eventRules.ts` (`applyEventResponse`), `src/game/commands/eventCommands.ts` |
| 5 | The news system | `eventRules.ts` (`createNewsItem`, `publishNews`), the events slice |
| 6 | Competitor AI Engine | `src/simulation/competitors/competitorState.ts`, `competitorRules.ts`, `index.ts` |
| 7 | The five personality profiles | `competitorState.ts` (`AI_PERSONALITIES`) |
| 8 | The strategic decision engine | `competitorRules.ts` (`evaluateObjectives`, `scoreObjective`, `applyObjective`) |
| 9 | The AI financial model | `competitorRules.ts` (`getCompetitorRevenuePerHour`, `getCompetitorOperatingCostPerHour`, `getCompetitorStability`) |
| 10 | The technology competition | `competitorRules.ts` (`selectResearchTarget`, `advanceResearch`) |
| 11 | The market integration | `competitorRules.ts` (`buildCompetitorMarketSignal`), `src/simulation/contracts.ts` |
| 12 | The deterministic random generator | `src/core/utils/index.ts` (`nextRandom`, `pickWeighted`) |
| 13 | The simulation integration | `src/game/simulationRunner.ts` (the `events` and `competitors` systems) |
| 14 | The command layer | `src/game/commands/eventCommands.ts`, `competitorCommands.ts` |
| 15 | The interface | `src/ui/screens/sections/EventsSection.tsx`, `CompetitorOverviewSection.tsx`, `MarketSection.tsx` |
| 16 | Tests and documentation | five new test files, `docs/EVENT_SYSTEM.md`, `docs/COMPETITOR_AI.md` |

---

## 5. AI Corporation Definitions

Three corporations, defined as rows of the `COMPETITOR_DEFINITIONS` table — the decision engine
never hardcodes a corporation.

| Corporation | Id | Specialisation | Strategy | Base personality | Tier | Capital | Presence |
|-------------|----|----------------|----------|------------------|------|---------|-----------|
| NEXORA INDUSTRIES | `nexora-industries` | Advanced computing, electronics and frontier technology | Technology leadership | `innovative` | growth | 120 000 | 34 |
| VANTEX GLOBAL | `vantex-global` | Industrial production, materials and logistics | Operational efficiency and market share | `conservative` | growth | 150 000 | 42 |
| HELION DYNAMICS | `helion-dynamics` | Energy generation, infrastructure and advanced materials | Resource control and long-term investment | `defensive` | established | 135 000 | 30 |

Each corporation owns: a stable identifier, the name, the specialisation, the strategy, the
base and the current personality, the reputation, the tier, the market presence, the **own
financial model**, the operations (the operating cost, the production capacity per commodity
category, the price pressure), the unlocked technologies, the running research programme, the
current objective, a bounded action history, the action cooldowns, the relationship with the
player and the timestamp of the next decision.

The decision offsets (0, 8 and 16 hours) spread the three corporations so they never all
decide in the same tick.

---

## 6. AI Decision Model

### 6.1 The personality profiles

Five profiles, each a **weight profile** — never random behaviour:

| Profile | Character | Highest weights |
|---------|-----------|-----------------|
| `aggressive` | Takes the market | expand production 1.0, market presence 0.9, cut prices 0.9 |
| `innovative` | Buys its future with research | research 1.0 |
| `conservative` | Protects the balance | reduce expenses 1.0, accumulate resources 0.9, raise prices 0.9 |
| `opportunistic` | Reads the market | enter category 1.0, accumulate resources 1.0 |
| `defensive` | Guards what it has | recover financials 1.0, accumulate resources 0.9, reduce expenses 0.8 |

The **current** personality shifts deterministically from the base personality:

```
stability below 35                     → defensive
an active shortage                     → opportunistic
the market leader with stability ≥ 60  → aggressive
otherwise                              → the base personality
```

All five profiles are therefore reachable in play — and each one is unit-tested.

### 6.2 The decision cycle

1. Every **24 simulated hours** a corporation evaluates nine objectives. The first decision
   never happens before a full interval has passed.
2. The score is `clamp(weight × need × affordability × contextModifier, 0, 1)`; a score below
   **0.25** is never taken.
3. The objectives are evaluated in a **fixed order**, so a tie is always broken identically.
4. The action must be **affordable** — the corporation never spends money it does not have.
5. The action type is blocked for **72 simulated hours** — no action can repeat every tick.
6. The objective, the priority and the action go into the bounded history (12 entries) and into
   the news feed.

The nine objectives: `invest-research`, `expand-production`, `increase-market-presence`,
`enter-category`, `cut-prices`, `raise-prices`, `reduce-expenses`, `accumulate-resources`,
`recover-financials`.

---

## 7. Financial Model

The AI has its **own compact model**. It has no employees, no payroll and no ledger — it is not
the Corporation Engine of the player and it never touches the player ledger.

```
revenue per hour = (marketPresence / 100) × 70 × (1 + worldActivity / 100) × eventFactor
operating cost    = (25 + marketPresence × 0.35) × costReductionFactor
balance          += revenue − operating cost − research − investment      (never negative)

stability = clamp(50 + (balance / startingCapital − 1) × 25 + profitScore, 0, 100)
profitScore = clamp(netResultPerHour / operatingCostPerHour, −1, 1) × 25
```

Tracked: `startingCapital`, `balance`, `lifetimeRevenue`, `lifetimeOperatingExpenses`,
`lifetimeResearchExpenses`, `lifetimeInvestmentExpenses`, `netResult` and `stability`.

- **No unlimited revenue**: the revenue is bounded by the market presence (0…100) and by the
  world activity (0…100).
- **The presence carries a part of the operating cost**, so the profit stays bounded even at a
  maximum presence.
- **The AI can lose money**: a recession, a missing presence or an expensive research programme
  drives the balance down. The balance is clamped at zero and never negative.
- **The AI can recover**: a corporation that lost its capital becomes defensive, cuts its costs
  and rebuilds its stability.

---

## 8. Market Integration

The AI reports its competitive pressure through the new `CompetitorMarketSignal` — the third
integration boundary, next to the corporate and the city signals.

```
supplyPressure[category] = clamp(Σ categoryCapacity × presence, 0, 100)
demandPressure[category] = clamp(Σ presence × 50 (of the categories it operates in), 0, 100)
pricePressure[category]  = clamp(weighted average of the price pressure, −1, 1)
```

The **existing** Economy Engine applies it per commodity category:

```
effectiveSupply = clamp(supplyPressure × (1 − pricePressure), 0, 150)
effectiveDemand = clamp(demandPressure × (1 + pricePressure), 0, 150)
supplyFactor    = 1 + effectiveSupply / 100 × 0.12
demandFactor    = 1 + effectiveDemand / 100 × 0.12
```

A corporation that undercuts the market adds more effective supply than one that pushes the
prices up. The city remains a consumer, the AI is a **producer** — but only with its own
bounded production capacity.

Every requirement of the specification is met:

| Requirement | How |
|-------------|-----|
| Competitor activity influences the market | the supply and the demand factors |
| Bounded supply and demand | the factors are capped at ±12 % |
| Explicit price pressure limits | the pressure is clamped to −1 … 1 and the effective values to 0 … 150 |
| No artificial infinite supply | the pressure comes from a presence that is capped at 100 |
| No duplicate market transactions | the AI never touches the market — it only reports a signal |
| No direct modification of the player balance | the AI has its own model |
| The absence of the signal preserves the behaviour | the signal is `null` without any corporation |
| Deterministic | a pure function of the competitor state |
| Applied only once per update | the factors are computed once per `updateEconomy` call |

The upper and lower influence bounds are covered by dedicated tests.

---

## 9. Event Catalogue

Seventeen events in six categories — the full table with every effect and every response is in
`docs/EVENT_SYSTEM.md`.

| Category | Events |
|----------|--------|
| Economic | Global Market Boom, Market Recession, Inflation Shock, Commodity Shortage, Demand Surge |
| Technology | Scientific Breakthrough, Semiconductor Breakthrough, AI Research Breakthrough, Technology Regulation |
| Industrial | Supply Chain Disruption, Manufacturing Crisis, Industrial Automation Breakthrough |
| Energy and environment | Energy Crisis, Renewable Energy Breakthrough, Environmental Restrictions |
| Geopolitical and regulatory | International Trade Restrictions, Corporate Regulation Changes |

Every definition declares: a unique identifier, the name, the description, the category, the
severity, the duration, the cooldown, the earliest trigger time, the trigger conditions, the
typed effects, the optional responses, the selection weight and the news headline. All values
are validated by `isValidEventDefinition`.

---

## 10. Event Scheduling and Effect System

### 10.1 Scheduling

- The scheduler evaluates the catalogue at most every **12 simulated hours** of the *elapsed*
  time.
- A candidate must have passed its `minElapsedMs`, its cooldown must have expired, it must not
  be active and its trigger conditions must be met.
- The selection is a **deterministic weighted selection** — the roll comes from the seeded
  xorshift generator whose state lives in the events state. The same state always selects the
  same event.
- At most **3** events are active at the same time.
- A long tick can never trigger a burst — one evaluation per tick at most.

### 10.2 The effect system

Ten typed effect kinds; a multiplier is bounded to **0.5 … 2**, a pressure to **0 … 1** and a
commodity effect may be restricted to a single category.

| Effect | Target |
|--------|--------|
| `commodity-demand` / `commodity-supply` | the commodity category |
| `operating-cost` | the operating costs of the corporation |
| `research-speed` | the research progress |
| `production-efficiency` | the output of the production orders |
| `market-demand` | the demand of the products |
| `city-infrastructure-pressure` / `city-environment-pressure` / `city-commercial-activity` | the city |
| `competitor-activity` | the revenue of the AI |

**Stacking**: the multipliers multiply, the pressures add, and the aggregate is clamped. Two
events that each multiply the market demand by 1.25 produce 1.5625 — never an unbounded
factor. The relief of a player response multiplies the effects of **its own instance** and
never leaves it.

**Expiration happens exactly once**: the instance leaves the active list and is written into
the bounded history (24 entries). An expired event has no influence any more — the modifiers
are recomputed from the active events on every tick.

### 10.3 The world, the city and the economy react

| Consumer | Modifier | Effect |
|----------|----------|--------|
| Economy Engine | `commodityDemand`, `commoditySupply` | the commodity demand and supply |
| Corporation Engine | `operatingCost` | the operating expenses |
| Technology Engine | `researchSpeed` | the research progress |
| Production Engine | `productionEfficiency` | the production progress |
| Market Engine | `marketDemand` | the product demand |
| City Engine | the three city modifiers | the infrastructure load, the environment and the commerce of the city |
| Competitor Engine | `competitorActivity` | the revenue of the AI |

Every consumer clamps the modifier again before it uses it, and every modifier is **optional** —
without an active event the snapshot is neutral and the behaviour is exactly the behaviour of
Stage 05.

---

## 11. Player Responses

Seven events offer a choice, six of them with two or more options — the specification required
at least five.

| Event | Responses |
|-------|-----------|
| Energy Crisis | Invest in energy efficiency (7 500) · Purchase additional energy (4 000 + 200 MWh) · Reduce the production activity (1 000) |
| Market Recession | Cut operating expenses (5 000) · Accumulate scarce resources (2 000 + 120 raw materials) |
| Commodity Shortage | Stockpile raw materials (3 000 + 150 raw materials) |
| Technology Regulation | Invest in compliance (5 500) · Suspend the affected research (2 500) |
| Supply Chain Disruption | Invest in logistics capacity (6 000) · Reduce the production activity (2 000) |
| Environmental Restrictions | Invest in compliance (6 000) · Accept the restrictions (0) |
| International Trade Restrictions | Localise the supply chain (6 500) · Absorb the tariffs (3 000) |

Every response:

- **costs** credits through the **existing** corporate ledger — a `resource` transaction when it
  also buys resources, an `operating` transaction otherwise;
- has a **real effect** — the relief multiplier scales the effects of its own event instance for
  a bounded duration, and the resources are delivered through the **Resource Engine** at the
  live market price;
- is validated for affordability, may be applied **only once** and only while the event is
  active;
- is **atomic** — a failed response changes neither the event, nor the inventory, nor the
  balance.

---

## 12. World and City Integration

The city is affected through the Stage 05 engine, not through a parallel path:

- **City infrastructure pressure** multiplies the infrastructure demand of the four networks —
  the same networks have to serve a larger load, the service level falls and the buildings
  respond exactly as they do in a shortage.
- **City environment pressure** lowers the environment target of the city.
- **City commercial activity** multiplies the commercial activity of the city, which feeds the
  prosperity target.

The world is affected through the economy: the events change the commodity supply and demand,
which changes the prices, which changes the commercial activity of the world and therefore the
conditions the events themselves depend on. The loop is bounded — the multipliers are clamped —
and the AI reads the result with a one-tick delay.

The city and the world keep working normally when no event is active: the modifier snapshot is
neutral and the behaviour is byte-for-byte the behaviour of Stage 05.

---

## 13. News System

The Events Engine owns the news feed — 40 items, bounded.

| Field | Meaning |
|-------|---------|
| `id` | Deterministic identifier (`news_0001`), unique and monotonic |
| `simTimeMs` | The simulated time — never a wall-clock date |
| `category` | event · competitor · technology · market · player |
| `headline` / `description` | The content |
| `relatedId` | The related event or corporation |
| `severity` | info · low · medium · high |
| `read` | The read state |

The news is generated **only** from real simulation events: the activation and the expiration of
an event, every significant decision of an AI corporation and every technology breakthrough of a
competitor. Nothing is invented and nothing is duplicated — the identifier sequence is shared
with the events, so every identifier is unique.

---

## 14. Tick Order

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

**Why the events run first**: every engine that consumes an event modifier must see the
modifiers of the *current* tick. At order 11 the Events Engine publishes them before the city
(15), the economy (20), the technology (40), the production (70), the market (80) and the
corporation (90) run.

**Why the competitors run last**: the AI reacts to the results of the market of the tick it is
in, and its own signal must reach the economy *afterwards*. The signal therefore reaches the
economy with the next tick — nothing that was already calculated is ever changed
retroactively. The one-tick delay is a deliberate, documented causal loop with a bounded
feedback factor (≤ 12 %).

**Preserved**: clock → everything; world → economy; city → economy; employees → technology;
technology → products; resources → production; production → market; market → corporation;
the corporate finances reflect the transactions of the same tick.

The Game Core lifecycle was **not** modified: the pause, the resume, the stop, the disposal and
the error isolation behave exactly as before.

---

## 15. UI Implementation

### 15.1 Global Events and News (`EventsSection.tsx`)

- The **active events** with their name, category, severity, description, the elapsed bar, the
  remaining duration in hours and the **actual effects** in readable form.
- The **player responses** with their label, their description and a **Commit** button that
  invokes `commands.respondToEvent`.
- The **event history** with the date, the name and whether the player answered.
- The **news feed** with the category, the simulated date, the headline, the description and a
  **Mark read** button that invokes `commands.markNewsRead`.

### 15.2 Competitor Overview (`CompetitorOverviewSection.tsx`)

- **Three AI corporations** with their name, tier, specialisation, strategy, current
  personality, reputation, market presence, financial stability, balance, unlocked technologies
  and the current objective.
- The **dossier** of the inspected corporation: balance, net result, revenue, technologies by
  category, the standing with the player, the market activity (operating cost, price pressure,
  competitive pressure), the running research programme and the four most recent actions.
- An **Inspect dossier** button that invokes `commands.getCompetitor` — a real command, not a
  local toggle.

### 15.3 Market competition (`MarketSection.tsx`)

The **existing** market section was extended — not duplicated — with a **Competitive Pressure**
block that shows, per commodity category, the price, the supply pressure, the demand pressure
and the price pressure the AI applies. The block renders with or without finished products.

### 15.4 Design system compliance

The new sections reuse the existing primitives (`StatCard`, `IndicatorBar`, `Badge`, `Button`) and
the existing CSS conventions (`section-block`, `stat-grid`, `tech-grid`, `resource-table`,
`empty-state`, `hiring-panel`). The new CSS rules — `.event-grid`, `.event-card`,
`.event-responses`, `.news-list`, `.news-item`, `.competitor-grid`, `.competitor-card`,
`.dossier-grid`, `.section-badge` — use the **existing custom properties** exclusively. **No
hardcoded brand colour was introduced.** The typography (Orbitron, Inter, Roboto Mono) is
inherited.

**Responsive**: the event and the competitor grids collapse to a single column below 480 px, the
news feed scrolls internally with a bounded height, and the existing breakpoints (720 px, 480 px)
are respected. The layout remains readable down to the 320 px minimum.

**Accessibility**: every control is a semantic `button` with an accessible name, the indicator
bars expose `role="meter"`, the feedback messages use `role="status"`, the sections carry their
`aria-label` and the badges are labelled text.

---

## 16. Files Created, Modified and Deleted

### Created (17)

| File | Purpose |
|------|---------|
| `src/simulation/events/eventState.ts` | The event catalogue, the active instances, the news, the validation |
| `src/simulation/events/eventRules.ts` | Scheduling, activation, expiration, the effect aggregation, the responses, the news |
| `src/simulation/competitors/competitorState.ts` | The corporations, the personality profiles, the financial model, the validation |
| `src/simulation/competitors/competitorRules.ts` | The decision engine, the research, the finances, the market signal |
| `src/game/commands/eventCommands.ts` | `respondToEvent`, `markNewsRead`, `getAvailableResponses` |
| `src/game/commands/competitorCommands.ts` | `getCompetitor` (read-only inspection) |
| `src/ui/screens/sections/EventsSection.tsx` | The Global Events and the News Feed |
| `src/ui/screens/sections/CompetitorOverviewSection.tsx` | The Competitor Overview and the dossier |
| `src/tests/simulation/events.test.ts` | 37 unit tests of the Events Engine |
| `src/tests/simulation/competitors.test.ts` | 39 unit tests of the Competitor Engine |
| `src/tests/integration/stage06.test.ts` | 14 integration tests |
| `src/tests/components/EventsUi.test.tsx` | 7 interface tests |
| `src/tests/components/CompetitorUi.test.tsx` | 7 interface tests |
| `docs/EVENT_SYSTEM.md` | The event catalogue and the design rationale |
| `docs/COMPETITOR_AI.md` | The AI design, the profiles and the reasoning |
| `docs/STAGE_06_FINAL_REPORT.md` | This report |

### Modified (28)

| File | Change |
|------|--------|
| `src/core/utils/index.ts` | Added the deterministic xorshift generator `nextRandom` and the weighted picker `pickWeighted` |
| `src/simulation/contracts.ts` | Added `CompetitorMarketSignal`, `EventEnvironmentModifiers`, `CommodityCategory`, `NewsCategory`, `NewsSeverity`, `NewsCandidate` |
| `src/simulation/economy/economyState.ts` | The commodity category union moved to the contracts module and re-exported |
| `src/simulation/economy/economyRules.ts` | Added the optional `competitorSignal` and `eventModifiers` and the four bounded factor helpers |
| `src/simulation/corporation/corporationRules.ts` | Added the optional `eventOperatingCost` modifier |
| `src/simulation/technology/technologyRules.ts` | Added the optional `eventResearchSpeed` modifier |
| `src/simulation/production/productionRules.ts` | Added the optional `eventEfficiency` modifier |
| `src/simulation/market/marketRules.ts` | Added the optional `eventMarketDemand` modifier |
| `src/simulation/city/cityRules.ts` | Added the optional `eventCityPressure` — the infrastructure load, the environment and the commerce |
| `src/simulation/events/index.ts` | Replaced the Stage 01 placeholder with the public surface |
| `src/simulation/competitors/index.ts` | Replaced the Stage 01 placeholder with the public surface |
| `src/game/state/gameStore.ts` | Added the `events` and `competitors` slices and their update actions |
| `src/game/state/selectors.ts` | Added the event, news and competitor selectors |
| `src/game/simulationRunner.ts` | Registered the `events` (11) and `competitors` (85) systems and wired the modifiers |
| `src/game/commands/index.ts` | Exported and aggregated the new commands |
| `src/ui/screens/Dashboard.tsx` | Added the two new sections and updated the version line |
| `src/ui/screens/sections/MarketSection.tsx` | Extended with the Competitive Pressure block |
| `src/app/navigation/MainNavigation.tsx` | The Competitor AI is now `ready`; the footer names Stage 06 |
| `src/index.css` | The new layout rules of the two sections |
| `package.json` | The version 0.4.0 → 0.6.0 |
| `docs/TECHNICAL_ARCHITECTURE.md` | The two new modules, the slices, the commands, the tick order and the third market boundary |
| `docs/ENGINE_RULES.md` | §9 (the Events Engine) and §10 (the Competitor AI Engine), the updated tick order |
| `docs/GAME_DESIGN_OVERVIEW.md` | §12 (the living world) and the updated module table |
| `docs/DEVELOPMENT_ROADMAP.md` | Stage 06 marked complete |
| `src/tests/integration/simulation.test.ts` | The tick order and the same-tick expectation |
| `src/tests/integration/stage03.test.ts` | The tick order |
| `src/tests/integration/stage04.test.ts` | The tick order |
| `src/tests/integration/stage05.test.ts` | The tick order |

### Deleted

**None.** Both Stage 01 placeholders were replaced in place.

---

## 17. Tests Added

**104 new tests — 464 in total (360 before the stage).**

### 17.1 Events Engine — 37 unit tests (`src/tests/simulation/events.test.ts`)

- **The catalogue** — at least fifteen valid and unique events; every category covered; at
  least five events with responses; a valid initial state.
- **Scheduling** — the same event for the same state; the minimum elapsed time; the trigger
  conditions (market activity, the corporation, the city); the cooldown before and after; the
  maximum number of active events; no event on every tick; no duplicate activation during a
  long tick.
- **The lifecycle** — the expiration exactly once; an event active until its duration elapses;
  no influence of an expired event; a category scoped effect.
- **The effect system** — a neutral modifier set without any event; the stacking of two
  overlapping events; the documented bounds of the multipliers and the pressures.
- **The player responses** — applied exactly once; rejected for an inactive event; rejected
  for an unknown response; the relief scales the effects; the relief expires with the event.
- **The news feed** — a news item for every activation and expiration; no duplicate; the bound
  of the feed; marking as read exactly once; an unknown item.
- **Determinism** — the same event sequence for identical runs; a reproducible random
  sequence; the documented scheduling interval; an invalid state and an invalid context are
  rejected.

### 17.2 Competitor AI Engine — 39 unit tests (`src/tests/simulation/competitors.test.ts`)

- **Initialization** — three corporations with unique identifiers; the documented
  corporations; a valid financial model; the same state on every call; the definitions as data.
- **The personality profiles** — at least five profiles with a weight for every objective; a
  distinct weight profile each; the score changes with the personality; the shift under
  trouble, under a shortage and at the top of the market; the base personality otherwise.
- **The decision engine** — no decision before the interval; a decision at the interval; never
  spending money the corporation does not have; never repeating an action before the cooldown;
  the bounded history; every score between zero and one; never choosing an unaffordable
  objective.
- **The financial model** — the accrual with the simulated time; no unlimited revenue; never
  losing more than the balance; the recovery of a struggling corporation; the derived
  stability; **the financial state of the player untouched**.
- **The market signal** — no signal without a corporation; a bounded signal; the bounds with an
  inflated presence; the reaction to a price move.
- **The technology competition** — a technology of the specialisation; the prerequisites of the
  tree; never an unaffordable research; the progress and the completion over the simulated time;
  the progress by category.
- **Determinism and safety** — the same state for identical runs; an invalid state and an
  invalid context rejected; the documented decision interval; a valid state over a long run.

### 17.3 Integration — 14 tests (`src/tests/integration/stage06.test.ts`)

- **The complete gameplay chain** required by the specification:

  ```
  Initial World → Event Scheduler → Global Event Activation → Event Effect Applied
    → Economy and City React → AI Competitors Evaluate Conditions
    → Competitor Strategic Decision → Competitive Market Activity
    → Player Sees Consequences → Player Responds to Event
    → Corporate Financial State Remains Valid → Event Expires
    → Temporary Effects Are Removed
  ```

- **The documented tick order** — the exact system list and the ordering constraints.
- **No event → the Stage 05 behaviour is preserved** — the modifier snapshot is neutral and the
  economy matches the recomputation.
- **No competitor activity → the Stage 04 behaviour is preserved.**
- **The commands** — a valid response, an unaffordable response (atomic), a response for an
  expired event, marking a news item as read, the inspection of a corporation.
- **Determinism** — identical runs produce an identical state.
- **Pause and resume** — the events and the competitors do not progress while paused.
- **A long tick** — no duplicate activation and no duplicate expiration.
- **The validity of every new slice** over a long run.
- **No negative balance** — neither the corporation nor the competitors.

### 17.4 Interface — 14 tests

- **Events (7)** — the section renders with the real state; an active event renders with its
  severity and its effects; the responses render; a response is committed through the command
  layer; an invalid action displays an error; the news feed reflects the actual simulation
  history; a news item is marked as read through the command layer.
- **Competitors (7)** — the three corporations render from the live state; the specialisation,
  the personality and the objective render; the real balance, the presence and the reputation
  render; the dossier opens through the command layer; the technology progress renders; the
  competitive pressure renders in the market section; the rendered values follow the
  simulated state.

### 17.5 Adapted existing tests (justified)

| Test | Adaptation | Reason |
|------|------------|--------|
| `simulation.test.ts`, `stage03.test.ts`, `stage04.test.ts`, `stage05.test.ts` — the tick-order assertions | `events` and `competitors` inserted at their documented positions | The tick order legitimately changed — the documented architecture of Stage 06. The intent (a deterministic order with the preserved dependencies) is strengthened, not weakened. |
| `simulation.test.ts` — "feeds the world state produced in the same tick into the economy" | the expectation now includes the competitor signal | The competitor engine is now part of the documented economy inputs. The test proves exactly what it proved before — that the world of the tick reaches the economy of the tick. |

No existing assertion was weakened, removed or relaxed. **All 360 pre-existing tests still
pass.**

---

## 18. Full Test Results

```
> aethrion@0.6.0 test
> vitest run

 Test Files  27 passed (27)
      Tests  464 passed (464)
   Duration  10.41s
```

**464 passing, 0 failing** — 360 before the stage, **+104 new tests** (37 events unit, 39
competitor unit, 14 integration, 14 interface). The full suite was executed after the final
change.

---

## 19. Typecheck Results

```
> aethrion@0.6.0 typecheck
> tsc --noEmit

(exit code 0 — no output)
```

Strict TypeScript with `strict`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch` and `isolatedModules`. **No errors, no warnings, no suppression
comments and no `any` casts were added.**

---

## 20. Lint Results

```
> aethrion@0.6.0 lint
> eslint . --ext ts,tsx --max-warnings 0

(exit code 0 — no output)
```

ESLint with `typescript-eslint` and the React hooks plugin, `--max-warnings 0`. **Zero errors and
zero warnings.**

---

## 21. Production Build Results

```
> aethrion@0.6.0 build
> npm run typecheck && vite build

✓ 5010 modules transformed.
dist/index.html                             0.90 kB │ gzip:   0.45 kB
dist/assets/index-C4ig9DFL.css             31.36 kB │ gzip:   5.42 kB
dist/assets/rolldown-runtime-BWaJ3C7D.js    0.91 kB │ gzip:   0.51 kB
dist/assets/state-DTU5yBsG.js               5.66 kB │ gzip:   2.09 kB │ map:  39.35 kB
dist/assets/motion-CNEVH0B1.js            117.65 kB │ gzip:  38.90 kB │ map: 636.72 kB
dist/assets/index-C5Y_CaVS.js             228.68 kB │ gzip:  54.78 kB │ map: 910.43 kB
dist/assets/react-DO6J-HTk.js             376.50 kB │ gzip: 107.30 kB │ map: 1,268.69 kB

✓ built in 302ms
```

The build succeeds. The application bundle grew by roughly 54 kB of uncompressed code — the two
engines, the commands and the two interface sections. **No new dependency was added**, so no
new chunk was created.

---

## 22. Dependency Audit

```
> npm audit
found 0 vulnerabilities

> npm audit --omit=dev
found 0 vulnerabilities
```

**Zero vulnerabilities** — in the full tree and in the production tree.

**No dependency was added, removed or changed by this stage.** The deterministic random
generator was implemented inside `@/core/utils` instead of adding a dependency — it is about
twenty lines and the alternative would have been a new package for one function.

`npm outdated` still reports the same twelve packages with newer versions as in Stage 05
(`@testing-library/jest-dom`, `@types/node`, `@types/three`, `eslint`,
`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `framer-motion`, `globals`, `jsdom`,
`three`, `typescript`, `zustand`). **None of them were upgraded** — the upgrades are unrelated
to Stage 06 and the stage explicitly forbids risky dependency upgrades.

---

## 23. Known Limitations

1. **The AI is a macro actor.** It has capital, presence, research and prices — it does not
   produce products, employ people, buy resources or build facilities. It cannot act on the
   player directly.
2. **The AI does not react to the player's behaviour.** Its decisions are driven by the world
   and by its own state, not by what the player does. There is no diplomacy, no alliance and no
   hostility beyond the price pressure.
3. **Only four commodity categories.** The categories the AI can enter are therefore limited.
4. **The AI never trades directly with the player.** It competes in the commodity market, not
   in the product listings of the market engine.
5. **The event catalogue is static.** Seventeen definitions cover the six categories; the
   scheduler chooses between them. There is no scenario tree and no chained events — that
   belongs to a later stage.
6. **The player cannot steer the AI.** Deliberate — the corporations have to be believable.
7. **The relief of a response scales the whole event instance.** A response cannot undo a single
   effect of an event.
8. **The World Engine still has the latent convergence issue** the City Engine does not have:
   `evolveWorld` uses a linear `+ gap × rate × hours` form, which can overshoot its target when
   a tick is much longer than one simulated hour. The City Engine and both new engines use the
   exponential form (`1 − (1 − rate)^hours`). The World Engine was **not** modified — it is out
   of the scope of this stage and its behaviour is unchanged.
9. **The navigation still labels Technology and Production as `planned`** although both have
   been implemented since Stage 04. This is a pre-existing inconsistency that was deliberately
   left untouched to keep the Stage 06 diff strictly scoped; only the Competitor AI entry was
   updated.
10. **The simulation state is not persisted.** IndexedDB save/load remains a Stage 08 concern.

---

## 24. Deferred Functionality

The following were explicitly **not** implemented in Stage 06, as required:

Web Workers · Comlink simulation execution · IndexedDB persistence · a save/load interface ·
Three.js world rendering · 3D city buildings · camera controls · individual citizen simulation ·
traffic simulation · multi-city management · multiplayer · cloud synchronisation · online AI
services · external LLM API integration · Google Play Billing · AdMob · monetisation · a major
dashboard redesign · a new technology tree unrelated to the Stage 04 system · a second economy or
market · a second corporate financial model for the player.

No out-of-scope system was introduced.

---

## 25. Git Commit Information

The work was committed to `main` in two logically separated commits, following the convention of
Stage 04 and Stage 05:

| Commit | Subject | Content |
|--------|---------|---------|
| `8cd0cd7` (`8cd0cd72cea20e2ca16c456fad67bb7ef13738ca`) | `feat(stage-06): Events & Competitor AI Engines` | The two engines, the commands, the simulation integration, the interface, the tests and the documentation updates |
| *(this commit)* | `docs(stage-06): add final report` | `docs/STAGE_06_FINAL_REPORT.md` |

- Branch: `main`, based on the Stage 05 commit `a010539`.
- The full diff was reviewed before the commits. No file was force-added, no history was
  rewritten, no force-push was performed and no secret, key or credential was committed.
- The only changes to the existing tree are the ones listed in §16.

---

## 26. Final Acceptance Criteria

# **COMPLETE**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Three independent AI corporations exist | ✅ | `COMPETITOR_DEFINITIONS` — NEXORA, VANTEX, HELION; 5 unit tests |
| At least five AI personality profiles work | ✅ | `AI_PERSONALITIES` — 5 profiles, all reachable through the shift; 7 unit tests |
| AI decisions are deterministic and state-driven | ✅ | fixed objective order, weighted scoring, 24 h interval, 72 h cooldown; the determinism test compares two runs byte for byte |
| AI finances are bounded and valid | ✅ | the revenue is bounded by the presence and the activity; the balance is never negative; `isValidCompetitor` |
| AI competitors interact with the existing market | ✅ | the `CompetitorMarketSignal` applied by the existing Economy Engine |
| Existing economy behaviour is preserved when the competitor signals are absent | ✅ | the signal is `null` without any corporation; 2 integration tests |
| Existing technology definitions are reused | ✅ | `selectResearchTarget` reads `TECHNOLOGIES` and obeys its prerequisites — no second tree |
| At least 15 global events are implemented | ✅ | 17 definitions in 6 categories; the catalogue test |
| Event scheduling is deterministic | ✅ | the seeded xorshift generator; the identical-runs test |
| Event duration and expiration work correctly | ✅ | the expiration happens exactly once; 3 unit tests |
| Event effects have explicit bounds and stacking rules | ✅ | the multipliers clamp to 0.5 … 2, the pressures to 0 … 1; the stacking test |
| At least five events have meaningful player responses | ✅ | 7 events, 16 responses in total |
| Player responses use the existing command and financial systems | ✅ | `respondToEventCommand` charges the ledger; the Resource Engine delivers the resources |
| Event effects influence existing world, city or economic systems | ✅ | 7 consumers; the integration test proves the economy reacts |
| News is generated from actual simulation events | ✅ | every item refers to an activation, an expiration, a competitor decision or a breakthrough |
| Histories are bounded | ✅ | 24 event history entries, 40 news items, 12 competitor actions |
| Simulation tick ordering is correct and tested | ✅ | 12 systems, 5 ordering assertions across 4 test files |
| UI displays real state and provides functional controls | ✅ | 2 new sections + the extended market section; 14 interface tests |
| Stage 01–05 tests remain passing | ✅ | all 360 pre-existing tests pass |
| New tests cover the complete event and competitor gameplay chain | ✅ | `stage06.test.ts` — the full chain |
| Typecheck passes | ✅ | `tsc --noEmit` — exit 0 |
| Lint passes with zero warnings | ✅ | `eslint --max-warnings 0` — exit 0 |
| Production build succeeds | ✅ | `vite build` — built in 302 ms |
| Documentation is updated | ✅ | 4 documents updated, 2 created, `docs/ENGINE_RULES.md` extended by ~300 lines |
| `docs/STAGE_06_FINAL_REPORT.md` exists | ✅ | this document |
| No Stage 07 functionality has been introduced | ✅ | see §24 |

### Verified vs. not verified

- **Verified**: the tests, the typecheck, the lint and the production build were **actually
  executed** and their real output is reproduced above. The dependency audit was actually run.
- **Not verified**: **Android compatibility was not verified.** No Android project was generated
  (`npx cap add android` was not run), no Gradle build was executed and no device or emulator
  test was performed. The Capacitor configuration is unchanged by this stage and the web build
  is verified, but nothing about the Android artefact was tested.
- **Not verified**: the interface was verified through the automated component tests in jsdom
  and by the production build. It was **not** manually tested on a physical Android device, and
  the 320 px readability claim is based on the CSS rules, not on a device measurement.

### Stage 06 is complete. Stage 07 has **not** been started — it waits for the explicit approval
of the user.
