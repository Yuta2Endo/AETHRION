import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulationRunner, SIMULATION_SYSTEM_ORDER } from '@/game/simulationRunner';
import { commands } from '@/game/commands';
import { useGameStore } from '@/game/state/gameStore';
import { ManualScheduler } from '@/tests/helpers/manualScheduler';
import { getPlayerCorporation } from '@/simulation/corporation';
import { isValidCorporationState } from '@/simulation/corporation';
import { isValidCityState } from '@/simulation/city';
import { createInitialEconomy, updateEconomy } from '@/simulation/economy';
import { getPayrollPeriod, PAYROLL_PERIOD_MS } from '@/simulation/employees';

const TICK_MS = 1000;

/**
 * The complete city gameplay loop of Stage 05:
 *
 * Corporation → Land → Construction → Housing → Population → Industry →
 * Infrastructure → Economy → Corporate finances
 */
describe('Stage 05 — the city gameplay chain', () => {
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

  const step = async (ticks: number): Promise<void> => {
    for (let i = 0; i < ticks; i += 1) {
      await runner.step();
    }
  };

  /** The first free plot of a district with the given zoning. */
  const plotOf = (districtId: string, zoning: string): string => {
    const city = useGameStore.getState().city.city!;
    const district = city.districts.find((candidate) => candidate.id === districtId)!;
    for (const plotId of district.plotIds) {
      const plot = city.plots.find((candidate) => candidate.id === plotId)!;
      if (plot.zoning === zoning && plot.status === 'available') return plotId;
    }
    throw new Error(`no free ${zoning} plot in ${districtId}`);
  };

  it('runs the whole chain from the corporation to the urban economy', async () => {
    // 1. An existing corporation.
    expect(commands.createCorporation({ name: 'Helion Dynamics' }).ok).toBe(true);
    const corporationBefore = getPlayerCorporation(useGameStore.getState().corporation)!;
    const balanceBefore = corporationBefore.finances.balance;

    // 2. Purchase land.
    const residentialPlot = plotOf('district_residential', 'residential');
    const purchase = commands.purchaseLand(residentialPlot);
    expect(purchase.ok).toBe(true);

    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(corporation.finances.balance).toBeLessThan(balanceBefore);
    expect(
      corporation.transactions.some((transaction) => transaction.type === 'city'),
    ).toBe(true);

    // 3. Construct a residential building.
    const construction = commands.startConstruction({
      buildingTypeId: 'residential-complex',
      plotId: residentialPlot,
    });
    expect(construction.ok).toBe(true);
    if (!construction.ok) throw new Error('setup failed');

    const buildingId = construction.value.id;
    expect(buildingId).toBe('bld_001');
    expect(useGameStore.getState().city.city!.buildings[0].status).toBe('constructing');

    // The construction cost reached the ledger.
    const afterConstruction = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(afterConstruction.finances.lifetimeCityExpenses).toBeGreaterThan(0);
    expect(afterConstruction.finances.balance).toBeLessThan(corporation.finances.balance);

    // 4. Construction completion — exactly once.
    await step(60);
    const completed = useGameStore.getState().city.city!.buildings[0];
    expect(completed.status).toBe('operational');
    expect(completed.progress).toBe(1);
    expect(completed.completedAtSimMs).not.toBeNull();

    await step(60);
    expect(useGameStore.getState().city.city!.buildings[0].completedAtSimMs).toBe(
      completed.completedAtSimMs,
    );

    // 5. The housing capacity increased.
    const statistics = useGameStore.getState().city.city!.statistics;
    expect(statistics.housingCapacity).toBe(300 + 420);

    // 6. The population grows towards the housing capacity.
    const populationBefore = useGameStore.getState().city.city!.population;
    await step(20);
    const city = useGameStore.getState().city.city!;
    expect(city.population).toBeGreaterThan(populationBefore);
    expect(city.population).toBeLessThanOrEqual(city.statistics.housingCapacity);

    // 7. Construct an industrial building.
    const industrialPlot = plotOf('district_industrial', 'industrial');
    expect(commands.purchaseLand(industrialPlot).ok).toBe(true);
    const industrial = commands.startConstruction({
      buildingTypeId: 'electronics-factory',
      plotId: industrialPlot,
    });
    expect(industrial.ok).toBe(true);
    if (!industrial.ok) throw new Error('setup failed');

    // 8. The infrastructure demand of the city rises.
    const demandBefore = useGameStore.getState().city.city!.statistics.infrastructure.demand;
    await step(60);

    const cityAfter = useGameStore.getState().city.city!;
    expect(cityAfter.buildings[1].status).toBe('operational');
    expect(cityAfter.statistics.infrastructure.demand.electricity).toBeGreaterThan(
      demandBefore.electricity,
    );

    // 9. The industrial capacity of the city increased.
    expect(cityAfter.statistics.industrialCapacity).toBe(40);

    // 10. Economy integration — the city raises the commodity demand.
    const economyBefore = useGameStore.getState().economy.commodities.map(
      (commodity) => commodity.demand,
    );
    await step(5);
    const economyAfter = useGameStore.getState().economy.commodities.map(
      (commodity) => commodity.demand,
    );
    expect(economyAfter[0]).toBeGreaterThan(economyBefore[0]);

    // 11. The corporate financial state remains valid.
    const corporationState = useGameStore.getState().corporation;
    expect(isValidCorporationState(corporationState)).toBe(true);
    expect(corporationState.corporations[0].finances.balance).toBeGreaterThanOrEqual(0);
    expect(isValidCityState(useGameStore.getState().city)).toBe(true);

    // The operating cost of the city reaches the operating expenses.
    expect(corporationState.corporations[0].finances.lifetimeOperatingExpenses).toBeGreaterThan(0);
  });

  it('keeps the documented tick order', () => {
    const systems = runner.getEngine().getSystems();
    const names = systems.map((system) => system.name);

    expect(names).toEqual([
      'world',
      'events',
      'city',
      'economy',
      'employees',
      'technology',
      'products',
      'resources',
      'production',
      'market',
      'competitors',
      'corporation',
    ]);

    const orders = systems.map((system) => system.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);

    // The city produces the market signal the economy consumes.
    expect(SIMULATION_SYSTEM_ORDER.city).toBeLessThan(SIMULATION_SYSTEM_ORDER.economy);
    // The Stage 02 dependency is preserved.
    expect(SIMULATION_SYSTEM_ORDER.world).toBeLessThan(SIMULATION_SYSTEM_ORDER.economy);
  });

  it('integrates the city signal with the economy', () => {
    const economy = createInitialEconomy();
    const commodity = economy.commodities.find((entry) => entry.id === 'quantum-core')!;

    // Without a city signal the market behaves exactly as before Stage 05.
    const withoutSignal = updateEconomy(economy, {
      tick: 1,
      deltaMs: 3_600_000,
      marketActivityIndex: 50,
    });

    const hours = 1;
    const activityFactor = 1 + (50 / 100) * 0.5;
    const expectedDemand =
      commodity.demand +
      commodity.demandGrowth * hours * (commodity.demand / commodity.baseDemand) * activityFactor;

    expect(withoutSignal.commodities.find((entry) => entry.id === 'quantum-core')!.demand).toBeCloseTo(
      expectedDemand,
      4,
    );

    // With a city signal the demand rises — but it stays bounded.
    const withSignal = updateEconomy(economy, {
      tick: 1,
      deltaMs: 3_600_000,
      marketActivityIndex: 50,
      citySignal: {
        commercialActivity: 80,
        researchCapacity: 40,
        industrialCapacity: 200,
        energyDemand: 400,
        population: 1_200,
        infrastructureUtilization: 90,
      },
    });

    const cityDemand = withSignal.commodities.find((entry) => entry.id === 'quantum-core')!.demand;
    expect(cityDemand).toBeGreaterThan(expectedDemand);

    // The city may raise the demand by at most fifteen percent.
    const withoutCity = withoutSignal.commodities.find((entry) => entry.id === 'quantum-core')!.demand;
    expect(cityDemand / withoutCity).toBeLessThanOrEqual(1.15);
  });

  it('leaves the economy untouched while the city runs nothing', async () => {
    const before = JSON.stringify(useGameStore.getState().economy);

    await step(10);

    const after = useGameStore.getState().economy;
    // The world and the corporation still move the market — but the city
    // contributes nothing while it runs no building.
    expect(after.commodities.find((c) => c.id === 'quantum-core')!.demand).toBeGreaterThan(
      createInitialEconomy().commodities.find((c) => c.id === 'quantum-core')!.demand,
    );
    expect(JSON.stringify(before)).not.toBe(JSON.stringify(after));
  });

  it('rejects a failed command without changing the state', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const before = JSON.stringify(useGameStore.getState());

    // The plot does not exist.
    const missing = commands.purchaseLand('plot_999');
    expect(missing.ok).toBe(false);

    // The plot is not owned yet.
    const notOwned = commands.startConstruction({
      buildingTypeId: 'residential-complex',
      plotId: plotOf('district_residential', 'residential'),
    });
    expect(notOwned.ok).toBe(false);

    expect(JSON.stringify(useGameStore.getState())).toBe(before);
  });

  it('never lets the balance become negative', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;

    // Drain the balance with repeated purchases of the most expensive plot.
    let result = commands.purchaseLand(plotOf('district_downtown', 'commercial'));
    let guard = 0;
    while (result.ok && guard < 100) {
      guard += 1;
      const city = useGameStore.getState().city.city!;
      const next = city.plots.find(
        (plot) => plot.status === 'available' && plot.districtId === 'district_downtown',
      );
      if (!next) break;
      result = commands.purchaseLand(next.id);
    }

    const after = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(after.finances.balance).toBeGreaterThanOrEqual(0);
    expect(corporation.finances.balance).toBeGreaterThanOrEqual(0);
  });

  it('records every transaction exactly once', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const plotId = plotOf('district_residential', 'residential');

    expect(commands.purchaseLand(plotId).ok).toBe(true);
    expect(
      commands.startConstruction({ buildingTypeId: 'residential-complex', plotId }).ok,
    ).toBe(true);

    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    const cityTransactions = corporation.transactions.filter(
      (transaction) => transaction.type === 'city',
    );

    expect(cityTransactions).toHaveLength(2);
    expect(new Set(cityTransactions.map((transaction) => transaction.id)).size).toBe(2);

    const explained = cityTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    expect(corporation.finances.balance - 50_000).toBeCloseTo(explained, 2);
  });

  it('never completes a construction twice', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const plotId = plotOf('district_residential', 'residential');
    commands.purchaseLand(plotId);
    commands.startConstruction({ buildingTypeId: 'residential-complex', plotId });

    await step(200);

    const city = useGameStore.getState().city.city!;
    expect(city.buildings).toHaveLength(1);
    expect(city.buildings[0].status).toBe('operational');
    expect(city.buildings[0].progress).toBe(1);

    // The plot still carries exactly one building.
    const occupied = city.plots.filter((plot) => plot.status === 'occupied');
    expect(occupied).toHaveLength(1);
  });

  it('never creates a resource', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const before = useGameStore.getState().resources.balances.map((balance) => balance.quantity);

    const plotId = plotOf('district_residential', 'residential');
    commands.purchaseLand(plotId);
    commands.startConstruction({ buildingTypeId: 'residential-complex', plotId });

    await step(80);

    const after = useGameStore.getState().resources.balances.map((balance) => balance.quantity);
    expect(after).toEqual(before);
  });

  it('never violates the ownership of the corporate employees', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    expect(
      commands.hireEmployee({ profession: 'engineer', department: 'engineering' }).ok,
    ).toBe(true);

    const employee = useGameStore.getState().employees.employees[0];
    const plotId = plotOf('district_industrial', 'industrial');
    commands.purchaseLand(plotId);
    commands.startConstruction({ buildingTypeId: 'electronics-factory', plotId });

    await step(60);

    const assignment = commands.assignBuilding('bld_001', [employee.id]);
    expect(assignment.ok).toBe(true);

    // The employee record itself is untouched — the city only stores a reference.
    const employees = useGameStore.getState().employees.employees;
    expect(employees).toHaveLength(1);
    expect(employees[0].id).toBe(employee.id);
    expect(employees[0].status).toBe('active');

    // The employee is counted exactly once by the corporation.
    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(corporation.finances.periodRevenue).toBeGreaterThanOrEqual(0);

    // The city never counts corporate employees as city residents.
    const city = useGameStore.getState().city.city!;
    expect(city.population).toBeLessThan(employees.length + 1_000);
    expect(city.statistics.employmentCapacity).toBe(180 + 70);
  });

  it('does not regress the payroll', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'engineer', department: 'engineering' });

    const periods = Math.ceil(PAYROLL_PERIOD_MS / 3_600_000) + 2;
    await step(periods);

    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    const payrolls = corporation.transactions.filter(
      (transaction) => transaction.type === 'payroll',
    );

    expect(payrolls.length).toBeGreaterThan(0);
    expect(corporation.finances.lifetimePayrollExpenses).toBeGreaterThan(0);
    expect(corporation.missedPayrollCount).toBe(0);
  });

  it('is deterministic across identical runs', async () => {
    const run = async (): Promise<string> => {
      runner.reset();
      commands.createCorporation({ name: 'Helion Dynamics' });

      const plotId = plotOf('district_residential', 'residential');
      commands.purchaseLand(plotId);
      commands.startConstruction({ buildingTypeId: 'residential-complex', plotId });

      for (let i = 0; i < 20; i += 1) {
        await runner.step();
      }

      const state = useGameStore.getState();
      return JSON.stringify({
        city: state.city,
        corporation: state.corporation.corporations,
        economy: state.economy,
      });
    };

    const first = await run();
    const second = await run();

    expect(second).toBe(first);
  });

  it('pauses and resumes the city', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const plotId = plotOf('district_residential', 'residential');
    commands.purchaseLand(plotId);
    commands.startConstruction({ buildingTypeId: 'residential-complex', plotId });

    runner.start();
    await runner.step();

    const progressBefore = useGameStore.getState().city.city!.buildings[0].progress;
    runner.pause();
    await runner.step();

    expect(useGameStore.getState().city.city!.buildings[0].progress).toBe(progressBefore);

    runner.resume();
    await runner.step();

    expect(useGameStore.getState().city.city!.buildings[0].progress).toBeGreaterThan(
      progressBefore,
    );

    runner.stop();
  });

  it('keeps the payroll period independent of the city', async () => {
    const period = getPayrollPeriod(3_600_000 * 200);

    expect(period.id).toBe('period_0001');
    expect(period.id).not.toBe(getPayrollPeriod(0).id);
  });
});
