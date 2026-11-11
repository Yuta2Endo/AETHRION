/**
 * Engine scheduler abstraction.
 *
 * The engine never talks to `requestAnimationFrame` directly. Frame scheduling
 * and time reading are injected, which makes the engine fully deterministic and
 * independently testable without relying on fake timers.
 */

export interface EngineScheduler {
  /** Monotonic time source in milliseconds. */
  now(): number;
  /** Schedules a frame callback. Returns a handle usable with `cancelFrame`. */
  requestFrame(callback: (time: number) => void): number;
  /** Cancels a previously scheduled frame. */
  cancelFrame(handle: number): void;
}

/**
 * Default scheduler backed by requestAnimationFrame / performance.now.
 */
export const rafScheduler: EngineScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

/**
 * Scheduler used by the engine when the environment has no
 * requestAnimationFrame (e.g. non-browser test runners).
 */
export const timeoutScheduler: EngineScheduler = {
  now: () => Date.now(),
  requestFrame: (callback) => setTimeout(() => callback(Date.now()), 16) as unknown as number,
  cancelFrame: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
};

/**
 * Picks the best available scheduler for the current environment.
 */
export function createDefaultScheduler(): EngineScheduler {
  if (typeof requestAnimationFrame === 'function') {
    return rafScheduler;
  }
  return timeoutScheduler;
}
