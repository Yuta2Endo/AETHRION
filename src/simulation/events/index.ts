/**
 * Events Engine module (Stage 01 placeholder).
 * Responsible for world events, news, and dynamic scenario triggers.
 * Typed interface only — no implementation in Stage 01.
 */

export interface WorldEvent {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  active: boolean;
}

export interface EventsState {
  events: WorldEvent[];
}

export const defaultEventsState: EventsState = {
  events: [],
};

export function getEventsState(): EventsState {
  return { ...defaultEventsState };
}
