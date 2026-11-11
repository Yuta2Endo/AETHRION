import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulationRunner, SIMULATION_SYSTEM_ORDER } from '@/game/simulationRunner';
import { commands } from '@/game/commands';
import { useGameStore } from '@/game/state/gameStore';
import { ManualScheduler } from '@/tests/helpers/manualScheduler';
import { getPlayerCorporation } from '@/simulation/corporation';
import { getTechnologyDefinition } from '@/simulation/technology';
import { getProductDefinition } from '@/simulation/products';
import { RESOURCES } from '@/simulation/resources';

const TICK_MS = 1000;

/**
 * The complete economic gameplay loop of Stage 04:
 *
 * Research → Technology Unlock → Product Development → Resource Acquisition →
 * Manufacturing → Inventory → Market Sales → Revenue → Corporate Growth
 */
describe('Stage 04 — the complete economic chain', () => {
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

  /** Runs the given number of simulation ticks. */
  const step = async (ticks: number): Promise<void> => {
    for (let i = 0; i < ticks; i += 1) {
      await runner.step();
    }
  };

  it('runs the whole chain from research to corporate revenue', async () => {
    // 1. A corporation and a workforce.
    expect(commands.createCorporation({ name: 'Helion Dynamics' }).ok).toBe(true);
    expect(
      commands.hireEmployee({ profession: 'researcher', department: 'research' }).ok,
    ).toBe(true);
    expect(
      commands.hireEmployee({ profession: 'engineer', department: 'engineering' }).ok,
    ).toBe(true);

    const employees = useGameStore.getState().employees.employees;
    const researcher = employees.find((e) => e.profession === 'researcher')!;
    const engineer = employees.find((e) => e.profession === 'engineer')!;

    // 2. Research — the foundation technology and its successor.
    expect(
      commands.startResearch({
        technologyId: 'quantum-lattice',
        employeeIds: [researcher.id],
      }).ok,
    ).toBe(true);

    await step(60);

    expect(useGameStore.getState().technology.unlocked).toContain('quantum-lattice');

    expect(
      commands.startResearch({
        technologyId: 'photonic-cores',
        employeeIds: [researcher.id],
      }).ok,
    ).toBe(true);

    await step(60);

    expect(useGameStore.getState().technology.unlocked).toContain('photonic-cores');

    // 3. Product development — the product requires the unlocked technology.
    const development = commands.startProductDevelopment({
      definitionId: 'helix-workstation',
      employeeIds: [engineer.id],
    });
    expect(development.ok).toBe(true);

    await step(80);

    const product = useGameStore.getState().products.instances[0];
    expect(product.status).toBe('ready');
    expect(product.quality).toBeGreaterThan(0);

    // 4. Resource acquisition — the market price funds the purchase.
    const balanceBefore = getPlayerCorporation(useGameStore.getState().corporation)!
      .finances.balance;

    const purchase = commands.purchaseResource({
      resourceId: 'electronics',
      quantity: 20,
    });
    expect(purchase.ok).toBe(true);

    const resources = useGameStore.getState().resources.balances;
    const electronics = resources.find((balance) => balance.resourceId === 'electronics')!;
    expect(electronics.quantity).toBe(20);

    const balanceAfter = getPlayerCorporation(useGameStore.getState().corporation)!
      .finances.balance;
    expect(balanceAfter).toBeLessThan(balanceBefore);

    // The product also needs components.
    expect(
      commands.purchaseResource({ resourceId: 'components', quantity: 20 }).ok,
    ).toBe(true);

    // 5. Manufacturing — a facility and a production order.
    const facility = commands.createFacility({
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    expect(facility.ok).toBe(true);
    if (!facility.ok) throw new Error('setup failed');

    const production = commands.startProduction({
      productInstanceId: product.id,
      facilityId: facility.value.id,
      quantity: 10,
    });
    expect(production.ok).toBe(true);

    // The resources are reserved for the order.
    const reserved = useGameStore.getState().resources.balances.find(
      (balance) => balance.resourceId === 'electronics',
    )!;
    expect(reserved.reserved).toBe(10);

    await step(30);

    // 6. The finished goods enter the inventory and the resources are consumed.
    const finished = useGameStore.getState().products.instances[0];
    expect(finished.inventory).toBe(10);

    const consumed = useGameStore.getState().resources.balances.find(
      (balance) => balance.resourceId === 'electronics',
    )!;
    expect(consumed.reserved).toBe(0);
    expect(consumed.quantity).toBe(10);
    expect(consumed.lifetimeConsumed).toBe(10);

    // 7. Market sales.
    expect(commands.setProductSalesActive(product.id, true).ok).toBe(true);

    const revenueBefore = getPlayerCorporation(useGameStore.getState().corporation)!
      .finances.lifetimeSalesRevenue;

    await step(60);

    const sold = useGameStore.getState().products.instances[0].unitsSold;
    expect(sold).toBeGreaterThan(0);

    // 8. The revenue reaches the corporation ledger.
    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(corporation.finances.lifetimeSalesRevenue).toBeGreaterThan(revenueBefore);
    expect(corporation.finances.lifetimeRevenue).toBeGreaterThanOrEqual(
      corporation.finances.lifetimeSalesRevenue,
    );
    expect(
      corporation.transactions.some((transaction) => transaction.type === 'sales'),
    ).toBe(true);
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
    expect(SIMULATION_SYSTEM_ORDER.world).toBeLessThan(SIMULATION_SYSTEM_ORDER.economy);
    expect(SIMULATION_SYSTEM_ORDER.market).toBeLessThan(SIMULATION_SYSTEM_ORDER.corporation);
  });

  it('does not create money without a transaction', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'researcher', department: 'research' });

    const corporation = () => getPlayerCorporation(useGameStore.getState().corporation)!;
    const balanceBefore = corporation().finances.balance;
    const transactionCountBefore = corporation().transactions.length;

    // A tick without any economic event must not change the balance.
    await step(5);

    const after = corporation();
    const balanceAfter = after.finances.balance;
    const newTransactions = after.transactions.slice(transactionCountBefore);
    const explained = newTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );

    expect(balanceAfter - balanceBefore).toBeCloseTo(explained, 2);
  });

  it('never lets a resource quantity become negative', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    await step(20);

    useGameStore.getState().resources.balances.forEach((balance) => {
      expect(balance.quantity).toBeGreaterThanOrEqual(0);
      expect(balance.reserved).toBeGreaterThanOrEqual(0);
      expect(balance.reserved).toBeLessThanOrEqual(balance.quantity);
    });
  });

  it('never completes a production order twice', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    expect(
      commands.hireEmployee({ profession: 'researcher', department: 'research' }).ok,
    ).toBe(true);
    expect(
      commands.hireEmployee({ profession: 'engineer', department: 'engineering' }).ok,
    ).toBe(true);

    const staff = useGameStore.getState().employees.employees;
    const researcher = staff.find((e) => e.profession === 'researcher')!;
    const engineer = staff.find((e) => e.profession === 'engineer')!;

    expect(
      commands.startResearch({
        technologyId: 'quantum-lattice',
        employeeIds: [researcher.id],
      }).ok,
    ).toBe(true);
    await step(80);

    expect(useGameStore.getState().technology.unlocked).toContain('quantum-lattice');

    expect(
      commands.startResearch({
        technologyId: 'photonic-cores',
        employeeIds: [researcher.id],
      }).ok,
    ).toBe(true);
    await step(120);

    expect(useGameStore.getState().technology.unlocked).toContain('photonic-cores');

    expect(
      commands.startProductDevelopment({
        definitionId: 'helix-workstation',
        employeeIds: [engineer.id],
      }).ok,
    ).toBe(true);
    await step(150);

    const product = useGameStore.getState().products.instances[0];
    expect(product.status).toBe('ready');

    commands.purchaseResource({ resourceId: 'electronics', quantity: 20 });
    commands.purchaseResource({ resourceId: 'components', quantity: 20 });

    const facility = commands.createFacility({
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    expect(facility.ok).toBe(true);
    if (!facility.ok) throw new Error('setup failed');

    expect(
      commands.startProduction({
        productInstanceId: product.id,
        facilityId: facility.value.id,
        quantity: 10,
      }).ok,
    ).toBe(true);

    await step(60);

    const completed = useGameStore
      .getState()
      .production.orders.filter((order) => order.status === 'completed');

    expect(completed).toHaveLength(1);
    expect(useGameStore.getState().products.instances[0].inventory).toBe(10);
  });

  it('pauses the whole chain', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    commands.hireEmployee({ profession: 'researcher', department: 'research' });

    runner.start();
    await runner.step();

    const unlockedBefore = useGameStore.getState().technology.unlocked.length;
    runner.pause();
    await runner.step();

    expect(useGameStore.getState().technology.unlocked.length).toBe(unlockedBefore);
  });

  it('is deterministic across identical runs', async () => {
    const run = async (): Promise<string> => {
      runner.reset();
      commands.createCorporation({ name: 'Helion Dynamics' });
      commands.hireEmployee({ profession: 'researcher', department: 'research' });
      const researcher = useGameStore.getState().employees.employees[0];
      commands.startResearch({
        technologyId: 'quantum-lattice',
        employeeIds: [researcher.id],
      });

      for (let i = 0; i < 10; i += 1) {
        await runner.step();
      }

      const state = useGameStore.getState();
      return JSON.stringify({
        technology: state.technology,
        corporation: state.corporation.corporations,
        employees: state.employees.employees,
      });
    };

    const first = await run();
    const second = await run();

    expect(second).toBe(first);
  });

  it('rejects a failed command without changing the state', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    const before = JSON.stringify(useGameStore.getState());

    const result = commands.startResearch({
      technologyId: 'photonic-cores',
      employeeIds: [],
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(useGameStore.getState())).toBe(before);
  });

  it('keeps the resource and technology definitions consistent', () => {
    expect(getTechnologyDefinition('photonic-cores')).toBeDefined();
    expect(getProductDefinition('helix-workstation')).toBeDefined();
    expect(RESOURCES.find((resource) => resource.id === 'electronics')).toBeDefined();
  });
});
