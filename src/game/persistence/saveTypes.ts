/**
 * Save & Archive Engine �?" types.
 *
 * The save format is **versioned**, **typed** and **structured-clone-safe**.
 * Only authoritative, serialisable simulation data is persisted; UI state,
 * runtime objects and the Worker are never part of a save.
 */

import type { SimulationStatus } from '@/core/types';
import type { GameClockSnapshot, GameDate } from '@/game/clock/gameClock';
import type { CityState } from '@/simulation/city';
import type { CompetitorsState } from '@/simulation/competitors';
import type { CorporationState } from '@/simulation/corporation';
import type { EconomyState } from '@/simulation/economy';
import type { EmployeeState } from '@/simulation/employees';
import type { EventsState } from '@/simulation/events';
import type { MarketState } from '@/simulation/market';
import type { ProductState } from '@/simulation/products';
import type { ProductionState } from '@/simulation/production';
import type { ResourceState } from '@/simulation/resources';
import type { TechnologyState } from '@/simulation/technology';
import type { WorldState } from '@/simulation/world';
import type { EmpireState } from '@/game/state/gameStore';

/** The current save format version. */
export const SAVE_FORMAT_VERSION = 1;

/** The default maximum number of save slots (configurable). */
export const DEFAULT_MAX_SAVE_SLOTS = 10;

/** The identifier of the rotating autosave slot. */
export const AUTOSAVE_SLOT_ID = 'autosave';

/** The default autosave interval, in simulated milliseconds (5 simulated minutes). */
export const DEFAULT_AUTOSAVE_INTERVAL_SIM_MS = 5 * 60_000;

/** The kind of a save slot. */
export type SaveSlotKind = 'manual' | 'autosave';

/**
 * The authoritative simulation slices that are persisted.
 *
 * This is the explicit allowlist �?" the save never serialises the whole
 * Zustand store. Transient slices (performance metrics) and runtime objects
 * (Worker, engine, scheduler, subscriptions) are excluded.
 */
export interface PersistedSimulationState {
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
  /** Includes the deterministic RNG state (randomState/sequence/cooldowns). */
  events: EventsState;
  competitors: CompetitorsState;
}

/**
 * The clock state required to continue the simulation deterministically.
 */
export interface PersistedClockState {
  snapshot: GameClockSnapshot;
  /** The speed multiplier that was active. */
  speed: number;
}

/**
 * The simulation meta that must survive a load.
 *
 * `status` and `lastError` are normalised on restore (the game resumes paused
 * and runtime errors are transient) �?" they are stored for information only.
 */
export interface PersistedSimulationMeta {
  status: SimulationStatus;
  tick: number;
  simTimeMs: number;
  elapsedSimMs: number;
  date: GameDate;
  speed: number;
  lastError: string | null;
}

/**
 * The complete, authoritative payload of a save.
 */
export interface SavePayload {
  formatVersion: number;
  state: PersistedSimulationState;
  simulation: PersistedSimulationMeta;
  clock: PersistedClockState;
}

/**
 * Metadata stored alongside a save, readable without loading the full payload.
 */
export interface SaveMetadata {
  saveId: string;
  slotId: string;
  kind: SaveSlotKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Simulated game date and time at the moment of the save. */
  simulatedDate: GameDate;
  simulatedTimeMs: number;
  tick: number;
  formatVersion: number;
  /** SHA-256 hex digest of the canonical payload, or null when unavailable. */
  checksum: string | null;
  /** Approximate payload size in bytes. */
  payloadBytes: number;
}

/**
 * A complete save record as stored in IndexedDB.
 */
export interface SaveRecord {
  metadata: SaveMetadata;
  payload: SavePayload;
}

/**
 * A lightweight description of a slot for the UI.
 */
export interface SaveSlotInfo {
  slotId: string;
  kind: SaveSlotKind;
  record: SaveMetadata | null;
}

/**
 * A portable archive that can be exported and imported.
 */
export interface SaveArchive {
  archiveVersion: 1;
  exportedAt: number;
  metadata: SaveMetadata;
  payload: SavePayload;
  checksum: string | null;
}

/**
 * The result of a successful save operation.
 */
export interface SaveOperationResult {
  metadata: SaveMetadata;
  durationMs: number;
}

/**
 * The result of a successful load operation.
 */
export interface LoadOperationResult {
  metadata: SaveMetadata;
  payload: SavePayload;
  migrated: boolean;
  durationMs: number;
}

/**
 * The observable status of the persistence subsystem.
 */
export interface SaveStatus {
  available: boolean;
  saving: boolean;
  loading: boolean;
  lastSaveAt: number | null;
  lastSaveSlotId: string | null;
  lastError: string | null;
  lastAutosaveAt: number | null;
  lastAutosaveError: string | null;
}

/**
 * Autosave configuration.
 */
export interface AutosaveConfig {
  enabled: boolean;
  /** Interval in simulated milliseconds. */
  intervalSimMs: number;
}