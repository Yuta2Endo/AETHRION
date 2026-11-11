/**
 * Game Core engine — types.
 *
 * The engine owns the simulation lifecycle and the tick loop. It owns no
 * domain rules: world, economy and future systems implement `EngineSystem`
 * and are executed in a deterministic order.
 */

import type { SimulationStatus } from '@/core/types';

/**
 * Immutable context handed to every system on each tick.
 * `deltaMs` is the amount of *simulated* time advanced by this tick
 * (0 when the clock is paused).
 */
export interface SimulationContext {
  /** Monotonic tick counter, starting at 1. */
  readonly tick: number;
  /** Simulated epoch milliseconds after this tick. */
  readonly simTimeMs: number;
  /** Simulated milliseconds advanced by this tick. */
  readonly deltaMs: number;
  /** Real milliseconds elapsed since the previous tick. */
  readonly realDeltaMs: number;
  /**
   * Simulated milliseconds elapsed since the simulation started.
   * Deterministic and independent of the wall clock — the basis for
   * period-based rules such as payroll.
   */
  readonly elapsedSimMs: number;
}

/**
 * A simulation unit updated on every tick.
 * `order` defines the deterministic execution order (ascending).
 */
export interface EngineSystem {
  readonly name: string;
  readonly order: number;
  update(context: SimulationContext): void | Promise<void>;
}

export interface GameEngineConfig {
  /** Real milliseconds between simulation ticks. */
  tickDurationMs: number;
  /**
   * Maximum ticks executed per animation frame.
   * Prevents an uncontrolled catch-up burst after a long pause or a
   * backgrounded tab.
   */
  maxTicksPerFrame: number;
}

export interface GameEngineSnapshot {
  status: SimulationStatus;
  tick: number;
  lastTickRealMs: number | null;
  /** Names of systems that threw during the last tick. */
  failedSystems: string[];
  /** Message of the most recent system failure, if any. */
  lastError: string | null;
}

export const DEFAULT_ENGINE_CONFIG: GameEngineConfig = {
  tickDurationMs: 1000,
  maxTicksPerFrame: 5,
};
