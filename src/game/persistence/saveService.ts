/**
 * Save service �?" orchestrates save, load, migration, integrity and recovery.
 *
 * The service is the single, typed boundary for persistence. It never mutates
 * the active game on a failed load and it never leaves a partially valid save
 * from the application's perspective.
 */

import type { SimulationRunner } from '@/game/simulationRunner';
import type { GameEngine } from '@/game/engine/gameEngine';
import { useGameStore } from '@/game/state/gameStore';
import { SaveError, asSaveError } from './saveErrors';
import { getDatabase, isDatabaseAvailable } from './database';
import { createRepository, type SaveRepository } from './saveRepository';
import { applyPersistedState, buildSavePayload, normalizeAutosaveInterval } from './saveSerialization';
import { computeChecksum, measurePayloadSize, verifyChecksum } from './saveIntegrity';
import { migratePayload } from './saveMigration';
import { exportArchive, importArchive, parseArchive, stringifyArchive } from './saveBackup';
import { validatePayload, validateSaveRecord } from './saveValidation';
import {
  AUTOSAVE_SLOT_ID,
  DEFAULT_AUTOSAVE_INTERVAL_SIM_MS,
  DEFAULT_MAX_SAVE_SLOTS,
  type AutosaveConfig,
  type LoadOperationResult,
  type SaveArchive,
  type SaveMetadata,
  type SaveOperationResult,
  type SaveRecord,
  type SaveSlotInfo,
  type SaveStatus,
} from './saveTypes';

export interface SaveServiceOptions {
  runner: SimulationRunner;
  repository?: SaveRepository;
  maxSlots?: number;
  now?: () => number;
  autosave?: Partial<AutosaveConfig>;
}

function normalizeName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new SaveError('SAVE_INVALID_NAME', 'A save name is required.');
  }
  return trimmed.slice(0, 60);
}

function slotKind(slotId: string): 'manual' | 'autosave' {
  return slotId === AUTOSAVE_SLOT_ID ? 'autosave' : 'manual';
}

export class SaveService {
  private readonly runner: SimulationRunner;
  private readonly repository: SaveRepository;
  private readonly maxSlots: number;
  private readonly now: () => number;

  private saveInFlight: Promise<unknown> | null = null;
  private loadInFlight = false;

  private autosaveConfig: AutosaveConfig;
  private lastAutosaveElapsedSimMs: number | null = null;

  private status: SaveStatus = {
    available: isDatabaseAvailable(),
    saving: false,
    loading: false,
    lastSaveAt: null,
    lastSaveSlotId: null,
    lastError: null,
    lastAutosaveAt: null,
    lastAutosaveError: null,
  };

  private readonly requireDatabase: boolean;

  constructor(options: SaveServiceOptions) {
    this.runner = options.runner;
    this.repository = options.repository ?? createRepository();
    this.requireDatabase = options.repository === undefined;
    this.maxSlots = options.maxSlots ?? DEFAULT_MAX_SAVE_SLOTS;
    this.now = options.now ?? (() => Date.now());
    this.autosaveConfig = {
      enabled: options.autosave?.enabled ?? true,
      intervalSimMs: normalizeAutosaveInterval(
        options.autosave?.intervalSimMs ?? DEFAULT_AUTOSAVE_INTERVAL_SIM_MS,
      ),
    };

    if (!this.requireDatabase) {
      this.status = { ...this.status, available: true };
    }
  }

  getStatus(): SaveStatus {
    return { ...this.status };
  }

  getAutosaveConfig(): AutosaveConfig {
    return { ...this.autosaveConfig };
  }

  setAutosaveConfig(next: Partial<AutosaveConfig>): AutosaveConfig {
    this.autosaveConfig = {
      enabled: next.enabled ?? this.autosaveConfig.enabled,
      intervalSimMs: normalizeAutosaveInterval(next.intervalSimMs ?? this.autosaveConfig.intervalSimMs),
    };
    return this.getAutosaveConfig();
  }

  async listSlots(): Promise<SaveSlotInfo[]> {
    await this.ensureAvailable();
    const records = await this.repository.list();
    const bySlot = new Map(records.map((record) => [record.slotId, record]));

    const slots: SaveSlotInfo[] = [];
    // Manual slots are numbered slot-1..slot-N for the UI; existing records of
    // any other manual id are also exposed.
    for (let i = 1; i <= this.maxSlots; i += 1) {
      const slotId = `slot-${i}`;
      slots.push({ slotId, kind: 'manual', record: bySlot.get(slotId) ?? null });
      bySlot.delete(slotId);
    }

    for (const [slotId, record] of bySlot.entries()) {
      if (slotId === AUTOSAVE_SLOT_ID) continue;
      slots.push({ slotId, kind: 'manual', record });
    }

    slots.push({ slotId: AUTOSAVE_SLOT_ID, kind: 'autosave', record: bySlot.get(AUTOSAVE_SLOT_ID) ?? null });
    return slots;
  }

  async listMetadata(): Promise<SaveMetadata[]> {
    await this.ensureAvailable();
    return this.repository.list();
  }

  /**
   * Saves the current confirmed game state to a slot.
   *
   * Concurrent save requests are rejected explicitly to prevent inconsistent
   * records.
   */
  async saveToSlot(
    slotId: string,
    name: string,
    options: { allowOverwrite?: boolean } = {},
  ): Promise<SaveOperationResult> {
    if (this.saveInFlight || this.loadInFlight) {
      throw new SaveError('SAVE_WRITE_IN_PROGRESS', 'Another save or load operation is in progress.');
    }

    const operation = this.performSave(slotId, name, options);
    this.saveInFlight = operation;
    try {
      return await operation;
    } finally {
      this.saveInFlight = null;
    }
  }

  private async performSave(
    slotId: string,
    name: string,
    options: { allowOverwrite?: boolean },
  ): Promise<SaveOperationResult> {
    await this.ensureAvailable();
    const started = this.now();
    const normalizedName = normalizeName(name);
    const kind = slotKind(slotId);

    this.status = { ...this.status, saving: true, lastError: null };

    try {
      const existing = await this.repository.getBySlot(slotId);

      if (existing && options.allowOverwrite === false) {
        throw new SaveError('SAVE_WRITE_FAILED', 'The slot already contains a save.');
      }

      if (!existing && kind === 'manual') {
        const records = await this.repository.list();
        const manualCount = records.filter((record) => record.kind === 'manual' && record.slotId !== slotId).length;
        if (manualCount >= this.maxSlots) {
          throw new SaveError('SAVE_SLOT_LIMIT_REACHED', `The maximum of ${this.maxSlots} save slots has been reached.`);
        }
      }

      const payload = buildSavePayload(this.runner.getClock());
      validatePayload(payload);

      const checksum = await computeChecksum(payload);
      const now = this.now();
      const metadata: SaveMetadata = {
        saveId: `save_${slotId}_${now}`,
        slotId,
        kind,
        name: normalizedName,
        createdAt: existing?.metadata.createdAt ?? now,
        updatedAt: now,
        simulatedDate: structuredClone(payload.simulation.date),
        simulatedTimeMs: payload.simulation.simTimeMs,
        tick: payload.simulation.tick,
        formatVersion: payload.formatVersion,
        checksum,
        payloadBytes: measurePayloadSize(payload),
      };

      const record: SaveRecord = { metadata, payload };
      validateSaveRecord(record);

      // Keep the previous valid record recoverable by writing a backup copy
      // before replacing the slot.
      if (existing) {
        await this.repository.putBackup(existing);
      }

      await this.repository.put(record);

      this.status = {
        ...this.status,
        saving: false,
        lastSaveAt: now,
        lastSaveSlotId: slotId,
        lastError: null,
        lastAutosaveAt: kind === 'autosave' ? now : this.status.lastAutosaveAt,
        lastAutosaveError: kind === 'autosave' ? null : this.status.lastAutosaveError,
      };

      return { metadata, durationMs: Math.max(0, this.now() - started) };
    } catch (error) {
      const saveError = asSaveError(error, 'SAVE_WRITE_FAILED', 'The game could not be saved.');
      this.status = {
        ...this.status,
        saving: false,
        lastError: saveError.message,
        lastAutosaveError: slotKind(slotId) === 'autosave' ? saveError.message : this.status.lastAutosaveError,
      };
      throw saveError;
    }
  }

  /**
   * Loads a save into the active game.
   *
   * The current game is preserved on any failure. The restored game is left
   * paused.
   */
  async loadFromSlot(slotId: string): Promise<LoadOperationResult> {
    if (this.saveInFlight || this.loadInFlight) {
      throw new SaveError('SAVE_WRITE_IN_PROGRESS', 'Another save or load operation is in progress.');
    }

    this.loadInFlight = true;
    this.status = { ...this.status, loading: true, lastError: null };
    const started = this.now();

    try {
      await this.ensureAvailable();
      const record = await this.repository.getBySlot(slotId);
      if (!record) {
        throw new SaveError('SAVE_NOT_FOUND', 'The selected save could not be found.');
      }

      const result = await this.prepareRecordForLoad(record, started);

      // Safe restore: stop, reset transient runtime/worker, then apply atomically.
      this.runner.prepareRestore();
      this.runner.getClock().restore(result.payload.clock.snapshot);
      this.runner.getClock().setSpeed(result.payload.clock.speed);
      this.runner.getClock().pause();
      applyPersistedState(result.payload);
      this.runner.finalizeRestore(result.payload.simulation.tick);

      this.lastAutosaveElapsedSimMs = result.payload.simulation.elapsedSimMs;

      this.status = { ...this.status, loading: false, lastError: null };
      return result;
    } catch (error) {
      const saveError = asSaveError(error, 'SAVE_LOAD_FAILED', 'The save could not be loaded.');
      this.status = { ...this.status, loading: false, lastError: saveError.message };
      throw saveError;
    } finally {
      this.loadInFlight = false;
    }
  }

  private async prepareRecordForLoad(record: SaveRecord, started: number): Promise<LoadOperationResult> {
    validateSaveRecord(record);
    await verifyChecksum(record.payload, record.metadata.checksum);

    const migration = migratePayload(record.payload);
    const payload = migration.payload;

    // Validate the migrated payload again — never apply an invalid state.
    validatePayload(payload);

    return {
      metadata: record.metadata,
      payload,
      migrated: migration.migrated,
      durationMs: Math.max(0, this.now() - started),
    };
  }

  async renameSlot(slotId: string, name: string): Promise<SaveMetadata> {
    await this.ensureAvailable();
    const normalizedName = normalizeName(name);
    const record = await this.repository.getBySlot(slotId);
    if (!record) throw new SaveError('SAVE_NOT_FOUND', 'The selected save could not be found.');

    const updated: SaveRecord = {
      ...record,
      metadata: { ...record.metadata, name: normalizedName, updatedAt: this.now() },
    };
    validateSaveRecord(updated);
    await this.repository.put(updated);
    return updated.metadata;
  }

  async deleteSlot(slotId: string): Promise<boolean> {
    await this.ensureAvailable();
    if (this.saveInFlight || this.loadInFlight) {
      throw new SaveError('SAVE_WRITE_IN_PROGRESS', 'Another save or load operation is in progress.');
    }
    const deleted = await this.repository.delete(slotId);
    return deleted;
  }

  /**
   * Attempts an autosave when the configured simulated interval has elapsed.
   *
   * The save runs only after a confirmed tick and never overlaps with another
   * save/load operation.
   */
  async maybeAutosave(): Promise<SaveOperationResult | null> {
    if (!this.autosaveConfig.enabled) return null;
    if (this.saveInFlight || this.loadInFlight) return null;

    const meta = useGameStore.getState().simulation;
    if (meta.tick <= 0) return null;

    const elapsed = meta.elapsedSimMs;
    if (this.lastAutosaveElapsedSimMs === null) {
      this.lastAutosaveElapsedSimMs = elapsed;
      return null;
    }

    if (elapsed - this.lastAutosaveElapsedSimMs < this.autosaveConfig.intervalSimMs) {
      return null;
    }

    try {
      const result = await this.saveToSlot(AUTOSAVE_SLOT_ID, 'Autosave', { allowOverwrite: true });
      this.lastAutosaveElapsedSimMs = elapsed;
      return result;
    } catch (error) {
      // Autosave failure must not interrupt the game.
      const saveError = asSaveError(error, 'SAVE_WRITE_FAILED', 'Autosave failed.');
      this.status = { ...this.status, lastAutosaveError: saveError.message };
      return null;
    }
  }

  resetAutosaveTimer(): void {
    this.lastAutosaveElapsedSimMs = useGameStore.getState().simulation.elapsedSimMs;
  }

  /**
   * Subscribes to confirmed ticks so autosave runs only after a completed tick.
   */
  attachToEngine(engine: GameEngine): () => void {
    return engine.onTick(() => {
      void this.maybeAutosave();
    });
  }

  async exportSlot(slotId: string): Promise<SaveArchive> {
    await this.ensureAvailable();
    const record = await this.repository.getBySlot(slotId);
    if (!record) throw new SaveError('SAVE_NOT_FOUND', 'The selected save could not be found.');
    validateSaveRecord(record);
    return exportArchive(record);
  }

  async exportSlotAsJson(slotId: string): Promise<string> {
    const archive = await this.exportSlot(slotId);
    return stringifyArchive(archive);
  }

  /**
   * Imports an archive into a new slot (never overwrites by default).
   */
  async importToSlot(
    archiveInput: unknown,
    slotId: string,
    name: string,
  ): Promise<SaveOperationResult> {
    await this.ensureAvailable();

    const existing = await this.repository.getBySlot(slotId);
    if (existing) {
      throw new SaveError('SAVE_IMPORT_REJECTED', 'The target slot already contains a save.');
    }

    const kind = slotKind(slotId);
    if (kind === 'manual') {
      const records = await this.repository.list();
      const manualCount = records.filter((record) => record.kind === 'manual').length;
      if (manualCount >= this.maxSlots) {
        throw new SaveError('SAVE_SLOT_LIMIT_REACHED', `The maximum of ${this.maxSlots} save slots has been reached.`);
      }
    }

    const started = this.now();
    const normalized = normalizeName(name);
    const record = await importArchive(archiveInput, { slotId, name: normalized, kind });
    validateSaveRecord(record);
    await this.repository.put(record);

    return { metadata: record.metadata, durationMs: Math.max(0, this.now() - started) };
  }

  importFromJson(text: string, slotId: string, name: string): Promise<SaveOperationResult> {
    const archive = parseArchive(text);
    return this.importToSlot(archive, slotId, name);
  }

  private async ensureAvailable(): Promise<void> {
    if (!this.requireDatabase) {
      this.status = { ...this.status, available: true };
      return;
    }

    if (!isDatabaseAvailable()) {
      this.status = { ...this.status, available: false };
      throw new SaveError('SAVE_DB_UNAVAILABLE', 'IndexedDB is not available in this environment.');
    }
    // Touch the database so a blocked/unavailable state is surfaced early.
    await getDatabase();
    this.status = { ...this.status, available: true };
  }
}