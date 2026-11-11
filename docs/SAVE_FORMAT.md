# AETHRION — Save Format

**Project:** AETHRION  
**Stage:** 08 — Save & Archive Engine  
**Current save format version:** `1` (`SAVE_FORMAT_VERSION`)

This document defines the versioned, typed, serialisable format used for save records and portable archives.

## 1. Versioning

| Concept | Value / meaning |
|---------|------------------|
| Save format version | `payload.formatVersion` (and `metadata.formatVersion`), currently **1**. Governs migrations. |
| IndexedDB database version | `SAVE_DB_VERSION` = **1** (`aethrion-save`). Governs object stores/indexes. |
| Application version | `package.json` version (e.g. `0.8.0`). Informational; not used to accept/reject payloads. |

- `formatVersion > SAVE_FORMAT_VERSION` → **incompatible (future)**, rejected.
- `formatVersion < SAVE_FORMAT_VERSION` → migrated sequentially if a path exists, else rejected.
- Metadata and payload `formatVersion`, `tick`, and `simulatedTimeMs` must be consistent.

## 2. Persisted payload (`SavePayload`)

```ts
interface SavePayload {
  formatVersion: number;                 // 1
  state: PersistedSimulationState;       // authoritative simulation slices (allowlist)
  simulation: PersistedSimulationMeta;   // tick/time/date/speed (+ stored status/lastError)
  clock: PersistedClockState;            // { snapshot: GameClockSnapshot, speed }
}
```

### `PersistedSimulationState` (allowlist)

```ts
interface PersistedSimulationState {
  empire: EmpireState;
  world: WorldState;
  economy: EconomyState;
  corporation: CorporationState;
  employees: EmployeeState;
  technology: TechnologyState;
  products: ProductState;
  resources: ResourceState;
  production: ProductionState;
  market: MarketState;
  city: CityState;
  events: EventsState;        // includes deterministic RNG/scheduler state
  competitors: CompetitorsState;
}
```

Excluded (never persisted): `performance`, Worker/transport/engine/scheduler runtime, React/UI/transient objects.

### Clock snapshot

```ts
interface GameClockSnapshot {
  config: {
    startDateMs: number;
    tickDurationMs: number;
    baseSimMsPerTick: number;
    speedMultiplier: number;
    paused: boolean;
  };
  elapsedSimMs: number;
  ticks: number;
}
```

Restoring the snapshot continues from the saved **simulated** time; the wall clock is never used.

### Simulation meta

```ts
interface PersistedSimulationMeta {
  status: SimulationStatus;   // stored; normalised to paused on restore
  tick: number;
  simTimeMs: number;
  elapsedSimMs: number;
  date: GameDate;             // { year, month(1-12), day, hour, minute, second } UTC-derived
  speed: number;
  lastError: string | null;   // cleared on restore
}
```

## 3. Metadata (`SaveMetadata`)

Lightweight, readable without loading full payload for listing:

```ts
interface SaveMetadata {
  saveId: string;             // unique record id
  slotId: string;             // e.g. "slot-1".."slot-N", "autosave"
  kind: 'manual' | 'autosave';
  name: string;
  createdAt: number;          // real timestamp (ms)
  updatedAt: number;          // real timestamp (ms)
  simulatedDate: GameDate;
  simulatedTimeMs: number;
  tick: number;
  formatVersion: number;
  checksum: string | null;    // SHA-256 hex of canonical payload, or null
  payloadBytes: number;       // approximate size
}
```

## 4. Record (`SaveRecord`)

Stored in IndexedDB `saves` / `backups`:

```ts
interface SaveRecord {
  metadata: SaveMetadata;
  payload: SavePayload;
}
```

Indexes: `by-slot` (unique, `metadata.slotId`), `by-updatedAt` (`metadata.updatedAt`).

## 5. Portable archive (`SaveArchive`)

```ts
interface SaveArchive {
  archiveVersion: 1;
  exportedAt: number;
  metadata: SaveMetadata;
  payload: SavePayload;
  checksum: string | null;
}
```

- Export: JSON (`stringifyArchive`) of a validated record.
- Import: `parseArchive` → validate structure → verify integrity → migrate if needed → re-validate → materialise into a target (empty) slot. Malformed/unsupported/corrupt archives are rejected.

## 6. Integrity

- **Algorithm:** SHA-256 over a deterministic, recursively key-sorted canonical JSON string of the payload (`stableStringify`).
- **Scope:** detects accidental corruption and payload/metadata tampering or mismatch on load/import when verifiable. Does **not** provide encryption or anti-cheat protection.
- **Availability:** if `crypto.subtle` is unavailable, checksum computation/verification is skipped and structural validation remains authoritative.

## 7. Validation rules (summary)

- Payload/metadata/record/archive must be structurally correct objects with required fields and valid types/ranges.
- All 13 authoritative state slices present; `events.randomState` (number) and `events.sequence` (integer) required for determinism.
- Tick/elapsed/simTime/speed finite and sensible; game date components valid; clock snapshot config/elapsed/ticks valid.
- Record consistency: metadata vs payload `formatVersion`, `tick`, `simulatedTimeMs` must match.
- Future format versions rejected; older versions migrated sequentially or rejected if no path.

## 8. Determinism

Deterministic continuation requires restoring: the full authoritative slices (including `events` RNG state), the clock snapshot (simulated time/ticks/config) and the simulation tick/elapsed time. Restores do not read the wall clock and do not regenerate seeds. Verified by save → continue → restore → continue equivalence tests in inline and worker modes.