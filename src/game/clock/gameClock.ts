/**
 * Game clock — simulated in-game date and time.
 *
 * The clock is **tick driven**: simulated time only advances when the Game
 * Core calls `advanceTick()`. It never reads the system clock, so simulation
 * behaviour is fully deterministic and reproducible in tests.
 *
 * Real time and simulated time are kept strictly separate:
 * - real time    : the wall-clock duration between engine ticks (engine concern)
 * - simulated time: in-game time accumulated by the clock (clock concern)
 */

import { isFiniteNumber } from '@/core/utils';

/** In-game calendar date and time, derived from simulated epoch milliseconds. */
export interface GameDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** 0-59 */
  second: number;
}

export interface GameClockConfig {
  /** Simulated epoch milliseconds of the in-game start date. */
  startDateMs: number;
  /** Real milliseconds between simulation ticks (owned by the engine). */
  tickDurationMs: number;
  /**
   * Simulated milliseconds advanced per tick at 1x speed.
   * Default: one simulated hour per tick.
   */
  baseSimMsPerTick: number;
  /** Speed multiplier. 1 = normal. */
  speedMultiplier: number;
  /** Initial paused state. */
  paused: boolean;
}

/**
 * A serialisable snapshot of the clock state.
 *
 * Restoring the snapshot makes the clock continue deterministically from the
 * saved simulated time — the wall clock is never involved.
 */
export interface GameClockSnapshot {
  config: GameClockConfig;
  elapsedSimMs: number;
  ticks: number;
}

export const DEFAULT_TICK_DURATION_MS = 1000;
export const DEFAULT_BASE_SIM_MS_PER_TICK = 3_600_000; // 1 simulated hour
export const MIN_SPEED_MULTIPLIER = 0.25;
export const MAX_SPEED_MULTIPLIER = 16;

export const DEFAULT_START_DATE_MS = Date.UTC(2287, 0, 1, 8, 0, 0); // 2287-01-01 08:00 UTC

export class GameClock {
  private config: GameClockConfig;
  private elapsedSimMs = 0;
  private ticks = 0;
  private readonly initialSpeed: number;
  private readonly initialPaused: boolean;

  constructor(config: Partial<GameClockConfig> = {}) {
    this.config = {
      startDateMs: DEFAULT_START_DATE_MS,
      tickDurationMs: DEFAULT_TICK_DURATION_MS,
      baseSimMsPerTick: DEFAULT_BASE_SIM_MS_PER_TICK,
      speedMultiplier: 1,
      paused: false,
      ...config,
    };
    this.validateConfig();
    this.initialSpeed = this.config.speedMultiplier;
    this.initialPaused = this.config.paused;
  }

  private validateConfig(): void {
    const { startDateMs, tickDurationMs, baseSimMsPerTick, speedMultiplier } = this.config;
    if (!isFiniteNumber(startDateMs)) {
      throw new Error('[GameClock] startDateMs must be a finite number');
    }
    if (!isFiniteNumber(tickDurationMs) || tickDurationMs <= 0) {
      throw new Error('[GameClock] tickDurationMs must be a finite number greater than 0');
    }
    if (!isFiniteNumber(baseSimMsPerTick) || baseSimMsPerTick <= 0) {
      throw new Error('[GameClock] baseSimMsPerTick must be a finite number greater than 0');
    }
    if (!isFiniteNumber(speedMultiplier) || speedMultiplier <= 0) {
      throw new Error('[GameClock] speedMultiplier must be a finite number greater than 0');
    }
  }

  /**
   * Current simulated time in epoch milliseconds.
   * Depends only on ticks processed — never on the system clock.
   */
  now(): number {
    return this.config.startDateMs + this.elapsedSimMs;
  }

  /** Simulated milliseconds elapsed since the in-game start. */
  getElapsedSimMs(): number {
    return this.elapsedSimMs;
  }

  /** Number of ticks processed by this clock. */
  getTicks(): number {
    return this.ticks;
  }

  /**
   * Advances simulated time by one tick.
   * @returns simulated milliseconds actually advanced (0 while paused)
   */
  advanceTick(): number {
    if (this.config.paused) return 0;

    const delta = this.config.baseSimMsPerTick * this.config.speedMultiplier;
    if (!isFiniteNumber(delta)) return 0;

    this.elapsedSimMs += delta;
    this.ticks += 1;
    return delta;
  }

  /**
   * Sets the speed multiplier.
   * @throws when the multiplier is not a finite number > 0 or is out of range.
   */
  setSpeed(multiplier: number): void {
    if (!isFiniteNumber(multiplier) || multiplier <= 0) {
      throw new Error('[GameClock] speed multiplier must be a finite number greater than 0');
    }
    if (multiplier < MIN_SPEED_MULTIPLIER || multiplier > MAX_SPEED_MULTIPLIER) {
      throw new Error(
        `[GameClock] speed multiplier must be between ${MIN_SPEED_MULTIPLIER} and ${MAX_SPEED_MULTIPLIER}`,
      );
    }
    this.config.speedMultiplier = multiplier;
  }

  getSpeed(): number {
    return this.config.speedMultiplier;
  }

  getTickDurationMs(): number {
    return this.config.tickDurationMs;
  }

  getBaseSimMsPerTick(): number {
    return this.config.baseSimMsPerTick;
  }

  pause(): void {
    this.config.paused = true;
  }

  resume(): void {
    this.config.paused = false;
  }

  isPaused(): boolean {
    return this.config.paused;
  }

  /**
   * Current in-game date.
   * Computed in UTC so results are independent of the host timezone.
   */
  getDate(): GameDate {
    return toGameDate(this.now());
  }

  /** Restores the clock to its initial state (time, speed and pause flag). */
  reset(): void {
    this.elapsedSimMs = 0;
    this.ticks = 0;
    this.config.speedMultiplier = this.initialSpeed;
    this.config.paused = this.initialPaused;
  }

  /**
   * A serialisable snapshot of the clock.
   */
  getSnapshot(): GameClockSnapshot {
    return {
      config: { ...this.config },
      elapsedSimMs: this.elapsedSimMs,
      ticks: this.ticks,
    };
  }

  /**
   * Restores the clock from a snapshot.
   *
   * The restored clock produces the same simulated time as the original — no
   * wall-clock value is ever read.
   */
  restore(snapshot: GameClockSnapshot): void {
    this.config = { ...snapshot.config };
    this.validateConfig();
    this.elapsedSimMs = isFiniteNumber(snapshot.elapsedSimMs) ? snapshot.elapsedSimMs : 0;
    this.ticks = Number.isInteger(snapshot.ticks) && snapshot.ticks >= 0 ? snapshot.ticks : 0;
  }
}

/**
 * Converts epoch milliseconds into an in-game date (UTC based).
 */
export function toGameDate(epochMs: number): GameDate {
  const date = new Date(epochMs);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

/**
 * Formats an in-game date as `YYYY-MM-DD HH:MM`.
 */
export function formatGameDate(date: GameDate): string {
  const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)} ${pad(date.hour)}:${pad(date.minute)}`;
}

/**
 * Formats an in-game date as `YYYY-MM-DD`.
 */
export function formatGameDateShort(date: GameDate): string {
  const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}
