# AETHRION — Competitor AI

**Project:** AETHRION  
**Stage:** 06 — Events & Competitor AI Engines

> The exact rules live in `docs/ENGINE_RULES.md` §10. This document explains the **design** of
> the AI: who the corporations are, how they think and what the player sees.

---

## 1. The purpose

The Competitor AI Engine exists so that AETHRION is a **world**, not a sandbox. Until Stage 06
the market reacted to the world and to the player — but nothing else ever bought, sold or
researched. Now three independent corporations pursue their own interests, compete for the
same commodities, invest in the same technologies and react to the same global events.

The design goals were:

1. **No rubber stamps.** A corporation that always wins is as dull as no opponent at all.
2. **No randomness.** The AI must be reproducible and auditable.
3. **No second game.** The AI has no employees, no payroll and no ledger of its own economy —
   it is a compact model inside the competitor module.
4. **Every action visible.** The player must be able to read *why* a corporation did something.

## 2. The three corporations

### NEXORA INDUSTRIES

> *Advanced computing, electronics and frontier technology* — **Technology leadership**.

NEXORA believes the market is won by the research portfolio. It spends early, it keeps a large
share of its capital in research programmes and it is the first to move into a new technology
category. Its base personality is **innovative** — the research weight of its decisions is the
highest of all — but under pressure it turns **aggressive** and tries to take the market
instead. It starts in the *growth* tier with 120 000 credits and a presence of 34.

### VANTEX GLOBAL

> *Industrial production, materials and logistics* — **Operational efficiency and market share**.

VANTEX is the industrial power of the world. It protects its balance, it raises the prices
when the market is strong and it cuts its expenses when the market is weak. Its base personality
is **conservative**. It starts in the *growth* tier with the largest capital of the three — a
150 000 credits — and the largest market presence of 42, because it is already the incumbent of
the materials and the logistics.

### HELION DYNAMICS

> *Energy generation, infrastructure and advanced materials* — **Resource control and long-term
> investment*.

HELION secures the inputs everybody else needs. It defends its position, it hoards its reserves
and it only expands when the balance allows it. Its base personality is **defensive**. It starts
in the *established* tier with 135 000 credits and the highest reputation of the three (32) —
the sector trusts it, but it does not take risks.

## 3. How a corporation thinks

### 3.1 The personality

A personality is a **weight profile**, never a random behaviour. The five profiles:

| Profile | Highest weights | Lowest weights |
|---------|-----------------|----------------|
| `aggressive` | expand production 1.0, market presence 0.9, cut prices 0.9 | recover financials 0.2 |
| `innovative` | research 1.0 | reduce expenses 0.3, recover financials 0.3 |
| `conservative` | reduce expenses 1.0, accumulate resources 0.9, raise prices 0.9 | expand production 0.4 |
| `opportunistic` | enter category 1.0, accumulate resources 1.0 | reduce expenses 0.4 |
| `defensive` | recover financials 1.0, accumulate resources 0.9, reduce expenses 0.8 | expand production 0.3 |

### 3.2 The shift

The current personality is derived from the conditions — the same corporations always behave
the same way in the same world:

```
stability below 35                  → defensive
an active shortage                  → opportunistic
the market leader, stability above 60 → aggressive
otherwise                           → the base personality
```

The shift is what makes a conservative corporation start buying up the scarce categories
during a shortage, and what makes a leading corporation push the prices instead of defending
them.

### 3.3 The decision

Every 24 simulated hours a corporation evaluates nine objectives. The score of an objective is
the product of three things:

```
score = clamp(personalityWeight × need × affordability × contextModifier, 0, 1)
```

- **need** — how much the corporation wants it right now (a presence below 60, an unlocked
  technology count below six, a stability below 45 …).
- **affordability** — a corporation never plans an action it cannot pay for.
- **contextModifier** — the state of the world: the research speed during a breakthrough, the
  opportunity of a shortage, the weakness of the market.

A score below 0.25 is never taken. The objectives are evaluated in a fixed order, so a tie is
always broken identically.

### 3.4 The nine objectives

| Objective | What it does | Cost |
|-----------|--------------|------|
| `invest-research` | Starts a research programme in the specialisation of the corporation | the research cost of the technology |
| `expand-production` | Raises the production capacity and the operating cost | 8 000 |
| `increase-market-presence` | Raises the market presence | 5 000 |
| `enter-category` | Opens a new commodity category | 12 000 |
| `cut-prices` | Undercuts the market for 96 hours | 2 000 |
| `raise-prices` | Pushes the prices up for 96 hours | 1 500 |
| `reduce-expenses` | Lowers the operating costs for 120 hours | 1 000 |
| `accumulate-resources` | Buys commodity exposure | 6 000 |
| `recover-financials` | Restores the financial stability without a cost | 0 |

Every action type is blocked for 72 hours after it was used, so a corporation never repeats
itself in a loop.

## 4. The financial model

The AI has no employees and no payroll. It has a compact model:

```
revenue per hour = (presence / 100) × 70 × (1 + worldActivity / 100) × eventFactor
operating cost    = (25 + presence × 0.35) × costReduction
```

Two consequences matter for the gameplay:

- **The AI can fail.** A recession lowers the world activity, the revenue falls below the
  operating cost and the balance falls. A corporation that never invests has no presence and
  therefore no revenue at all — it dies.
- **The AI cannot cheat.** The revenue is bounded by the presence and by the world activity, and
  the presence carries a part of the operating cost, so the profit of a corporation stays
  bounded even at a maximum presence.

The **stability** (0…100) is the number the interface shows. It combines the capital ratio and
the current profit, and it is what makes a struggling corporation defensive.

## 5. The technology competition

The AI reuses the **Stage 04 technology tree** — the same twenty definitions, the same
prerequisites and the same research durations. There is no second tree.

A corporation only researches a technology of its own specialisation whose prerequisites it has
already unlocked, and it never commits more than half of its balance to a single programme. The
progress advances with the simulated time and the reputation of the corporation.

When a corporation unlocks a technology, the achievement is published into the news feed — the
player sees the sector move.

## 6. The market presence

The AI reports its pressure through the `CompetitorMarketSignal` and the **Economy Engine**
applies it. The AI never touches the market directly.

A corporation that undercuts the market adds more effective supply; one that pushes the prices
up adds less. Both effects are bounded to ±12 % of the commodity supply or demand, so three
corporations can never take the market over.

The signal only exists while there is at least one corporation — an empty competitor state
leaves the economy exactly as it was in Stage 05.

## 7. What the player sees

- **The overview** — the name, the specialisation, the strategy, the current personality, the
  reputation, the tier, the market presence, the financial stability, the balance and the
  current objective of every corporation.
- **The dossier** — the balance, the net result, the unlocked technologies, the standing with
  the player, the market activity, the running research programme and the four most recent
  significant actions.
- **The news** — every decision of the AI is published as a news item with its cost and its
  target.
- **The competitive pressure** — the market section shows, per commodity category, the supply
  and the demand pressure and the price pressure the AI applies.

The player may **inspect** a corporation. There is deliberately no command that lets the player
steer the AI — the corporations have to be believable.

## 8. The limits of the current model

- The AI does not produce products, does not employ people and does not buy resources. It is a
  **macro** actor: capital, presence, research and prices.
- It does not react to the player directly — its actions are driven by the world, not by the
  behaviour of the player.
- It has no diplomacy, no alliances and no hostility beyond the price pressure.
- The number of commodities is four, so the categories it can enter are limited.

These limits are deliberate for Stage 06. A more detailed AI belongs to a later stage, when
there is more of the economy for it to act upon.
