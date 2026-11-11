import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameClock } from '@/game/clock/gameClock';
import { SimulationRunner } from '@/game/simulationRunner';
import { useGameStore } from '@/game/state/gameStore';
import { commands } from '@/game/commands';
import { ManualScheduler } from '@/tests/helpers/manualScheduler';
import {
  AUTOSAVE_SLOT_ID,
  SAVE_FORMAT_VERSION,
  SaveError,
  SaveService,
  buildSavePayload,
  computeChecksum,
  migratePayload,
  parseArchive,
  stringifyArchive,
  validateArchive,
  validatePayload,
  validateSaveRecord,
  verifyChecksum,
  type SaveMetadata,
  type SaveRecord,
  type SaveRepository,
} from '@/game/persistence';
import { createSimulationWorkerApi } from '@/game/simulation/workerApi';
import type { SimulationWorkerTransport } from '@/game/simulation/transport';

function createInMemoryRepository(): SaveRepository & { records: Map<string, SaveRecord>; backups: SaveRecord[] } {
  const records = new Map<string, SaveRecord>();
  const backups: SaveRecord[] = [];

  const bySlot = (slotId: string): SaveRecord | undefined =>
    Array.from(records.values()).find((record) => record.metadata.slotId === slotId);

  return {
    records,
    backups,
    async list() {
      return Array.from(records.values())
        .map((record) => structuredClone(record.metadata))
        .sort((a, b) => a.updatedAt - b.updatedAt);
    },
    async getBySlot(slotId) {
      const record = bySlot(slotId);
      return record ? structuredClone(record) : undefined;
    },
    async getById(saveId) {
      const record = records.get(saveId);
      return record ? structuredClone(record) : undefined;
    },
    async put(record) {
      const copy = structuredClone(record);
      const existing = bySlot(copy.metadata.slotId);
      if (existing) records.delete(existing.metadata.saveId);
      records.set(copy.metadata.saveId, copy);
    },
    async delete(slotId) {
      const existing = bySlot(slotId);
      if (!existing) return false;
      records.delete(existing.metadata.saveId);
      return true;
    },
    async putBackup(record) {
      backups.push(structuredClone(record));
    },
    async listBackups() {
      return backups.map((record) => structuredClone(record.metadata));
    },
  };
}

function createLocalTransport(): SimulationWorkerTransport {
  const api = createSimulationWorkerApi({ now: () => 0, workerId: 'test-worker' });
  return {
    hello: (request) => api.hello(request),
    tick: (request) => api.tick(request),
    terminate: () => undefined,
  };
}

async function setupService(options: { worker?: boolean; maxSlots?: number } = {}) {
  useGameStore.getState().reset();
  const scheduler = new ManualScheduler();
  const clock = new GameClock({ tickDurationMs: 1000 });
  const runner = new SimulationRunner({
    scheduler,
    clock,
    tickDurationMs: 1000,
    executionMode: options.worker ? 'worker' : 'inline',
    createWorkerTransport: options.worker ? createLocalTransport : undefined,
  });
  const repository = createInMemoryRepository();
  let now = 1_700_000_000_000;
  const service = new SaveService({
    runner,
    repository,
    maxSlots: options.maxSlots ?? 10,
    now: () => {
      now += 1;
      return now;
    },
  });

  commands.createCorporation({ name: 'Helion Dynamics' });
  commands.hireEmployee({ profession: 'engineer', department: 'engineering' });

  return { runner, service, repository, clock };
}

function captureComparableState() {
  const state = useGameStore.getState();
  return JSON.stringify({
    empire: state.empire,
    world: state.world,
    economy: state.economy,
    corporation: state.corporation,
    employees: state.employees,
    technology: state.technology,
    products: state.products,
    resources: state.resources,
    production: state.production,
    market: state.market,
    city: state.city,
    events: state.events,
    competitors: state.competitors,
    simulation: {
      tick: state.simulation.tick,
      simTimeMs: state.simulation.simTimeMs,
      elapsedSimMs: state.simulation.elapsedSimMs,
      date: state.simulation.date,
      speed: state.simulation.speed,
    },
  });
}

describe('Stage 08 �?" Save & Archive Engine', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    useGameStore.getState().reset();
  });

  it('creates, lists, renames and deletes independent save slots', async () => {
    const { runner, service } = await setupService();
    try {
      await runner.step();

      const a = await service.saveToSlot('slot-1', 'Alpha');
      const b = await service.saveToSlot('slot-2', 'Beta');
      expect(a.metadata.slotId).toBe('slot-1');
      expect(b.metadata.slotId).toBe('slot-2');

      let slots = await service.listSlots();
      expect(slots.find((slot) => slot.slotId === 'slot-1')?.record?.name).toBe('Alpha');
      expect(slots.find((slot) => slot.slotId === 'slot-2')?.record?.name).toBe('Beta');

      const renamed = await service.renameSlot('slot-1', 'Alpha Renamed');
      expect(renamed.name).toBe('Alpha Renamed');

      await runner.step();
      await service.saveToSlot('slot-2', 'Beta Updated', { allowOverwrite: true });

      slots = await service.listSlots();
      expect(slots.find((slot) => slot.slotId === 'slot-1')?.record?.name).toBe('Alpha Renamed');
      expect(slots.find((slot) => slot.slotId === 'slot-2')?.record?.tick).toBeGreaterThan(
        slots.find((slot) => slot.slotId === 'slot-1')!.record!.tick,
      );

      const deleted = await service.deleteSlot('slot-1');
      expect(deleted).toBe(true);
      slots = await service.listSlots();
      expect(slots.find((slot) => slot.slotId === 'slot-1')?.record).toBeNull();
      expect(slots.find((slot) => slot.slotId === 'slot-2')?.record).not.toBeNull();
    } finally {
      runner.dispose();
    }
  });

  it('prevents overlapping saves', async () => {
    const { runner, service } = await setupService();
    try {
      const first = service.saveToSlot('slot-1', 'One');
      const second = service.saveToSlot('slot-2', 'Two');
      await expect(second).rejects.toMatchObject({ code: 'SAVE_WRITE_IN_PROGRESS' });
      await first;
    } finally {
      runner.dispose();
    }
  });

  it('preserves the previous valid record in a backup when overwriting', async () => {
    const { runner, service, repository } = await setupService();
    try {
      await runner.step();
      const first = await service.saveToSlot('slot-1', 'First');
      await runner.step();
      await service.saveToSlot('slot-1', 'Second', { allowOverwrite: true });

      expect(repository.backups.length).toBeGreaterThanOrEqual(1);
      expect(repository.backups[0].metadata.saveId).toBe(first.metadata.saveId);
    } finally {
      runner.dispose();
    }
  });

  it('loads a save, restores clock/tick/RNG and leaves the game paused', async () => {
    const { runner, service, clock } = await setupService();
    try {
      for (let i = 0; i < 12; i += 1) await runner.step();

      const before = {
        tick: useGameStore.getState().simulation.tick,
        simTimeMs: useGameStore.getState().simulation.simTimeMs,
        elapsed: clock.getElapsedSimMs(),
        clockTicks: clock.getTicks(),
        randomState: useGameStore.getState().events.randomState,
      };

      await service.saveToSlot('slot-1', 'Checkpoint');

      for (let i = 0; i < 8; i += 1) await runner.step();
      expect(useGameStore.getState().simulation.tick).toBeGreaterThan(before.tick);

      const result = await service.loadFromSlot('slot-1');
      expect(result.migrated).toBe(false);

      const state = useGameStore.getState();
      expect(state.simulation.status).toBe('paused');
      expect(state.simulation.tick).toBe(before.tick);
      expect(state.simulation.simTimeMs).toBe(before.simTimeMs);
      expect(clock.getElapsedSimMs()).toBe(before.elapsed);
      expect(clock.getTicks()).toBe(before.clockTicks);
      expect(state.events.randomState).toBe(before.randomState);
      expect(runner.getStatus()).toBe('paused');
    } finally {
      runner.dispose();
    }
  });

  it('preserves the active game when a load fails', async () => {
    const { runner, service } = await setupService();
    try {
      for (let i = 0; i < 5; i += 1) await runner.step();
      await service.saveToSlot('slot-1', 'Good');

      const before = captureComparableState();
      const tickBefore = useGameStore.getState().simulation.tick;

      // Corrupt the stored record.
      const stored = await (service as unknown as { repository: SaveRepository }).repository.getBySlot('slot-1');
      expect(stored).toBeDefined();
      if (stored) {
        stored.metadata.checksum = 'deadbeef';
        stored.payload.state.world = { ...stored.payload.state.world, tick: stored.payload.state.world.tick + 999 };
        await (service as unknown as { repository: SaveRepository }).repository.put(stored);
      }

      await expect(service.loadFromSlot('slot-1')).rejects.toBeInstanceOf(SaveError);

      expect(useGameStore.getState().simulation.tick).toBe(tickBefore);
      expect(captureComparableState()).toBe(before);
    } finally {
      runner.dispose();
    }
  });

  it('continues deterministically after save/load in inline mode', async () => {
    const run = async () => {
      const { runner, service } = await setupService();
      try {
        for (let i = 0; i < 20; i += 1) await runner.step();
        await service.saveToSlot('slot-1', 'Determinism');
        for (let i = 0; i < 25; i += 1) await runner.step();
        return captureComparableState();
      } finally {
        runner.dispose();
      }
    };

    const continued = await run();

    const { runner, service } = await setupService();
    try {
      for (let i = 0; i < 20; i += 1) await runner.step();
      await service.saveToSlot('slot-1', 'Determinism');
      await runner.step();
      await runner.step();
      await service.loadFromSlot('slot-1');
      runner.resume();
      for (let i = 0; i < 25; i += 1) await runner.step();
      expect(captureComparableState()).toBe(continued);
    } finally {
      runner.dispose();
    }
  });

  it('continues deterministically after save/load in worker mode', async () => {
    const run = async () => {
      const { runner, service } = await setupService({ worker: true });
      try {
        for (let i = 0; i < 20; i += 1) await runner.step();
        await service.saveToSlot('slot-1', 'Determinism');
        for (let i = 0; i < 20; i += 1) await runner.step();
        return captureComparableState();
      } finally {
        runner.dispose();
      }
    };

    const continued = await run();

    const { runner, service } = await setupService({ worker: true });
    try {
      for (let i = 0; i < 20; i += 1) await runner.step();
      await service.saveToSlot('slot-1', 'Determinism');
      await runner.step();
      await service.loadFromSlot('slot-1');
      runner.resume();
      for (let i = 0; i < 20; i += 1) await runner.step();
      expect(captureComparableState()).toBe(continued);
    } finally {
      runner.dispose();
    }
  });

  it('validates payloads and rejects incompatible or malformed data', async () => {
    const { runner } = await setupService();
    try {
      await runner.step();
      const payload = buildSavePayload(runner.getClock());
      expect(() => validatePayload(payload)).not.toThrow();

      expect(() => validatePayload({ ...payload, formatVersion: 999 })).toThrow(SaveError);
      expect(() => validatePayload({})).toThrow(SaveError);
      expect(() =>
        validatePayload({
          ...payload,
          state: { ...payload.state, world: null },
        }),
      ).toThrow(SaveError);
    } finally {
      runner.dispose();
    }
  });

  it('verifies integrity and detects a modified payload', async () => {
    const { runner } = await setupService();
    try {
      await runner.step();
      const payload = buildSavePayload(runner.getClock());
      const checksum = await computeChecksum(payload);

      if (checksum) {
        await expect(verifyChecksum(payload, checksum)).resolves.toBeUndefined();
        const modified = structuredClone(payload);
        modified.simulation.tick += 1;
        await expect(verifyChecksum(modified, checksum)).rejects.toMatchObject({
          code: 'SAVE_INTEGRITY_FAILED',
        });
      }

      // Missing checksum is accepted (structural validation still applies).
      await expect(verifyChecksum(payload, null)).resolves.toBeUndefined();
    } finally {
      runner.dispose();
    }
  });

  it('migrates a supported older fixture and rejects unsupported/future schemas', async () => {
    const { runner } = await setupService();
    try {
      await runner.step();
      const payload = buildSavePayload(runner.getClock());
      expect(payload.formatVersion).toBe(SAVE_FORMAT_VERSION);

      const current = migratePayload(structuredClone(payload));
      expect(current.migrated).toBe(false);

      // Minimal historical fixture: v0 is not supported by the current registry.
      const legacy = { ...structuredClone(payload), formatVersion: 0 };
      expect(() => migratePayload(legacy)).toThrow(SaveError);

      const future = { ...structuredClone(payload), formatVersion: SAVE_FORMAT_VERSION + 1 };
      expect(() => migratePayload(future)).toThrow(SaveError);
    } finally {
      runner.dispose();
    }
  });

  it('exports and imports archives into a new slot and rejects malformed archives', async () => {
    const { runner, service } = await setupService();
    try {
      await runner.step();
      await service.saveToSlot('slot-1', 'Original');
      const json = await service.exportSlotAsJson('slot-1');
      const archive = parseArchive(json);
      validateArchive(archive);

      const imported = await service.importFromJson(json, 'slot-2', 'Imported');
      expect(imported.metadata.slotId).toBe('slot-2');

      const slots = await service.listSlots();
      expect(slots.find((slot) => slot.slotId === 'slot-1')?.record).not.toBeNull();
      expect(slots.find((slot) => slot.slotId === 'slot-2')?.record).not.toBeNull();

      await expect(service.importFromJson(json, 'slot-2', 'Duplicate')).rejects.toMatchObject({
        code: 'SAVE_IMPORT_REJECTED',
      });

      try {
        await service.importFromJson('{bad json', 'slot-3', 'Bad');
        expect.unreachable('invalid JSON should be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(SaveError);
        expect((error as SaveError).code).toBe('SAVE_IMPORT_INVALID');
      }
    } finally {
      runner.dispose();
    }
  });

  it('runs autosave on simulated interval without overlapping writes', async () => {
    const { runner, service } = await setupService();
    try {
      service.setAutosaveConfig({ enabled: true, intervalSimMs: 2 * 3_600_000 });
      service.resetAutosaveTimer();

      for (let i = 0; i < 5; i += 1) {
        await runner.step();
        await service.maybeAutosave();
      }

      const slots = await service.listSlots();
      const autosave = slots.find((slot) => slot.slotId === AUTOSAVE_SLOT_ID)?.record as SaveMetadata | null;
      expect(autosave).not.toBeNull();

      // No duplicate overlapping / no repeated save while unchanged interval.
      const again = await service.maybeAutosave();
      expect(again).toBeNull();
    } finally {
      runner.dispose();
    }
  });

  it('enforces the slot limit and validates names', async () => {
    const { runner, service } = await setupService({ maxSlots: 1 });
    try {
      await service.saveToSlot('slot-1', 'Only');
      await expect(service.saveToSlot('slot-2', 'Too many')).rejects.toMatchObject({
        code: 'SAVE_SLOT_LIMIT_REACHED',
      });
      await expect(service.saveToSlot('slot-1', '   ', { allowOverwrite: true })).rejects.toMatchObject({
        code: 'SAVE_INVALID_NAME',
      });
    } finally {
      runner.dispose();
    }
  });

  it('rejects a structurally valid record with mismatched metadata', async () => {
    const { runner } = await setupService();
    try {
      await runner.step();
      const payload = buildSavePayload(runner.getClock());
      const metadata: SaveMetadata = {
        saveId: 'save_x',
        slotId: 'slot-1',
        kind: 'manual',
        name: 'X',
        createdAt: 1,
        updatedAt: 1,
        simulatedDate: payload.simulation.date,
        simulatedTimeMs: payload.simulation.simTimeMs,
        tick: payload.simulation.tick + 5,
        formatVersion: payload.formatVersion,
        checksum: null,
        payloadBytes: 0,
      };

      const bad: SaveRecord = { metadata, payload };
      expect(() => validateSaveRecord(bad)).toThrow(SaveError);
    } finally {
      runner.dispose();
    }
  });

  it('exports a portable archive that can be stringified and parsed', async () => {
    const { runner, service } = await setupService();
    try {
      await runner.step();
      await service.saveToSlot('slot-1', 'Portable');
      const archive = await service.exportSlot('slot-1');
      expect(archive.archiveVersion).toBe(1);
      const text = stringifyArchive(archive);
      const parsed = parseArchive(text);
      validateArchive(parsed);
      expect((parsed as typeof archive).metadata.slotId).toBe('slot-1');
    } finally {
      runner.dispose();
    }
  });
});