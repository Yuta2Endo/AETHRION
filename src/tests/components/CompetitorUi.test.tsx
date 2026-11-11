import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Dashboard } from '@/ui/screens/Dashboard';
import { useGameStore } from '@/game/state/gameStore';
import { simulation } from '@/game/simulationRunner';
import { commands } from '@/game/commands';

describe('Competitor interface', () => {
  beforeEach(() => {
    simulation.reset();
    useGameStore.getState().reset();
  });

  afterEach(() => {
    simulation.reset();
  });

  it('renders the three AI corporations from the live state', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Competitor overview'));

    expect(section.getByText('NEXORA INDUSTRIES')).toBeInTheDocument();
    expect(section.getByText('VANTEX GLOBAL')).toBeInTheDocument();
    expect(section.getByText('HELION DYNAMICS')).toBeInTheDocument();
  });

  it('renders the specialisation, the personality and the objective of a corporation', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Competitor overview'));

    expect(
      section.getByText('Advanced computing, electronics and frontier technology'),
    ).toBeInTheDocument();
    expect(section.getAllByText('Current objective').length).toBe(3);
    expect(section.getByText('innovative')).toBeInTheDocument();
    expect(section.getByText('conservative')).toBeInTheDocument();
    expect(section.getByText('defensive')).toBeInTheDocument();
  });

  it('renders the real balance, the presence and the reputation', () => {
    const competitor = useGameStore.getState().competitors.competitors[0];
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Competitor overview'));

    const card = section.getByText(competitor.name).closest('.competitor-card');

    expect(card?.textContent).toContain(
      competitor.finances.balance.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    );
    expect(section.getByText(`reputation ${Math.round(competitor.reputation)}`)).toBeInTheDocument();
  });

  it('opens the dossier of a corporation through the command layer', () => {
    const competitor = useGameStore.getState().competitors.competitors[0];
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Competitor overview'));

    fireEvent.click(section.getAllByRole('button', { name: /inspect dossier/i })[0]);

    expect(section.getByText(`Competitor Dossier — ${competitor.name}`)).toBeInTheDocument();
    expect(section.getByText('Market activity')).toBeInTheDocument();
    expect(section.getByText('Recent actions')).toBeInTheDocument();
    expect(section.getByText('Balance')).toBeInTheDocument();
  });

  it('shows the technology progress of a corporation', () => {
    const state = useGameStore.getState();
    state.applyCompetitorsState({
      ...state.competitors,
      competitors: state.competitors.competitors.map((competitor) =>
        competitor.id === 'nexora-industries'
          ? { ...competitor, unlockedTechnologies: ['quantum-lattice', 'photonic-cores'] }
          : competitor,
      ),
    });

    render(<Dashboard />);
    const section = within(screen.getByLabelText('Competitor overview'));

    expect(section.getAllByText('2 tech').length).toBeGreaterThan(0);
  });

  it('renders the competitive pressure in the market section', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Products and market'));

    expect(section.getByText('Competitive Pressure')).toBeInTheDocument();
    expect(section.getByText('compute')).toBeInTheDocument();
    expect(section.getByText('Quantum Core')).toBeInTheDocument();
    expect(section.getByText('Helion Cell')).toBeInTheDocument();
  });

  it('reflects the simulated state of the competitors', async () => {
    await act(async () => {
      await simulation.step();
      await simulation.step();
    });

    const competitor = useGameStore.getState().competitors.competitors[0];
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Competitor overview'));

    const card = section.getByText(competitor.name).closest('.competitor-card');

    expect(card?.textContent).toContain(
      competitor.finances.balance.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    );
  });
});
