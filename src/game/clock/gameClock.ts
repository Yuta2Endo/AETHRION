/**
 * Game clock foundation.
 * Provides a simulated time source for the empire simulation. Decoupled from
 * real wall-clock time so the simulation can be paused, sped up, or tested
 * deterministically. No gameplay logic here.
 */

export interface GameClockOptions {
  startTimeMs?: number;
  speedMultiplier?: number;
}

export class GameClock {
  private startTimeMs: number;
  private speedMultiplier: number;
  private pausedAt: number | null = null;
  private accumulatedPauseMs = 0;

  constructor(options: GameClockOptions = {}) {
    this.startTimeMs = options.startTimeMs ?? Date.now();
    this.speedMultiplier = options.speedMultiplier ?? 1;
  }

  /**
   * Current simulated time in ms since epoch.
   */
  now(): number {
    if (this.pausedAt !== null) {
      return this.pausedAt - this.startTimeMs - this.accumulatedPauseMs;
    }
    const elapsed = Date.now() - this.startTimeMs - this.accumulatedPauseMs;
    return elapsed * this.speedMultiplier;
  }

  setSpeed(multiplier: number): void {
    // Adjust accumulated pause so `now()` stays continuous when speed changes.
    const current = this.now();
    this.speedMultiplier = multiplier;
    this.accumulatedPauseMs = Date.now() - this.startTimeMs - current / this.speedMultiplier;
  }

  pause(): void {
    if (this.pausedAt !== null) return;
    this.pausedAt = Date.now();
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.accumulatedPauseMs += Date.now() - this.pausedAt;
    this.pausedAt = null;
  }

  isPaused(): boolean {
    return this.pausedAt !== null;
  }

  getSpeed(): number {
    return this.speedMultiplier;
  }
}

export const gameClock = new GameClock();
