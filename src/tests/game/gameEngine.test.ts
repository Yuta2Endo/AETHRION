import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '@/game/engine/gameEngine';
import { GameClock } from '@/game/clock/gameClock';
import { ManualScheduler } from '@/tests/helpers/manualScheduler';

describe('GameEngine', () => {
  let scheduler: ManualScheduler;
  let clock: GameClock;
  let engine: GameEngine;

  beforeEach(() => {
    scheduler = new ManualScheduler();
    clock = new GameClock({ startDateMs: 0, tickDurationMs: 1000, baseSimMsPerTick: 1000 });
    engine = new GameEngine({
      clock,
      scheduler,
      config: { tickDurationMs: 1000, maxTicksPerFrame: 5 },
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('starts and reports the running status', () => {
    expect(engine.getStatus()).toBe('idle');

    engine.start();

    expect(engine.getStatus()).toBe('running');
    expect(engine.isRunning()).toBe(true);
    expect(scheduler.pendingFrames).toBe(1);
  });

  it('prevents duplicate loops when start is called twice', () => {
    engine.start();
    engine.start();
    engine.start();

    expect(scheduler.pendingFrames).toBe(1);
  });

  it('pauses and cancels the scheduled frame', () => {
    engine.start();
    engine.pause();

    expect(engine.getStatus()).toBe('paused');
    expect(scheduler.pendingFrames).toBe(0);
  });

  it('ignores a pause when the engine is not running', () => {
    engine.pause();
    expect(engine.getStatus()).toBe('idle');
  });

  it('resumes a paused simulation', () => {
    engine.start();
    engine.pause();
    engine.resume();

    expect(engine.getStatus()).toBe('running');
    expect(scheduler.pendingFrames).toBe(1);
  });

  it('stops the simulation and keeps the state', () => {
    engine.start();
    scheduler.advance(1000);
    const tickBeforeStop = engine.getTick();

    engine.stop();

    expect(engine.getStatus()).toBe('stopped');
    expect(scheduler.pendingFrames).toBe(0);
    expect(engine.getTick()).toBe(tickBeforeStop);
  });

  it('executes exactly one tick per elapsed tick duration', () => {
    engine.start();

    // The first frame establishes the time baseline — no time has elapsed yet.
    scheduler.advance(1000);
    expect(engine.getTick()).toBe(0);

    scheduler.advance(999);
    expect(engine.getTick()).toBe(0);

    scheduler.advance(1);
    expect(engine.getTick()).toBe(1);

    scheduler.advance(3000);
    expect(engine.getTick()).toBe(4);
  });

  it('executes systems in a deterministic order', async () => {
    const order: string[] = [];
    engine.registerSystem({
      name: 'third',
      order: 30,
      update: () => {
        order.push('third');
      },
    });
    engine.registerSystem({
      name: 'first',
      order: 10,
      update: () => {
        order.push('first');
      },
    });
    engine.registerSystem({
      name: 'second',
      order: 20,
      update: () => {
        order.push('second');
      },
    });

    await engine.step();

    expect(order).toEqual(['first', 'second', 'third']);
    expect(engine.getSystems().map((s) => s.name)).toEqual(['first', 'second', 'third']);
  });

  it('isolates a failing system so the others still run', async () => {
    const ran: string[] = [];
    engine.registerSystem({
      name: 'healthy',
      order: 10,
      update: () => {
        ran.push('healthy');
      },
    });
    engine.registerSystem({
      name: 'broken',
      order: 20,
      update: () => {
        throw new Error('system exploded');
      },
    });
    engine.registerSystem({
      name: 'after',
      order: 30,
      update: () => {
        ran.push('after');
      },
    });

    await engine.step();

    expect(ran).toEqual(['healthy', 'after']);
    expect(engine.getSnapshot().failedSystems).toContain('broken');
    expect(engine.getSnapshot().lastError).toContain('system exploded');
  });

  it('does not overlap asynchronous ticks', async () => {
    let release: () => void = () => undefined;
    let ticks = 0;

    engine.registerSystem({
      name: 'slow',
      order: 10,
      update: () =>
        new Promise<void>((resolve) => {
          ticks += 1;
          release = resolve;
        }),
    });

    const first = engine.step();
    const second = engine.step();

    await second;
    expect(ticks).toBe(1);
    expect(engine.getTick()).toBe(1);

    release();
    await first;

    expect(engine.getTick()).toBe(1);
  });

  it('discards the tick backlog instead of catching up without limit', () => {
    engine.start();

    scheduler.advance(1000); // time baseline
    // A long stall produces far more backlog than the per-frame cap.
    scheduler.advance(60_000);

    expect(engine.getTick()).toBe(5);
    expect(scheduler.pendingFrames).toBe(1);
  });

  it('drops the accumulated backlog when the document becomes visible again', () => {
    const setHidden = (hidden: boolean): void => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => hidden,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    };

    engine.start();
    scheduler.advance(1000); // time baseline

    setHidden(true);
    scheduler.advance(30_000);
    expect(engine.getTick()).toBe(0);

    setHidden(false);
    scheduler.advance(1000); // new baseline after the visibility change
    expect(engine.getTick()).toBe(0);

    scheduler.advance(1000);
    expect(engine.getTick()).toBe(1);
  });

  it('emits tick and status notifications', async () => {
    const ticks: number[] = [];
    const statuses: string[] = [];

    engine.onTick((context) => ticks.push(context.tick));
    engine.onStatusChange((snapshot) => statuses.push(snapshot.status));

    engine.start();
    await engine.step();

    expect(ticks).toEqual([1]);
    expect(statuses).toEqual(['running']);
  });

  it('rejects duplicate system names', () => {
    engine.registerSystem({ name: 'only-one', order: 1, update: () => undefined });

    expect(() => engine.registerSystem({ name: 'only-one', order: 2, update: () => undefined })).toThrow(
      /already registered/,
    );
  });

  it('unregisters a system through the returned disposer', () => {
    const dispose = engine.registerSystem({ name: 'temp', order: 1, update: () => undefined });
    expect(engine.getSystems()).toHaveLength(1);

    dispose();

    expect(engine.getSystems()).toHaveLength(0);
  });

  it('resets the tick counter and the status', async () => {
    engine.start();
    await engine.step();
    expect(engine.getTick()).toBe(1);

    engine.reset();

    expect(engine.getTick()).toBe(0);
    expect(engine.getStatus()).toBe('idle');
  });

  it('releases the visibility listener on dispose', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    engine.dispose();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });
});
