/**
 * Simulation runner — binds the Game Core, the Game Clock, the game state
 * and the domain engines into one running simulation.
 *
 * Tick execution order (deterministic):
 *   1. Game Clock  — advances simulated time (engine-owned, before systems)
 *   2. World Engine — evolves regions from the new simulated time
 *   3. Economy Engine — updates markets using the world produced in step 2
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
import { useGameStore } from '@/game/state/gameStore';
import { updateEconomy } from '@/simulation/economy';
import { evolveWorld, getMarketActivityIndex } from '@/simulation/world';

/**
 * Deterministic execution order of the registered simulation systems.
 * Lower numbers execute first.
 */
export const SIMULATION_SYSTEM_ORDER = {
  world: 10,
  economy: 20,
} as const;

/** Speed multipliers offered by the interface. */
export const SIMULATION_SPEEDS = [0.5, 1, 2, 4] as const;

export interface SimulationRunnerOptions {
  clock?: GameClock;
  scheduler?: EngineScheduler;
  tickDurationMs?: number;
  /** Skip registering the world / economy systems (used by unit tests). */
  registerSystems?: boolean;
}

export class SimulationRunner {
  private readonly engine: GameEngine;
  private readonly clock: GameClock;
  private readonly unbinders: Array<() => void> = [];

  constructor(options: SimulationRunnerOptions = {}) {
    const tickDurationMs = options.tickDurationMs ?? 1000;

    this.clock =
      options.clock ??
      new GameClock({ tickDurationMs } satisfies Partial<GameClockConfig>);

    this.engine = new GameEngine({
      clock: this.clock,
      scheduler: options.scheduler,
      config: { tickDurationMs },
    });

    if (options.registerSystems !== false) {
      this.registerSystems();
    }
    this.bindStore();
  }

  // -------------------------------------------------------------- wiring

  private registerSystems(): void {
    this.engine.registerSystem({
      name: 'world',
      order: SIMULATION_SYSTEM_ORDER.world,
      update: (context) => {
        const store = useGameStore.getState();
        const next = evolveWorld(store.world, {
          tick: context.tick,
          deltaMs: context.deltaMs,
        });
        store.applyWorldState(next);
      },
    });

    this.engine.registerSystem({
      name: 'economy',
      order: SIMULATION_SYSTEM_ORDER.economy,
      update: (context) => {
        const store = useGameStore.getState();
        const next = updateEconomy(store.economy, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          marketActivityIndex: getMarketActivityIndex(store.world),
        });
        store.applyEconomyState(next);
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

  /** Restores the simulation to its initial state. */
  reset(): void {
    this.engine.reset();
    this.clock.reset();
    useGameStore.getState().reset();
    logger.info('Simulation reset');
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

  /** Releases the engine and every store subscription. */
  dispose(): void {
    this.unbinders.forEach((unbind) => unbind());
    this.unbinders.length = 0;
    this.engine.dispose();
  }
}

/**
 * Application-wide simulation instance.
 * The UI controls this instance; the simulation never depends on React.
 */
export const simulation = new SimulationRunner();
