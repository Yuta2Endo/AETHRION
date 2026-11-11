/**
 * Simulation performance metrics.
 *
 * A lightweight, **bounded** instrumentation layer. It keeps counters and
 * aggregates — never a growing list — so the memory it uses is constant.
 *
 * The instrumentation must not slow the hot path down: the snapshot size is
 * measured only every few ticks, the rest are plain number updates.
 */

import type { SimulationExecutionMode } from './workerClient';

/**
 * A tick slower than this is counted as a slow tick.
 *
 * The measured cost of a tick of the current simulation is about 0.2 ms, so
 * 50 ms is more than two hundred times the expected cost — the counter only
 * fires on a genuine anomaly (a long frame, a garbage collection, a worker
 * round trip that stalled).
 */
export const SLOW_TICK_THRESHOLD_MS = 50;

/**
 * How often the size of the transferred snapshot is measured, in ticks.
 */
export const SNAPSHOT_MEASUREMENT_INTERVAL = 30;

/**
 * The aggregated performance figures of the simulation.
 */
export interface SimulationPerformanceMetrics {
  /** The execution mode of the last tick. */
  mode: SimulationExecutionMode;
  /** Whether the Worker is available. */
  workerAvailable: boolean;
  /** The identifier of the Worker instance. */
  workerId: string | null;
  /** The number of ticks that were measured. */
  ticks: number;
  /** The average duration of a tick, in milliseconds. */
  averageTickMs: number;
  /** The slowest tick, in milliseconds. */
  maxTickMs: number;
  /** The number of ticks slower than `SLOW_TICK_THRESHOLD_MS`. */
  slowTickCount: number;
  /** The average round trip to the Worker, in milliseconds. */
  averageRoundTripMs: number;
  /** The slowest round trip, in milliseconds. */
  maxRoundTripMs: number;
  /** The average duration of the simulation work inside the Worker. */
  averageWorkerMs: number;
  /** How often the main-thread fallback was activated. */
  fallbackActivations: number;
  /** How many Worker errors were observed. */
  workerErrors: number;
  /** The size of the last measured snapshot, in bytes. */
  lastSnapshotBytes: number;
}

function emptyMetrics(): SimulationPerformanceMetrics {
  return {
    mode: 'inline',
    workerAvailable: false,
    workerId: null,
    ticks: 0,
    averageTickMs: 0,
    maxTickMs: 0,
    slowTickCount: 0,
    averageRoundTripMs: 0,
    maxRoundTripMs: 0,
    averageWorkerMs: 0,
    fallbackActivations: 0,
    workerErrors: 0,
    lastSnapshotBytes: 0,
  };
}

/**
 * Creates the initial, empty performance figures.
 */
export function createInitialPerformanceMetrics(): SimulationPerformanceMetrics {
  return emptyMetrics();
}

/**
 * Collects the performance figures of the simulation.
 */
export class SimulationMetricsCollector {
  private metrics = emptyMetrics();
  private totalTickMs = 0;
  private totalRoundTripMs = 0;
  private totalWorkerMs = 0;
  private ticksSinceMeasurement = 0;

  /**
   * Records a finished tick.
   */
  recordTick(input: {
    mode: SimulationExecutionMode;
    durationMs: number;
    roundTripMs: number;
    workerMs: number;
    workerAvailable: boolean;
    workerId: string | null;
  }): void {
    const duration = Math.max(0, input.durationMs);

    this.metrics.mode = input.mode;
    this.metrics.workerAvailable = input.workerAvailable;
    this.metrics.workerId = input.workerId;
    this.metrics.ticks += 1;

    this.totalTickMs += duration;
    this.totalRoundTripMs += Math.max(0, input.roundTripMs);
    this.totalWorkerMs += Math.max(0, input.workerMs);

    this.metrics.averageTickMs = this.totalTickMs / this.metrics.ticks;
    this.metrics.averageRoundTripMs = this.totalRoundTripMs / this.metrics.ticks;
    this.metrics.averageWorkerMs = this.totalWorkerMs / this.metrics.ticks;

    if (duration > this.metrics.maxTickMs) this.metrics.maxTickMs = duration;
    if (input.roundTripMs > this.metrics.maxRoundTripMs) {
      this.metrics.maxRoundTripMs = input.roundTripMs;
    }
    if (duration > SLOW_TICK_THRESHOLD_MS) this.metrics.slowTickCount += 1;

    this.ticksSinceMeasurement += 1;
  }

  /**
   * Records the size of a transferred snapshot.
   *
   * The measurement is only taken every `SNAPSHOT_MEASUREMENT_INTERVAL` ticks,
   * so the hot path stays cheap.
   */
  recordSnapshotSize(bytes: number): void {
    if (this.ticksSinceMeasurement < SNAPSHOT_MEASUREMENT_INTERVAL) return;
    this.ticksSinceMeasurement = 0;
    this.metrics.lastSnapshotBytes = bytes;
  }

  /**
   * Records the activation of the main-thread fallback.
   */
  recordFallback(): void {
    this.metrics.fallbackActivations += 1;
  }

  /**
   * Records a Worker error.
   */
  recordWorkerError(): void {
    this.metrics.workerErrors += 1;
  }

  /**
   * The current figures.
   */
  getMetrics(): SimulationPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Restores the initial figures.
   */
  reset(): void {
    this.metrics = emptyMetrics();
    this.totalTickMs = 0;
    this.totalRoundTripMs = 0;
    this.totalWorkerMs = 0;
    this.ticksSinceMeasurement = 0;
  }
}

/**
 * Measures the size of a transferable payload, in bytes.
 */
export function measurePayloadBytes(payload: unknown): number {
  try {
    return JSON.stringify(payload).length;
  } catch {
    return 0;
  }
}
