# AETHRION — Project Overview

**Project:** AETHRION  
**Stage:** 10 — Android Native Integration & Monetization (implemented with documented external blockers)  
**Mode:** GREENFIELD — Build from scratch (evolved through staged implementation)  
**Platform:** Web + Android target (Capacitor)  
**Genre:** Hybrid Empire Simulator  
**Visual Style:** Premium Neon Sci-Fi  
**Brand:** AETHRION  
**Slogan:** BUILD YOUR EMPIRE. SHAPE THE FUTURE.

## 1. Vision

AETHRION is a futuristic global technology empire simulator.

The player starts with a small technology corporation and gradually builds a global empire. Core player activities include establishing corporations, hiring employees, developing technologies, building factories and research centers, manufacturing products, managing supply chains, developing cities, influencing global markets, competing against AI corporations, expanding across world regions, and shaping the future of civilization.

The game combines: Business Tycoon, Economic Strategy, City Builder, Life Simulation, Technology Simulator, and Global Empire Management. The world must evolve in response to player decisions.

## 2. Stage Objectives

### Stage 01 — Project Foundation & Architecture (complete)

Stage 01 established a professional, maintainable, and scalable development foundation for eventual commercial release on Google Play.

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

### Stage 02 — Game Core & Simulation Foundation (complete)

Stage 02 turned the foundation into a functional simulation backbone: a real tick loop, a simulated in-game clock, a typed game state, baseline World and Economy engines, their integration, and a live Empire Dashboard — with no gameplay systems from later stages pulled forward.

### Stages 03–09 (complete)

Corporation/Employee, Technology/Production, City, Events/Competitor AI, Performance/Web Workers, Save & Archive, and Rendering/World View systems were implemented incrementally with deterministic, test-backed simulation behavior and documented architecture.

### Stage 10 — Android Native Integration & Monetization (completed with blockers)

Android/Capacitor integration, lifecycle and mobile rendering readiness, and owner-selected monetization architecture were implemented in-repo: **Yandex Ads** (rewarded-first, verified completion, idempotent rewards) and **Robokassa** (server-authoritative, signature-verified, idempotent payment processing) with distribution/payment policy gating. Real device/SDK/credential/backend/enrollment-dependent steps are documented as blockers (no fabricated IDs, secrets, or approvals). See `docs/STAGE_10_FINAL_REPORT.md`.

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

Android/monetization (owner-selected): **Yandex Mobile Ads** (advertising) and **Robokassa** (purchases) with server-authoritative payment verification and distribution-specific policy gating. Google Play payment policy requirements are respected/documented where applicable without presenting Google Play Billing as the owner’s preferred primary provider.

## 4. Directory Structure (src/)

```
src/
  app/            # Application layer (React shell, navigation, providers)
  core/           # Cross-cutting concerns (config, events, logging, types, utils, error)
  game/           # Game core (engine, state, clock, simulation runner)
  simulation/     # Domain engines (world, economy, corporation, technology, production,
                  # city, employees, events, competitors)
  rendering/      # Three.js rendering (scenes, cameras, objects, materials, lighting)
  ui/             # UI system (components, screens, theme, design-tokens)
  services/       # Persistence, audio, assets
  workers/        # Web Workers — reserved for Stage 07
  platform/       # Platform integrations (android)
  tests/          # Vitest setup + unit, integration and component tests
```

## 5. Development Rules

- Build from scratch. No unrelated architectures reused.
- No unnecessary complexity; keep modules testable.
- Strict TypeScript.
- Rendering and simulation independent (Three.js never holds game rules).
- Document important interfaces.
- Avoid circular dependencies.
- No fake gameplay functionality.
- Preserve owner-selected monetization decisions and security: **Yandex Ads** and **Robokassa** (server-authoritative, no client secrets), with policy-compliant distribution gating.
- No production deployment claims without verification.
- No secrets or credentials committed.
