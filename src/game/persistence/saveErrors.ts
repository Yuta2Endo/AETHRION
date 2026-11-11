/**
 * Persistence errors.
 *
 * Typed errors keep the persistence layer independent from the UI while still
 * giving the interface enough information to show a precise, recoverable
 * message. No internal stack trace is ever meant for display.
 */

export type SaveErrorCode =
  | 'SAVE_DB_UNAVAILABLE'
  | 'SAVE_DB_BLOCKED'
  | 'SAVE_DB_FAILED'
  | 'SAVE_NOT_FOUND'
  | 'SAVE_SLOT_LIMIT_REACHED'
  | 'SAVE_INVALID_NAME'
  | 'SAVE_WRITE_IN_PROGRESS'
  | 'SAVE_WRITE_FAILED'
  | 'SAVE_QUOTA_EXCEEDED'
  | 'SAVE_VALIDATION_FAILED'
  | 'SAVE_INTEGRITY_FAILED'
  | 'SAVE_INCOMPATIBLE_VERSION'
  | 'SAVE_MIGRATION_FAILED'
  | 'SAVE_LOAD_FAILED'
  | 'SAVE_IMPORT_INVALID'
  | 'SAVE_IMPORT_REJECTED'
  | 'SAVE_EXPORT_FAILED';

export class SaveError extends Error {
  readonly code: SaveErrorCode;
  readonly recoverable: boolean;

  constructor(code: SaveErrorCode, message: string, recoverable = true) {
    super(message);
    this.name = 'SaveError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

export function asSaveError(error: unknown, fallback: SaveErrorCode, message: string): SaveError {
  if (error instanceof SaveError) return error;

  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') {
    return new SaveError('SAVE_QUOTA_EXCEEDED', 'Storage quota exceeded. Free space or remove old saves.');
  }

  return new SaveError(fallback, message);
}