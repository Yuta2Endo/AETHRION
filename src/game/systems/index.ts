/**
 * Game systems barrel export.
 * Individual system modules (economy, corporation, technology, ...) are
 * implemented under src/simulation and re-exported here for the game layer.
 * Stage 01: placeholder only — no systems active yet.
 */

export * from '@/game/engine/gameEngine';
export * from '@/game/state/gameStore';
export * from '@/game/clock/gameClock';
