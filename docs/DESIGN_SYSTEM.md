# AETHRION — Design System

**Project:** AETHRION  
**Stage:** 02 — Game Core & Simulation Foundation

## 1. Brand Identity

- **Name:** AETHRION
- **Slogan:** BUILD YOUR EMPIRE. SHAPE THE FUTURE.
- **Visual Direction:** Premium Neon Sci-Fi

## 2. Color Palette

All colors are centralized in CSS custom properties (`src/index.css`) and a JavaScript mirror (`src/ui/theme/tokens.ts`). Brand colors must **not** be hardcoded in components.

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-deep-space` | #080B18 | Background |
| `--color-empire-blue` | #111A31 | Cards, surfaces |
| `--color-neon-cyan` | #00D9FF | Accents, primary actions, glows |
| `--color-imperial-purple` | #A855F7 | Brand badges, secondary accents |
| `--color-royal-violet` | #7C3AED | Secondary accents |
| `--color-stellar-white` | #DCE8FF | Primary text |

Semantic surfaces (`--surface-card`, `--surface-border`, …) and text colors (`--text-primary`, `--text-accent`, …) are derived from the brand palette.

Semantic state colors: `--success` (#22C55E), `--warning` (#F59E0B), `--error` (#EF4444), `--info` (Neon Cyan).

## 3. Typography

| Role | Font | Fallback |
|------|------|----------|
| Headings | Orbitron | Segoe UI, Roboto, sans-serif |
| Interface | Inter | Segoe UI, Roboto, sans-serif |
| Numeric / mono | Roboto Mono | Consolas, Monaco, monospace |

Numeric values use the mono typeface (`.text-mono`) with tabular figures so values do not jitter while the simulation runs.

## 4. Design Tokens (JS)

`src/ui/theme/tokens.ts` exports `themeTokens` containing `brand`, `colors`, `typography`, `fontSize`, `space`, `radius`, `shadows`, and `zIndex`. Use these for any JS-side token values (e.g. Three.js material colors).

## 5. UI Primitives

| Component | Purpose | Variants |
|-----------|---------|----------|
| `Button` | Action trigger. Forwards all native button props and event handlers. | primary, secondary, ghost, danger × sm, md, lg + loading state |
| `Card` | Surface container | padded / bordered |
| `Badge` | Small status label | ok, pending, brand, danger, warning |
| `StatCard` | Single simulated value with label, hint and optional icon | default, accent, brand, success, warning |
| `IndicatorBar` | Labelled 0..max progress bar with `role="meter"` | cyan, purple, success, warning |
| `TrendIndicator` | Signed change with direction arrow | up, down, flat (derived) |
| `MarketValue` | One traded commodity: name, category, price, change, market pressure | pressure: balanced / demand / supply |

All styled via CSS custom properties. No hardcoded brand colors. No duplicated business logic — components receive values and render them.

## 6. Application Shell

Responsive layout with top bar (brand, theme toggle, actions), collapsible sidebar navigation, and main content area. Themed via the `data-theme` attribute (`dark` / `neon`).

## 7. Screens

- `LoadingScreen` — branded initialization screen, shown until the simulation produced its first tick.
- `Dashboard` — the **Empire Dashboard**: simulation control panel, empire overview, world overview with region indicators, economy overview with market prices and trends. Every value is read from the live simulation state.

### Dashboard layout

```
┌─ header ───────────── brand identity ──────────────── simulated date ─┐
│  Command Center                                              (h1)     │
├─ simulation control panel ────────────────────────────────────────────┤
│  status badge · tick · speed │ start · pause · resume · stop │ 0.5-4x  │
├─ Empire Overview ──────────────────────────────────────────────────────┤
│  empire · founded · home region · world regions                      │
├─ World Overview ───────────────────────────────────────────────────────┤
│  aggregate metrics │ region cards with four indicator bars each       │
├─ Economy Overview ─────────────────────────────────────────────────────┤
│  aggregate metrics │ market rows: price · change · market pressure    │
└─ footer ───────────────────────────────────────────────────────────────┘
```

### Responsive behaviour

At ≤ 720 px the control panel stacks vertically, the market table collapses from a four-column grid into a two-column card layout, and the header date block is hidden. Region and metric grids reflow to a single column.

### Accessibility

- Every interactive element is a real `<button>` with an accessible name.
- Indicator bars expose `role="meter"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`.
- Speed controls are grouped with `role="group"` and use `aria-pressed`.
- Decorative icons are `aria-hidden`.
- The dashboard has a single `h1` and labelled `section` regions (`aria-label`).
