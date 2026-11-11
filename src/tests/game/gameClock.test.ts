import { describe, it, expect } from 'vitest';
import { GameClock, formatGameDate, toGameDate } from '@/game/clock/gameClock';

const HOUR = 3_600_000;

describe('GameClock', () => {
  it('advances simulated time by one simulated hour per tick at 1x speed', () => {
    const clock = new GameClock({ startDateMs: 0, baseSimMsPerTick: HOUR, speedMultiplier: 1 });

    expect(clock.now()).toBe(0);
    expect(clock.advanceTick()).toBe(HOUR);
    expect(clock.now()).toBe(HOUR);
    expect(clock.getTicks()).toBe(1);
  });

  it('applies the speed multiplier to the simulated advance', () => {
    const clock = new GameClock({ startDateMs: 0, baseSimMsPerTick: 1000, speedMultiplier: 4 });

    expect(clock.advanceTick()).toBe(4000);
    expect(clock.now()).toBe(4000);
  });

  it('changes the advance rate when the speed is changed', () => {
    const clock = new GameClock({ startDateMs: 0, baseSimMsPerTick: 1000, speedMultiplier: 1 });

    clock.setSpeed(2);
    expect(clock.advanceTick()).toBe(2000);

    clock.setSpeed(0.5);
    expect(clock.advanceTick()).toBe(500);
    expect(clock.now()).toBe(2500);
  });

  it('does not advance while paused', () => {
    const clock = new GameClock({ startDateMs: 0, baseSimMsPerTick: HOUR });

    clock.advanceTick();
    const pausedAt = clock.now();

    clock.pause();
    expect(clock.isPaused()).toBe(true);
    expect(clock.advanceTick()).toBe(0);
    expect(clock.now()).toBe(pausedAt);
  });

  it('continues from the same point after a resume', () => {
    const clock = new GameClock({ startDateMs: 0, baseSimMsPerTick: HOUR });

    clock.advanceTick();
    clock.advanceTick();
    const beforePause = clock.now();

    clock.pause();
    clock.advanceTick();
    clock.advanceTick();

    clock.resume();
    expect(clock.isPaused()).toBe(false);
    expect(clock.now()).toBe(beforePause);

    clock.advanceTick();
    expect(clock.now()).toBe(beforePause + HOUR);
  });

  it('derives the in-game date in UTC, independent of the host timezone', () => {
    const clock = new GameClock({
      startDateMs: Date.UTC(2287, 0, 1, 8, 0, 0),
      baseSimMsPerTick: HOUR,
    });

    expect(clock.getDate()).toEqual({
      year: 2287,
      month: 1,
      day: 1,
      hour: 8,
      minute: 0,
      second: 0,
    });

    clock.advanceTick();
    expect(clock.getDate().hour).toBe(9);
  });

  it('formats the in-game date', () => {
    const date = toGameDate(Date.UTC(2287, 3, 12, 14, 30, 0));
    expect(formatGameDate(date)).toBe('2287-04-12 14:30');
  });

  it('rejects invalid speed multipliers', () => {
    const clock = new GameClock({ startDateMs: 0 });

    expect(() => clock.setSpeed(0)).toThrow(/greater than 0/);
    expect(() => clock.setSpeed(-1)).toThrow(/greater than 0/);
    expect(() => clock.setSpeed(Number.NaN)).toThrow(/greater than 0/);
    expect(() => clock.setSpeed(Number.POSITIVE_INFINITY)).toThrow(/greater than 0/);
    expect(clock.getSpeed()).toBe(1);
  });

  it('rejects an invalid configuration', () => {
    expect(() => new GameClock({ startDateMs: Number.NaN })).toThrow(/startDateMs/);
    expect(() => new GameClock({ tickDurationMs: 0 })).toThrow(/tickDurationMs/);
    expect(() => new GameClock({ baseSimMsPerTick: -1 })).toThrow(/baseSimMsPerTick/);
  });

  it('is deterministic and never reads the system clock', () => {
    const first = new GameClock({ startDateMs: 1000, baseSimMsPerTick: HOUR });
    const second = new GameClock({ startDateMs: 1000, baseSimMsPerTick: HOUR });

    for (let i = 0; i < 25; i += 1) {
      first.advanceTick();
      second.advanceTick();
    }

    expect(first.now()).toBe(second.now());
    expect(first.getDate()).toEqual(second.getDate());
    // The simulated time is fully derived from the start date and the ticks.
    expect(first.now()).toBe(1000 + 25 * HOUR);
  });

  it('restores its initial state on reset', () => {
    const clock = new GameClock({ startDateMs: 500, baseSimMsPerTick: HOUR });
    clock.advanceTick();
    clock.advanceTick();

    clock.reset();

    expect(clock.now()).toBe(500);
    expect(clock.getTicks()).toBe(0);
  });
});
