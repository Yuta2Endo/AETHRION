/**
 * Simulation Worker — the API implementation.
 *
 * The API is a **plain object of async functions**. It contains no
 * transport code at all, which makes it directly unit-testable without a
 * browser: the Worker entry point only wraps it in the RPC transport.
 *
 * The module imports nothing from React, the DOM, Zustand or the rendering
 * engine — only the pure simulation kernel.
 */

import { advanceSimulation } from '@/game/simulation/kernel';
import {
  WORKER_PROTOCOL_VERSION,
  type SimulationWorkerApi,
  type WorkerHelloRequest,
  type WorkerHelloResponse,
  type WorkerTickRequest,
  type WorkerTickResult,
} from '@/game/simulation/protocol';

export interface WorkerApiOptions {
  /** The time source used for the duration measurement. */
  now?: () => number;
  /** The identifier of the worker instance. */
  workerId?: string;
}

/**
 * A counter that identifies the worker instances of a session.
 *
 * It is deterministic — no randomness enters the simulation, not even the
 * identifier of the worker.
 */
let workerCounter = 0;

/**
 * Creates the API the Worker exposes.
 */
export function createSimulationWorkerApi(options: WorkerApiOptions = {}): SimulationWorkerApi {
  const now = options.now ?? (() => performance.now());
  workerCounter += 1;
  const workerId = options.workerId ?? `sim-worker-${workerCounter}`;

  return {
    async hello(request: WorkerHelloRequest): Promise<WorkerHelloResponse> {
      if (!request || request.protocolVersion !== WORKER_PROTOCOL_VERSION) {
        throw new Error(
          `[WORKER_PROTOCOL_MISMATCH] the worker speaks protocol ${WORKER_PROTOCOL_VERSION}, the client speaks ${String(
            request?.protocolVersion,
          )}`,
        );
      }

      return {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        workerId,
        supportsDelta: true,
      };
    },

    async tick(request: WorkerTickRequest): Promise<WorkerTickResult> {
      if (!request || typeof request.sequence !== 'number' || !request.snapshot || !request.context) {
        return {
          ok: false,
          sequence: request?.sequence ?? -1,
          code: 'WORKER_INVALID_REQUEST',
          message: 'The tick request is malformed.',
        };
      }

      const started = now();

      try {
        const { delta } = await advanceSimulation(request.snapshot, request.context);
        const changedSlices = Object.keys(delta).length;

        return {
          ok: true,
          sequence: request.sequence,
          delta,
          changedSlices,
          durationMs: Math.max(0, now() - started),
        };
      } catch (error) {
        return {
          ok: false,
          sequence: request.sequence,
          code: 'WORKER_TICK_FAILED',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
