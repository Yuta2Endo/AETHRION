/**
 * Worker transport — the boundary between the main thread and the Worker.
 *
 * The transport is a narrow interface with two operations and a termination.
 * The production implementation wraps Comlink; the tests inject a fake
 * transport, so the client logic never depends on a browser environment.
 */

import * as Comlink from 'comlink';
import type {
  SimulationWorkerApi,
  WorkerHelloRequest,
  WorkerHelloResponse,
  WorkerTickRequest,
  WorkerTickResult,
} from './protocol';

/**
 * The operations the main thread needs from a simulation Worker.
 */
export interface SimulationWorkerTransport {
  /** The readiness handshake. */
  hello(request: WorkerHelloRequest): Promise<WorkerHelloResponse>;
  /** Advances the simulation by one tick. */
  tick(request: WorkerTickRequest): Promise<WorkerTickResult>;
  /** Releases the transport and the worker behind it. */
  terminate(): void;
}

/**
 * The Comlink backed transport.
 *
 * Comlink was already part of the dependency set of the project (it was
 * provisioned for the worker architecture), so no new RPC library is added.
 */
export class ComlinkWorkerTransport implements SimulationWorkerTransport {
  private readonly remote: Comlink.Remote<SimulationWorkerApi>;
  private readonly worker: Worker;

  constructor(worker: Worker) {
    this.worker = worker;
    this.remote = Comlink.wrap<SimulationWorkerApi>(worker);
  }

  hello(request: WorkerHelloRequest): Promise<WorkerHelloResponse> {
    return this.remote.hello(request);
  }

  tick(request: WorkerTickRequest): Promise<WorkerTickResult> {
    return this.remote.tick(request);
  }

  terminate(): void {
    this.worker.terminate();
  }
}

/**
 * Creates a transport backed by a real module Worker.
 *
 * Vite detects the `new Worker(new URL(...), { type: 'module' })` pattern and
 * bundles the worker into its own asset in the production build.
 */
export function createWorkerTransport(): SimulationWorkerTransport {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'aethrion-simulation',
  });

  return new ComlinkWorkerTransport(worker);
}

/**
 * Whether the current environment can spawn a Worker.
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}
