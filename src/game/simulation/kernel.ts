/**
 * Simulation kernel — the deterministic heart of the simulation.
 *
 * The kernel contains the twelve simulation systems of AETHRION. They are
 * bound to an **injected store**, which is what allows the very same code to
 * run
 *
 * - on the main thread, against the Zustand store (the inline mode), and
 * - inside a Web Worker, against a plain local store (the worker mode).
 *
 * The kernel imports **no** React, DOM, Zustand or rendering code — it is pure
 * domain logic and it is safe to execute in any JavaScript context.
 *
 * The tick order is fixed and documented:
 *
 * | Order | System        | Depends on                                   |
 * |-------|---------------|----------------------------------------------|
 * |  10   | world         | —                                            |
 * |  11   | events        | the world                                    |
 * |  15   | city          | the events                                   |
 * |  20   | economy       | the world, the three market signals, the events |
 * |  30   | employees     | —                                            |
 * |  40   | technology    | the employees, the events                    |
 * |  50   | products      | the technology, the employees                |
 * |  60   | resources     | —                                            |
 * |  70   | production    | the products, the resources, the events      |
 * |  80   | market        | the products, the world, the events          |
 * |  85   | competitors   | the economy, the world, the events           |
 * |  90   | corporation   | the employees, the city, the events          |
 */

import { logger } from '@/core/logging/logger';
import type { EngineSystem, SimulationContext } from '@/game/engine/types';
import { advanceCity, buildCityMarketSignal, getCityOperatingCostPerHour } from '@/simulation/city';
import { advanceCompetitors, buildCompetitorMarketSignal } from '@/simulation/competitors';
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
import { advanceEvents, aggregateModifiers, publishNews } from '@/simulation/events';
import { buildCorporateMarketSignal, ensureListing, processSales } from '@/simulation/market';
import { advanceDevelopment } from '@/simulation/products';
import { advanceProduction, getTotalCapacity } from '@/simulation/production';
import { advanceResources, consumeResources } from '@/simulation/resources';
import { advanceResearch, getUnlockedEffects } from '@/simulation/technology';
import { evolveWorld, getMarketActivityIndex, getWorldMetrics } from '@/simulation/world';
import { LocalSimulationStore, type SimulationDelta, type SimulationSnapshot, type SimulationStore } from './types';

/**
 * The deterministic execution order of the registered simulation systems.
 * Lower numbers execute first.
 */
export const SIMULATION_SYSTEM_ORDER = {
  world: 10,
  events: 11,
  city: 15,
  economy: 20,
  employees: 30,
  technology: 40,
  products: 50,
  resources: 60,
  production: 70,
  market: 80,
  competitors: 85,
  corporation: 90,
} as const;

/**
 * The four commodity categories in their canonical order.
 */
const CATEGORIES = ['compute', 'energy', 'materials', 'logistics'] as const;

/**
 * The average development of the world, 0..100.
 */
function getAverageWorldDevelopment(world: SimulationSnapshot['world']): number {
  return getWorldMetrics(world).averageDevelopment;
}

/**
 * The market presence of the player corporation, 0..100.
 *
 * It is a proxy built from the listings the player offers — the competitors
 * compare themselves with it.
 */
function getPlayerMarketPresence(store: SimulationSnapshot): number {
  const active = store.market.listings.filter((listing) => listing.active).length;
  const sold = store.market.listings.reduce((total, listing) => total + listing.unitsSold, 0);
  return Math.min(100, Math.max(0, active * 18 + sold * 0.05));
}

/**
 * Whether an active global event creates a commodity shortage.
 */
function hasCommodityShortage(modifiers: ReturnType<typeof aggregateModifiers>): boolean {
  return CATEGORIES.some(
    (category) =>
      modifiers.commoditySupply[category] < 1 && modifiers.commodityDemand[category] >= 1,
  );
}

/**
 * Whether an active global event creates a commodity surplus.
 */
function hasCommoditySurplus(modifiers: ReturnType<typeof aggregateModifiers>): boolean {
  return CATEGORIES.some(
    (category) =>
      modifiers.commoditySupply[category] > 1 && modifiers.commodityDemand[category] <= 1,
  );
}

/**
 * Builds the twelve simulation systems, bound to the given store.
 *
 * The systems are created fresh for every store, so the inline mode and the
 * Worker mode execute *exactly* the same implementations.
 */
export function createSimulationSystems(store: SimulationStore): EngineSystem[] {
  return [
    {
      name: 'world',
      order: SIMULATION_SYSTEM_ORDER.world,
      update: (context) => {
        const state = store.getState();
        const next = evolveWorld(state.world, {
          tick: context.tick,
          deltaMs: context.deltaMs,
        });
        store.applyWorldState(next);
      },
    },

    {
      name: 'events',
      order: SIMULATION_SYSTEM_ORDER.events,
      update: (context) => {
        const state = store.getState();
        const city = state.city.city;

        const result = advanceEvents(state.events, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          simTimeMs: context.simTimeMs,
          elapsedSimMs: context.elapsedSimMs,
          worldDevelopment: getAverageWorldDevelopment(state.world),
          marketActivityIndex: getMarketActivityIndex(state.world),
          hasCorporation: state.corporation.playerCorporationId !== null,
          hasActiveCity:
            city !== null && city.buildings.some((building) => building.status === 'operational'),
        });

        if (result.state === state.events) return;

        // The Global Events Engine owns the news feed — it published the news
        // of the activation and the expiration itself.
        store.applyEventsState(result.state);
      },
    },

    {
      name: 'city',
      order: SIMULATION_SYSTEM_ORDER.city,
      update: (context) => {
        const state = store.getState();
        const modifiers = aggregateModifiers(state.events, context.simTimeMs);

        const next = advanceCity(state.city, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          simTimeMs: context.simTimeMs,
          eventCityPressure: {
            infrastructure: modifiers.cityInfrastructurePressure,
            environment: modifiers.cityEnvironmentPressure,
            commercialActivity: modifiers.cityCommercialActivity,
          },
        });

        if (next !== state.city) {
          store.applyCityState(next);
        }
      },
    },

    {
      name: 'economy',
      order: SIMULATION_SYSTEM_ORDER.economy,
      update: (context) => {
        const state = store.getState();
        const employees = getActiveEmployees(state.employees);
        const workforceProductivity =
          employees.length > 0
            ? employees.reduce((sum, employee) => sum + employee.productivity, 0) /
              employees.length
            : 0;

        // The corporate market signal is the documented integration boundary
        // between the corporation and the market.
        const signal = buildCorporateMarketSignal({
          workforceProductivity,
          marketReach: getUnlockedEffects(state.technology).marketReach ?? 1,
          productionCapacity: getTotalCapacity(state.production),
          activeProducts: state.market.listings.filter((listing) => listing.active).length,
        });

        // The city market signal is the documented integration boundary
        // between the city and the market. It is only produced while the city
        // runs something — otherwise the economy behaves exactly as in Stage 04.
        const citySignal = state.city.city
          ? buildCityMarketSignal(state.city.city) ?? undefined
          : undefined;

        // The competitor market signal is the documented integration boundary
        // between the AI corporations and the market.
        const competitorSignal = buildCompetitorMarketSignal(state.competitors) ?? undefined;

        // The global events modulate the supply and the demand as well.
        const modifiers = aggregateModifiers(state.events, context.simTimeMs);

        const next = updateEconomy(state.economy, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          marketActivityIndex: getMarketActivityIndex(state.world),
          corporateSignal: signal,
          citySignal,
          competitorSignal,
          eventModifiers: modifiers,
        });
        store.applyEconomyState(next);
      },
    },

    {
      name: 'employees',
      order: SIMULATION_SYSTEM_ORDER.employees,
      update: (context) => {
        const state = store.getState();
        const period = getPayrollPeriod(context.elapsedSimMs);
        const next = developEmployees(state.employees, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          elapsedSimMs: context.elapsedSimMs,
          periodId: period.id,
        });
        store.applyEmployeeState(next);
      },
    },

    {
      name: 'technology',
      order: SIMULATION_SYSTEM_ORDER.technology,
      update: (context) => {
        const state = store.getState();
        const next = advanceResearch(
          state.technology,
          {
            tick: context.tick,
            deltaMs: context.deltaMs,
            simTimeMs: context.simTimeMs,
            eventResearchSpeed: aggregateModifiers(state.events, context.simTimeMs).researchSpeed,
          },
          state.employees.employees,
        );
        store.applyTechnologyState(next);
      },
    },

    {
      name: 'products',
      order: SIMULATION_SYSTEM_ORDER.products,
      update: (context) => {
        const state = store.getState();
        const next = advanceDevelopment(
          state.products,
          state.technology,
          {
            tick: context.tick,
            deltaMs: context.deltaMs,
            simTimeMs: context.simTimeMs,
          },
          state.employees.employees,
        );
        store.applyProductState(next);
      },
    },

    {
      name: 'resources',
      order: SIMULATION_SYSTEM_ORDER.resources,
      update: (context) => {
        const state = store.getState();
        const next = advanceResources(state.resources, {
          tick: context.tick,
          deltaMs: context.deltaMs,
        });
        store.applyResourceState(next);
      },
    },

    {
      name: 'production',
      order: SIMULATION_SYSTEM_ORDER.production,
      update: (context) => {
        const state = store.getState();
        const advanced = advanceProduction(
          state.production,
          {
            tick: context.tick,
            deltaMs: context.deltaMs,
            simTimeMs: context.simTimeMs,
            eventEfficiency: aggregateModifiers(state.events, context.simTimeMs)
              .productionEfficiency,
          },
          state.employees.employees,
        );

        if (advanced.completed.length === 0) {
          if (advanced.state !== state.production) {
            store.applyProductionState(advanced.state);
          }
          return;
        }

        let resources = state.resources;
        let products = state.products;

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
    },

    {
      name: 'market',
      order: SIMULATION_SYSTEM_ORDER.market,
      update: (context) => {
        const state = store.getState();
        const effects = getUnlockedEffects(state.technology);

        // Every finished product offered on the market needs a listing.
        let market = state.market;
        for (const instance of state.products.instances) {
          if (instance.status === 'ready' && instance.salesActive) {
            market = ensureListing(market, instance.id, instance.price, true);
          }
        }

        const sales = processSales(state.products, market, {
          deltaMs: context.deltaMs,
          marketActivityIndex: getMarketActivityIndex(state.world),
          marketReach: effects.marketReach ?? 1,
          simTimeMs: context.simTimeMs,
          eventMarketDemand: aggregateModifiers(state.events, context.simTimeMs).marketDemand,
        });

        store.applyProductState(sales.products);
        store.applyMarketState(sales.market);

        if (sales.revenueToRecord > 0) {
          const corporation = getPlayerCorporation(state.corporation);
          if (corporation) {
            const next = recordFinancialEvent(corporation, {
              type: 'sales',
              amount: sales.revenueToRecord,
              description: 'Market sales',
              simTimeMs: context.simTimeMs,
            });
            if (next !== corporation) {
              store.applyCorporationState({
                ...state.corporation,
                corporations: state.corporation.corporations.map((candidate) =>
                  candidate.id === next.id ? next : candidate,
                ),
              });
            }
          }
        }
      },
    },

    {
      name: 'competitors',
      order: SIMULATION_SYSTEM_ORDER.competitors,
      update: (context) => {
        const state = store.getState();
        const modifiers = aggregateModifiers(state.events, context.simTimeMs);

        const result = advanceCompetitors(state.competitors, {
          tick: context.tick,
          deltaMs: context.deltaMs,
          simTimeMs: context.simTimeMs,
          marketActivityIndex: getMarketActivityIndex(state.world),
          globalDemandIndex: state.economy.globalDemandIndex,
          globalSupplyIndex: state.economy.globalSupplyIndex,
          playerPresence: getPlayerMarketPresence(state),
          modifiers,
          hasShortage: hasCommodityShortage(modifiers),
          hasSurplus: hasCommoditySurplus(modifiers),
        });

        if (result.state === state.competitors) return;

        store.applyCompetitorsState(result.state);

        // The news of the AI is published into the events slice.
        if (result.news.length > 0) {
          let events = state.events;
          for (const candidate of result.news) {
            events = publishNews(events, candidate, context.simTimeMs);
          }
          store.applyEventsState(events);
        }
      },
    },

    {
      name: 'corporation',
      order: SIMULATION_SYSTEM_ORDER.corporation,
      update: (context) => {
        const state = store.getState();
        const corporation = getPlayerCorporation(state.corporation);
        if (!corporation) return;

        const employees = getActiveEmployees(state.employees);
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
          // The operating cost of the city buildings (Stage 05). It is zero
          // while the city runs nothing, so the Stage 03 semantics are
          // preserved exactly.
          cityOperatingCostPerHour: state.city.city
            ? getCityOperatingCostPerHour(state.city.city)
            : 0,
          // The operating cost modifier of the active global events (Stage 06).
          eventOperatingCost: aggregateModifiers(state.events, context.simTimeMs).operatingCost,
        };

        // 1. Accrue revenue and operating costs for the elapsed time.
        let next = accrueFinances(corporation, corporationContext);

        // 2. Process the payroll of the current period — at most once.
        const payroll = applyPayroll(next, employees, {
          elapsedSimMs: context.elapsedSimMs,
          simTimeMs: context.simTimeMs,
        });
        next = payroll.corporation;
        store.applyEmployeeState({ ...state.employees, employees: payroll.employees });

        // 3. Update reputation, tier and status.
        next = updateProgression(next, corporationContext);

        store.applyCorporationState({
          ...state.corporation,
          corporations: state.corporation.corporations.map((candidate) =>
            candidate.id === next.id ? next : candidate,
          ),
          tick: state.corporation.tick + 1,
        });
      },
    },
  ];
}

/**
 * Advances the whole simulation by one tick over a plain snapshot.
 *
 * The systems run in their documented order and a failing system is isolated —
 * exactly like the Game Core does it on the main thread. The result is the
 * new snapshot and the delta of the slices that changed.
 */
export async function advanceSimulation(
  snapshot: SimulationSnapshot,
  context: SimulationContext,
): Promise<{ snapshot: SimulationSnapshot; delta: SimulationDelta }> {
  if (!snapshot || typeof snapshot !== 'object' || !('world' in snapshot) || !('economy' in snapshot)) {
    throw new Error('[SIMULATION_INVALID_SNAPSHOT] the snapshot is missing or invalid');
  }

  const store = new LocalSimulationStore(snapshot);
  const systems = createSimulationSystems(store);

  for (const system of systems) {
    try {
      await system.update(context);
    } catch (error) {
      // A failing system is isolated — the remaining systems still run and
      // the state of the failed system stays untouched.
      logger.error(`Simulation system "${system.name}" failed`, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { snapshot: store.getSnapshot(), delta: store.getDelta() };
}
