/**
 * Shared core types.
 * Domain-specific types live in their respective modules (game, simulation,
 * rendering). This file holds cross-cutting types only.
 */

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export interface AppError {
  code: string;
  message: string;
  fatal?: boolean;
  context?: Record<string, unknown>;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface Timestamped {
  createdAt: number;
  updatedAt: number;
}

export interface Identifiable {
  id: string;
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}
