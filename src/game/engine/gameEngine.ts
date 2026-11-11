/**
 * Game Core Engine (Stage 01 placeholder).
 *
 * Responsible for orchestrating the game loop and subsystem updates.
 * No game rules are implemented here. The engine is intentionally thin so
 * that subsystems (economy, corporation, technology, ...) can be plugged in
 * in later stages without circular dependencies.
 */

import { logger } from '@/core/logging/logger';
import { eventBus } from '@/core/events/eventBus';

export interface GameEngineConfig {
  tickRateMs: number;
  enabled: boolean;
}

export interface GameState {
  running: boolean;
  tick: number;
  lastTickMs: number | null;
}

const defaultConfig: GameEngineConfig = {
  tickRateMs: 1000,
  enabled: false, // simulation not active in Stage 01
};

export class GameEngine {
  private config: GameEngineConfig;
  private state: GameState;
  private rafId: number | null = null;
  private lastTime: number | null = null;

  constructor(config: Partial<GameEngineConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.state = {
      running: false,
      tick: 0,
      lastTickMs: null,
    };
    logger.info('GameEngine created', { config: this.config });
  }

  start(): void {
    if (this.state.running) return;
    if (!this.config.enabled) {
      logger.warn('GameEngine start requested but simulation is disabled in Stage 01');
      return;
    }
    this.state.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    logger.info('GameEngine started');
  }

  stop(): void {
    this.state.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    logger.info('GameEngine stopped');
  }

  private loop = (time: number): void => {
    if (!this.state.running) return;

    if (this.lastTime !== null) {
      const delta = time - this.lastTime;
      if (delta >= this.config.tickRateMs) {
        this.state.tick += 1;
        this.state.lastTickMs = time;
        this.lastTime = time;
        eventBus.emit('simulation:tick', { delta, timestamp: time });
        logger.debug('GameEngine tick', { tick: this.state.tick, delta });
      }
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  getState(): GameState {
    return { ...this.state };
  }

  dispose(): void {
    this.stop();
  }
}

export const gameEngine = new GameEngine();
