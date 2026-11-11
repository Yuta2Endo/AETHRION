/**
 * Save serialization �?" builds and applies the persisted payload.
 *
 * The payload is an explicit allowlist of authoritative simulation slices. The
 * UI-only and runtime-only state (performance metrics, Worker, engine internals,
 * React state) is never included.
 */

import { captureSnapshot, type SimulationSnapshot } from '@/game/simulation/types';
import { useGameStore } from '@/game/state/gameStore';
import type { GameClock } from '@/game/clock/gameClock';
import {
  DEFAULT_AUTOSAVE_INTERVAL_SIM_MS,
  type PersistedClockState,
  type PersistedSimulationMeta,
  type PersistedSimulationState,
  type SavePayload,
  SAVE_FORMAT_VERSION,
} from './saveTypes';

/**
 * Captures the authoritative simulation state from the game store.
 */
export function capturePersistedState(): PersistedSimulationState {
  const state = useGameStore.getState();
  const snapshot: SimulationSnapshot = captureSnapshot(state);
  return {
    empire: structuredClone(state.empire),
    world: structuredClone(snapshot.world),
    economy: structuredClone(snapshot.economy),
    corporation: structuredClone(snapshot.corporation),
    employees: structuredClone(snapshot.employees),
    technology: structuredClone(snapshot.technology),
    products: structuredClone(snapshot.products),
    resources: structuredClone(snapshot.resources),
    production: structuredClone(snapshot.production),
    market: structuredClone(snapshot.market),
    city: structuredClone(snapshot.city),
    events: structuredClone(snapshot.events),
    competitors: structuredClone(snapshot.competitors),
  };
}

/**
 * Builds the persisted payload from the current, confirmed game state.
 */
export function buildSavePayload(clock: GameClock): SavePayload {
  const meta = useGameStore.getState().simulation;
  const simulation: PersistedSimulationMeta = {
    status: meta.status,
    tick: meta.tick,
    simTimeMs: meta.simTimeMs,
    elapsedSimMs: meta.elapsedSimMs,
    date: structuredClone(meta.date),
    speed: meta.speed,
    lastError: meta.lastError,
  };

  const clockState: PersistedClockState = {
    snapshot: clock.getSnapshot(),
    speed: clock.getSpeed(),
  };

  return {
    formatVersion: SAVE_FORMAT_VERSION,
    state: capturePersistedState(),
    simulation,
    clock: clockState,
  };
}

/**
 * Applies a validated payload to the authoritative game state.
 *
 * The clock and the engine tick are restored by the caller (the runner/service)
 * so the restore can be performed atomically from the active game's perspective.
 */
export function applyPersistedState(payload: SavePayload): void {
  const store = useGameStore.getState();
  const { state } = payload;

  store.applyEmpire(structuredClone(state.empire));
  store.applyWorldState(structuredClone(state.world));
  store.applyEconomyState(structuredClone(state.economy));
  store.applyCorporationState(structuredClone(state.corporation));
  store.applyEmployeeState(structuredClone(state.employees));
  store.applyTechnologyState(structuredClone(state.technology));
  store.applyProductState(structuredClone(state.products));
  store.applyResourceState(structuredClone(state.resources));
  store.applyProductionState(structuredClone(state.production));
  store.applyMarketState(structuredClone(state.market));
  store.applyCityState(structuredClone(state.city));
  store.applyEventsState(structuredClone(state.events));
  store.applyCompetitorsState(structuredClone(state.competitors));
}

/**
 * A normalised autosave interval.
 */
export function normalizeAutosaveInterval(intervalSimMs: number): number {
  if (!Number.isFinite(intervalSimMs) || intervalSimMs <= 0) {
    return DEFAULT_AUTOSAVE_INTERVAL_SIM_MS;
  }
  return Math.max(60_000, Math.floor(intervalSimMs));
}