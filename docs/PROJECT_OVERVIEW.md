# AETHRION — Project Overview

**Project:** AETHRION  
**Stage:** 01 — Project Foundation & Architecture  
**Mode:** GREENFIELD — Build from scratch  
**Platform:** Android (Capacitor)  
**Genre:** Hybrid Empire Simulator  
**Visual Style:** Premium Neon Sci-Fi  
**Brand:** AETHRION  
**Slogan:** BUILD YOUR EMPIRE. SHAPE THE FUTURE.

## 1. Vision

AETHRION is a futuristic global technology empire simulator.

The player starts with a small technology corporation and gradually builds a global empire. Core player activities include establishing corporations, hiring employees, developing technologies, building factories and research centers, manufacturing products, managing supply chains, developing cities, influencing global markets, competing against AI corporations, expanding across world regions, and shaping the future of civilization.

The game combines: Business Tycoon, Economic Strategy, City Builder, Life Simulation, Technology Simulator, and Global Empire Management. The world must evolve in response to player decisions.

## 2. Stage 01 Objective

Stage 01 is strictly a foundation stage. It does **not** implement the full game. The goal is to establish a professional, maintainable, and scalable development foundation for eventual commercial release on Google Play.

Acceptance criteria:
1. New AETHRION project initialized.
2. Target technology stack installed and validated.
3. Project architecture documented.
4. Initial directory structure exists.
5. Application starts successfully.
6. Initial branded interface works.
7. Design tokens centralized.
8. TypeScript validation succeeds.
9. Production build succeeds.
10. Tests configured and executed.
11. Android integration status documented.
12. All stage documentation created.

## 3. Target Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Build tool | Vite | Dev server & production build |
| Framework | React 19 | Application interface |
| Language | TypeScript 5.6 (strict) | Type safety |
| State (app) | Zustand 4 | Application-facing state |
| State (game) | Zustand 4 (separate store) | Simulation state (decoupled) |
| Rendering | Three.js | WebGL rendering only |
| Animation | Framer Motion | UI transitions |
| Icons | Phosphor Icons | UI iconography |
| Workers | Web Workers + Comlink | Expensive simulation off main thread |
| Persistence | IndexedDB (via idb) | Save / archive |
| Testing | Vitest + jsdom | Unit & component tests |
| E2E | Playwright | End-to-end testing |
| Mobile | Capacitor | Android native container |
| Linting | ESLint (flat config) | Code quality |

Android integrations planned for later stages: Google Play Billing, Google AdMob.

## 4. Directory Structure (src/)

```
src/
  app/            # Application layer (React shell, navigation, providers)
  core/           # Cross-cutting concerns (config, events, logging, types, utils, error)
  game/           # Game core (engine, state, clock, systems)
  simulation/     # Domain engines (world, economy, corporation, technology, production,
                  # city, employees, events, competitors)
  rendering/      # Three.js rendering (scenes, cameras, objects, materials, lighting)
  ui/             # UI system (components, screens, theme, design-tokens)
  services/       # Persistence, audio, assets
  workers/        # Web Workers (simulation)
  platform/       # Platform integrations (android)
  tests/          # Vitest setup + component tests
```

## 5. Development Rules

- Build from scratch. No unrelated architectures reused.
- No unnecessary complexity; keep modules testable.
- Strict TypeScript.
- Rendering and simulation independent (Three.js never holds game rules).
- Document important interfaces.
- Avoid circular dependencies.
- No fake gameplay functionality in Stage 01.
- No monetization (billing/ads) before gameplay foundations exist.
- No production deployment.
- No secrets or credentials committed.
