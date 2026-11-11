# AETHRION — Development Roadmap

**Project:** AETHRION  
**Stage:** 01 — Project Foundation & Architecture (current)

## Completed — Stage 01

- Project initialized with target stack (Capacitor, React 19, TypeScript, Vite, Three.js, Zustand, Framer Motion, Phosphor Icons, Web Workers/Comlink, IndexedDB/idb, Vitest, Playwright).
- Directory structure created per architecture.
- Branded application shell (dark theme, navigation, responsive layout).
- Loading screen + dashboard placeholder (no fake gameplay).
- Centralized design tokens (CSS + JS).
- Centralized error handling + logging + env config.
- Typed interfaces for all 15 planned modules.
- TypeScript, ESLint, Vitest, Playwright configured.
- Production build validated.
- All stage documentation created.

## Planned — Stage 02 (recommended, pending user approval)

- Implement Game Core engine (game loop, clock, game state store).
- Wire World Engine + Economy Engine with typed interfaces.
- Implement corporation creation and employee hiring (basic).
- Connect simulation to Web Worker for off-main-thread ticks.
- Add React screens bound to game state (empire overview).
- Implement save/load via IndexedDB.
- Expand component library and dashboard with live data.
- Add component + simulation unit tests.

## Planned — Later Stages

- Technology tree, production, city building.
- Competitor AI.
- Events engine.
- Three.js world view (rendering engine).
- Android native integration: Google Play Billing, Google AdMob.
- Polishing, performance, release build for Google Play.

## Rules (all stages)

- No monetization before gameplay foundations exist.
- No production deployment.
- No secrets or credentials committed.
- Strict TypeScript; rendering and simulation independent.
