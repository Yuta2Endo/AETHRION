/**
 * Simulation runner — binds the Game Core, the Game Clock, the game state
 * and the domain engines into one running simulation.
 *
 * Tick execution order (deterministic, Stage 04):
 *   1. Game Clock        — advances simulated time (engine-owned, before systems)
 *   2. World Engine      — order 10
 *   3. Economy Engine    — order 20  ← consumes the world produced in step 2
 *   4. Employee Engine   — order 30  ← develops the workforce
 *   5. Technology Engine — order 40  ← research uses the workforce of step 4
 *   6. Product Engine    — order 50  ← development uses the unlocked technologies
 *   7. Resource Engine   — order 60  ← resource bookkeeping
 *   8. Production Engine — order 70  ← consumes the reserved resources
 *   9. Market Engine     — order 80  ← sells the finished goods
 *  10. Corporation Engine— order 90  ← accrues the finances, payroll, progression
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
import {
  accrueFinances,
  getPlayerCorporation,
  recordFinancialEvent,
  updateProgression,
  type CorporationContext,
} from '@/simulation/corporation';
import { updateEconomy } from '@/simulation/economy';
import {
  applyPayroll,
  developEmployees,
  getActiveEmployees,
  getPayrollPeriod,
} from '@/simulation/employees';
import {
  buildCorporateMarketSignal,
  ensureListing,
  processSales,
} from '@/simulation/market';
import { advanceDevelopment } from '@/simulation/products';
import { advanceProduction, getTotalCapacity } from '@/simulation/production';
import { advanceResources, consumeResources } from '@/simulation/resources';
import { advanceResearch, getUnlockedEffects } from '@/simulation/technology';
import { evolveWorld, getMarketActivityIndex } from '@/simulation/world';

/**
 * Deterministic execution order of the registered simulation systems.
 * Lower numbers execute first.
 */
export const SIMULATION_SYSTEM_ORDER = {
  world: 10,
  economy: 20,
  employees: 30,
  technology: 40,
  products: 50,
  resources: 60,
  production: 70,
  market: 80,
  corporation: 90,
} as const;

/** Speed multipliers offered by the interface. */
export const SIMULATION_SPEEDS = [0.5, 1, 2, 4] as const;

export interface SimulationRunnerOptions {
  clock?: GameClock;
  scheduler?: EngineScheduler;
  tickDurationMs?: number;
  /** Skip registering the simulation systems (used by unit tests). */
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
        const employees = getActiveEmployees(store.employees);
        const workforceProductivity =
          employees.length > 0
            ? employees.reduce((sum, employee) => sum + employee.productivity, 0) /
              employees.length
            : 0;

        // The corporate market signal is the documented integration boundary
        // between the corporation and the market.
        const signal = buildCorporateMarketSignal({
          workforceProductivity,
          marketReach: getUnlockedEffects(store.technology).marketReach ?? 1,
          productionCapacity: getTotalCapacity(store.production),
          activeProducts: store.market.listings.filter((listing) => listing.active).length,
        });

        const next = updateEconomy(store.economy, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          marketActivityIndex: getMarketActivityIndex(store.world),
          corporateSignal: signal,
        });
        store.applyEconomyState(next);
      },
    });

    this.engine.registerSystem({
      name: 'employees',
      order: SIMULATION_SYSTEM_ORDER.employees,
      update: (context) => {
        const store = useGameStore.getState();
        const period = getPayrollPeriod(context.elapsedSimMs);
        const next = developEmployees(store.employees, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          elapsedSimMs: context.elapsedSimMs,
          periodId: period.id,
        });
        store.applyEmployeeState(next);
      },
    });

    this.engine.registerSystem({
      name: 'technology',
      order: SIMULATION_SYSTEM_ORDER.technology,
      update: (context) => {
        const store = useGameStore.getState();
        const next = advanceResearch(
          store.technology,
          {
            tick: context.tick,
            deltaMs: context.deltaMs,
            simTimeMs: context.simTimeMs,
          },
          store.employees.employees,
        );
        store.applyTechnologyState(next);
      },
    });

    this.engine.registerSystem({
      name: 'products',
      order: SIMULATION_SYSTEM_ORDER.products,
      update: (context) => {
        const store = useGameStore.getState();
        const next = advanceDevelopment(
          store.products,
          store.technology,
          {
            tick: context.tick,
            deltaMs: context.deltaMs,
            simTimeMs: context.simTimeMs,
          },
          store.employees.employees,
        );
        store.applyProductState(next);
      },
    });

    this.engine.registerSystem({
      name: 'resources',
      order: SIMULATION_SYSTEM_ORDER.resources,
      update: (context) => {
        const store = useGameStore.getState();
        const next = advanceResources(store.resources, {
          tick: context.tick,
          deltaMs: context.deltaMs,
        });
        store.applyResourceState(next);
      },
    });

    this.engine.registerSystem({
      name: 'production',
      order: SIMULATION_SYSTEM_ORDER.production,
      update: (context) => {
        const store = useGameStore.getState();
        const advanced = advanceProduction(
          store.production,
          {
            tick: context.tick,
            deltaMs: context.deltaMs,
            simTimeMs: context.simTimeMs,
          },
          store.employees.employees,
        );

        if (advanced.completed.length === 0) {
          if (advanced.state !== store.production) {
            store.applyProductionState(advanced.state);
          }
          return;
        }

        let resources = store.resources;
        let products = store.products;

        for (const order of advanced.completed) {
          // The reserved resources leave the inventory.
          const consumed = consumeResources(
            resources,
            order.reservedResources,
            context.simTimeMs,
          );
          if (consumed.ok) {
            resources = consumed.value.state;
          }

          // The finished goods enter the product inventory.
          products = {
            ...products,
            instances: products.instances.map((instance) =>
              instance.id === order.productInstanceId
                ? { ...instance, inventory: instance.inventory + order.produced }
                : instance,
            ),
          };
        }

        store.applyProductionState(advanced.state);
        store.applyResourceState(resources);
        store.applyProductState(products);
      },
    });

    this.engine.registerSystem({
      name: 'market',
      order: SIMULATION_SYSTEM_ORDER.market,
      update: (context) => {
        const store = useGameStore.getState();
        const effects = getUnlockedEffects(store.technology);

        // Every finished product offered on the market needs a listing.
        let market = store.market;
        for (const instance of store.products.instances) {
          if (instance.status === 'ready' && instance.salesActive) {
            market = ensureListing(market, instance.id, instance.price, true);
          }
        }

        const sales = processSales(store.products, market, {
          deltaMs: context.deltaMs,
          marketActivityIndex: getMarketActivityIndex(store.world),
          marketReach: effects.marketReach ?? 1,
          simTimeMs: context.simTimeMs,
        });

        store.applyProductState(sales.products);
        store.applyMarketState(sales.market);

        if (sales.revenueToRecord > 0) {
          const corporation = getPlayerCorporation(store.corporation);
          if (corporation) {
            const next = recordFinancialEvent(corporation, {
              type: 'sales',
              amount: sales.revenueToRecord,
              description: 'Market sales',
              simTimeMs: context.simTimeMs,
            });
            if (next !== corporation) {
              store.applyCorporationState({
                ...store.corporation,
                corporations: store.corporation.corporations.map((candidate) =>
                  candidate.id === next.id ? next : candidate,
                ),
              });
            }
          }
        }
      },
    });

    this.engine.registerSystem({
      name: 'corporation',
      order: SIMULATION_SYSTEM_ORDER.corporation,
      update: (context) => {
        const store = useGameStore.getState();
        const corporation = getPlayerCorporation(store.corporation);
        if (!corporation) return;

        const employees = getActiveEmployees(store.employees);
        const workforceProductivity = employees.reduce(
          (total, employee) => total + employee.productivity,
          0,
        );

        const period = getPayrollPeriod(context.elapsedSimMs);
        const corporationContext: CorporationContext = {
          tick: context.tick,
          deltaMs: context.deltaMs,
          elapsedSimMs: context.elapsedSimMs,
          periodId: period.id,
          workforceProductivity,
          employeeCount: employees.length,
        };

        // 1. Accrue revenue and operating costs for the elapsed time.
        let next = accrueFinances(corporation, corporationContext);

        // 2. Process the payroll of the current period — at most once.
        const payroll = applyPayroll(next, employees, {
          elapsedSimMs: context.elapsedSimMs,
          simTimeMs: context.simTimeMs,
        });
        next = payroll.corporation;
        store.applyEmployeeState({ ...store.employees, employees: payroll.employees });

        // 3. Update reputation, tier and status.
        next = updateProgression(next, corporationContext);

        store.applyCorporationState({
          ...store.corporation,
          corporations: store.corporation.corporations.map((candidate) =>
            candidate.id === next.id ? next : candidate,
          ),
          tick: store.corporation.tick + 1,
        });
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
