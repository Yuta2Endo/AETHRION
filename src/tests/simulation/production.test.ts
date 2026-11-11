import { describe, it, expect } from 'vitest';
import {
  FACILITY_DEFINITIONS,
  MAX_BATCH_MULTIPLE,
  advanceProduction,
  assignFacilityEmployees,
  cancelProduction,
  createFacility,
  createInitialProductionState,
  facilitySupports,
  findFacility,
  findProductionOrder,
  getEffectiveEfficiency,
  getOrderResourceRequirement,
  getProductionDurationMs,
  getTotalCapacity,
  isValidProductionState,
  startProduction,
  unassignFacilityEmployee,
} from '@/simulation/production';
import { getProductDefinition } from '@/simulation/products';
import { HOUR, makeEmployee, makeProductInstance } from '@/tests/helpers/fixtures';

describe('Production Engine — facilities', () => {
  it('defines the four required facility types', () => {
    const types = FACILITY_DEFINITIONS.map((definition) => definition.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'electronics-factory',
        'materials-plant',
        'energy-facility',
        'assembly-facility',
      ]),
    );
  });

  it('creates a facility with the defined characteristics', () => {
    const result = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.facility.id).toBe('fac_001');
    expect(result.value.facility.capacity).toBe(40);
    expect(result.value.facility.status).toBe('idle');
    expect(result.value.facility.queue).toHaveLength(0);
  });

  it('rejects an unknown type and an empty name', () => {
    const state = createInitialProductionState();

    expect(
      createFacility(state, { name: 'X', type: 'space-elevator' as never }).ok,
    ).toBe(false);
    expect(createFacility(state, { name: '  ', type: 'materials-plant' }).ok).toBe(false);
  });

  it('validates the facility compatibility with the product categories', () => {
    expect(facilitySupports('electronics-factory', 'computing')).toBe(true);
    expect(facilitySupports('electronics-factory', 'industrial')).toBe(false);
    expect(facilitySupports('assembly-facility', 'industrial')).toBe(true);
  });

  it('assigns and unassigns employees', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const assigned = assignFacilityEmployees(created.value.state, 'fac_001', ['emp_0001']);
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.value.facility.assignedEmployeeIds).toEqual(['emp_0001']);

    const duplicate = assignFacilityEmployees(assigned.value.state, 'fac_001', ['emp_0001']);
    expect(duplicate.ok).toBe(false);

    const removed = unassignFacilityEmployee(assigned.value.state, 'fac_001', 'emp_0001');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.facility.assignedEmployeeIds).toHaveLength(0);
  });

  it('raises the effective efficiency with the assigned workforce', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const facility = created.value.facility;
    const employees = [makeEmployee({ skill: 60, productivity: 60 })];

    const without = getEffectiveEfficiency(facility, employees);
    const withStaff = getEffectiveEfficiency(
      { ...facility, assignedEmployeeIds: ['emp_0001'] },
      employees,
    );

    expect(withStaff).toBeGreaterThan(without);
    expect(withStaff).toBeLessThanOrEqual(facility.efficiency * 1.5);
  });

  it('sums the corporate capacity', () => {
    const state = createInitialProductionState();
    const first = createFacility(state, { name: 'A', type: 'electronics-factory' });
    if (!first.ok) throw new Error('setup failed');
    const second = createFacility(first.value.state, { name: 'B', type: 'materials-plant' });
    if (!second.ok) throw new Error('setup failed');

    expect(getTotalCapacity(second.value.state)).toBe(100);
  });
});

describe('Production Engine — orders', () => {
  it('creates an order for a finished product', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const product = makeProductInstance();
    const result = startProduction(
      created.value.state,
      { product, facilityId: 'fac_001', quantity: 10, startedAtSimMs: 0 },
      [],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.order.id).toMatch(/^ord_\d{4}$/);
    expect(result.value.order.status).toBe('queued');
    expect(result.value.order.quantity).toBe(10);
    expect(result.value.reservedResources.electronics).toBe(10);
    expect(result.value.operatingCost).toBeGreaterThan(0);
    expect(result.value.durationMs).toBeGreaterThan(0);
    expect(findFacility(result.value.state, 'fac_001')!.status).toBe('producing');
  });

  it('refuses to produce an unfinished product', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const result = startProduction(
      created.value.state,
      {
        product: makeProductInstance({ status: 'developing' }),
        facilityId: 'fac_001',
        quantity: 5,
        startedAtSimMs: 0,
      },
      [],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PRODUCT_NOT_READY');
  });

  it('refuses an incompatible facility', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'materials-plant',
    });
    if (!created.ok) throw new Error('setup failed');

    const result = startProduction(
      created.value.state,
      {
        product: makeProductInstance(),
        facilityId: 'fac_001',
        quantity: 5,
        startedAtSimMs: 0,
      },
      [],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FACILITY_NOT_COMPATIBLE');
  });

  it('rejects a negative or fractional quantity', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    expect(
      startProduction(
        created.value.state,
        { product: makeProductInstance(), facilityId: 'fac_001', quantity: -1, startedAtSimMs: 0 },
        [],
      ).ok,
    ).toBe(false);

    expect(
      startProduction(
        created.value.state,
        { product: makeProductInstance(), facilityId: 'fac_001', quantity: 2.5, startedAtSimMs: 0 },
        [],
      ).ok,
    ).toBe(false);
  });

  it('rejects a quantity beyond the facility capacity', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const result = startProduction(
      created.value.state,
      {
        product: makeProductInstance(),
        facilityId: 'fac_001',
        quantity: 40 * MAX_BATCH_MULTIPLE + 1,
        startedAtSimMs: 0,
      },
      [],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PRODUCTION_OVER_CAPACITY');
  });

  it('computes the resource requirement of an order', () => {
    const definition = getProductDefinition('helix-workstation')!;

    const requirement = getOrderResourceRequirement(definition.resourceCost, 10);

    expect(requirement.electronics).toBe(10);
    expect(requirement.components).toBe(10);
  });

  it('computes the production duration', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');
    const facility = created.value.facility;

    const oneBatch = getProductionDurationMs(40, facility, 12 * HOUR, 1);
    const twoBatches = getProductionDurationMs(80, facility, 12 * HOUR, 1);

    expect(twoBatches).toBeCloseTo(oneBatch * 2, 2);
  });
});

describe('Production Engine — progression', () => {
  it('advances the order and completes it exactly once', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const started = startProduction(
      created.value.state,
      { product: makeProductInstance(), facilityId: 'fac_001', quantity: 10, startedAtSimMs: 0 },
      [],
    );
    if (!started.ok) throw new Error('setup failed');

    const advanced = advanceProduction(
      started.value.state,
      { tick: 1, deltaMs: 10_000 * HOUR, simTimeMs: 10_000 * HOUR },
      [],
    );

    expect(advanced.completed).toHaveLength(1);
    expect(advanced.completed[0].status).toBe('completed');
    expect(advanced.completed[0].produced).toBe(10);
    expect(
      findProductionOrder(advanced.state, advanced.completed[0].id)!.progress,
    ).toBe(1);

    // A second tick must not complete the order again.
    const again = advanceProduction(
      advanced.state,
      { tick: 2, deltaMs: 10_000 * HOUR, simTimeMs: 20_000 * HOUR },
      [],
    );
    expect(again.completed).toHaveLength(0);
  });

  it('never exceeds a progress of one', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const started = startProduction(
      created.value.state,
      { product: makeProductInstance(), facilityId: 'fac_001', quantity: 10, startedAtSimMs: 0 },
      [],
    );
    if (!started.ok) throw new Error('setup failed');

    const advanced = advanceProduction(
      started.value.state,
      { tick: 1, deltaMs: 100_000 * HOUR, simTimeMs: 100_000 * HOUR },
      [],
    );

    expect(advanced.state.orders[0].progress).toBeLessThanOrEqual(1);
  });

  it('cancels an order and empties the facility queue', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const started = startProduction(
      created.value.state,
      { product: makeProductInstance(), facilityId: 'fac_001', quantity: 10, startedAtSimMs: 0 },
      [],
    );
    if (!started.ok) throw new Error('setup failed');

    const cancelled = cancelProduction(started.value.state, started.value.order.id, 1_000);

    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.value.order.status).toBe('cancelled');
    expect(findFacility(cancelled.value.state, 'fac_001')!.queue).toHaveLength(0);
    expect(findFacility(cancelled.value.state, 'fac_001')!.status).toBe('idle');
  });

  it('refuses to cancel a finished order', () => {
    const created = createFacility(createInitialProductionState(), {
      name: 'Foundry East',
      type: 'electronics-factory',
    });
    if (!created.ok) throw new Error('setup failed');

    const started = startProduction(
      created.value.state,
      { product: makeProductInstance(), facilityId: 'fac_001', quantity: 10, startedAtSimMs: 0 },
      [],
    );
    if (!started.ok) throw new Error('setup failed');

    const advanced = advanceProduction(
      started.value.state,
      { tick: 1, deltaMs: 10_000 * HOUR, simTimeMs: 10_000 * HOUR },
      [],
    );

    const cancelled = cancelProduction(advanced.state, started.value.order.id, 0);
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.error.code).toBe('PRODUCTION_ORDER_FINAL');
  });

  it('rejects an invalid state without changing it', () => {
    const invalid = {
      ...createInitialProductionState(),
      facilities: [
        {
          id: 'fac_001',
          name: 'Broken',
          type: 'electronics-factory' as const,
          capacity: Number.NaN,
          efficiency: 1,
          operatingCost: 10,
          assignedEmployeeIds: [],
          status: 'idle' as const,
          queue: [],
        },
      ],
    };

    const advanced = advanceProduction(
      invalid,
      { tick: 1, deltaMs: HOUR, simTimeMs: HOUR },
      [],
    );

    expect(advanced.state).toBe(invalid);
  });

  it('validates the production state', () => {
    expect(isValidProductionState(createInitialProductionState())).toBe(true);
  });
});
