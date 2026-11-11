import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Dashboard } from '@/ui/screens/Dashboard';
import { useGameStore } from '@/game/state/gameStore';
import { simulation } from '@/game/simulationRunner';

describe('Corporation interface', () => {
  beforeEach(() => {
    simulation.reset();
    useGameStore.getState().reset();
  });

  afterEach(() => {
    simulation.reset();
  });

  it('shows the establishment form while no corporation exists', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Establish corporation'));

    expect(section.getByLabelText(/corporation name/i)).toBeInTheDocument();
    expect(
      section.getByRole('button', { name: /establish corporation/i }),
    ).toBeInTheDocument();
  });

  it('establishes a corporation through the interface', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Establish corporation'));

    fireEvent.change(section.getByLabelText(/corporation name/i), {
      target: { value: 'Helion Dynamics' },
    });
    fireEvent.click(section.getByRole('button', { name: /establish corporation/i }));

    const overview = within(screen.getByLabelText('Corporation overview'));
    expect(overview.getByText('Helion Dynamics')).toBeInTheDocument();
    expect(overview.getByText(/startup · tier 1/i)).toBeInTheDocument();
    expect(useGameStore.getState().corporation.corporations).toHaveLength(1);
  });

  it('shows a validation error for an invalid corporation name', () => {
    render(<Dashboard />);
    const section = within(screen.getByLabelText('Establish corporation'));

    fireEvent.change(section.getByLabelText(/corporation name/i), {
      target: { value: 'x' },
    });
    fireEvent.click(section.getByRole('button', { name: /establish corporation/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(useGameStore.getState().corporation.corporations).toHaveLength(0);
  });

  it('hires an employee through the interface and lists them', () => {
    render(<Dashboard />);

    const establish = within(screen.getByLabelText('Establish corporation'));
    fireEvent.change(establish.getByLabelText(/corporation name/i), {
      target: { value: 'Helion Dynamics' },
    });
    fireEvent.click(establish.getByRole('button', { name: /establish corporation/i }));

    const hiring = within(screen.getByLabelText('Hiring'));
    fireEvent.change(hiring.getByLabelText(/profession/i), {
      target: { value: 'researcher' },
    });
    fireEvent.click(hiring.getByRole('button', { name: /hire employee/i }));

    expect(hiring.getByText(/joined as Researcher/)).toBeInTheDocument();

    const management = within(screen.getByLabelText('Employee management'));
    const card = management.getByText('Kael Voss').closest('.employee-card');
    expect(card?.textContent).toContain('Researcher');
    // The profession and the department are chosen independently.
    expect(card?.textContent).toContain('engineering');
    expect(useGameStore.getState().employees.employees).toHaveLength(1);
  });

  it('shows the real balance and figures in the finance overview', () => {
    render(<Dashboard />);

    const establish = within(screen.getByLabelText('Establish corporation'));
    fireEvent.change(establish.getByLabelText(/corporation name/i), {
      target: { value: 'Helion Dynamics' },
    });
    fireEvent.click(establish.getByRole('button', { name: /establish corporation/i }));

    const finance = within(screen.getByLabelText('Finance overview'));
    const balance = useGameStore.getState().corporation.corporations[0].finances.balance;

    // Compared against the rendered card, independent of the locale
    // formatting of the thousands separator.
    const cashCard = finance.getByText('Cash Balance').closest('.stat-card');
    const digits = (cashCard?.textContent ?? '').replace(/[^0-9]/g, '');
    expect(digits).toContain(String(balance));
    expect(finance.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('shows an empty state when the corporation has no employees', () => {
    render(<Dashboard />);

    const establish = within(screen.getByLabelText('Establish corporation'));
    fireEvent.change(establish.getByLabelText(/corporation name/i), {
      target: { value: 'Helion Dynamics' },
    });
    fireEvent.click(establish.getByRole('button', { name: /establish corporation/i }));

    const management = within(screen.getByLabelText('Employee management'));
    expect(management.getByText('No employees yet')).toBeInTheDocument();
  });

  it('shows the hiring cost and the capacity of the current tier', () => {
    render(<Dashboard />);

    const establish = within(screen.getByLabelText('Establish corporation'));
    fireEvent.change(establish.getByLabelText(/corporation name/i), {
      target: { value: 'Helion Dynamics' },
    });
    fireEvent.click(establish.getByRole('button', { name: /establish corporation/i }));

    const hiring = within(screen.getByLabelText('Hiring'));
    expect(hiring.getByText(/startup tier · capacity 5/i)).toBeInTheDocument();
    expect(hiring.getByText(/hiring fee/i)).toBeInTheDocument();
  });

  it('reports a validation error when the capacity is exhausted', () => {
    render(<Dashboard />);

    const establish = within(screen.getByLabelText('Establish corporation'));
    fireEvent.change(establish.getByLabelText(/corporation name/i), {
      target: { value: 'Helion Dynamics' },
    });
    fireEvent.click(establish.getByRole('button', { name: /establish corporation/i }));

    const hiring = within(screen.getByLabelText('Hiring'));
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(hiring.getByRole('button', { name: /hire employee/i }));
    }

    fireEvent.click(hiring.getByRole('button', { name: /hire employee/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/capacity/i);
    expect(useGameStore.getState().employees.employees).toHaveLength(5);
  });

  it('does not render the corporation sections before a corporation exists', () => {
    render(<Dashboard />);

    expect(screen.queryByLabelText('Employee management')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Finance overview')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hiring')).not.toBeInTheDocument();
  });
});
