/**
 * Simulation runner — binds the Game Core, the Game Clock, the game state
 * and the domain engines into one running simulation.
 *
 * Tick execution order (deterministic, Stage 07):
 *   1. Game Clock        — advances simulated time (engine-owned, before systems)
 *   2. World Engine      — order 10
 *   3. Events Engine     — order 11  ← schedules the global events, expires them
 *   4. City Engine       — order 15  ← consumes the event pressures
 *   5. Economy Engine    — order 20  ← consumes the world and the three signals
 *   6. Employee Engine   — order 30  ← develops the workforce
 *   7. Technology Engine — order 40  ← research uses the workforce of step 6
 *   8. Product Engine    — order 50  ← development uses the unlocked technologies
 *   9. Resource Engine   — order 60  ← resource bookkeeping
 *  10. Production Engine — order 70  ← consumes the reserved resources
 *  11. Market Engine     — order 80  ← sells the finished goods
 *  12. Competitor Engine — order 85  ← the AI decisions and the market activity
 *  13. Corporation Engine— order 90  ← accrues the finances, payroll, progression
 *
 * The competitor engine runs **after** the market: the AI reacts to the
 * results of the tick it is in, and its signal reaches the economy with the
 * next tick. Nothing that was already calculated is ever changed retroactively.
 *
 * ## Execution modes (Stage 07)
 *
 * - `inline` (the default) — the twelve systems are registered on the Game
 *   Core and run on the main thread.
 * - `worker` — a single system delegates the whole tick to a Web Worker. The
 *   Worker runs **the same kernel** (`src/game/simulation/kernel.ts`), so the
 *   result is identical; only the execution place differs.
 *
 * The runner owns the wiring only. Every rule lives in `src/simulation/*`,
 * every lifecycle rule lives in `src/game/engine/*` and every state write
 * goes through the game store.
 */

import { logger } from '@/core/logging/logger';
import type { SimulationStatus } from '@/core/types';
import { GameClock, type GameClockConfig } from '@/game/clock/gameClock';
import { GameEngine } from '@/game/engine/gameEngine';
import type { EngineScheduler } from '@/game/engine/scheduler';
import { SIMULATION_SYSTEM_ORDER, createSimulationSystems } from '@/game/simulation/kernel';
import {
  SimulationMetricsCollector,
  measurePayloadBytes,
} from '@/game/simulation/metrics';
import type { SimulationWorkerTransport } from '@/game/simulation/transport';
import {
  applyDelta,
  captureSnapshot,
  type SimulationStore,
} from '@/game/simulation/types';
import { SimulationWorkerClient } from '@/game/simulation/workerClient';
import { useGameStore } from '@/game/state/gameStore';

export { SIMULATION_SYSTEM_ORDER };

/**
 * Adapts the Zustand store to the store interface of the simulation kernel.
 *
 * The adapter is a thin, allocation-free view: the systems always read the
 * **live** state of the game, exactly like they did before the kernel was
 * introduced.
 */
export function createZustandSimulationStore(): SimulationStore {
  return {
    getState: () => useGameStore.getState(),
    applyWorldState: (next) => useGameStore.getState().applyWorldState(next),
    applyEconomyState: (next) => useGameStore.getState().applyEconomyState(next),
    applyCorporationState: (next) => useGameStore.getState().applyCorporationState(next),
    applyEmployeeState: (next) => useGameStore.getState().applyEmployeeState(next),
    applyTechnologyState: (next) => useGameStore.getState().applyTechnologyState(next),
    applyProductState: (next) => useGameStore.getState().applyProductState(next),
    applyResourceState: (next) => useGameStore.getState().applyResourceState(next),
    applyProductionState: (next) => useGameStore.getState().applyProductionState(next),
    applyMarketState: (next) => useGameStore.getState().applyMarketState(next),
    applyCityState: (next) => useGameStore.getState().applyCityState(next),
    applyEventsState: (next) => useGameStore.getState().applyEventsState(next),
    applyCompetitorsState: (next) => useGameStore.getState().applyCompetitorsState(next),
  };
}

/**
 * The order of the single system that replaces the twelve systems when the
 * simulation runs inside a Worker.
 */
export const WORKER_SYSTEM_ORDER = 5;

/** Speed multipliers offered by the interface. */
export const SIMULATION_SPEEDS = [0.5, 1, 2, 4] as const;

/**
 * Where the simulation work is executed.
 */
export type SimulationExecutionOption = 'inline' | 'worker';

export interface SimulationRunnerOptions {
  clock?: GameClock;
  scheduler?: EngineScheduler;
  tickDurationMs?: number;
  /** Skip registering the simulation systems (used by unit tests). */
  registerSystems?: boolean;
  /**
   * Where the simulation work is executed.
   *
   * `inline` runs the systems on the main thread, `worker` delegates the tick
   * to a Web Worker with a main-thread fallback.
   */
  executionMode?: SimulationExecutionOption;
  /** Creates the Worker transport — injectable for the tests. */
  createWorkerTransport?: () => SimulationWorkerTransport;
  /** The timeout of a Worker round trip, in milliseconds. */
  workerTimeoutMs?: number;
}

export class SimulationRunner {
  private readonly engine: GameEngine;
  private readonly clock: GameClock;
  private readonly unbinders: Array<() => void> = [];
  private readonly metrics = new SimulationMetricsCollector();
  private readonly workerClient: SimulationWorkerClient | null;
  private readonly executionMode: SimulationExecutionOption;

  constructor(options: SimulationRunnerOptions = {}) {
    const tickDurationMs = options.tickDurationMs ?? 1000;
    this.executionMode = options.executionMode ?? 'inline';

    this.clock =
      options.clock ??
      new GameClock({ tickDurationMs } satisfies Partial<GameClockConfig>);

    this.engine = new GameEngine({
      clock: this.clock,
      scheduler: options.scheduler,
      config: { tickDurationMs },
    });

    if (this.executionMode === 'worker') {
      this.workerClient = new SimulationWorkerClient({
        createTransport: options.createWorkerTransport,
        timeoutMs: options.workerTimeoutMs,
        forceSupported: options.createWorkerTransport !== undefined,
      });
    } else {
      this.workerClient = null;
    }

    if (options.registerSystems !== false) {
      this.registerSystems(this.executionMode);
    }
    this.bindStore();
  }

  // -------------------------------------------------------------- wiring

  private registerSystems(mode: SimulationExecutionOption): void {
    if (mode === 'worker') {
      this.registerWorkerSystem();
      return;
    }

    // The inline mode registers the twelve systems of the kernel — the very
    // same implementations the Worker runs.
    for (const system of createSimulationSystems(createZustandSimulationStore())) {
      this.engine.registerSystem(system);
    }
  }

  /**
   * Registers the single system that delegates the tick to the Worker.
   *
   * The Worker computes the delta of the tick; the main thread only applies
   * it. The clock, the tick counter and the pause semantics stay on the main
   * thread — the Game Core remains the authority over the lifecycle.
   */
  private registerWorkerSystem(): void {
    const client = this.workerClient;
    if (!client) {
      throw new Error('[SimulationRunner] the worker mode requires a worker client');
    }

    this.engine.registerSystem({
      name: 'simulation',
      order: WORKER_SYSTEM_ORDER,
      update: async (context) => {
        const store = useGameStore.getState();
        const snapshot = captureSnapshot(store);
        const started = performance.now();

        const result = await client.tick(snapshot, context);
        const durationMs = performance.now() - started;

        // Only the confirmed slices are written — a slice that did not change
        // keeps its reference and does not trigger a re-render.
        applyDelta(useGameStore.getState(), result.delta);

        const status = client.getStatus();
        this.metrics.recordTick({
          mode: result.mode,
          durationMs,
          roundTripMs: result.roundTripMs,
          workerMs: result.workerMs,
          workerAvailable: status.available,
          workerId: status.workerId,
        });
        this.metrics.recordSnapshotSize(measurePayloadBytes(snapshot));

        if (status.fallbackActivations > this.metrics.getMetrics().fallbackActivations) {
          this.metrics.recordFallback();
        }
        if (status.errors > this.metrics.getMetrics().workerErrors) {
          this.metrics.recordWorkerError();
        }

        useGameStore.getState().applyPerformanceMetrics(this.metrics.getMetrics());
      },
    });
  }

  private bindStore(): void {
    this.unbinders.push(
      this.engine.onTick((context) => {
        const store = useGameStore.getState();
        const date = this.clock.getDate();

        store.applySimulationMeta({
          tick: context.tick,
          simTimeMs: context.simTimeMs,
          elapsedSimMs: context.elapsedSimMs,
          date,
          speed: this.clock.getSpeed(),
          status: this.engine.getStatus(),
          lastError: this.engine.getSnapshot().lastError,
        });

        if (!store.empire.foundedOn) {
          store.applyEmpire({
            foundedOn: date,
            homeRegionId: store.world.activeRegionId,
          });
        }
      }),
    );

    this.unbinders.push(
      this.engine.onStatusChange((snapshot) => {
        useGameStore.getState().applySimulationMeta({
          status: snapshot.status,
          tick: snapshot.tick,
          speed: this.clock.getSpeed(),
          lastError: snapshot.lastError,
        });
      }),
    );
  }

  // ----------------------------------------------------------- lifecycle

  start(): void {
    this.engine.start();
  }

  pause(): void {
    this.engine.pause();
  }

  resume(): void {
    this.engine.resume();
  }

  stop(): void {
    this.engine.stop();
  }

  /**
   * Changes the simulation speed.
   * Invalid values are rejected and logged instead of throwing, so a bad
   * request from the interface can never break the running simulation.
   */
  setSpeed(multiplier: number): void {
    try {
      this.clock.setSpeed(multiplier);
      useGameStore
        .getState()
        .applySimulationMeta({ speed: this.clock.getSpeed() });
      logger.info('Simulation speed changed', { speed: multiplier });
    } catch (error) {
      logger.warn('Simulation speed change rejected', {
        speed: multiplier,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Executes exactly one tick (controlled stepping). */
  async step(realDeltaMs?: number): Promise<void> {
    await this.engine.step(realDeltaMs);
  }

  /**
   * Restores the simulation to its initial state.
   */
  reset(): void {
    this.engine.reset();
    this.clock.reset();
    this.metrics.reset();
    useGameStore.getState().reset();
  }

  // ------------------------------------------------------------ getters

  getStatus(): SimulationStatus {
    return this.engine.getStatus();
  }

  getSpeed(): number {
    return this.clock.getSpeed();
  }

  getEngine(): GameEngine {
    return this.engine;
  }

  getClock(): GameClock {
    return this.clock;
  }

  /**
   * The performance figures of the simulation.
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * The status of the simulation Worker.
   */
  getWorkerStatus() {
    return (
      this.workerClient?.getStatus() ?? {
        available: false,
        mode: 'inline' as const,
        workerId: null,
        fallbackActivations: 0,
        errors: 0,
        lastSequence: 0,
      }
    );
  }

  /**
   * Prepares the runner for a state restore.
   *
   * The simulation is stopped, the Worker is reset so it cannot operate on
   * stale pre-load state, and the transient performance figures are cleared.
   * The authoritative game state must be applied by the caller.
   */
  prepareRestore(): void {
    this.engine.stop();
    this.engine.hydrate(0, 'idle');
    this.clock.pause();
    this.metrics.reset();
    this.workerClient?.reset();
  }

  /**
   * Finalises a restore after the authoritative state and the clock have been
   * applied. The game is left paused so the player can resume explicitly.
   */
  finalizeRestore(tick: number): void {
    this.engine.hydrate(tick, 'paused');
    this.clock.pause();
    const store = useGameStore.getState();
    store.applyPerformanceMetrics(this.metrics.getMetrics());
    store.applySimulationMeta({
      status: 'paused',
      tick,
      simTimeMs: this.clock.now(),
      elapsedSimMs: this.clock.getElapsedSimMs(),
      date: this.clock.getDate(),
      speed: this.clock.getSpeed(),
      lastError: null,
    });
  }

  /** Releases the engine and every store subscription. */
  dispose(): void {
    this.unbinders.forEach((unbind) => unbind());
    this.unbinders.length = 0;
    this.workerClient?.terminate();
    this.engine.dispose();
  }
}

/**
 * Application-wide simulation instance.
 * The UI controls this instance; the simulation never depends on React.
 */
export const simulation = new SimulationRunner();
