import { describe, it, expect } from 'vitest';
import {
  MAX_RESOURCE_TRANSACTIONS,
  RESOURCES,
  addResource,
  consumeResources,
  createInitialResourceState,
  findResourceBalance,
  getAvailableQuantity,
  getRequirementCost,
  getResourceDefinition,
  getResourcePrices,
  getResourceUnitPrice,
  isValidResourceState,
  purchaseResource,
  releaseResources,
  removeResource,
  reserveResources,
} from '@/simulation/resources';
import { makeEconomy } from '@/tests/helpers/fixtures';

describe('Resource Engine — definitions', () => {
  it('supports every required resource', () => {
    const ids = RESOURCES.map((resource) => resource.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'raw-materials',
        'metals',
        'electronics',
        'energy',
        'components',
        'advanced-materials',
        'research-data',
        'industrial-chemicals',
      ]),
    );
  });

  it('gives every resource a typed id, a unit and a storage limit', () => {
    RESOURCES.forEach((resource) => {
      expect(getResourceDefinition(resource.id)).toBeDefined();
      expect(resource.basePrice).toBeGreaterThan(0);
      expect(resource.unit.length).toBeGreaterThan(0);
      expect(resource.maxStorage).toBeGreaterThan(0);
    });
  });

  it('initialises an empty but valid inventory', () => {
    const state = createInitialResourceState();

    expect(state.balances).toHaveLength(RESOURCES.length);
    state.balances.forEach((balance) => {
      expect(balance.quantity).toBe(0);
      expect(balance.reserved).toBe(0);
    });
    expect(isValidResourceState(state)).toBe(true);
  });
});

describe('Resource Engine — pricing', () => {
  it('derives the unit price from the linked commodity', () => {
    const economy = makeEconomy();
    const definition = getResourceDefinition('electronics')!;

    const price = getResourceUnitPrice(definition, economy);

    expect(price).toBeGreaterThan(0);
    expect(price).toBeCloseTo(definition.basePrice, 2);
  });

  it('follows the market price of the commodity', () => {
    const economy = makeEconomy();
    const definition = getResourceDefinition('electronics')!;

    const cheaper = {
      ...economy,
      commodities: economy.commodities.map((commodity) =>
        commodity.id === 'quantum-core' ? { ...commodity, price: commodity.basePrice / 2 } : commodity,
      ),
    };

    expect(getResourceUnitPrice(definition, cheaper)).toBeCloseTo(
      definition.basePrice / 2,
      2,
    );
  });

  it('prices every resource', () => {
    const prices = getResourcePrices(makeEconomy());
    RESOURCES.forEach((resource) => {
      expect(prices[resource.id]).toBeGreaterThan(0);
    });
  });
});

describe('Resource Engine — purchases', () => {
  it('adds the purchased quantity and returns the cost', () => {
    const result = purchaseResource(createInitialResourceState(), {
      resourceId: 'electronics',
      quantity: 10,
      unitPrice: 260,
      availableFunds: 50_000,
      simTimeMs: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalCost).toBe(2_600);
    expect(
      findResourceBalance(result.value.state, 'electronics')!.quantity,
    ).toBe(10);
    expect(result.value.transaction.type).toBe('purchase');
    expect(result.value.transaction.balanceAfter).toBe(10);
  });

  it('rejects a purchase without sufficient funds and changes nothing', () => {
    const state = createInitialResourceState();

    const result = purchaseResource(state, {
      resourceId: 'electronics',
      quantity: 10,
      unitPrice: 260,
      availableFunds: 100,
      simTimeMs: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RESOURCE_INSUFFICIENT_FUNDS');
    expect(findResourceBalance(state, 'electronics')!.quantity).toBe(0);
  });

  it('rejects a purchase beyond the storage capacity', () => {
    const definition = getResourceDefinition('advanced-materials')!;

    const result = purchaseResource(createInitialResourceState(), {
      resourceId: 'advanced-materials',
      quantity: definition.maxStorage + 1,
      unitPrice: 420,
      availableFunds: 10_000_000,
      simTimeMs: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RESOURCE_CAPACITY_EXCEEDED');
  });

  it('rejects an invalid quantity and price', () => {
    const state = createInitialResourceState();

    expect(
      purchaseResource(state, {
        resourceId: 'electronics',
        quantity: 0,
        unitPrice: 260,
        availableFunds: 1_000,
        simTimeMs: 0,
      }).ok,
    ).toBe(false);

    expect(
      purchaseResource(state, {
        resourceId: 'electronics',
        quantity: 5,
        unitPrice: Number.NaN,
        availableFunds: 1_000,
        simTimeMs: 0,
      }).ok,
    ).toBe(false);
  });

  it('bounds the transaction ledger', () => {
    let state = createInitialResourceState();

    for (let i = 0; i < MAX_RESOURCE_TRANSACTIONS + 20; i += 1) {
      const result = purchaseResource(state, {
        resourceId: 'electronics',
        quantity: 1,
        unitPrice: 260,
        availableFunds: 1_000_000,
        simTimeMs: i,
      });
      if (!result.ok) throw new Error('setup failed');
      state = result.value.state;
    }

    expect(state.transactions.length).toBeLessThanOrEqual(MAX_RESOURCE_TRANSACTIONS);
  });
});

describe('Resource Engine — reservations', () => {
  it('reserves resources without changing the owned quantity', () => {
    const purchased = purchaseResource(createInitialResourceState(), {
      resourceId: 'electronics',
      quantity: 10,
      unitPrice: 260,
      availableFunds: 50_000,
      simTimeMs: 0,
    });
    if (!purchased.ok) throw new Error('setup failed');

    const reserved = reserveResources(purchased.value.state, { electronics: 4 }, 100);

    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const balance = findResourceBalance(reserved.value.state, 'electronics')!;
    expect(balance.quantity).toBe(10);
    expect(balance.reserved).toBe(4);
    expect(getAvailableQuantity(reserved.value.state, 'electronics')).toBe(6);
  });

  it('rolls back completely when one resource of the requirement is missing', () => {
    const purchased = purchaseResource(createInitialResourceState(), {
      resourceId: 'electronics',
      quantity: 10,
      unitPrice: 260,
      availableFunds: 50_000,
      simTimeMs: 0,
    });
    if (!purchased.ok) throw new Error('setup failed');

    const reserved = reserveResources(
      purchased.value.state,
      { electronics: 4, metals: 10 },
      100,
    );

    expect(reserved.ok).toBe(false);
    if (!reserved.ok) expect(reserved.error.code).toBe('RESOURCE_INSUFFICIENT');
    // Atomic: the electronics reservation was not applied either.
    expect(findResourceBalance(purchased.value.state, 'electronics')!.reserved).toBe(0);
  });

  it('rejects a reservation larger than the available quantity', () => {
    const result = reserveResources(createInitialResourceState(), { electronics: 1 }, 0);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RESOURCE_INSUFFICIENT');
  });

  it('releases a reservation', () => {
    const purchased = purchaseResource(createInitialResourceState(), {
      resourceId: 'electronics',
      quantity: 10,
      unitPrice: 260,
      availableFunds: 50_000,
      simTimeMs: 0,
    });
    if (!purchased.ok) throw new Error('setup failed');

    const reserved = reserveResources(purchased.value.state, { electronics: 4 }, 0);
    if (!reserved.ok) throw new Error('setup failed');

    const released = releaseResources(reserved.value.state, { electronics: 4 }, 200);

    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(findResourceBalance(released.value.state, 'electronics')!.reserved).toBe(0);
    expect(findResourceBalance(released.value.state, 'electronics')!.quantity).toBe(10);
  });

  it('refuses to release more than reserved', () => {
    const result = releaseResources(createInitialResourceState(), { electronics: 1 }, 0);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RESOURCE_NOT_RESERVED');
  });
});

describe('Resource Engine — consumption', () => {
  it('consumes the reserved resources and leaves the inventory', () => {
    const purchased = purchaseResource(createInitialResourceState(), {
      resourceId: 'electronics',
      quantity: 10,
      unitPrice: 260,
      availableFunds: 50_000,
      simTimeMs: 0,
    });
    if (!purchased.ok) throw new Error('setup failed');

    const reserved = reserveResources(purchased.value.state, { electronics: 4 }, 0);
    if (!reserved.ok) throw new Error('setup failed');

    const consumed = consumeResources(reserved.value.state, { electronics: 4 }, 300);

    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    const balance = findResourceBalance(consumed.value.state, 'electronics')!;
    expect(balance.quantity).toBe(6);
    expect(balance.reserved).toBe(0);
    expect(balance.lifetimeConsumed).toBe(4);
  });

  it('refuses to consume resources that are not reserved', () => {
    const purchased = purchaseResource(createInitialResourceState(), {
      resourceId: 'electronics',
      quantity: 10,
      unitPrice: 260,
      availableFunds: 50_000,
      simTimeMs: 0,
    });
    if (!purchased.ok) throw new Error('setup failed');

    const consumed = consumeResources(purchased.value.state, { electronics: 4 }, 0);

    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.error.code).toBe('RESOURCE_NOT_RESERVED');
  });

  it('never produces a negative quantity', () => {
    const state = createInitialResourceState();
    const result = removeResource(state, 'electronics', 5);

    expect(result.ok).toBe(false);
    expect(findResourceBalance(state, 'electronics')!.quantity).toBe(0);
  });

  it('adds and removes quantities within the capacity', () => {
    const added = addResource(createInitialResourceState(), 'metals', 100);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const removed = removeResource(added.value.state, 'metals', 40);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(findResourceBalance(removed.value.state, 'metals')!.quantity).toBe(60);
  });
});

describe('Resource Engine — cost helper', () => {
  it('totals a requirement with the market prices', () => {
    const prices = getResourcePrices(makeEconomy());

    const cost = getRequirementCost({ electronics: 2, metals: 1 }, prices);

    expect(cost).toBeCloseTo(prices.electronics * 2 + prices.metals, 2);
  });
});
