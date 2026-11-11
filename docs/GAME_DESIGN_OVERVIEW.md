# AETHRION — Game Design Overview

**Project:** AETHRION  
**Stage:** 02 — Game Core & Simulation Foundation  
**Status:** World Engine and Economy Engine baselines implemented; all business gameplay systems remain in later stages.

## 1. Genre & Vision

Hybrid Empire Simulator combining Business Tycoon, Economic Strategy, City Builder, Life Simulation, Technology Simulator, and Global Empire Management.

The player starts with a small technology corporation and builds a global empire. The world evolves in response to player decisions.

## 2. Core Player Activities

- Establish corporations *(Stage 03)*
- Hire and manage employees *(Stage 03)*
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
| Corporation Engine | Corporations, employees, hiring, corporate structure | Typed interface only |
| Technology Engine | Technology tree, research, unlocks | Typed interface only |
| Production Engine | Factories, products, manufacturing, supply chains | Typed interface only |
| City Engine | Cities, buildings, urban development | Typed interface only |
| Employee Engine | Hiring, roles, salaries, performance | Typed interface only |
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

## 6. Simulation Principles

- Game simulation does **not** depend on React components.
- Three.js is responsible for rendering only — never game rules.
- Simulated time is tick-driven and never reads the system clock.
- Domain rules are pure functions: same input → same output.
- Expensive simulation tasks run in Web Workers (via Comlink) when justified *(Stage 07)*.
- Typed interfaces between modules; no circular dependencies.
- All modules testable in isolation.
