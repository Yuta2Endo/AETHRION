/**
 * Game Core Engine.
 *
 * Owns the simulation lifecycle and the tick loop. Contains no domain rules:
 * world, economy and future systems implement `EngineSystem` and run in a
 * deterministic order.
 *
 * Guarantees:
 * - start / stop / pause / resume with an explicit status machine
 * - duplicate loops are impossible (start is idempotent, one frame chain only)
 * - visibility changes are handled safely (no catch-up burst on return)
 * - long pauses never produce an uncontrolled catch-up (tick cap per frame)
 * - asynchronous ticks can never overlap (in-flight guard)
 * - a failing system cannot corrupt the rest of the simulation
 * - animation frames, timers and subscriptions are released on dispose
 */

import { logger } from '@/core/logging/logger';
import { eventBus } from '@/core/events/eventBus';
import type { SimulationStatus } from '@/core/types';
import { GameClock } from '@/game/clock/gameClock';
import {
  createDefaultScheduler,
  type EngineScheduler,
} from '@/game/engine/scheduler';
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineSystem,
  type GameEngineConfig,
  type GameEngineSnapshot,
  type SimulationContext,
} from '@/game/engine/types';

export interface GameEngineOptions {
  clock?: GameClock;
  config?: Partial<GameEngineConfig>;
  scheduler?: EngineScheduler;
}

type TickListener = (context: SimulationContext) => void;
type StatusListener = (snapshot: GameEngineSnapshot) => void;

export class GameEngine {
  private readonly clock: GameClock;
  private readonly config: GameEngineConfig;
  private readonly scheduler: EngineScheduler;

  private readonly systems: EngineSystem[] = [];
  private readonly tickListeners = new Set<TickListener>();
  private readonly statusListeners = new Set<StatusListener>();

  private status: SimulationStatus = 'idle';
  private tick = 0;
  private accumulator = 0;
  private lastFrameTime: number | null = null;
  private frameHandle: number | null = null;
  private ticking = false;
  private disposed = false;
  private hidden = false;

  private readonly failedSystems = new Set<string>();
  private lastError: string | null = null;

  private readonly handleVisibilityChange = (): void => {
    const isHidden = typeof document !== 'undefined' ? document.hidden : false;
    this.hidden = isHidden;

    if (!isHidden) {
      // Returning to the foreground: drop any accumulated backlog so the
      // simulation does not burst through missed ticks.
      this.accumulator = 0;
      this.lastFrameTime = null;
      logger.info('GameEngine resumed frame timing after visibility change');
    }
  };

  constructor(options: GameEngineOptions = {}) {
    this.clock = options.clock ?? new GameClock();
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...options.config };
    this.scheduler = options.scheduler ?? createDefaultScheduler();

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    logger.info('GameEngine created', { config: this.config });
  }

  // ---------------------------------------------------------------- systems

  /**
   * Registers a simulation system.
   * @returns a function that unregisters the system.
   */
  registerSystem(system: EngineSystem): () => void {
    if (this.disposed) {
      throw new Error('[GameEngine] cannot register systems on a disposed engine');
    }
    if (this.systems.some((s) => s.name === system.name)) {
      throw new Error(`[GameEngine] a system named "${system.name}" is already registered`);
    }
    this.systems.push(system);
    this.sortSystems();
    return () => this.unregisterSystem(system.name);
  }

  unregisterSystem(name: string): void {
    const index = this.systems.findIndex((s) => s.name === name);
    if (index >= 0) {
      this.systems.splice(index, 1);
    }
  }

  private sortSystems(): void {
    // Deterministic order: ascending `order`, then registration index.
    this.systems.sort((a, b) => a.order - b.order);
  }

  /** Registered systems in execution order. */
  getSystems(): readonly EngineSystem[] {
    return this.systems.slice();
  }

  // -------------------------------------------------------------- lifecycle

  /**
   * Starts the simulation. Idempotent — calling it while running does nothing,
   * so duplicate loops are impossible.
   */
  start(): void {
    if (this.disposed) return;
    if (this.status === 'running') {
      logger.debug('GameEngine start ignored — already running');
      return;
    }

    this.status = 'running';
    this.accumulator = 0;
    this.lastFrameTime = null;
    this.clock.resume();
    this.scheduleFrame();
    this.notifyStatus();
    logger.info('GameEngine started');
  }

  /** Pauses the simulation. The tick loop is suspended, state is retained. */
  pause(): void {
    if (this.disposed) return;
    if (this.status !== 'running') {
      logger.debug(`GameEngine pause ignored — status is ${this.status}`);
      return;
    }

    this.status = 'paused';
    this.clock.pause();
    this.cancelFrame();
    this.accumulator = 0;
    this.lastFrameTime = null;
    this.notifyStatus();
    logger.info('GameEngine paused');
  }

  /** Resumes a paused simulation from where it left off. */
  resume(): void {
    if (this.disposed) return;
    if (this.status !== 'paused') {
      logger.debug(`GameEngine resume ignored — status is ${this.status}`);
      return;
    }

    this.status = 'running';
    this.clock.resume();
    this.accumulator = 0;
    this.lastFrameTime = null;
    this.scheduleFrame();
    this.notifyStatus();
    logger.info('GameEngine resumed');
  }

  /** Stops the simulation. State is retained so it can be restarted later. */
  stop(): void {
    if (this.disposed) return;
    if (this.status === 'stopped') {
      logger.debug('GameEngine stop ignored — already stopped');
      return;
    }

    this.status = 'stopped';
    this.clock.pause();
    this.cancelFrame();
    this.accumulator = 0;
    this.lastFrameTime = null;
    this.notifyStatus();
    logger.info('GameEngine stopped');
  }

  /** Releases every resource held by the engine. */
  dispose(): void {
    if (this.disposed) return;
    this.status = 'stopped';
    this.cancelFrame();
    this.systems.length = 0;
    this.tickListeners.clear();
    this.statusListeners.clear();

    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.disposed = true;
    logger.info('GameEngine disposed');
  }

  /**
   * Returns the engine to its initial state: no ticks, no backlog, idle.
   * Registered systems and listeners are preserved.
   */
  reset(): void {
    if (this.disposed) return;
    this.cancelFrame();
    this.status = 'idle';
    this.tick = 0;
    this.accumulator = 0;
    this.lastFrameTime = null;
    this.ticking = false;
    this.failedSystems.clear();
    this.lastError = null;
    this.notifyStatus();
    logger.info('GameEngine reset');
  }

  /**
   * Hydrates the engine with a previously persisted tick counter and status.
   *
   * The loop is stopped and the backlog is cleared. The caller is responsible
   * for restoring the clock and the authoritative game state consistently.
   */
  hydrate(tick: number, status: SimulationStatus): void {
    if (this.disposed) return;
    this.cancelFrame();
    this.tick = Number.isInteger(tick) && tick >= 0 ? tick : 0;
    this.accumulator = 0;
    this.lastFrameTime = null;
    this.ticking = false;
    this.failedSystems.clear();
    this.lastError = null;
    this.status = status;
  }

  // ------------------------------------------------------------------ ticks

  /**
   * Executes exactly one tick, regardless of the scheduler.
   * Used for controlled stepping and by tests.
   *
   * A paused simulation is never stepped forward.
   * @param realDeltaMs real milliseconds attributed to this tick.
   */
  async step(realDeltaMs = this.config.tickDurationMs): Promise<void> {
    if (this.disposed) return;
    if (this.status === 'paused') {
      logger.debug('GameEngine step ignored — the simulation is paused');
      return;
    }
    await this.runTick(realDeltaMs);
  }

  private scheduleFrame(): void {
    if (this.disposed) return;
    this.frameHandle = this.scheduler.requestFrame(this.loop);
  }

  private cancelFrame(): void {
    if (this.frameHandle !== null) {
      this.scheduler.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private readonly loop = (time: number): void => {
    if (this.disposed || this.status !== 'running') return;

    const realDelta = this.lastFrameTime === null ? 0 : time - this.lastFrameTime;
    this.lastFrameTime = time;

    if (this.hidden) {
      // Do not accumulate while backgrounded.
      this.accumulator = 0;
      this.scheduleFrame();
      return;
    }

    if (realDelta > 0) {
      this.accumulator += realDelta;
    }

    let executed = 0;
    while (this.accumulator >= this.config.tickDurationMs && executed < this.config.maxTicksPerFrame) {
      this.accumulator -= this.config.tickDurationMs;
      executed += 1;
      void this.runTick(this.config.tickDurationMs);
    }

    if (executed >= this.config.maxTicksPerFrame && this.accumulator >= this.config.tickDurationMs) {
      // Backlog still present after the cap — discard it to avoid an
      // uncontrolled catch-up burst.
      logger.warn('GameEngine dropped tick backlog', { droppedMs: Math.round(this.accumulator) });
      this.accumulator = 0;
    }

    this.scheduleFrame();
  };

  /**
   * Runs one tick: advances the clock, then executes every system in order.
   * A tick that is still in flight blocks any further tick (no overlap).
   */
  private async runTick(realDeltaMs: number): Promise<void> {
    if (this.ticking) {
      logger.warn('GameEngine skipped a tick — the previous tick is still running');
      return;
    }

    this.ticking = true;
    try {
      const deltaMs = this.clock.advanceTick();
      this.tick += 1;

      const context: SimulationContext = {
        tick: this.tick,
        simTimeMs: this.clock.now(),
        deltaMs,
        realDeltaMs,
        elapsedSimMs: this.clock.getElapsedSimMs(),
      };

      for (const system of this.getSystems()) {
        try {
          await system.update(context);
          this.failedSystems.delete(system.name);
        } catch (error) {
          this.handleSystemError(system.name, error);
        }
      }

      this.notifyTick(context);
      eventBus.emit('simulation:tick', {
        tick: context.tick,
        simTimeMs: context.simTimeMs,
        deltaMs: context.deltaMs,
        realDeltaMs: context.realDeltaMs,
        elapsedSimMs: context.elapsedSimMs,
      });
    } finally {
      this.ticking = false;
    }
  }

  private handleSystemError(systemName: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.failedSystems.add(systemName);
    this.lastError = `[${systemName}] ${message}`;
    logger.error(`GameEngine system "${systemName}" failed`, { message });
    eventBus.emit('simulation:state-change', { system: systemName, tick: this.tick });
  }

  // -------------------------------------------------------------- observers

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyTick(context: SimulationContext): void {
    for (const listener of this.tickListeners) {
      try {
        listener(context);
      } catch (error) {
        logger.error('GameEngine tick listener failed', error);
      }
    }
  }

  private notifyStatus(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.statusListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        logger.error('GameEngine status listener failed', error);
      }
    }
    eventBus.emit('simulation:status', {
      status: snapshot.status,
      tick: snapshot.tick,
      speed: this.clock.getSpeed(),
    });
  }

  // ---------------------------------------------------------------- getters

  getStatus(): SimulationStatus {
    return this.status;
  }

  getTick(): number {
    return this.tick;
  }

  getClock(): GameClock {
    return this.clock;
  }

  getSnapshot(): GameEngineSnapshot {
    return {
      status: this.status,
      tick: this.tick,
      lastTickRealMs: this.lastFrameTime,
      failedSystems: Array.from(this.failedSystems),
      lastError: this.lastError,
    };
  }

  isRunning(): boolean {
    return this.status === 'running';
  }
}
