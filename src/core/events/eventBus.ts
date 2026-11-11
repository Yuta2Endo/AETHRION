/**
 * Lightweight typed event bus.
 * Decouples modules without creating direct dependencies. Used for
 * application-level communication (e.g. UI <-> simulation state changes).
 * Game simulation should not depend on this bus.
 */
type EventListener<T> = (_payload: T) => void;

interface EventMap {
  'app:theme-change': string;
  'app:error': { message: string; fatal: boolean };
  'simulation:tick': { delta: number; timestamp: number };
  'simulation:state-change': { system: string; patch: unknown };
}

class EventBus {
  private listeners = new Map<keyof EventMap, Set<EventListener<any>>>();

  on<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as EventListener<any>);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener as EventListener<any>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        // Prevent one listener from breaking others
        console.error(`[AETHRION] Event listener error for ${String(event)}:`, error);
      }
    });
  }

  removeAll(): void {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
export type { EventListener, EventMap };
