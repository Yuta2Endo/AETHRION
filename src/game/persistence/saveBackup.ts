/**
 * Save backup & archive.
 *
 * Archives are portable JSON documents. Import always restores into a new slot
 * by default and never overwrites an existing save without an explicit, separate
 * confirmation step handled by the caller/service.
 */

import { SaveError } from './saveErrors';
import { computeChecksum, measurePayloadSize, verifyChecksum } from './saveIntegrity';
import { migratePayload } from './saveMigration';
import { validateArchive } from './saveValidation';
import type { SaveArchive, SaveMetadata, SavePayload, SaveRecord } from './saveTypes';

/**
 * Builds a portable archive from a record.
 */
export async function exportArchive(record: SaveRecord): Promise<SaveArchive> {
  const checksum = record.metadata.checksum ?? (await computeChecksum(record.payload));
  return {
    archiveVersion: 1,
    exportedAt: Date.now(),
    metadata: structuredClone(record.metadata),
    payload: structuredClone(record.payload),
    checksum,
  };
}

/**
 * Validates and normalises an imported archive.
 *
 * The archive is migrated if necessary and its integrity is verified before the
 * record is returned. The caller decides the target slot.
 */
export async function importArchive(
  input: unknown,
  target: { slotId: string; name: string; kind: 'manual' | 'autosave' },
): Promise<SaveRecord> {
  try {
    validateArchive(input);
  } catch (error) {
    if (error instanceof SaveError) throw error;
    throw new SaveError('SAVE_IMPORT_INVALID', 'The archive is malformed or unsupported.');
  }

  const archive = input as SaveArchive;
  const migration = migratePayload(archive.payload);
  await verifyChecksum(migration.payload, archive.checksum ?? archive.metadata.checksum);

  const now = Date.now();
  const payload: SavePayload = migration.payload;
  const checksum = await computeChecksum(payload);

  const metadata: SaveMetadata = {
    saveId: `save_${target.slotId}_${now}`,
    slotId: target.slotId,
    kind: target.kind,
    name: target.name,
    createdAt: archive.metadata.createdAt || now,
    updatedAt: now,
    simulatedDate: structuredClone(payload.simulation.date),
    simulatedTimeMs: payload.simulation.simTimeMs,
    tick: payload.simulation.tick,
    formatVersion: payload.formatVersion,
    checksum,
    payloadBytes: measurePayloadSize(payload),
  };

  return { metadata, payload };
}

/**
 * Serialises an archive to JSON.
 */
export function stringifyArchive(archive: SaveArchive): string {
  return JSON.stringify(archive, null, 2);
}

/**
 * Parses an archive from JSON.
 */
export function parseArchive(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SaveError('SAVE_IMPORT_INVALID', 'The archive file is not valid JSON.');
  }
}