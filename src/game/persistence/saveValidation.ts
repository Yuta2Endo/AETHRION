/**
 * Save validation.
 *
 * Every record is validated before it is written and before it is applied. The
 * validator is intentionally structural and defensive: it rejects malformed or
 * incompatible data without mutating the active game.
 */

import { SaveError } from './saveErrors';
import {
  SAVE_FORMAT_VERSION,
  type PersistedClockState,
  type PersistedSimulationMeta,
  type PersistedSimulationState,
  type SaveArchive,
  type SaveMetadata,
  type SavePayload,
  type SaveRecord,
} from './saveTypes';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new SaveError('SAVE_VALIDATION_FAILED', message);
  }
}

function validateDate(value: unknown, label: string): void {
  assert(isObject(value), `${label} must be an object`);
  assert(isFiniteInt(value.year), `${label}.year must be an integer`);
  assert(isFiniteInt(value.month) && value.month >= 1 && value.month <= 12, `${label}.month is invalid`);
  assert(isFiniteInt(value.day) && value.day >= 1 && value.day <= 31, `${label}.day is invalid`);
  assert(isFiniteInt(value.hour) && value.hour >= 0 && value.hour <= 23, `${label}.hour is invalid`);
  assert(isFiniteInt(value.minute) && value.minute >= 0 && value.minute <= 59, `${label}.minute is invalid`);
  assert(isFiniteInt(value.second) && value.second >= 0 && value.second <= 59, `${label}.second is invalid`);
}

function validateState(state: unknown): asserts state is PersistedSimulationState {
  assert(isObject(state), 'state must be an object');
  const required = [
    'empire',
    'world',
    'economy',
    'corporation',
    'employees',
    'technology',
    'products',
    'resources',
    'production',
    'market',
    'city',
    'events',
    'competitors',
  ] as const;

  for (const key of required) {
    assert(isObject(state[key]), `state.${key} must be an object`);
  }

  const events = state.events as Record<string, unknown>;
  // RNG state must be present for deterministic continuation.
  assert(typeof events.randomState === 'number', 'state.events.randomState must be a number');
  assert(isFiniteInt(events.sequence), 'state.events.sequence must be an integer');
}

function validateSimulation(simulation: unknown): asserts simulation is PersistedSimulationMeta {
  assert(isObject(simulation), 'simulation must be an object');
  assert(isFiniteInt(simulation.tick) && simulation.tick >= 0, 'simulation.tick must be a non-negative integer');
  assert(
    typeof simulation.simTimeMs === 'number' && Number.isFinite(simulation.simTimeMs),
    'simulation.simTimeMs must be a finite number',
  );
  assert(
    typeof simulation.elapsedSimMs === 'number' && Number.isFinite(simulation.elapsedSimMs),
    'simulation.elapsedSimMs must be a finite number',
  );
  assert(
    typeof simulation.speed === 'number' && Number.isFinite(simulation.speed) && simulation.speed > 0,
    'simulation.speed must be a positive number',
  );
  validateDate(simulation.date, 'simulation.date');
}

function validateClock(clock: unknown): asserts clock is PersistedClockState {
  assert(isObject(clock), 'clock must be an object');
  assert(isObject(clock.snapshot), 'clock.snapshot must be an object');
  assert(isObject(clock.snapshot.config), 'clock.snapshot.config must be an object');
  assert(
    typeof clock.snapshot.elapsedSimMs === 'number' && Number.isFinite(clock.snapshot.elapsedSimMs),
    'clock.snapshot.elapsedSimMs must be a finite number',
  );
  assert(
    isFiniteInt(clock.snapshot.ticks) && clock.snapshot.ticks >= 0,
    'clock.snapshot.ticks must be a non-negative integer',
  );
  assert(typeof clock.speed === 'number' && Number.isFinite(clock.speed), 'clock.speed must be a finite number');
}

export function validatePayload(payload: unknown): asserts payload is SavePayload {
  assert(isObject(payload), 'payload must be an object');
  assert(isFiniteInt(payload.formatVersion), 'payload.formatVersion must be an integer');

  if (payload.formatVersion > SAVE_FORMAT_VERSION) {
    throw new SaveError(
      'SAVE_INCOMPATIBLE_VERSION',
      `Save format version ${payload.formatVersion} is newer than supported (${SAVE_FORMAT_VERSION}).`,
    );
  }

  validateState(payload.state);
  validateSimulation(payload.simulation);
  validateClock(payload.clock);
}

export function validateMetadata(metadata: unknown): asserts metadata is SaveMetadata {
  assert(isObject(metadata), 'metadata must be an object');
  assert(isNonEmptyString(metadata.saveId), 'metadata.saveId is required');
  assert(isNonEmptyString(metadata.slotId), 'metadata.slotId is required');
  assert(metadata.kind === 'manual' || metadata.kind === 'autosave', 'metadata.kind is invalid');
  assert(isNonEmptyString(metadata.name), 'metadata.name is required');
  assert(typeof metadata.createdAt === 'number' && Number.isFinite(metadata.createdAt), 'metadata.createdAt is invalid');
  assert(typeof metadata.updatedAt === 'number' && Number.isFinite(metadata.updatedAt), 'metadata.updatedAt is invalid');
  assert(isFiniteInt(metadata.tick) && metadata.tick >= 0, 'metadata.tick is invalid');
  assert(isFiniteInt(metadata.formatVersion), 'metadata.formatVersion is invalid');
  validateDate(metadata.simulatedDate, 'metadata.simulatedDate');
}

export function validateSaveRecord(record: unknown): asserts record is SaveRecord {
  assert(isObject(record), 'record must be an object');
  validateMetadata(record.metadata);
  validatePayload(record.payload);

  if (record.metadata.formatVersion !== record.payload.formatVersion) {
    throw new SaveError('SAVE_VALIDATION_FAILED', 'Metadata and payload format versions do not match.');
  }
  if (record.metadata.tick !== record.payload.simulation.tick) {
    throw new SaveError('SAVE_VALIDATION_FAILED', 'Metadata and payload tick counters do not match.');
  }
  if (record.metadata.simulatedTimeMs !== record.payload.simulation.simTimeMs) {
    throw new SaveError('SAVE_VALIDATION_FAILED', 'Metadata and payload simulated time do not match.');
  }
}

export function validateArchive(archive: unknown): asserts archive is SaveArchive {
  assert(isObject(archive), 'archive must be an object');
  assert(archive.archiveVersion === 1, 'archive.archiveVersion is not supported');
  assert(typeof archive.exportedAt === 'number' && Number.isFinite(archive.exportedAt), 'archive.exportedAt is invalid');
  validateMetadata(archive.metadata);
  validatePayload(archive.payload);
  validateSaveRecord({ metadata: archive.metadata, payload: archive.payload });
}