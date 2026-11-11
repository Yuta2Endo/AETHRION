import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulationRunner, SIMULATION_SYSTEM_ORDER } from '@/game/simulationRunner';
import { commands } from '@/game/commands';
import { useGameStore } from '@/game/state/gameStore';
import { ManualScheduler } from '@/tests/helpers/manualScheduler';
import { PAYROLL_PERIOD_MS, developEmployees, getPayrollPeriod } from '@/simulation/employees';
import { getPlayerCorporation } from '@/simulation/corporation';

const TICK_MS = 1000;

const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('Stage 03 — simulation integration', () => {
  let scheduler: ManualScheduler;
  let runner: SimulationRunner;

  beforeEach(() => {
    useGameStore.getState().reset();
    scheduler = new ManualScheduler();
    runner = new SimulationRunner({ scheduler, tickDurationMs: TICK_MS });
  });

  afterEach(() => {
    runner.dispose();
    useGameStore.getState().reset();
  });

  it('registers the corporation and employee systems in the documented order', () => {
    const systems = runner.getEngine().getSystems();

    // Stage 04 inserted the technology, product, resource, production and
    // market systems between the employees and the corporation.
    expect(systems.map((system) => system.name)).toEqual([
      'world',
      'economy',
      'employees',
      'technology',
      'products',
      'resources',
      'production',
      'market',
      'corporation',
    ]);
    expect(SIMULATION_SYSTEM_ORDER.employees).toBeGreaterThan(SIMULATION_SYSTEM_ORDER.economy);
    expect(SIMULATION_SYSTEM_ORDER.corporation).toBeGreaterThan(SIMULATION_SYSTEM_ORDER.employees);
  });

  it('starts without a corporation and accepts one through the command layer', () => {
    expect(getPlayerCorporation(useGameStore.getState().corporation)).toBeNull();

    const result = commands.createCorporation({ name: 'Helion Dynamics' });

    expect(result.ok).toBe(true);
    const corporation = getPlayerCorporation(useGameStore.getState().corporation);
    expect(corporation).not.toBeNull();
    expect(corporation?.name).toBe('Helion Dynamics');
  });

  it('rejects a second corporation and an invalid name', () => {
    expect(commands.createCorporation({ name: 'Helion Dynamics' }).ok).toBe(true);

    const duplicate = commands.createCorporation({ name: 'Another Corp' });
    expect(duplicate.ok).toBe(false);

    const invalid = commands.createCorporation({ name: 'x' });
    expect(invalid.ok).toBe(false);
  });

  it('hires an employee and charges the hiring fee', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    const balanceBefore = corporation.finances.balance;

    const result = commands.hireEmployee({
      profession: 'engineer',
      department: 'engineering',
    });

    expect(result.ok).toBe(true);
    const state = useGameStore.getState();
    expect(state.employees.employees).toHaveLength(1);
    expect(state.employees.employees[0].department).toBe('engineering');
    const updated = getPlayerCorporation(state.corporation)!;
    expect(updated.finances.balance).toBeLessThan(balanceBefore);
    expect(updated.finances.lifetimeHiringCosts).toBeGreaterThan(0);
    expect(updated.transactions.some((t) => t.type === 'hiring')).toBe(true);
  });

  it('rejects hiring without a corporation', () => {
    const result = commands.hireEmployee({
      profession: 'engineer',
      department: 'engineering',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CORPORATION_NOT_FOUND');
  });

  it('develops the workforce and accrues corporate revenue on every tick', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'engineer', department: 'engineering' });

    await runner.step();

    const state = useGameStore.getState();
    expect(state.employees.employees[0].experience).toBeGreaterThan(0);
    expect(state.employees.employees[0].development.length).toBeGreaterThan(0);

    const corporation = getPlayerCorporation(state.corporation)!;
    expect(corporation.finances.lifetimeRevenue).toBeGreaterThan(0);
    expect(corporation.finances.lifetimeOperatingExpenses).toBeGreaterThan(0);
  });

  it('feeds the workforce developed in the same tick into the corporation', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'researcher', department: 'research' });

    const before = useGameStore.getState();
    const expectedEmployees = developEmployees(before.employees, {
      tick: 1,
      deltaMs: 3_600_000,
      elapsedSimMs: 3_600_000,
      periodId: getPayrollPeriod(3_600_000).id,
    });
    const expectedProductivity = expectedEmployees.employees[0].productivity;

    await runner.step();

    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    const expectedRevenue = Math.round(
      expectedProductivity * 1.2 * 1 * 100,
    ) / 100;

    expect(corporation.finances.lifetimeRevenue).toBeCloseTo(expectedRevenue, 1);
  });

  it('processes the payroll exactly once per period', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'engineer', department: 'engineering' });

    await runner.step();

    const afterFirst = getPlayerCorporation(useGameStore.getState().corporation)!;
    const payrollTransactions = afterFirst.transactions.filter((t) => t.type === 'payroll');
    expect(payrollTransactions).toHaveLength(1);
    expect(afterFirst.lastPayrollPeriodId).toBe('period_0000');

    // Further ticks inside the same period must not pay again.
    await runner.step();
    await runner.step();

    const afterMore = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(afterMore.transactions.filter((t) => t.type === 'payroll')).toHaveLength(1);
    expect(afterMore.finances.lifetimePayrollExpenses).toBe(
      afterFirst.finances.lifetimePayrollExpenses,
    );
  });

  it('pays the next period once the boundary is crossed', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'engineer', department: 'engineering' });

    await runner.step();

    // Jump across the payroll boundary.
    const clock = runner.getClock();
    const remaining = PAYROLL_PERIOD_MS - clock.getElapsedSimMs() + 1;
    for (let i = 0; i < Math.ceil(remaining / 3_600_000); i += 1) {
      await runner.step();
    }

    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(corporation.transactions.filter((t) => t.type === 'payroll')).toHaveLength(2);
    expect(corporation.financialHistory.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the corporation and employee state synchronised', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'manager', department: 'management' });
    commands.hireEmployee({ profession: 'marketer', department: 'management' });

    await runner.step();

    const state = useGameStore.getState();
    const corporation = getPlayerCorporation(state.corporation)!;
    const employeeCount = state.employees.employees.filter((e) => e.status !== 'departed').length;

    expect(employeeCount).toBe(2);
    expect(corporation.financialHistory[corporation.financialHistory.length - 1].employeeCount).toBe(
      employeeCount,
    );
  });

  it('pauses and resumes the corporation simulation', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'engineer', department: 'engineering' });

    runner.start();
    await runner.step();
    const revenueBefore = getPlayerCorporation(useGameStore.getState().corporation)!
      .finances.lifetimeRevenue;

    runner.pause();
    await runner.step();

    expect(
      getPlayerCorporation(useGameStore.getState().corporation)!.finances.lifetimeRevenue,
    ).toBe(revenueBefore);

    runner.resume();
    await runner.step();

    expect(
      getPlayerCorporation(useGameStore.getState().corporation)!.finances.lifetimeRevenue,
    ).toBeGreaterThan(revenueBefore);
  });

  it('is deterministic across identical runs', async () => {
    const run = async (): Promise<string> => {
      // Reset the whole simulation — store, clock and engine — so both runs
      // start from exactly the same state.
      runner.reset();
      commands.createCorporation({ name: 'Helion Dynamics' });
      commands.hireEmployee({ profession: 'engineer', department: 'engineering' });
      commands.hireEmployee({ profession: 'researcher', department: 'research' });

      for (let i = 0; i < 5; i += 1) {
        await runner.step();
      }

      const state = useGameStore.getState();
      return JSON.stringify({
        employees: state.employees.employees,
        corporation: state.corporation.corporations,
      });
    };

    const first = await run();
    const second = await run();

    expect(second).toBe(first);
  });

  it('isolates a failing system so the corporation still updates', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'engineer', department: 'engineering' });

    runner.getEngine().registerSystem({
      name: 'broken',
      order: 35,
      update: () => {
        throw new Error('stage 03 system exploded');
      },
    });

    await runner.step();

    const state = useGameStore.getState();
    expect(state.simulation.lastError).toContain('stage 03 system exploded');
    const corporation = getPlayerCorporation(state.corporation)!;
    expect(corporation.finances.lifetimeRevenue).toBeGreaterThan(0);
  });

  it('does not create a corporation implicitly', async () => {
    await runner.step();

    expect(getPlayerCorporation(useGameStore.getState().corporation)).toBeNull();
    expect(useGameStore.getState().employees.employees).toHaveLength(0);
  });

  it('advances the simulation through the frame scheduler', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    runner.start();

    scheduler.advance(TICK_MS); // time baseline
    scheduler.advance(TICK_MS);
    await flushMicrotasks();

    expect(useGameStore.getState().simulation.tick).toBe(1);
    expect(useGameStore.getState().corporation.tick).toBe(1);
  });
});
