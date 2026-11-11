import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Dashboard } from '@/ui/screens/Dashboard';
import { useGameStore } from '@/game/state/gameStore';
import { simulation } from '@/game/simulationRunner';

describe('Dashboard', () => {
  beforeEach(() => {
    simulation.reset();
    useGameStore.getState().reset();
  });

  afterEach(() => {
    simulation.reset();
  });

  it('renders the simulated date taken from the game state', () => {
    render(<Dashboard />);

    expect(screen.getByText('2287-01-01 08:00')).toBeInTheDocument();
  });

  it('renders the corporation section from the game state', () => {
    render(<Dashboard />);

    // No corporation has been established yet — the dashboard shows the
    // establishment form instead of any placeholder statistics.
    expect(screen.getByLabelText('Establish corporation')).toBeInTheDocument();
    expect(screen.queryByLabelText('Corporation overview')).not.toBeInTheDocument();
  });

  it('renders every world region with its stable identifier', () => {
    render(<Dashboard />);
    const world = within(screen.getByLabelText('World overview'));

    expect(world.getByText('Aurora Basin')).toBeInTheDocument();
    expect(world.getByText('Nova Reach')).toBeInTheDocument();
    expect(world.getByText('Helion Rift')).toBeInTheDocument();
    expect(world.getByText('Cyther Peaks')).toBeInTheDocument();
    expect(world.getByText('Vanta March')).toBeInTheDocument();
    expect(world.getByText('aurora-basin')).toBeInTheDocument();
  });

  it('renders the market rows with the real commodity prices', () => {
    const { container } = render(<Dashboard />);
    const economy = within(screen.getByLabelText('Economy overview'));

    expect(economy.getByText('Quantum Core')).toBeInTheDocument();
    expect(economy.getByText('Helion Cell')).toBeInTheDocument();

    // Compared against the same locale-aware formatting the component uses.
    const expected = `AΞ${(4200).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    expect(container.querySelector('.market-price')?.textContent).toBe(expected);
  });

  it('reflects the simulation status', () => {
    render(<Dashboard />);

    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('starts the simulation from the interface', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(useGameStore.getState().simulation.status).toBe('running');

    act(() => {
      simulation.stop();
    });
  });

  it('pauses and resumes the simulation from the interface', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(useGameStore.getState().simulation.status).toBe('paused');

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(useGameStore.getState().simulation.status).toBe('running');

    act(() => {
      simulation.stop();
    });
  });

  it('changes the simulation speed from the interface', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: '4x' }));

    expect(useGameStore.getState().simulation.speed).toBe(4);
  });

  it('updates the rendered date when the simulation advances', async () => {
    render(<Dashboard />);

    await act(async () => {
      await simulation.step();
    });

    expect(screen.getByText('2287-01-01 09:00')).toBeInTheDocument();
  });

  it('does not render placeholder system cards', () => {
    render(<Dashboard />);

    expect(screen.queryByText(/Planned — future stage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/System \d/)).not.toBeInTheDocument();
  });
});
