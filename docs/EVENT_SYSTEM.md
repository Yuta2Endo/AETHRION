# AETHRION — Global Event System

**Project:** AETHRION  
**Stage:** 06 — Events & Competitor AI Engines

> The exact rules live in `docs/ENGINE_RULES.md` §9. This document is the **catalogue** and the
> design rationale of the global event system.

---

## 1. What the system does

The Global Events Engine produces the **conditions** the world is in. It never decides anything
itself and it never touches the state of another engine — it publishes a typed modifier
snapshot that the affected engines consume.

```
Global conditions → an event activates → the modifiers change
                  → the economy, the city, the corporation and the AI react
                  → the player answers (or does not)
                  → the event expires → the modifiers are gone
```

## 2. The catalogue

Seventeen events in six categories. Every event is a plain, serialisable record — there is not
a single function inside the data.

### 2.1 Economic

| Event | Severity | Duration | Cooldown | Effects | Player responses |
|-------|----------|----------|----------|---------|------------------|
| Global Market Boom | medium | 96 h | 320 h | commodity demand ×1.2, market demand ×1.25, city commerce ×1.15 | Expand production to capture the boom (8 000) · Hold reserves and wait (1 500) |
| Market Recession | high | 120 h | 400 h | commodity demand ×0.78, market demand ×0.72, city commerce ×0.8, competitor activity ×0.85 | Cut operating expenses (5 000) · Accumulate scarce resources (2 000 + 120 raw materials) |
| Inflation Shock | medium | 72 h | 288 h | operating costs ×1.3, commodity supply ×0.88 | Invest in energy efficiency (6 500) |
| Commodity Shortage | high | 96 h | 360 h | materials supply ×0.7, materials demand ×1.15 | Stockpile raw materials (3 000 + 150 raw materials) |
| Demand Surge | low | 48 h | 240 h | market demand ×1.35, commodity demand ×1.1 | — |

### 2.2 Technology

| Event | Severity | Duration | Cooldown | Effects | Player responses |
|-------|----------|----------|----------|---------|------------------|
| Scientific Breakthrough | medium | 120 h | 384 h | research speed ×1.35, competitor activity ×1.1 | Fund the laboratories (4 500) |
| Semiconductor Breakthrough | medium | 144 h | 432 h | compute supply ×1.2, production efficiency ×1.15 | Upgrade the production lines (7 000) |
| AI Research Breakthrough | high | 168 h | 480 h | research speed ×1.45, market demand ×1.3, competitor activity ×1.15 | Launch a patent programme (9 000) |
| Technology Regulation | medium | 96 h | 336 h | research speed ×0.72, operating costs ×1.12 | Invest in compliance (5 500) · Suspend the affected research (2 500) |

### 2.3 Industrial

| Event | Severity | Duration | Cooldown | Effects | Player responses |
|-------|----------|----------|----------|---------|------------------|
| Supply Chain Disruption | high | 84 h | 300 h | production efficiency ×0.75, logistics supply ×0.82, city infrastructure pressure +0.2 | Invest in logistics capacity (6 000) · Reduce the production activity (2 000) |
| Manufacturing Crisis | high | 72 h | 288 h | production efficiency ×0.65, operating costs ×1.25 | Emergency maintenance (8 000) |
| Industrial Automation Breakthrough | low | 144 h | 400 h | production efficiency ×1.2, operating costs ×0.88 | — |

### 2.4 Energy and environment

| Event | Severity | Duration | Cooldown | Effects | Player responses |
|-------|----------|----------|----------|---------|------------------|
| Energy Crisis | high | 96 h | 336 h | operating costs ×1.4, energy demand ×1.3, energy supply ×0.75, city infrastructure pressure +0.3 | Invest in energy efficiency (7 500) · Purchase additional energy (4 000 + 200 MWh) · Reduce the production activity (1 000) |
| Renewable Energy Breakthrough | medium | 120 h | 360 h | energy supply ×1.25, operating costs ×0.9, city infrastructure pressure −0.1 | Build additional power capacity (5 000) |
| Environmental Restrictions | medium | 108 h | 336 h | operating costs ×1.18, city environment pressure +0.25, city infrastructure pressure +0.15 | Invest in compliance (6 000) · Accept the restrictions (0) |

### 2.5 Geopolitical and regulatory

| Event | Severity | Duration | Cooldown | Effects | Player responses |
|-------|----------|----------|----------|---------|------------------|
| International Trade Restrictions | high | 120 h | 400 h | market demand ×0.8, logistics supply ×0.88, competitor activity ×0.9 | Localise the supply chain (6 500) · Absorb the tariffs (3 000) |
| Corporate Regulation Changes | low | 72 h | 264 h | operating costs ×1.08, market demand ×0.96 | — |

Seven events offer player responses, six of them with two or more options.

## 3. The design rules

### 3.1 Determinism

The event sequence is produced by a **seeded xorshift generator** whose state lives in the
events state. There is no `Math.random()` and no `Date.now()` in the simulation. Two identical
runs produce the same sequence of events — this is covered by a test.

### 3.2 Bounded influence

| Bound | Value |
|-------|-------|
| Effect multiplier | 0.5 … 2 |
| Effect pressure | 0 … 1 |
| Relief multiplier | 0.25 … 2 |
| Simultaneous events | 3 |
| Event history | 24 entries |
| News feed | 40 items |
| Scheduling interval | 12 simulated hours |

Overlapping events **stack multiplicatively** and the aggregate is clamped. Two events that
each double the market demand produce a factor of 2 — never 4.

### 3.3 Exactly once

An event **activates once** and **expires once**. The activation stamps the instance and sets
the cooldown; the expiry moves the instance into the history. The status of the instance — not a
flag — is what prevents a second completion.

### 3.4 The relief of a player response

A response grants a **relief multiplier** for a bounded duration:

```
relief = { multiplier, untilSimMs }
untilSimMs = min(event.endsAtSimMs, event.startedAtSimMs + reliefDurationMs)
```

The relief multiplies the effects of **its own event instance** — it never reaches another
event and never outlives the event it belongs to.

## 4. The integration into the simulation

| Consumer | Modifier | Effect |
|----------|----------|--------|
| Economy Engine | `commodityDemand`, `commoditySupply` | The demand and the supply of the commodity category |
| Corporation Engine | `operatingCost` | The operating expenses of the corporation |
| Technology Engine | `researchSpeed` | The progress of the research projects |
| Production Engine | `productionEfficiency` | The progress of the production orders |
| Market Engine | `marketDemand` | The demand of the products |
| City Engine | `cityInfrastructurePressure`, `cityEnvironmentPressure`, `cityCommercialActivity` | The infrastructure load, the environment and the commerce of the city |
| Competitor Engine | `competitorActivity` | The revenue of the AI corporations |

Every consumer clamps the modifier again before it uses it, and every modifier is optional —
without an active event the snapshot is the neutral one and **the behaviour is exactly the
behaviour of Stage 05**.

## 5. The player responses

A response is a real decision with a real cost and a measurable result:

- **Invest in energy efficiency** (7 500) — the operating cost effect of the energy crisis is
  scaled by 0.82 for 140 hours. The operating expenses of the corporation drop measurably.
- **Purchase additional energy** (4 000 + 200 MWh) — the resources are delivered through the
  Resource Engine, the price follows the live market and the whole operation is atomic.
- **Stockpile raw materials** — the inventory of the corporation grows by 150 units and the
  shortage hurts less.
- **Cut operating expenses** (5 000) — the operating costs of the recession are scaled by 0.85.
- **Invest in compliance** (6 000) — the research speed and the operating costs of the
  regulation are scaled by 0.85.

The response is only available while the event is active and it may only be applied once. A
failed response — an unaffordable one — changes neither the event nor the corporation.
