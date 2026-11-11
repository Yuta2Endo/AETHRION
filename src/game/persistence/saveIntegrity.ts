/**
 * Save integrity.
 *
 * A SHA-256 digest of the canonical payload detects accidental corruption and
 * incomplete/mismatched records. It does NOT provide encryption or anti-cheat
 * protection.
 */

import { SaveError } from './saveErrors';
import type { SavePayload } from './saveTypes';

/**
 * A deterministic, stable JSON string for hashing.
 *
 * Object keys are sorted so semantically identical payloads produce the same
 * digest regardless of insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${parts.join(',')}}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes the SHA-256 digest of the payload.
 *
 * Returns `null` when the runtime does not provide `crypto.subtle` (the save is
 * still written and validated structurally, but integrity verification is not
 * available in that environment).
 */
export async function computeChecksum(payload: SavePayload): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;

    const canonical = stableStringify(payload);
    const data = new TextEncoder().encode(canonical);
    const digest = await subtle.digest('SHA-256', data);
    return toHex(digest);
  } catch {
    return null;
  }
}

/**
 * Verifies the payload against a stored checksum.
 */
export async function verifyChecksum(payload: SavePayload, checksum: string | null | undefined): Promise<void> {
  if (checksum == null || checksum === '') return;

  const actual = await computeChecksum(payload);
  if (actual === null) {
    // The runtime cannot verify the digest — do not reject a structurally
    // valid save because of a missing capability.
    return;
  }

  if (actual !== checksum) {
    throw new SaveError(
      'SAVE_INTEGRITY_FAILED',
      'The save payload failed integrity verification and may be corrupted.',
    );
  }
}

/**
 * The approximate size of a payload in bytes.
 */
export function measurePayloadSize(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return 0;
  }
}