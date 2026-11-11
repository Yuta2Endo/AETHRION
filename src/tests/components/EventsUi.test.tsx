import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Dashboard } from '@/ui/screens/Dashboard';
import { useGameStore } from '@/game/state/gameStore';
import { simulation } from '@/game/simulationRunner';
import { commands } from '@/game/commands';
import { getEventDefinition } from '@/simulation/events';

/**
 * Injects an active event into the simulation state so that the interface can
 * be tested with a real, playable event.
 */
function injectEvent(definitionId: string): string {
  const definition = getEventDefinition(definitionId)!;
  const state = useGameStore.getState();
  const id = 'evt_001';

  state.applyEventsState({
    ...state.events,
    activeEvents: [
      {
        id,
        definitionId: definition.id,
        name: definition.name,
        category: definition.category,
        severity: definition.severity,
        startedAtSimMs: 0,
        endsAtSimMs: definition.durationMs,
        effects: definition.effects.map((effect) => ({ ...effect })),
        appliedResponseIds: [],
        relief: null,
      },
    ],
  });

  return id;
}

describe('Global events interface', () => {
  beforeEach(() => {
    simulation.reset();
    useGameStore.getState().reset();
  });

  afterEach(() => {
    simulation.reset();
  });

  it('renders the section with the real state', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Global events'));

    expect(section.getByText('Global Events')).toBeInTheDocument();
    expect(section.getByText('No global event active')).toBeInTheDocument();
    expect(section.getByText('News Feed')).toBeInTheDocument();
  });

  it('renders an active event with its severity and effects', () => {
    injectEvent('energy-crisis');
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Global events'));

    expect(section.getByText('Energy Crisis')).toBeInTheDocument();
    expect(section.getByText('energy')).toBeInTheDocument();
    expect(section.getByText('high')).toBeInTheDocument();
    expect(section.getByText(/operating costs/)).toBeInTheDocument();
  });

  it('renders the player responses of an event', () => {
    const definition = getEventDefinition('energy-crisis')!;
    injectEvent('energy-crisis');
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Global events'));

    expect(section.getByText('Your response')).toBeInTheDocument();
    expect(section.getByText('Invest in energy efficiency')).toBeInTheDocument();
    expect(section.getAllByRole('button', { name: /commit/i }).length).toBe(
      definition.responses!.length,
    );
  });

  it('commits a response through the command layer', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const eventId = injectEvent('energy-crisis');
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Global events'));

    fireEvent.click(section.getAllByRole('button', { name: /commit/i })[0]);

    const events = useGameStore.getState().events;
    const event = events.activeEvents.find((candidate) => candidate.id === eventId);
    expect(event).toBeDefined();
    expect(event!.appliedResponseIds.length).toBe(1);
    expect(event!.relief).not.toBeNull();
  });

  it('displays a validation error for an invalid action', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    injectEvent('energy-crisis');
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Global events'));

    // Drain the balance so that the response cannot be afforded.
    const store = useGameStore.getState();
    const corporation = store.corporation.corporations[0];
    store.applyCorporationState({
      ...store.corporation,
      corporations: store.corporation.corporations.map((candidate) =>
        candidate.id === corporation.id
          ? { ...candidate, finances: { ...candidate.finances, balance: 0 } }
          : candidate,
      ),
    });

    fireEvent.click(section.getAllByRole('button', { name: /commit/i })[0]);

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('renders the news feed from the actual simulation history', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    await act(async () => {
      await simulation.step();
      await simulation.step();
      await simulation.step();
    });

    const news = useGameStore.getState().events.news;
    expect(news.length).toBeGreaterThan(0);

    render(<Dashboard />);
    const section = within(screen.getByLabelText('Global events'));

    expect(section.getByText(news[news.length - 1].headline)).toBeInTheDocument();
  });

  it('marks a news item as read through the command layer', () => {
    const state = useGameStore.getState();
    state.applyEventsState({
      ...state.events,
      news: [
        {
          id: 'news_0001',
          simTimeMs: 0,
          category: 'event',
          headline: 'A global event begins',
          description: 'The world shifts.',
          relatedId: null,
          severity: 'medium',
          read: false,
        },
      ],
    });

    render(<Dashboard />);
    const section = within(screen.getByLabelText('Global events'));

    fireEvent.click(section.getByRole('button', { name: /mark .* as read/i }));

    expect(useGameStore.getState().events.news[0].read).toBe(true);
  });
});
