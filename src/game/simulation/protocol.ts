/**
 * Worker protocol — the typed contract between the main thread and the
 * simulation Worker.
 *
 * The protocol is deliberately **data only**: every response is a plain,
 * structured-clone-safe object. Errors are returned as a discriminated result
 * instead of being thrown, because a thrown error loses its type across the
 * message boundary.
 *
 * Every request carries a **monotonic sequence number**. The main thread only
 * accepts the response of the request it is currently waiting for — a stale
 * or duplicated response is rejected instead of overwriting newer state.
 */

import type { SimulationContext } from '@/game/engine/types';
import type { SimulationDelta, SimulationSnapshot } from './types';

/**
 * The version of the protocol. The main thread refuses a worker that speaks a
 * different version.
 */
export const WORKER_PROTOCOL_VERSION = 1;

/**
 * The error codes the worker can report.
 */
export type WorkerErrorCode =
  | 'WORKER_PROTOCOL_MISMATCH'
  | 'WORKER_INVALID_REQUEST'
  | 'WORKER_TICK_FAILED';

/**
 * The readiness handshake.
 */
export interface WorkerHelloRequest {
  protocolVersion: number;
}

export interface WorkerHelloResponse {
  protocolVersion: number;
  /** A stable identifier of the worker instance. */
  workerId: string;
  /** Whether the worker returns the delta of a tick instead of the full state. */
  supportsDelta: boolean;
}

/**
 * A request to advance the simulation by one tick.
 */
export interface WorkerTickRequest {
  /** The monotonic sequence number of the request. */
  sequence: number;
  /** The complete simulation state. */
  snapshot: SimulationSnapshot;
  /** The context of the tick. */
  context: SimulationContext;
}

/**
 * The result of a tick.
 */
export interface WorkerTickSuccess {
  ok: true;
  /** The sequence number of the request this result belongs to. */
  sequence: number;
  /** The slices that changed. */
  delta: SimulationDelta;
  /** The number of slices that changed. */
  changedSlices: number;
  /** The duration of the simulation work inside the worker, in milliseconds. */
  durationMs: number;
}

export interface WorkerTickFailure {
  ok: false;
  /** The sequence number of the request this result belongs to. */
  sequence: number;
  code: WorkerErrorCode;
  message: string;
}

export type WorkerTickResult = WorkerTickSuccess | WorkerTickFailure;

/**
 * The API the Worker exposes.
 */
export interface SimulationWorkerApi {
  /** The readiness handshake. */
  hello(request: WorkerHelloRequest): Promise<WorkerHelloResponse>;
  /** Advances the simulation by one tick. */
  tick(request: WorkerTickRequest): Promise<WorkerTickResult>;
}

/**
 * The error thrown when the protocol version does not match.
 */
export class WorkerProtocolError extends Error {
  readonly code: WorkerErrorCode;

  constructor(code: WorkerErrorCode, message: string) {
    super(message);
    this.name = 'WorkerProtocolError';
    this.code = code;
  }
}

/**
 * Whether a tick result belongs to the given sequence number.
 *
 * A result with a **lower** sequence is stale (it belongs to a request that
 * was already abandoned) and must be ignored. A result with a **higher**
 * sequence cannot happen — the client only ever has one request in flight —
 * and is rejected as invalid.
 */
export function isResultForSequence(
  result: { sequence: number },
  expectedSequence: number,
): boolean {
  return result.sequence === expectedSequence;
}

/**
 * Whether a result is stale — it belongs to an abandoned request.
 */
export function isStaleResult(
  result: { sequence: number },
  currentSequence: number,
): boolean {
  return result.sequence < currentSequence;
}
