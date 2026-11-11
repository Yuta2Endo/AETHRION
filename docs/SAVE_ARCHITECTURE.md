# AETHRION — Save & Archive Architecture

**Project:** AETHRION  
**Stage:** 08 — Save & Archive Engine

This document describes the persistence subsystem: its responsibilities, data flow, autosave behaviour, load/restore pipeline, recovery, and integration with the simulation and the Web Worker architecture.

## 1. Goals and boundaries

- Persist **authoritative, serialisable simulation state** so a player can save, load and continue deterministically.
- Keep persistence **independent from React components and simulation rules**. The UI calls a typed service boundary; the service orchestrates validation, migration, integrity and storage.
- Preserve the **last confirmed, consistent** simulation state. A failed save never corrupts the previous valid record; a failed load never mutates the active game.
- Remain compatible with **inline and Worker** execution (Stage 07): IndexedDB access stays on the main thread and restores never leave a stale Worker operating on pre-load state.

Out of scope: cloud saves, multiplayer sync, encryption/anti-cheat, compression, Three.js rendering, new gameplay systems.

## 2. Module structure

`src/game/persistence/`

| Module | Responsibility |
|--------|----------------|
| `saveTypes.ts` | Versioned types: payload, metadata, record, archive, slot/status/config |
| `saveErrors.ts` | Typed, recoverable persistence errors (`SaveError`, `SaveErrorCode`) |
| `saveValidation.ts` | Structural validation before save, after migration and before load/apply |
| `saveSerialization.ts` | Explicit allowlist capture of authoritative state and clock; apply to store |
| `saveIntegrity.ts` | SHA-256 checksum (when `crypto.subtle` available), stable stringify, size measurement |
| `saveMigration.ts` | Sequential, typed migration pipeline with pre/post validation |
| `database.ts` | IndexedDB open/upgrade/availability via `idb`, schema and stores |
| `saveRepository.ts` | Low-level CRUD, slot listing, backup storage (transactional writes) |
| `saveBackup.ts` | Portable JSON archive export/import/parse/stringify |
| `saveService.ts` | Orchestration: save, load, rename, delete, export/import, autosave, concurrency control, status |
| `index.ts` | Public API and the application-wide `saveService` bound to the singleton runner |

`src/services/persistence/indexedDB.ts` remains as a legacy Stage 01 stub and is not used by the Stage 08 engine.

## 3. Database design

- **Library:** `idb` (existing dependency).
- **Database:** `aethrion-save`, version **1**.
- **Stores:**
  - `saves` (keyPath `metadata.saveId`)
    - index `by-slot` on `metadata.slotId` (**unique**) — enforces one record per slot
    - index `by-updatedAt` on `metadata.updatedAt` — lightweight metadata listing
  - `backups` (keyPath `metadata.saveId`)
    - index `by-updatedAt` on `metadata.updatedAt` — previous valid records kept recoverable

Availability is detected (`indexedDB` presence) and failures/quota issues are surfaced as typed, recoverable errors; the game remains playable without persistence.

## 4. Persisted state (explicit allowlist)

Persisted (`PersistedSimulationState`): `empire`, `world`, `economy`, `corporation`, `employees`, `technology`, `products`, `resources`, `production`, `market`, `city`, `events`, `competitors`.

Also persisted: `simulation` meta (tick, simTimeMs, elapsedSimMs, date, speed; status/lastError stored but normalised on restore) and `clock` snapshot (`GameClockSnapshot` + speed) including `startDateMs`, `elapsedSimMs`, `ticks`, config.

**Not persisted:** `performance` metrics, Worker/client/transport, engine/scheduler internals, tick/frame state, React/UI state, dialogs, notifications, subscriptions, callbacks, Promises, DOM objects. `status` is restored as **paused** and runtime `lastError` cleared.

`events` state carries the deterministic RNG/scheduler state (`randomState`, `sequence`, cooldowns/scheduling markers) required for reproducible continuation.

## 5. Save pipeline (manual and autosave)

1. **Concurrency gate:** reject if a save or load is in flight (`SAVE_WRITE_IN_PROGRESS`) — prevents overlapping writes and inconsistent records.
2. **Availability/DB check:** ensure storage is usable (typed errors on unavailable/quota/blocked/open failure).
3. **Slot policy:** validate name; for manual saves enforce configured slot capacity (default 10 manual slots, excluding autosave); optional overwrite confirmation handled by UI.
4. **Capture:** build payload from the current confirmed store state and clock snapshot (`buildSavePayload`), using an explicit allowlist and `structuredClone`.
5. **Validate:** structural payload validation before write.
6. **Integrity & metadata:** compute SHA-256 checksum (when available) and payload size; create metadata (ids, slot, kind, timestamps, simulated date/time, tick, format version).
7. **Atomicity (application perspective):** read existing slot record; write previous valid record to `backups`; write new record in a `readwrite` transaction that removes any other record sharing the slot (`by-slot`) then puts the new record. A failed write does not replace the previous valid record.
8. **Status:** update last save/autosave timestamps and clear errors on success.

Autosave is triggered after **confirmed simulation ticks** (`engine.onTick` / `maybeAutosave`), uses **simulated elapsed time** (`simulation.elapsedSimMs`) against a configurable interval (default 5 simulated minutes), writes to the rotating `autosave` slot, is debounced by interval tracking, and never overlaps (in-flight guard). It does not save when unchanged interval has not elapsed and failures do not interrupt gameplay.

## 6. Load and restore pipeline

1. **Concurrency gate:** reject if save/load in flight.
2. **Read & verify:** fetch record by slot; structural record validation (including metadata/payload consistency).
3. **Integrity:** verify checksum when present and verifiable.
4. **Migrate:** run sequential migrations to current format (original stored record never mutated); re-validate.
5. **Candidate ready:** build complete, validated payload without mutating the active game.
6. **Safe stop & worker sync:** `runner.prepareRestore()` — stop engine, hydrate to idle, pause clock, reset transient metrics, **reset worker client** (terminate/reinitialize) so no stale Worker operates on pre-load state.
7. **Atomic apply:** restore clock snapshot + speed (paused), apply authoritative persisted slices to the store, `runner.finalizeRestore(tick)` hydrates engine tick and sets simulation meta to **paused** with correct tick/time/date/speed and cleared runtime error.
8. **Resume policy:** restored game remains paused; the player resumes explicitly.

On **any failure** the active game state is preserved (no partial apply). Errors are typed and recoverable.

## 7. Migration strategy

- Separate **save format version** (`SAVE_FORMAT_VERSION`) from DB/app version.
- `migratePayload` clones input, applies sequential migrations from source version upward, sets `formatVersion` per step, and validates the result. Unsupported/future versions and missing migration paths throw typed errors; migration failures are reported without mutating the stored record.
- Current supported format: **v1**. No historical formats exist yet; the registry is prepared for future evolution and tests cover current/unsupported-future/invalid cases and the pipeline contract.

## 8. Integrity and recovery

- **Mechanism:** SHA-256 digest of a deterministic, key-sorted canonical JSON of the payload (via `crypto.subtle` when available). Stored in metadata and archives.
- **Protects against:** accidental corruption, incomplete/mismatched records, tampered payloads detected on load/import (when verifiable).
- **Does not provide:** encryption, confidentiality, authentication, or anti-cheat protection. No secrets/tokens/credentials are stored.
- **Recovery:** invalid/corrupt/incompatible/migration-failed loads are rejected before apply; previous valid slot record is retained and backups store overwritten records.

## 9. Backup and archive

- Portable JSON archive (`archiveVersion: 1`) containing metadata, payload, checksum and export timestamp.
- **Export:** from an existing slot (validated) to JSON.
- **Import:** parse + validate archive, verify integrity, migrate if needed, re-validate, then restore into a **new (empty) slot by default**. Import rejects malformed/unsupported archives and refuses to overwrite an occupied target slot (`SAVE_IMPORT_REJECTED`) — UI confirmation governs target selection.

## 10. Worker compatibility

- All IndexedDB access and persistence orchestration run on the **main thread**. The simulation Worker never performs persistence.
- Saves capture a **confirmed** snapshot (post-tick, authoritative store + clock). Worker/runtime objects are excluded by the allowlist.
- Load resets the worker client and leaves the game paused; the next execution (inline or worker, per runner configuration) uses fresh state. Deterministic continuation is verified in both inline and worker modes.

## 11. UI integration

`SaveLoadSection` (dashboard) provides: slot listing with metadata (name, real/simulated time, tick, size, empty state), manual save/new/overwrite (with confirmation), load (with explicit warning that active game is replaced, unsaved progress lost, restore paused), rename, delete (confirmation), export/import (validated, import into empty slot), and autosave settings (enable/interval, last status/timestamps, errors). Accessible labels/controls, keyboard focus, no blocking alerts, responsive/Android-first, using existing design tokens and primitives.

## 12. Known limitations

- Real IndexedDB CRUD/upgrade/quota behaviour depends on the host environment; automated tests exercise the service/repository contract via an in-memory repository and the validation/migration/integrity/determinism logic. Browser-level storage edge cases (private mode/quota policies) are handled defensively but not exhaustively device-tested.
- Checksum verification is skipped when `crypto.subtle` is unavailable (structural validation still applies).
- A rotating single autosave slot is provided (bounded history beyond backups is not implemented).
- Android/device verification was not performed in this stage.

See `docs/SAVE_FORMAT.md` for the format details.