/**
 * Shared core types.
 * Domain-specific types live in their respective modules (game, simulation,
 * rendering). This file holds cross-cutting types only.
 *
 * This module deliberately has NO imports from other core modules so that it
 * can be consumed by the event bus, the error handler and every domain layer
 * without creating circular dependencies.
 */

/**
 * Lifecycle state of the simulation.
 * - idle    : created but never started
 * - running : ticking
 * - paused  : started but temporarily suspended
 * - stopped : explicitly stopped (state retained)
 */
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * Canonical application error shape.
 * The error handler (`@/core/error/errorHandler`) imports this definition —
 * it is defined here so that the error handler and the event bus can both
 * depend on core/types without a circular import.
 */
export interface AppError {
  code: string;
  message: string;
  fatal?: boolean;
  context?: Record<string, unknown>;
  timestamp: number;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

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
