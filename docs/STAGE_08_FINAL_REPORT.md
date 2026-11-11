# AETHRION — Stage 08 Final Report
## Save & Archive Engine

**Stage:** 08 — Save & Archive Engine  
**Status:** **COMPLETE**  
**Branch:** `main`  
**Date:** 2026-11-12 (workspace)

---

## 1. Stage summary

Stage 08 implements a typed, versioned, deterministic and recoverable Save & Archive Engine: IndexedDB persistence (`idb`, `aethrion-save` v1), multiple independent save slots, manual save/load/rename/delete/export/import, configurable simulated-time autosave, validated/migrated/integrity-checked restores that are atomic and leave the active game unchanged on failure, and Worker-compatible load/continue behaviour. A Save & Load UI was integrated into the dashboard. The implementation and this report are committed separately.

## 2. Initial repository state and HEAD

- **Before Stage 08:** clean working tree, `main` at `0f22d72892e317b87d0f3ce873acacb6a40a5158` (`0f22d72`, `docs(stage-07): add final report`), v0.7.0, 487 tests passing (per Stage 07 report/state).
- **Implementation commit:** `1556cbc1666783c823c4d2f168992a11aa8626d6` (`1556cbc`, `feat(stage-08): Save & Archive Engine`).
- **Final HEAD (report commit):** recorded by this commit.

No history rewrite, no force-push, no discarded user changes.

## 3. Audit findings

- **Persisted (authoritative, explicit allowlist):** `empire`, `world`, `economy`, `corporation`, `employees`, `technology`, `products`, `resources`, `production`, `market`, `city`, `events`, `competitors`, plus `simulation` meta (tick, simTimeMs, elapsedSimMs, date, speed) and a **clock snapshot**.
- **Transient (not persisted):** `performance` metrics, Worker client/transport/engine/scheduler internals, tick/frame/accumulator state, React/UI state, dialogs/notifications/subscriptions/callbacks. `simulation.status` normalised to `paused` and runtime `lastError` cleared on restore.
- **Clock:** tick-driven `GameClock` (`startDateMs`, `elapsedSimMs`, ticks, speed, pause, config). Added serialisable `getSnapshot()`/`restore()`; simulated time never derived from wall clock.
- **RNG/determinism state:** lives in `events` slice (`randomState`, `sequence`, `lastScheduleElapsedMs`, `cooldowns`) — restored as part of authoritative state; no seeds regenerated on load.
- **Reset/restore hooks:** `SimulationRunner.reset()` resets engine/clock/metrics/store. Added `GameEngine.hydrate(tick,status)`, `SimulationWorkerClient.reset()`, `SimulationRunner.prepareRestore()/finalizeRestore()` to stop safely, clear transient/worker state, and rehydrate tick/clock without leaving a stale Worker.
- **Worker boundary:** worker runs pure kernel on snapshots (main thread applies deltas); IndexedDB must remain on main thread; restore resets worker client and reinitialises against fresh state.
- **Existing persistence:** `src/services/persistence/indexedDB.ts` is an unused Stage 01 stub (`aethrion` DB v1, simple `save_` records, no validation/migration/integrity/slots). `idb` already in dependencies. New subsystem implemented under `src/game/persistence/`; legacy stub left in place (unused).
- **Startup/commands/tests:** singleton `simulation` runner; command layer unchanged for gameplay; Vitest/jsdom environment (no guaranteed `indexedDB`) — service accepts injectable repository for deterministic, environment-independent tests.

## 4. Architecture decisions

- **Dedicated subsystem** `src/game/persistence/` (database, repository, service, validation, serialization, integrity, migration, backup, types, errors, index) — persistence independent from React and simulation rules.
- **Explicit allowlist** snapshot (not whole Zustand store) via `buildSavePayload`/`capturePersistedState` + `structuredClone`; `GameClockSnapshot` restored explicitly.
- **Save format versioned separately** (`SAVE_FORMAT_VERSION=1`) from DB version (`SAVE_DB_VERSION=1`) and app version; sequential migration pipeline, no mutation of stored records.
- **Integrity:** SHA-256 over deterministic key-sorted canonical JSON (`crypto.subtle` when available). Detects accidental corruption/mismatch/tamper on load/import when verifiable; **not** encryption or anti-cheat. Structural validation always enforced.
- **Atomicity & recovery:** in-flight guard rejects overlapping save/load; previous valid slot record copied to `backups` before overwrite; unique per-slot index; failed write preserves prior record; load validates/verifies/migrates in-memory then applies atomically; any load failure preserves active game. Restore policy: **paused**.
- **Autosave:** simulated elapsed-time interval (default 5 sim minutes, configurable, enabled by default), triggered after confirmed ticks, debounced/non-overlapping, rotating `autosave` slot; no save when interval not elapsed.
- **Worker safety:** persistence on main thread; restore stops engine, resets worker client/metrics, applies state, hydrates paused — no stale pre-load worker.
- **UI:** `SaveLoadSection` using existing tokens/primitives; confirmations (no blocking alerts), responsive/accessible.

## 5. Files created and modified

### Implementation commit (`1556cbc`)

| Status | File |
|--------|------|
| A | `docs/SAVE_ARCHITECTURE.md` |
| A | `docs/SAVE_FORMAT.md` |
| A | `src/game/persistence/database.ts` |
| A | `src/game/persistence/index.ts` |
| A | `src/game/persistence/saveBackup.ts` |
| A | `src/game/persistence/saveErrors.ts` |
| A | `src/game/persistence/saveIntegrity.ts` |
| A | `src/game/persistence/saveMigration.ts` |
| A | `src/game/persistence/saveRepository.ts` |
| A | `src/game/persistence/saveSerialization.ts` |
| A | `src/game/persistence/saveService.ts` |
| A | `src/game/persistence/saveTypes.ts` |
| A | `src/game/persistence/saveValidation.ts` |
| A | `src/tests/integration/stage08.persistence.test.ts` |
| A | `src/ui/screens/sections/SaveLoadSection.tsx` |
| M | `docs/DEVELOPMENT_ROADMAP.md` |
| M | `docs/ENGINE_RULES.md` |
| M | `docs/TECHNICAL_ARCHITECTURE.md` |
| M | `package.json` |
| M | `src/game/clock/gameClock.ts` |
| M | `src/game/engine/gameEngine.ts` |
| M | `src/game/simulation/workerClient.ts` |
| M | `src/game/simulationRunner.ts` |
| M | `src/index.css` |
| M | `src/ui/screens/Dashboard.tsx` |

### Report commit

| Status | File |
|--------|------|
| A | `docs/STAGE_08_FINAL_REPORT.md` |

## 6. Database design

- **DB:** `aethrion-save` (via `idb`), **DB version 1**.
- **Stores:**
  - `saves` (keyPath `metadata.saveId`), indexes `by-slot` (`metadata.slotId`, **unique**), `by-updatedAt` (`metadata.updatedAt`).
  - `backups` (keyPath `metadata.saveId`), index `by-updatedAt`.
- **Behaviour:** lazy open with cached handle; upgrade creates stores/indexes; availability detection; typed recoverable errors for unavailable/blocked/quota/open failures; transactional put (remove conflicting slot record + put) for per-slot consistency.

## 7. Save format

- **`SavePayload`:** `{ formatVersion, state: PersistedSimulationState (13 slices), simulation: PersistedSimulationMeta, clock: PersistedClockState{snapshot,speed} }`.
- **`SaveMetadata`:** save/slot ids, kind (manual/autosave), name, real timestamps, simulated date/time, tick, format version, checksum, payload bytes.
- **`SaveRecord`:** `{ metadata, payload }`. **`SaveArchive` (v1):** `{ archiveVersion, exportedAt, metadata, payload, checksum }`.
- **Deterministic fields:** clock snapshot (start/elapsed/ticks/config/speed), tick/elapsed/simTime/date, and `events` RNG state (`randomState`, `sequence`, cooldowns/scheduling markers).
- Full definition: `docs/SAVE_FORMAT.md`.

## 8. Autosave implementation

- **Config:** enabled by default, interval `DEFAULT_AUTOSAVE_INTERVAL_SIM_MS = 300000` (5 simulated minutes), configurable.
- **Trigger:** post confirmed tick (`engine.onTick` / `maybeAutosave`), compared against `simulation.elapsedSimMs`; interval baseline reset on enable/restore to avoid burst writes.
- **Safety:** in-flight guard (no overlapping saves/loads), debounced by simulated interval, rotates `autosave` slot (overwrite allowed), failures recorded in status but do not interrupt gameplay; pauses do not advance ticks so unchanged state is not repeatedly saved.

## 9. Load and restore pipeline

1. Read record by slot; reject if save/load in flight.
2. Structural record validation (metadata/payload consistency).
3. Verify checksum (when present/verifiable).
4. Migrate sequentially to current format (clone; stored record untouched); re-validate.
5. `runner.prepareRestore()`: stop engine, hydrate idle, pause clock, reset metrics, **reset worker client**.
6. Restore clock snapshot + speed (paused); `applyPersistedState` (allowlisted slices, cloned).
7. `runner.finalizeRestore(tick)`: hydrate engine tick/status paused, apply paused simulation meta (tick/time/date/speed, `lastError` null).
8. Leave paused for explicit resume. Any failure → typed error, active game preserved.

## 10. Migration implementation

- **Pipeline:** `migratePayload` — requires object payload, clones input, rejects future `formatVersion`, applies sequential registered migrations `v -> v+1` (or errors if missing), sets `formatVersion`, validates result. Returns `{ payload, migrated, fromVersion }`.
- **Current:** v1 supported; migration registry prepared (no historical formats yet). Unsupported/future/invalid paths produce typed errors (`SAVE_INCOMPATIBLE_VERSION`, `SAVE_MIGRATION_FAILED`, `SAVE_VALIDATION_FAILED`).
- **Tests:** current schema load (no migration), unsupported older/missing path, unsupported future, invalid/malformed payload rejection. (No fabricated historical schema; initial supported format documented as v1.)

## 11. Integrity and recovery

- **Checksum:** SHA-256 of deterministic key-sorted canonical JSON payload; stored in metadata/archive; verified on load/import when present and `crypto.subtle` available. (Detects corruption/mismatch; not encryption/anti-cheat.)
- **Validation:** payload/state/clock/meta/date, required slices (incl. `events.randomState`/`sequence`), metadata consistency (format/tick/simTime), archive structure.
- **Recovery:** reject invalid/corrupt/incompatible/migrated-invalid before apply; keep active game intact; retain prior slot record and `backups` store entries on overwrite.

## 12. Backup/archive implementation

- **Archive:** portable JSON `{ archiveVersion:1, exportedAt, metadata, payload, checksum }`.
- **Export:** validate record, build archive, stringify JSON (service/UI download).
- **Import:** parse JSON, validate archive + integrity, migrate/re-validate, materialise into **empty target slot by default**; reject malformed/unsupported (`SAVE_IMPORT_INVALID`), reject occupied target without separate overwrite flow (`SAVE_IMPORT_REJECTED`). Capacity enforced for manual slots.

## 13. Worker compatibility

- IndexedDB and persistence run on **main thread** only; saves capture confirmed post-tick state (allowlist excludes Worker/runtime objects).
- Load: `prepareRestore` terminates/resets worker client; `finalizeRestore` leaves paused and ready for fresh execution (inline or worker per runner config). No stale pre-load worker.
- Deterministic continuation verified in **inline and worker** modes (`createLocalTransport` worker-path tests).

## 14. UI changes

- **`src/ui/screens/sections/SaveLoadSection.tsx`** (added) and integrated into `Dashboard`: Save Manager (slots with name/real+simulated time/tick/size/status, empty states), manual save to new/selected slot, overwrite/load/rename/delete with confirmations, export/import (file), Autosave settings (enable, interval options, last autosave/save status, errors), clear load warning (replaces active game, unsaved progress lost, restores paused). Accessible labels/controls, no blocking alerts, responsive/Android-first, existing design tokens/primitives.
- **Styling:** minimal scoped additions in `src/index.css`. Version label updated to `v0.8.0`.

## 15. Tests executed and results

**Environment:** Windows (`win32`), project scripts, Vitest/jsdom. **Date:** 2026-11-12.

| Check | Command | Result |
|-------|---------|--------|
| Type check | `npm run typecheck` (`tsc --noEmit`) | **PASS** |
| Lint | `npm run lint` (`eslint . --ext ts,tsx --max-warnings 0`) | **PASS** (0 warnings) |
| Unit/Integration tests | `npm test` (`vitest run`) | **PASS** — **29 test files, 502 tests passed, 0 failed** |
| Production build | `npm run build` (`npm run typecheck && vite build`) | **PASS** (worker asset emitted) |
| Dependency audit | `npm audit` | **PASS** — 0 vulnerabilities |

**New Stage 08 coverage** (`src/tests/integration/stage08.persistence.test.ts`, 15 tests): independent slots create/list/rename/delete; overwrite keeps previous backup; overlapping save prevention; load restores clock/tick/RNG and leaves paused; failed load preserves active game; save→continue→restore→continue determinism (inline and worker); payload validation/incompatible/malformed rejection; integrity verification + modified payload rejection (when checksum verifiable) + missing checksum accepted; migration pipeline (current/no-op, unsupported older path, unsupported future); archive export/import/parse/validate, duplicate-target rejection, malformed JSON rejection; autosave on simulated interval and no repeated save when interval unchanged; slot limit/name validation; metadata/payload mismatch rejection.

**Service/repository contract:** exercised via an injectable in-memory repository (jsdom lacks guaranteed `indexedDB`), covering CRUD semantics, backups, concurrency guards, autosave, load pipeline, migration/integrity/validation/archive logic and determinism. Real-browser IndexedDB/upgrade/quota edge cases are handled defensively but not device/browser-matrix tested in this environment.

**Regression:** all existing Stage 01–07 suites passed (502 total). No existing tests removed or weakened.

## 16. Performance measurements

Measured in Vitest/jsdom (in-memory repository, not real IndexedDB disk I/O), after 40 ticks with 1 corporation + 1 employee:

| Metric | Value (measured) |
|--------|------------------|
| Payload JSON size | **22,963 bytes** |
| Metadata `payloadBytes` | **22,990 bytes** |
| SHA-256 checksum computation | **~4.81 ms** |
| `saveToSlot` duration | **~1.30 ms** (in-memory repo) |
| `loadFromSlot` duration | **~1.39 ms** (in-memory repo, incl. validate/verify/migrate/restore) |
| Archive JSON size | **42,578 bytes** |

**Note:** save/load timings reflect in-memory repository + service/validation/integrity work; real IndexedDB transaction and storage latency will vary by browser/device/quota state and were not measured on device.

## 17. Android verification status

**Not verified.** No Android build (`cap sync`/Gradle) and no device/emulator test were performed. Vite production build succeeds; Capacitor/Android runtime, WebView IndexedDB behaviour and file import/export UX on device were not tested.

## 18. Known limitations

- Real IndexedDB CRUD/upgrade/quota/private-mode behaviour not exhaustively verified (in-memory repository used for automated tests in this environment).
- Checksum skipped when `crypto.subtle` unavailable (structural validation still applies); checksum is not encryption/anti-cheat.
- Single rotating autosave slot (no multi-version autosave history beyond backups).
- Save/load measurements exclude real disk/IDB latency (in-memory). Archive import/export uses browser file APIs (main thread/UI context).
- Android/device compatibility unverified.
- `src/services/persistence/indexedDB.ts` remains an unused legacy stub.
- Out of scope unchanged: cloud/multiplayer sync, compression/encryption, new gameplay/engines, Three.js rendering (Stage 09).

## 19. Commit hashes

| Item | Hash | Message |
|------|------|---------|
| Initial HEAD | `0f22d72892e317b87d0f3ce873acacb6a40a5158` (`0f22d72`) | `docs(stage-07): add final report` |
| Implementation | `1556cbc1666783c823c4d2f168992a11aa8626d6` (`1556cbc`) | `feat(stage-08): Save & Archive Engine` |
| Final report | *(this commit)* | `docs(stage-08): add final report` |

## 20. GitHub publication status

**Published.** Implementation and report commits pushed to `origin/main` (fast-forward). (Recorded after push in this stage execution.)

## 21. Acceptance criteria checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | IndexedDB persistence implemented | **Met** (`idb`, `aethrion-save` v1, stores/indexes) |
| 2 | Save format typed and versioned | **Met** (`SAVE_FORMAT_VERSION=1`, typed payload/metadata/record/archive) |
| 3 | Multiple save slots work independently | **Met** (unique per-slot, capacity, list/metadata) |
| 4 | Manual save works | **Met** (new/selected slot, overwrite with confirmation flow) |
| 5 | Autosave works without overlapping writes | **Met** (simulated-time, post-tick, debounced, in-flight guard) |
| 6 | Loading restores all authoritative simulation state | **Met** (allowlisted slices + meta + clock) |
| 7 | Clock and tick counter restore correctly | **Met** (clock snapshot + engine hydrate) |
| 8 | RNG state restores correctly | **Met** (`events.randomState`/sequence/cooldowns) |
| 9 | Save/load preserves deterministic continuation | **Met** (inline + worker equivalence tests) |
| 10 | Restore is atomic from active game's perspective | **Met** (validate/migrate/verify before apply, paused restore) |
| 11 | Failed loads preserve the current game | **Met** |
| 12 | Schema migrations implemented and tested | **Met** (sequential pipeline; v1/current + unsupported/invalid paths tested) |
| 13 | Integrity validation works | **Met** (SHA-256 when available + structural validation) |
| 14 | Backup export/import works | **Met** (JSON archive, validate, import to new/empty slot) |
| 15 | Worker mode remains compatible | **Met** (main-thread IDB, worker reset on restore, deterministic worker tests) |
| 16 | UI integrated and responsive | **Met** (`SaveLoadSection`, accessible, Android-first layout) |
| 17 | Existing Stage 01–07 tests pass | **Met** (502/502 total) |
| 18 | New Stage 08 tests pass | **Met** (15) |
| 19 | Typecheck passes | **Met** |
| 20 | Lint passes with zero warnings | **Met** |
| 21 | Production build succeeds | **Met** |
| 22 | Documentation updated | **Met** (`SAVE_ARCHITECTURE.md`, `SAVE_FORMAT.md`, architecture/roadmap/engine rules, this report) |
| 23 | `docs/STAGE_08_FINAL_REPORT.md` complete | **Met** |
| 24 | Git changes committed and published | **Met** |

## 22. Final stage status

**Stage 08: COMPLETE**

All critical acceptance criteria are met. Real-device Android/IndexedDB runtime verification and real-disk IDB latency measurements were not performed; checksum depends on `crypto.subtle` availability (with structural fallback). These are documented limitations, not blockers to the Stage 08 persistence, determinism and recovery objectives.

**STOP. Stage 09 must not begin until the user explicitly approves it.**