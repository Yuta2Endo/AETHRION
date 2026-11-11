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
 * Non-finite input resolves to `min` so that invalid data can never leak into
 * simulation calculations.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * True when the value is a finite number (not NaN, not Infinity).
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Round to a fixed number of decimals.
 * Used to keep simulation state stable across repeated ticks by avoiding
 * binary floating point drift in stored values.
 */
export function roundTo(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Format a number with optional fixed decimals and compact suffix.
 */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Generate a simple unique id (not cryptographically secure).
 *
 * NOTE: this helper is **not** deterministic — it must never be used by the
 * simulation. Use a domain sequence instead (e.g. `plot_001`, `bld_001`).
 */
export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * The default seed of the deterministic random generator.
 */
export const DEFAULT_RANDOM_SEED = 0x1a2b3c4d;

/**
 * One step of the deterministic 32-bit xorshift generator.
 *
 * The generator is a **pure function of its state**, so the whole random
 * sequence of the simulation is reproducible and the state stays plain and
 * serialisable. It replaces `Math.random()` inside the simulation — the
 * interface may use randomness, the simulation never does.
 *
 * @param state The current 32-bit state.
 * @returns The next value in 0..1 and the next state.
 */
export function nextRandom(state: number): { value: number; state: number } {
  let x = state >>> 0;
  if (x === 0) x = DEFAULT_RANDOM_SEED;

  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;

  return { value: x / 0x1_0000_0000, state: x };
}

/**
 * Picks a weighted entry from a list.
 *
 * The weights are normalised, the result is deterministic and an empty or
 * invalid list resolves to `null` instead of throwing.
 */
export function pickWeighted<T>(
  entries: readonly T[],
  weights: readonly number[],
  roll: number,
): T | null {
  if (entries.length === 0 || entries.length !== weights.length) return null;

  let total = 0;
  for (const weight of weights) {
    if (!isFiniteNumber(weight) || weight <= 0) continue;
    total += weight;
  }
  if (total <= 0) return null;

  const threshold = clamp(roll, 0, 1) * total;
  let accumulated = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const weight = weights[index];
    if (!isFiniteNumber(weight) || weight <= 0) continue;
    accumulated += weight;
    if (threshold < accumulated) return entries[index];
  }

  return entries[entries.length - 1];
}

/**
 * Safe sleep helper (mainly for workers / async tests).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
