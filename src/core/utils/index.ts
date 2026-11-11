/**
 * Shared utilities.
 * Pure, testable helper functions kept free of framework dependencies.
 */

/**
 * Deep-freeze an object (dev only) to catch accidental mutations in simulation state.
 */
export function deepFreeze<T>(object: T): T {
  if (typeof object !== 'object' || object === null || Object.isFrozen(object)) {
    return object;
  }
  Object.freeze(object);
  Object.getOwnPropertyNames(object).forEach((prop) => {
    const value = (object as Record<string, unknown>)[prop];
    if (typeof value === 'object' && value !== null) {
      deepFreeze(value);
    }
  });
  return object;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Format a number with optional fixed decimals and compact suffix.
 */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Generate a simple unique id (not cryptographically secure).
 */
export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Safe sleep helper (mainly for workers / async tests).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
