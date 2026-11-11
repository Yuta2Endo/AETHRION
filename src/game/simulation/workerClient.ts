/**
 * Simulation Worker — the main-thread adapter.
 *
 * The client owns the lifecycle of the Worker:
 *
 * - it spawns it lazily and performs the readiness handshake,
 * - it sends one tick at a time and validates the sequence of every answer,
 * - it protects the request with a timeout,
 * - it falls back to the main thread when the Worker is unavailable or fails,
 * - it terminates the Worker on disposal.
 *
 * The client never mutates the game state — it only computes a **delta** that
 * the caller applies. That keeps the main thread the single source of truth
 * and makes a Worker failure harmless: the last confirmed state stays intact.
 */

import { logger } from '@/core/logging/logger';
import type { SimulationContext } from '@/game/engine/types';
import { advanceSimulation } from '@/game/simulation/kernel';
import {
  WORKER_PROTOCOL_VERSION,
  isResultForSequence,
  isStaleResult,
  type SimulationWorkerApi,
} from './protocol';
import {
  createWorkerTransport,
  isWorkerSupported,
  type SimulationWorkerTransport,
} from './transport';
import type { SimulationDelta, SimulationSnapshot } from './types';

/**
 * How the simulation is currently executed.
 */
export type SimulationExecutionMode = 'inline' | 'worker' | 'fallback';

/**
 * The observable status of the Worker.
 */
export interface SimulationWorkerStatus {
  /** Whether the Worker answered the handshake and can accept ticks. */
  available: boolean;
  /** The current execution mode. */
  mode: SimulationExecutionMode;
  /** The identifier of the Worker instance. */
  workerId: string | null;
  /** How often the main-thread fallback was activated. */
  fallbackActivations: number;
  /** How many Worker errors were observed. */
  errors: number;
  /** The sequence number of the last accepted request. */
  lastSequence: number;
}

export interface SimulationWorkerClientOptions {
  /** Creates the transport — injectable for the tests. */
  createTransport?: () => SimulationWorkerTransport;
  /** The timeout of the handshake and of a tick, in milliseconds. */
  timeoutMs?: number;
  /**
   * Forces the availability of the Worker.
   *
   * When a transport is injected by a test, the environment check would
   * otherwise refuse to start the Worker in Node — this flag lets the test
   * drive the client without a browser.
   */
  forceSupported?: boolean;
}

/** The default timeout of a Worker round trip, in milliseconds. */
export const DEFAULT_WORKER_TIMEOUT_MS = 5_000;

/**
 * Rejects a promise that does not settle in time.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class SimulationWorkerClient {
  private readonly createTransport: () => SimulationWorkerTransport;
  private readonly timeoutMs: number;
  private readonly forceSupported: boolean;

  private transport: SimulationWorkerTransport | null = null;
  private workerId: string | null = null;
  private available = false;
  private initializing: Promise<boolean> | null = null;
  private fallbackActive = false;
  private fallbackActivations = 0;
  private errors = 0;
  private sequence = 0;
  private disposed = false;

  constructor(options: SimulationWorkerClientOptions = {}) {
    this.createTransport = options.createTransport ?? createWorkerTransport;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
    // An explicitly injected transport is treated as supported — it is the
    // test's way of driving the client without a browser Worker.
    this.forceSupported = options.forceSupported ?? options.createTransport !== undefined;
  }

  /**
   * Makes sure the Worker is ready.
   *
   * The handshake is performed **once** — concurrent callers share the same
   * promise, so the Worker is never spawned twice.
   */
  async ensureReady(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.available) return true;
    if (this.initializing) return this.initializing;

    this.initializing = this.performHandshake().finally(() => {
      this.initializing = null;
    });

    return this.initializing;
  }

  private async performHandshake(): Promise<boolean> {
    if (!this.forceSupported && !isWorkerSupported()) {
      logger.warn('Simulation Worker is not supported in this environment — using the main thread');
      this.fallbackActivations += 1;
      this.fallbackActive = true;
      return false;
    }

    let transport: SimulationWorkerTransport | null = null;

    try {
      transport = this.createTransport();
      const hello = await withTimeout(
        transport.hello({ protocolVersion: WORKER_PROTOCOL_VERSION }),
        this.timeoutMs,
        '[WORKER_TIMEOUT] the readiness handshake did not answer in time',
      );

      if (hello.protocolVersion !== WORKER_PROTOCOL_VERSION) {
        throw new Error(
          `[WORKER_PROTOCOL_MISMATCH] the worker speaks protocol ${hello.protocolVersion}`,
        );
      }

      this.transport = transport;
      this.workerId = hello.workerId;
      this.available = true;
      this.fallbackActive = false;

      logger.info('Simulation Worker ready', { workerId: hello.workerId });
      return true;
    } catch (error) {
      // A graceful startup failure must never break the game — the main thread
      // fallback takes over.
      logger.warn('Simulation Worker could not be started — using the main thread', {
        message: error instanceof Error ? error.message : String(error),
      });

      if (transport) {
        try {
          transport.terminate();
        } catch {
          // The transport is already gone — nothing to clean up.
        }
      }

      this.transport = null;
      this.available = false;
      this.fallbackActive = true;
      this.fallbackActivations += 1;
      return false;
    }
  }

  /**
   * Advances the simulation by one tick.
   *
   * The Worker computes the delta; when it is unavailable the very same
   * kernel runs on the main thread and produces the identical delta.
   */
  async tick(
    snapshot: SimulationSnapshot,
    context: SimulationContext,
  ): Promise<{ delta: SimulationDelta; mode: SimulationExecutionMode; roundTripMs: number; workerMs: number }> {
    if (this.disposed) {
      throw new Error('[WORKER_DISPOSED] the simulation worker client has been disposed');
    }

    const ready = await this.ensureReady();

    if (!ready || !this.transport) {
      return this.runFallback(snapshot, context);
    }

    const sequence = this.sequence + 1;
    this.sequence = sequence;

    const started = performance.now();

    try {
      const result = await withTimeout(
        this.transport.tick({ sequence, snapshot, context }),
        this.timeoutMs,
        `[WORKER_TIMEOUT] the tick ${sequence} did not answer in time`,
      );

      const roundTripMs = performance.now() - started;

      // A stale answer belongs to a request that was already abandoned — it
      // must never overwrite newer state.
      if (isStaleResult(result, sequence)) {
        logger.warn('Simulation Worker returned a stale result — it was ignored', { sequence });
        return this.runFallback(snapshot, context);
      }

      if (!isResultForSequence(result, sequence)) {
        logger.warn('Simulation Worker returned an unexpected result — it was rejected', {
          sequence,
          received: result.sequence,
        });
        return this.runFallback(snapshot, context);
      }

      if (!result.ok) {
        this.errors += 1;
        logger.warn('Simulation Worker reported a tick failure', {
          code: result.code,
          message: result.message,
        });
        this.disableWorker();
        return this.runFallback(snapshot, context);
      }

      return {
        delta: result.delta,
        mode: 'worker',
        roundTripMs,
        workerMs: result.durationMs,
      };
    } catch (error) {
      this.errors += 1;
      logger.warn('Simulation Worker failed — the main thread takes over', {
        message: error instanceof Error ? error.message : String(error),
      });
      this.disableWorker();
      return this.runFallback(snapshot, context);
    }
  }

  /**
   * Runs the tick on the main thread.
   *
   * The kernel is the very same code the Worker runs, so the result is
   * identical — only the execution place differs.
   */
  private async runFallback(
    snapshot: SimulationSnapshot,
    context: SimulationContext,
  ): Promise<{ delta: SimulationDelta; mode: SimulationExecutionMode; roundTripMs: number; workerMs: number }> {
    const started = performance.now();
    const { delta } = await advanceSimulation(snapshot, context);
    const durationMs = performance.now() - started;

    if (!this.fallbackActive) {
      this.fallbackActive = true;
      this.fallbackActivations += 1;
    }

    return { delta, mode: 'fallback', roundTripMs: durationMs, workerMs: durationMs };
  }

  /**
   * Disables the Worker after a failure.
   *
   * The Worker is terminated and the next tick runs on the main thread. The
   * tick that failed is **not** executed a second time — the state of the
   * simulation stays at the last confirmed value.
   */
  private disableWorker(): void {
    this.available = false;

    if (this.transport) {
      try {
        this.transport.terminate();
      } catch {
        // The worker is already gone.
      }
    }

    this.transport = null;
    this.workerId = null;
    this.fallbackActive = true;
  }

  /**
   * The observable status of the Worker.
   */
  getStatus(): SimulationWorkerStatus {
    return {
      available: this.available,
      mode: this.available ? 'worker' : this.fallbackActive ? 'fallback' : 'inline',
      workerId: this.workerId,
      fallbackActivations: this.fallbackActivations,
      errors: this.errors,
      lastSequence: this.sequence,
    };
  }

  /**
   * Terminates the Worker and releases every resource.
   */
  terminate(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.available = false;

    if (this.transport) {
      try {
        this.transport.terminate();
      } catch {
        // The worker is already gone.
      }
    }

    this.transport = null;
    this.workerId = null;
    logger.info('Simulation Worker terminated');
  }

  /**
   * Resets the client so it can be used again after a restore.
   *
   * Any existing worker is terminated and the client returns to its initial
   * state. The next tick will perform a fresh handshake.
   */
  reset(): void {
    if (this.transport) {
      try {
        this.transport.terminate();
      } catch {
        // The worker is already gone.
      }
    }

    this.transport = null;
    this.workerId = null;
    this.available = false;
    this.initializing = null;
    this.fallbackActive = false;
    this.fallbackActivations = 0;
    this.errors = 0;
    this.sequence = 0;
    this.disposed = false;
  }
}

/**
 * The type of the remote API — re-exported for the transport implementations.
 */
export type { SimulationWorkerApi };
