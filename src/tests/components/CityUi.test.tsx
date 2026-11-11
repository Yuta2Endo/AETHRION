import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Dashboard } from '@/ui/screens/Dashboard';
import { useGameStore } from '@/game/state/gameStore';
import { simulation } from '@/game/simulationRunner';
import { commands } from '@/game/commands';
import { getPlayerCorporation } from '@/simulation/corporation';

/**
 * Establishes a corporation so that the city actions are enabled.
 */
function establishCorporation(): void {
  commands.createCorporation({ name: 'Helion Dynamics' });
}

/** The first free plot of a district with the given zoning. */
function plotOf(districtId: string, zoning: string): string {
  const city = useGameStore.getState().city.city!;
  const district = city.districts.find((candidate) => candidate.id === districtId)!;
  for (const plotId of district.plotIds) {
    const plot = city.plots.find((candidate) => candidate.id === plotId)!;
    if (plot.zoning === zoning && plot.status === 'available') return plotId;
  }
  throw new Error(`no free ${zoning} plot in ${districtId}`);
}

describe('City interface', () => {
  beforeEach(() => {
    simulation.reset();
    useGameStore.getState().reset();
  });

  afterEach(() => {
    simulation.reset();
  });

  it('renders the city overview from the real simulation state', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('City overview'));

    expect(section.getByText('Aethrion Prime')).toBeInTheDocument();
    expect(section.getByText('Population')).toBeInTheDocument();
    expect(section.getByText('Housing Capacity')).toBeInTheDocument();
    expect(section.getByText('Unemployment')).toBeInTheDocument();
    expect(section.getByText('Prosperity')).toBeInTheDocument();
    expect(section.getByText('Public Services')).toBeInTheDocument();
  });

  it('renders the five districts with their real identifiers', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('City overview'));

    expect(section.getByText('Downtown')).toBeInTheDocument();
    expect(section.getByText('Industrial Zone')).toBeInTheDocument();
    expect(section.getByText('Research Park')).toBeInTheDocument();
    expect(section.getByText('Residential District')).toBeInTheDocument();
    expect(section.getByText('Energy District')).toBeInTheDocument();
    expect(section.getByText('district_downtown')).toBeInTheDocument();
  });

  it('renames the city through the interface', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('City overview'));

    fireEvent.change(section.getByLabelText(/city name/i), {
      target: { value: 'New Avalon' },
    });
    fireEvent.click(section.getByRole('button', { name: /rename city/i }));

    expect(useGameStore.getState().city.city!.name).toBe('New Avalon');
  });

  it('renders the land map with the real plots', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Land management'));

    expect(section.getByText('plot_001')).toBeInTheDocument();
    expect(section.getByText('plot_030')).toBeInTheDocument();
    expect(section.getByText(/30 plot\(s\) shown/)).toBeInTheDocument();
  });

  it('buys a plot through the interface and charges the corporation', () => {
    establishCorporation();
    render(<Dashboard />);

    const section = within(screen.getByLabelText('Land management'));
    const plotId = plotOf('district_residential', 'residential');
    const balanceBefore = getPlayerCorporation(useGameStore.getState().corporation)!.finances.balance;

    fireEvent.click(section.getByRole('button', { name: `Buy plot ${plotId}` }));

    const city = useGameStore.getState().city.city!;
    const plot = city.plots.find((candidate) => candidate.id === plotId)!;

    expect(plot.status).toBe('owned');
    expect(
      getPlayerCorporation(useGameStore.getState().corporation)!.finances.balance,
    ).toBeLessThan(balanceBefore);
  });

  it('renders the building catalogue with its real costs', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('City construction'));

    expect(section.getByText('Corporate Headquarters')).toBeInTheDocument();
    expect(section.getByText('Electronics Factory')).toBeInTheDocument();
    expect(section.getByText('Research Laboratory')).toBeInTheDocument();
    expect(section.getByText('Residential Complex')).toBeInTheDocument();
    expect(section.getByText('Power Station')).toBeInTheDocument();
    expect(section.getByText('Water Treatment Facility')).toBeInTheDocument();
  });

  it('starts a construction through the interface', () => {
    establishCorporation();
    render(<Dashboard />);

    const section = within(screen.getByLabelText('City construction'));
    const plotId = plotOf('district_residential', 'residential');

    act(() => {
      commands.purchaseLand(plotId);
    });

    fireEvent.change(section.getByLabelText(/^plot$/i), { target: { value: plotId } });
    fireEvent.click(section.getByRole('button', { name: /start construction/i }));

    const city = useGameStore.getState().city.city!;
    expect(city.buildings).toHaveLength(1);
    expect(city.buildings[0].status).toBe('constructing');
    expect(city.buildings[0].typeId).toBe('residential-complex');
  });

  it('lists the city buildings and their lifecycle controls', () => {
    establishCorporation();
    render(<Dashboard />);

    const plotId = plotOf('district_residential', 'residential');

    act(() => {
      commands.purchaseLand(plotId);
      commands.startConstruction({
        buildingTypeId: 'residential-complex',
        plotId,
      });
    });

    const section = within(screen.getByLabelText('City construction'));
    expect(section.getByText('City Buildings')).toBeInTheDocument();
    expect(section.getByText(new RegExp(`plot ${plotId}`))).toBeInTheDocument();
    expect(section.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('reports a validation error for an incompatible construction', () => {
    establishCorporation();
    render(<Dashboard />);

    const section = within(screen.getByLabelText('City construction'));
    const plotId = plotOf('district_industrial', 'industrial');

    act(() => {
      commands.purchaseLand(plotId);
    });

    // The research laboratory may not be built in the industrial zone.
    fireEvent.change(section.getByLabelText(/^building$/i), {
      target: { value: 'research-laboratory' },
    });

    expect(section.getByText(/no compatible owned plot/i)).toBeInTheDocument();
  });
});
