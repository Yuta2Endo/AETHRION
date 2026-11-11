# AETHRION — Technical Architecture

**Project:** AETHRION  
**Stage:** 01 — Foundation

## 1. Layered Architecture

Clear separation of responsibilities across layers.

```
┌─────────────────────────────────────┐
│  Platform (Capacitor / Android)     │  ← billing, ads (later stages)
├─────────────────────────────────────┤
│  UI System (React + Framer Motion)  │  ← application interface
├─────────────────────────────────────┤
│  App State (Zustand — app store)    │  ← application-facing state
├─────────────────────────────────────┤
│  Rendering Engine (Three.js)        │  ← rendering only, no game rules
├─────────────────────────────────────┤
│  Game Core (engine, state, clock)   │  ← simulation orchestration
├─────────────────────────────────────┤
│  Simulation Engines (domain)        │  ← world, economy, corp, tech, …
├─────────────────────────────────────┤
│  Core (config, events, logging, …)  │  ← cross-cutting concerns
└─────────────────────────────────────┘
```

## 2. Module Responsibilities

| Module | Responsibility | Depends On |
|--------|----------------|------------|
| Application Core | App entry, providers, navigation, shell | React, Zustand |
| Game Core | Game loop, game state, clock | Core |
| World Engine | Regions, map, world state | Core |
| Economy Engine | Markets, currencies, pricing | Core |
| Corporation Engine | Corporations, employees, hiring | Core |
| Technology Engine | Tech tree, research, unlocks | Core |
| Production Engine | Factories, products, supply chains | Core |
| City Engine | Cities, buildings | Core |
| Employee Engine | Hiring, roles, salaries | Core |
| Events Engine | World events, news | Core |
| Competitor AI Engine | AI corporations | Core |
| Save & Archive | IndexedDB persistence | idb |
| Rendering Engine | Three.js scenes, cameras, materials | Three.js |
| UI System | Components, screens, theme, tokens | React, Framer Motion |
| Platform Integration | Capacitor, Android | Capacitor |

## 3. State Separation

Two distinct Zustand stores:

- `src/app/providers/AppProvider.tsx` — **application state** (theme, sidebar, version). Persisted to sessionStorage.
- `src/game/state/gameStore.ts` — **game/simulation state** (empire name, founded at). Persisted to localStorage.

React UI consumes application state. Game simulation state is consumed by simulation engines — not by React components directly.

## 4. Event Communication

`src/core/events/eventBus.ts` — a typed event bus decouples modules. Application-level events (theme change, errors, simulation ticks) flow through it. Game simulation does not depend on the bus.

## 5. Error Handling

`src/core/error/errorHandler.ts` — centralized error handler. Installs global `window.onerror` and `unhandledrejection` handlers, logs via the logger, emits `app:error` events, and exposes a `tryCatch` Result helper. React Error Boundary lives in the UI layer (to be wired per screen in later stages).

## 6. Logging

`src/core/logging/logger.ts` — centralized logger respecting `VITE_LOG_LEVEL`. Prefix `AETHRION`.

## 7. Environment Configuration

`src/core/config/env.ts` — typed access to Vite env variables (`VITE_APP_*`, `VITE_ENV`, `VITE_DEBUG`, `VITE_LOG_LEVEL`, `VITE_API_BASE_URL`, `VITE_ENABLE_SIMULATION_WORKER`). No direct `import.meta.env` reads elsewhere.

## 8. Web Workers

`src/workers/simulation/` — expensive simulation tasks run off the main thread via Web Workers, coordinated with Comlink when appropriate. Enabled via `VITE_ENABLE_SIMULATION_WORKER`.

## 9. Persistence

`src/services/persistence/indexedDB.ts` — IndexedDB (via `idb`) with `saves` and `settings` object stores. Foundation only in Stage 01.

## 10. TypeScript Configuration

Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`). Path alias `@/` → `./src`.

## 11. Dependency Rules

- Avoid circular dependencies.
- Game simulation independent of React.
- Three.js independent of game rules.
- UI depends on design tokens only (no hardcoded brand colors).
