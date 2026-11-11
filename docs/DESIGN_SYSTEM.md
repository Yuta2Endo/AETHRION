# AETHRION — Design System

**Project:** AETHRION  
**Stage:** 01 — Foundation

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

## 3. Typography

| Role | Font | Fallback |
|------|------|----------|
| Headings | Orbitron | Segoe UI, Roboto, sans-serif |
| Interface | Inter | Segoe UI, Roboto, sans-serif |
| Numeric / mono | Roboto Mono | Consolas, Monaco, monospace |

## 4. Design Tokens (JS)

`src/ui/theme/tokens.ts` exports `themeTokens` containing `brand`, `colors`, `typography`, `fontSize`, `space`, `radius`, `shadows`, and `zIndex`. Use these for any JS-side token values (e.g., Three.js material colors).

## 5. UI Primitives

- `Button` — variants: primary, secondary, ghost, danger; sizes: sm, md, lg; loading state.
- `Card` — padded/bordered surface container.
- `Badge` — variants: ok, pending, brand, danger, warning.

All styled via CSS custom properties. No hardcoded brand colors.

## 6. Application Shell

Responsive layout with top bar (brand, theme toggle, actions), collapsible sidebar navigation, and main content area. Themed via `data-theme` attribute (`dark` / `neon`).

## 7. Screens

- `LoadingScreen` — branded initialization screen.
- `Dashboard` — Command Center placeholder identifying AETHRION and brand identity; marks future-stage systems as planned.
