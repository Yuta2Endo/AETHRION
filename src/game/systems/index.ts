/**
 * Game systems barrel export.
 * The Game Core owns lifecycle and the tick loop; the domain engines live
 * under `src/simulation` and are re-exported here for the game layer.
 */

export { GameEngine } from '@/game/engine/gameEngine';
export type { GameEngineOptions } from '@/game/engine/gameEngine';
export { DEFAULT_ENGINE_CONFIG } from '@/game/engine/types';
export type {
  EngineSystem,
  GameEngineConfig,
  GameEngineSnapshot,
  SimulationContext,
} from '@/game/engine/types';
export { createDefaultScheduler, rafScheduler, timeoutScheduler } from '@/game/engine/scheduler';
export type { EngineScheduler } from '@/game/engine/scheduler';

export {
  GameClock,
  DEFAULT_BASE_SIM_MS_PER_TICK,
  DEFAULT_START_DATE_MS,
  DEFAULT_TICK_DURATION_MS,
  formatGameDate,
  formatGameDateShort,
  toGameDate,
} from '@/game/clock/gameClock';
export type { GameClockConfig, GameDate } from '@/game/clock/gameClock';

export { useGameStore } from '@/game/state/gameStore';
export type { EmpireState, GameStoreState, SimulationMeta } from '@/game/state/gameStore';

export {
  SimulationRunner,
  SIMULATION_SPEEDS,
  SIMULATION_SYSTEM_ORDER,
  simulation,
} from '@/game/simulationRunner';
export type { SimulationRunnerOptions } from '@/game/simulationRunner';
