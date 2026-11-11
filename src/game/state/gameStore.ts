/**
 * Game state (Zustand) — canonical simulation state.
 *
 * Responsibilities:
 * - Holds the simulation state that the UI reads.
 * - Exposes controlled update actions.
 *
 * Explicit non-responsibilities:
 * - Contains NO domain logic. All rules live in `src/simulation/*` as pure
 *   functions; the store only stores the results.
 * - Does NOT persist to localStorage. Persistent storage is an IndexedDB
 *   concern reserved for Stage 08. The state kept here is plain and
 *   serialisable so it can be snapshotted later without reshaping it.
 * - Is strictly separate from the application store
 *   (`src/app/providers/AppProvider`), which owns UI-only state.
 */

import { create } from 'zustand';
import type { SimulationStatus } from '@/core/types';
import type { GameDate } from '@/game/clock/gameClock';
import { createInitialEconomy, type EconomyState } from '@/simulation/economy';
import { createInitialWorld, type WorldState } from '@/simulation/world';

/** The player's empire — global identity, not a corporation (Stage 03). */
export interface EmpireState {
  name: string;
  charter: string;
  /** In-game date the empire was founded, or null before the simulation started. */
  foundedOn: GameDate | null;
  /** Region the empire operates from, or null. */
  homeRegionId: string | null;
}

/** Runtime metadata about the running simulation. */
export interface SimulationMeta {
  status: SimulationStatus;
  /** Ticks processed since the simulation started. */
  tick: number;
  /** Current simulated epoch milliseconds. */
  simTimeMs: number;
  /** Current in-game date. */
  date: GameDate;
  /** Current speed multiplier. */
  speed: number;
  /** Message of the most recent system failure, or null. */
  lastError: string | null;
}

export interface GameStoreState {
  empire: EmpireState;
  world: WorldState;
  economy: EconomyState;
  simulation: SimulationMeta;

  /** Controlled updates — the store stores results, it never computes them. */
  applyWorldState: (next: WorldState) => void;
  applyEconomyState: (next: EconomyState) => void;
  applySimulationMeta: (next: Partial<SimulationMeta>) => void;
  applyEmpire: (next: Partial<EmpireState>) => void;
  /** Restores the initial simulation state. */
  reset: () => void;
}

const INITIAL_EMPIRE: EmpireState = {
  name: 'AETHRION',
  charter: 'Technology Conglomerate',
  foundedOn: null,
  homeRegionId: null,
};

const INITIAL_SIMULATION: SimulationMeta = {
  status: 'idle',
  tick: 0,
  simTimeMs: 0,
  date: { year: 2287, month: 1, day: 1, hour: 8, minute: 0, second: 0 },
  speed: 1,
  lastError: null,
};

export const useGameStore = create<GameStoreState>()((set) => ({
  empire: { ...INITIAL_EMPIRE },
  world: createInitialWorld(),
  economy: createInitialEconomy(),
  simulation: { ...INITIAL_SIMULATION },

  applyWorldState: (next) => set({ world: next }),
  applyEconomyState: (next) => set({ economy: next }),
  applySimulationMeta: (next) =>
    set((state) => ({ simulation: { ...state.simulation, ...next } })),
  applyEmpire: (next) => set((state) => ({ empire: { ...state.empire, ...next } })),
  reset: () =>
    set({
      empire: { ...INITIAL_EMPIRE },
      world: createInitialWorld(),
      economy: createInitialEconomy(),
      simulation: { ...INITIAL_SIMULATION },
    }),
}));

export type { WorldState, EconomyState, GameDate, SimulationStatus };
