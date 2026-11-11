/**
 * Deterministic scheduler used by the engine and integration tests.
 * Frames are only executed when the test explicitly advances them, so no
 * fake timers and no real animation frames are involved.
 */

import type { EngineScheduler } from '@/game/engine/scheduler';

export class ManualScheduler implements EngineScheduler {
  private time = 0;
  private nextHandle = 1;
  private readonly callbacks = new Map<number, (time: number) => void>();

  now(): number {
    return this.time;
  }

  requestFrame(callback: (time: number) => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancelFrame(handle: number): void {
    this.callbacks.delete(handle);
  }

  /** Number of frames currently scheduled. */
  get pendingFrames(): number {
    return this.callbacks.size;
  }

  /** Advances time and runs every frame scheduled at that moment. */
  advance(ms: number): void {
    this.time += ms;
    const entries = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    entries.forEach(([, callback]) => callback(this.time));
  }
}
