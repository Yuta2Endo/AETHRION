# AETHRION — Development Roadmap

**Project:** AETHRION  
**Stage:** 10 — Android Native Integration & Monetization (current)  
**Status:** Stage 10 implemented with documented external blockers — Stage 11 awaiting user approval

---

## Completed — Stage 01: Project Foundation & Architecture

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

---

## Completed — Stage 02: Game Core & Simulation Foundation

- **Game Core engine** rewritten: start / stop / pause / resume, controlled `step()`, idempotent start (no duplicate loops), deterministic system order, in-flight tick guard (no overlapping asynchronous ticks), per-frame tick cap (no uncontrolled catch-up), visibility-change handling, per-system error isolation, full resource cleanup.
- **Game Clock** rewritten as a tick-driven simulated clock: in-game date/time, configurable speed multipliers, pause/resume, UTC-derived dates, no dependency on the system clock.
- **Game state** reworked: simulation state separated from application state, controlled update actions, no domain logic inside Zustand, **localStorage persistence removed** (IndexedDB is a Stage 08 concern).
- **World Engine baseline**: five fictional regions with stable identifiers, four development indicators, tier model, deterministic evolution rules, invalid-state rejection.
- **Economy Engine baseline**: two currencies, four traded commodities, market prices, supply/demand indicators, deterministic price rules, numeric validation.
- **Simulation integration**: `SimulationRunner` binds engine + clock + state + world + economy with an explicit tick execution order.
- **Empire Dashboard** replaced the placeholder with a live simulation dashboard (empire overview, simulated date, status, speed, world regions, market prices and trends, start/pause/resume/stop and speed controls).
- **UI library** extended with `StatCard`, `IndicatorBar`, `TrendIndicator`, `MarketValue`.
- **Tests**: 85 passing (was 3) — engine, clock, world, economy, integration and component coverage.
- Documentation updated; `docs/STAGE_02_FINAL_REPORT.md` created.

---

## Completed — Stage 03: Corporation & Employee Engines

- **Corporation Engine**: creation with validation, a single player corporation, a flat six-department structure, a data-driven tier table, complete financial model (balance, revenue, operating expenses, payroll expenses, net profit), a bounded transaction ledger and bounded financial history.
- **Employee Engine**: employee model with skill, experience, salary, productivity, satisfaction, morale and employment status; five data-driven professions; deterministic hiring with department availability, capacity and funds checks; deterministic development model (experience, skill, satisfaction, morale, productivity) with a bounded development history.
- **Payroll model**: a fixed seven in-game day period derived from the simulated clock, at-most-once processing per period, a full payroll or a recorded miss — never partial payment and never created money.
- **Simulation integration**: the employee and corporation systems were added to the runner (orders 30 and 40), preserving the world → economy order; the workforce developed in a tick feeds the corporation in the same tick.
- **Command layer**: the single entry point for player actions — establish corporation, hire, dismiss. All validation errors are surfaced to the interface.
- **Game state**: `corporation` and `employees` slices added, typed selectors extended.
- **Interface**: Corporation Overview, Employee Management, Hiring and Finance Overview sections.
- **Tests**: 170 passing (was 85).
- Documentation updated; `docs/STAGE_03_FINAL_REPORT.md` created.

---

## Completed — Stage 04: Technology & Production Engines

- **Technology Research Engine**: data-driven tree (20 technologies, 6 categories), prerequisites, tier gating, deterministic contribution model, unlock effects, cancellation and bounded history.
- **Product Development Engine**: data-driven blueprints, technology prerequisites, deterministic development/quality/innovation/market readiness.
- **Resource & Supply Chain**: inventory with reservations and bounded ledger; fully atomic purchase/reserve/release/consume operations.
- **Production Engine**: facilities, capability checks, production orders, deterministic duration/cost, completion/cancellation.
- **Market Integration**: demand/sales and `CorporateMarketSignal` consumed by Economy Engine.
- **Simulation integration**: tick order extended to 9 systems preserving prior dependencies.
- **Command layer** split by domain (16 validated commands).
- **Interface**: Technology & Research, Product Development, Resource Inventory, Manufacturing, Products & Market sections.
- **Tests**: 285 passing (was 170).
- Documentation updated; `docs/ENGINE_RULES.md`, `docs/STAGE_04_FINAL_REPORT.md` created.

---

## Completed — Stage 05: City Engine & Urban Infrastructure

- **City Engine**: one city, 5 districts, 30 plots, 13 data-driven building definitions, deterministic construction lifecycle, 4 infrastructure networks, population/labour model and bounded indicators.
- **Land & construction**: plot purchase/sale through corporate ledger, zoning/district compatibility, lifecycle rules (sunk-cost cancellation, demolition releases plot).
- **Infrastructure & population**: capacity/demand aggregation, service-level/operational factor, housing-capped population and non-negative unemployment.
- **Economy integration**: `CityMarketSignal` (bounded demand/saturation influence, no supply).
- **Simulation integration**: city system inserted before economy (tick order 10 systems).
- **Interface**: City Overview, District Management, Urban Infrastructure, Land Management, Construction & Buildings.
- **Tests**: 360 passing (was 285).
- Documentation updated; `docs/STAGE_05_FINAL_REPORT.md` created.

---

## Completed — Stage 06: Events & Competitor AI Engines

- **Global Events Engine**: 17 data-driven events (6 categories), deterministic seeded scheduling, typed bounded effects, lifecycle/expiry, player responses, news feed.
- **Competitor AI Engine**: 3 AI corporations, personality/objective-driven deterministic decisions, compact finances/research/market presence, `CompetitorMarketSignal`.
- **Simulation integration**: tick order 12 systems (events early, competitors after market).
- **Interface**: Global Events, News Feed, Competitor Overview.
- **Tests**: 464 passing (was 360).
- Documentation updated; `docs/EVENT_SYSTEM.md`, `docs/COMPETITOR_AI.md`, `docs/STAGE_06_FINAL_REPORT.md`.

---

## Completed — Stage 07: Performance & Web Workers

- **Simulation kernel** extracted as pure, injected-store implementation shared by inline and Worker execution.
- **Worker architecture**: module Worker + Comlink transport, versioned handshake/protocol, delta responses, lifecycle/timeout/fallback, bounded metrics/diagnostics.
- **Determinism & integrity**: identical results inline/worker, monotonic sequence validation, no overlapping/duplicated ticks, safe fallback.
- **Tests**: 487 passing (was 464).
- Documentation updated; `docs/WORKER_ARCHITECTURE.md`, `docs/STAGE_07_FINAL_REPORT.md`.

---

## Completed — Stage 08: Save & Archive Engine

- **Persistence subsystem** (`src/game/persistence/`): typed, versioned save format, explicit allowlist, validation, SHA-256 integrity (when available), sequential migrations, portable JSON archives.
- **Database & repository:** IndexedDB via `idb` (`aethrion-save` v1), `saves`/`backups`, per-slot atomicity and recoverable errors.
- **Save/Load:** manual slots, rename/delete, metadata, export/import (validated), safe/atomic restore to paused state, failed-load preservation, worker reset/reinit on restore.
- **Autosave:** simulated-time, post-tick, debounced/non-overlapping, rotating autosave slot.
- **Determinism:** save → continue → restore → continue verified (inline/worker).
- **UI:** `SaveLoadSection` integrated.
- **Tests**: 502 passing (was 487).
- Documentation updated; `docs/SAVE_ARCHITECTURE.md`, `docs/SAVE_FORMAT.md`, `docs/STAGE_08_FINAL_REPORT.md`.

---

## Completed — Stage 09: Rendering Engine & World View

- **Rendering subsystem** (`src/rendering/`): simulation-independent Three.js visualization layer (deterministic layout adapter, read-only visual mapping, `CityWorld`, `WorldRenderer`, quality/WebGL detection, safe lifecycle/disposal).
- **World View:** interactive 3D city (5 districts, 30 plots, buildings) reflecting actual simulation state/status/progress, incremental sync, save/load reflection, worker-compatible store-driven updates.
- **Interaction:** orbit/zoom/pan/reset/focus, raycast selection (district/plot/building), read-only inspector, touch-friendly viewport.
- **Fallback & performance:** WebGL/error fallback with 2D/textual overview (real data), Android-conscious quality caps, restrained effects, chunking.
- **Tests**: 515 passing (was 502).
- Documentation updated; `docs/RENDERING_ARCHITECTURE.md`, `docs/WORLD_VIEW_GUIDE.md`, `docs/STAGE_09_FINAL_REPORT.md`.

---

## Completed with blockers — Stage 10: Android Native Integration & Monetization

**Owner-selected monetization providers (preserved):**
- **Advertising:** Yandex Mobile Ads (rewarded-first, user-initiated, verified-completion-only rewards).
- **Purchases:** Robokassa (server-authoritative creation/verification, ResultURL-confirmed, idempotent entitlements, no client secrets).

**Implemented in-repo (architectural/client/reference scope):**
- Capacitor/platform audit and configuration hardening (appId `com.aethrion.app`, `webDir dist`, `https` scheme) and client-safe env/config (`.env.example`) with no secrets.
- Platform/lifecycle abstractions: Capacitor/native detection, lifecycle manager (visibility + Capacitor App hooks when available), Android back-button handling integration, safe background/foreground behavior without duplicate loops.
- Mobile rendering profile: configurable quality profile (`auto/low/medium/high`) with DPR/AA heuristics and existing WebGL fallback.
- Monetization architecture: distribution/payment policy modes and safe gating, Yandex rewarded-ads typed service (init/load/show states, verified completion, idempotent reward granting, dev/prod config validation) with Capacitor plugin bridge contract.
- Payments architecture: typed payment state machine/client contracts, policy-gated payment client, and **reference server-authoritative Robokassa module** (`server/src/payments/`) implementing signature generation/verification, notification validation (amount/invoice), and idempotent ResultURL processing/entitlement granting logic (automated-tested).
- Automated tests added for platform config, distribution policy, rewarded-ad lifecycle/idempotency, payment transitions, and Robokassa verification/idempotency. Full regression gates executed (see Stage 10 report).
- Documentation: `docs/ANDROID_ARCHITECTURE.md`, `docs/ANDROID_BUILD_GUIDE.md`, `docs/MONETIZATION_ARCHITECTURE.md`, `docs/ROBOKASSA_INTEGRATION.md`, `docs/YANDEX_ADS_INTEGRATION.md`, `docs/STAGE_10_FINAL_REPORT.md`, and roadmap/architecture/security updates.

**Documented blockers / not verified (external or environment):**
- No native `android/` project/toolchain/SDK/device/emulator in this environment: `cap add/sync android`, Gradle debug/release builds, APK/AAB signing/device tests **not executed**.
- Yandex Mobile Ads: no native Android SDK/plugin build on device and no real/production ad unit IDs or account configuration; demo/production IDs not fabricated. Device behavior not verified.
- Robokassa: no deployable/authenticated backend, no merchant credentials, no live/test endpoint deployment — **server-authoritative processing implemented as reference logic/contract and tests only**; production integration blocked pending secure backend and credentials.
- Google Play distribution/payment policy: no Play Console enrollment/eligibility/approval verified. EEA alternative billing and other Play modes are **safely gated/architecturally prepared**, not claimed approved or enabled.

Google Play payment policy requirements are respected/documented without presenting Google Play Billing as the owner’s selected primary provider.

---

## Stage 11+: Polish & Commercial Release (next — pending user approval)

- Resolve Stage 10 external blockers: Android toolchain/project generation and verified builds, native Yandex Ads SDK/plugin validation on devices, secure Robokassa backend deployment/credentials/testing, distribution-channel decision and policy-compliant payment enablement (including any required Play enrollment/reporting only where eligible and approved).
- Balance pass, performance tuning, accessibility, localization.
- Store assets, privacy/consent disclosures as required, age rating, release signing and submission preparation (channel-dependent).
- Additional features only with explicit approval.

---

## Rules (all stages)

- Preserve owner-selected monetization: **Yandex Ads** (advertising) and **Robokassa** (purchases), with **server-authoritative payment verification** and distribution-specific policy gating.
- **No secrets or credentials in the client/repository.** No fabricated production IDs, merchant secrets, keys, or enrollments.
- Gameplay correctness, payment correctness, security, Android stability, and reproducible builds take priority over superficial completion.
- No production deployment claims without verification.
- Strict TypeScript; rendering and simulation independent.
- Each stage ends with verified checks (as available), honest reporting, passing required quality gates, and updated documentation. Stop after stage completion and wait for explicit approval before proceeding.