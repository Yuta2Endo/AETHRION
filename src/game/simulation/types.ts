/**
 * Simulation kernel — shared types.
 *
 * The kernel is the **pure** part of the simulation: it advances the domain
 * engines over a plain, serialisable state object. It knows nothing about
 * React, the DOM, Zustand or the rendering engine, so the very same code runs
 * on the main thread and inside a Web Worker.
 */

import type { CityState } from '@/simulation/city';
import type { CompetitorsState } from '@/simulation/competitors';
import type { CorporationState } from '@/simulation/corporation';
import type { EconomyState } from '@/simulation/economy';
import type { EmployeeState } from '@/simulation/employees';
import type { EventsState } from '@/simulation/events';
import type { MarketState } from '@/simulation/market';
import type { ProductState } from '@/simulation/products';
import type { ProductionState } from '@/simulation/production';
import type { ResourceState } from '@/simulation/resources';
import type { TechnologyState } from '@/simulation/technology';
import type { WorldState } from '@/simulation/world';

/**
 * The slices of the simulation state, in their canonical order.
 *
 * The order matches the tick order of the systems that write them.
 */
export const SIMULATION_SLICE_KEYS = [
  'world',
  'economy',
  'corporation',
  'employees',
  'technology',
  'products',
  'resources',
  'production',
  'market',
  'city',
  'events',
  'competitors',
] as const;

export type SimulationSliceKey = (typeof SIMULATION_SLICE_KEYS)[number];

/**
 * The complete simulation state — everything the domain engines read.
 *
 * The object is plain and structured-clone-safe, so it can be transferred to a
 * Web Worker without any conversion.
 */
export interface SimulationSnapshot {
  world: WorldState;
  economy: EconomyState;
  corporation: CorporationState;
  employees: EmployeeState;
  technology: TechnologyState;
  products: ProductState;
  resources: ResourceState;
  production: ProductionState;
  market: MarketState;
  city: CityState;
  events: EventsState;
  competitors: CompetitorsState;
}

/**
 * The slices that changed during a tick.
 *
 * A partial snapshot — the worker returns only what actually changed, the
 * main thread applies only those slices.
 */
export type SimulationDelta = Partial<SimulationSnapshot>;

/**
 * The write side of the simulation store.
 *
 * The Zustand state object satisfies it (the actions are part of the state) and
 * so does the local store of the Worker.
 */
export interface SimulationStateWriter {
  applyWorldState(next: WorldState): void;
  applyEconomyState(next: EconomyState): void;
  applyCorporationState(next: CorporationState): void;
  applyEmployeeState(next: EmployeeState): void;
  applyTechnologyState(next: TechnologyState): void;
  applyProductState(next: ProductState): void;
  applyResourceState(next: ResourceState): void;
  applyProductionState(next: ProductionState): void;
  applyMarketState(next: MarketState): void;
  applyCityState(next: CityState): void;
  applyEventsState(next: EventsState): void;
  applyCompetitorsState(next: CompetitorsState): void;
}

/**
 * The store interface the simulation systems are bound to.
 *
 * The Zustand store satisfies it structurally (`getState` + the `applyXState`
 * actions), and so does the lightweight local store the Worker uses. That is
 * what lets the *same* system implementations run in both places.
 */
export interface SimulationStore extends SimulationStateWriter {
  getState(): SimulationSnapshot;
}

/**
 * A plain, local implementation of the simulation store.
 *
 * It is used by the Worker (the state lives in the message payload) and by the
 * main-thread fallback. It records which slices changed, so only the delta has
 * to be sent back.
 */
export class LocalSimulationStore implements SimulationStore {
  private state: SimulationSnapshot;
  private readonly initial: SimulationSnapshot;

  constructor(snapshot: SimulationSnapshot) {
    this.state = snapshot;
    this.initial = snapshot;
  }

  getState(): SimulationSnapshot {
    return this.state;
  }

  applyWorldState(next: SimulationSnapshot['world']): void {
    this.state = { ...this.state, world: next };
  }

  applyEconomyState(next: SimulationSnapshot['economy']): void {
    this.state = { ...this.state, economy: next };
  }

  applyCorporationState(next: SimulationSnapshot['corporation']): void {
    this.state = { ...this.state, corporation: next };
  }

  applyEmployeeState(next: SimulationSnapshot['employees']): void {
    this.state = { ...this.state, employees: next };
  }

  applyTechnologyState(next: SimulationSnapshot['technology']): void {
    this.state = { ...this.state, technology: next };
  }

  applyProductState(next: SimulationSnapshot['products']): void {
    this.state = { ...this.state, products: next };
  }

  applyResourceState(next: SimulationSnapshot['resources']): void {
    this.state = { ...this.state, resources: next };
  }

  applyProductionState(next: SimulationSnapshot['production']): void {
    this.state = { ...this.state, production: next };
  }

  applyMarketState(next: SimulationSnapshot['market']): void {
    this.state = { ...this.state, market: next };
  }

  applyCityState(next: SimulationSnapshot['city']): void {
    this.state = { ...this.state, city: next };
  }

  applyEventsState(next: SimulationSnapshot['events']): void {
    this.state = { ...this.state, events: next };
  }

  applyCompetitorsState(next: SimulationSnapshot['competitors']): void {
    this.state = { ...this.state, competitors: next };
  }

  /**
   * The slices that changed since the store was created.
   *
   * The comparison is by reference: a system that does not write its slice
   * leaves the reference untouched, so the delta stays minimal.
   */
  getDelta(): SimulationDelta {
    const delta: SimulationDelta = {};

    for (const key of SIMULATION_SLICE_KEYS) {
      if (this.state[key] !== this.initial[key]) {
        // The assignment is safe: every key of the union is a slice of the
        // snapshot and the types line up one to one.
        (delta as Record<string, unknown>)[key] = this.state[key];
      }
    }

    return delta;
  }

  /**
   * The complete state after the tick.
   */
  getSnapshot(): SimulationSnapshot {
    return this.state;
  }
}

/**
 * Extracts the simulation slices from a game store state.
 */
export function captureSnapshot(state: SimulationSnapshot): SimulationSnapshot {
  return {
    world: state.world,
    economy: state.economy,
    corporation: state.corporation,
    employees: state.employees,
    technology: state.technology,
    products: state.products,
    resources: state.resources,
    production: state.production,
    market: state.market,
    city: state.city,
    events: state.events,
    competitors: state.competitors,
  };
}

/**
 * Applies a delta to a game store.
 *
 * Only the slices that are present in the delta are written — a slice that
 * did not change keeps its reference, so the store does not trigger a
 * re-render for it.
 */
export function applyDelta(
  writer: SimulationStateWriter,
  delta: SimulationDelta,
): void {
  if (delta.world !== undefined) writer.applyWorldState(delta.world);
  if (delta.economy !== undefined) writer.applyEconomyState(delta.economy);
  if (delta.corporation !== undefined) writer.applyCorporationState(delta.corporation);
  if (delta.employees !== undefined) writer.applyEmployeeState(delta.employees);
  if (delta.technology !== undefined) writer.applyTechnologyState(delta.technology);
  if (delta.products !== undefined) writer.applyProductState(delta.products);
  if (delta.resources !== undefined) writer.applyResourceState(delta.resources);
  if (delta.production !== undefined) writer.applyProductionState(delta.production);
  if (delta.market !== undefined) writer.applyMarketState(delta.market);
  if (delta.city !== undefined) writer.applyCityState(delta.city);
  if (delta.events !== undefined) writer.applyEventsState(delta.events);
  if (delta.competitors !== undefined) writer.applyCompetitorsState(delta.competitors);
}
