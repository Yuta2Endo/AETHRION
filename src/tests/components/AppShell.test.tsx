import { describe, it, expect, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AppShell } from '@/app/layouts/AppShell';
import { simulation } from '@/game/simulationRunner';

describe('AppShell', () => {
  afterEach(() => {
    simulation.reset();
  });

  it('shows the loading screen until the simulation produced its first tick', async () => {
    render(<AppShell />);

    expect(screen.getByText(/Initializing empire foundation/)).toBeInTheDocument();
    expect(simulation.getStatus()).toBe('running');

    await act(async () => {
      await simulation.step();
    });

    expect(screen.getByRole('heading', { name: /command center/i })).toBeInTheDocument();
    expect(screen.queryByText(/Initializing empire foundation/)).not.toBeInTheDocument();
  });

  it('renders the AETHRION brand identity', async () => {
    render(<AppShell />);

    await act(async () => {
      await simulation.step();
    });

    expect(screen.getAllByText('AETHRION').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BUILD YOUR EMPIRE. SHAPE THE FUTURE.').length).toBeGreaterThan(0);
  });

  it('stops the simulation when the shell is unmounted', () => {
    const { unmount } = render(<AppShell />);

    expect(simulation.getStatus()).toBe('running');

    unmount();

    expect(simulation.getStatus()).toBe('stopped');
  });
});
