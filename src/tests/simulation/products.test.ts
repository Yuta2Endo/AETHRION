import { describe, it, expect } from 'vitest';
import {
  PRODUCT_DEFINITIONS,
  PRODUCT_CATEGORIES,
  advanceDevelopment,
  assignDevelopmentEmployees,
  calculateInnovation,
  calculateMarketReadiness,
  calculateQuality,
  canStartDevelopment,
  createInitialProductState,
  getProductDefinition,
  getTechnologyDepth,
  isValidProductDefinition,
  isValidProductState,
  setProductPrice,
  setProductSalesActive,
  startDevelopment,
} from '@/simulation/products';
import { getTechnologyDefinition } from '@/simulation/technology';
import { HOUR, makeEmployee, makeTechnologyState } from '@/tests/helpers/fixtures';

describe('Product Engine — definitions', () => {
  it('defines at least five configurable products', () => {
    expect(PRODUCT_DEFINITIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('covers every required category', () => {
    expect(PRODUCT_CATEGORIES).toEqual(
      expect.arrayContaining([
        'computing',
        'industrial',
        'energy',
        'automation',
        'software',
      ]),
    );
  });

  it('uses unique identifiers and valid definitions', () => {
    const ids = PRODUCT_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);

    PRODUCT_DEFINITIONS.forEach((definition) => {
      expect(isValidProductDefinition(definition)).toBe(true);
      expect(Object.keys(definition.resourceCost).length).toBeGreaterThan(0);
      expect(definition.basePrice).toBeGreaterThan(definition.baseProductionCost);
    });
  });

  it('only requires technologies that exist', () => {
    PRODUCT_DEFINITIONS.forEach((definition) => {
      expect(getTechnologyDefinition(definition.requiresTechnology)).toBeDefined();
    });
  });
});

describe('Product Engine — development projects', () => {
  it('requires the technology to be unlocked', () => {
    const definition = getProductDefinition('helix-workstation')!;

    const withoutTechnology = canStartDevelopment(
      createInitialProductState(),
      definition,
      makeTechnologyState(),
    );
    expect(withoutTechnology.ok).toBe(false);
    if (!withoutTechnology.ok) {
      expect(withoutTechnology.error.code).toBe('PRODUCT_TECHNOLOGY_REQUIRED');
    }

    const withTechnology = canStartDevelopment(
      createInitialProductState(),
      definition,
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
    );
    expect(withTechnology.ok).toBe(true);
  });

  it('creates a development project with a deterministic identifier', () => {
    const result = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      {
        definitionId: 'helix-workstation',
        assignedEmployeeIds: ['emp_0001'],
        createdAtSimMs: 0,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.instance.id).toBe('prd_0001');
    expect(result.value.instance.status).toBe('developing');
    expect(result.value.instance.progress).toBe(0);
    expect(result.value.state.sequence).toBe(1);
  });

  it('rejects an unknown product and a duplicate project', () => {
    const unknown = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { definitionId: 'warp-core', assignedEmployeeIds: [], createdAtSimMs: 0 },
    );
    expect(unknown.ok).toBe(false);

    const technologyState = makeTechnologyState({ unlocked: ['photonic-cores'] });
    const first = startDevelopment(createInitialProductState(), technologyState, {
      definitionId: 'helix-workstation',
      assignedEmployeeIds: [],
      createdAtSimMs: 0,
    });
    if (!first.ok) throw new Error('setup failed');

    const second = startDevelopment(first.value.state, technologyState, {
      definitionId: 'helix-workstation',
      assignedEmployeeIds: [],
      createdAtSimMs: 0,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('PRODUCT_ALREADY_IN_DEVELOPMENT');
    }
  });

  it('rejects a duplicate employee assignment', () => {
    const result = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      {
        definitionId: 'helix-workstation',
        assignedEmployeeIds: ['emp_0001', 'emp_0001'],
        createdAtSimMs: 0,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PRODUCT_DUPLICATE_ASSIGNMENT');
  });

  it('assigns additional employees to a running project', () => {
    const started = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { definitionId: 'helix-workstation', assignedEmployeeIds: [], createdAtSimMs: 0 },
    );
    if (!started.ok) throw new Error('setup failed');

    const assigned = assignDevelopmentEmployees(started.value.state, 'prd_0001', ['emp_0001']);

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.value.instance.assignedEmployeeIds).toEqual(['emp_0001']);
  });

  it('refuses to staff a finished project', () => {
    const started = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { definitionId: 'helix-workstation', assignedEmployeeIds: [], createdAtSimMs: 0 },
    );
    if (!started.ok) throw new Error('setup failed');

    const assigned = assignDevelopmentEmployees(started.value.state, 'prd_0001', ['emp_0001']);
    if (!assigned.ok) throw new Error('setup failed');

    // Simulate a finished project.
    const finished = {
      ...assigned.value.state,
      instances: assigned.value.state.instances.map((instance) => ({
        ...instance,
        status: 'ready' as const,
      })),
    };

    const rejected = assignDevelopmentEmployees(finished, 'prd_0001', ['emp_0002']);
    expect(rejected.ok).toBe(false);
  });
});

describe('Product Engine — development progression', () => {
  it('advances the progress with the elapsed simulated time', () => {
    const started = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { definitionId: 'helix-workstation', assignedEmployeeIds: ['emp_0001'], createdAtSimMs: 0 },
    );
    if (!started.ok) throw new Error('setup failed');

    const advanced = advanceDevelopment(
      started.value.state,
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { tick: 1, deltaMs: HOUR, simTimeMs: HOUR },
      [makeEmployee({ profession: 'engineer', skill: 80, productivity: 80 })],
    );

    expect(advanced.instances[0].progress).toBeGreaterThan(0);
    expect(advanced.instances[0].progress).toBeLessThanOrEqual(1);
  });

  it('never exceeds a progress of one', () => {
    const started = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { definitionId: 'helix-workstation', assignedEmployeeIds: ['emp_0001'], createdAtSimMs: 0 },
    );
    if (!started.ok) throw new Error('setup failed');

    const advanced = advanceDevelopment(
      started.value.state,
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { tick: 1, deltaMs: 10_000 * HOUR, simTimeMs: 10_000 * HOUR },
      [makeEmployee({ profession: 'engineer', skill: 100, productivity: 100 })],
    );

    expect(advanced.instances[0].progress).toBeLessThanOrEqual(1);
  });

  it('completes the project and computes the quality', () => {
    const started = startDevelopment(
      createInitialProductState(),
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { definitionId: 'helix-workstation', assignedEmployeeIds: ['emp_0001'], createdAtSimMs: 0 },
    );
    if (!started.ok) throw new Error('setup failed');

    const advanced = advanceDevelopment(
      started.value.state,
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
      { tick: 1, deltaMs: 10_000 * HOUR, simTimeMs: 10_000 * HOUR },
      [makeEmployee({ profession: 'engineer', skill: 80, productivity: 80 })],
    );

    const instance = advanced.instances[0];
    expect(instance.status).toBe('ready');
    expect(instance.progress).toBe(1);
    expect(instance.quality).toBeGreaterThan(0);
    expect(instance.quality).toBeLessThanOrEqual(100);
    expect(instance.innovation).toBeGreaterThan(0);
  });

  it('produces reproducible results', () => {
    const run = () => {
      const technologyState = makeTechnologyState({ unlocked: ['photonic-cores'] });
      const started = startDevelopment(createInitialProductState(), technologyState, {
        definitionId: 'helix-workstation',
        assignedEmployeeIds: ['emp_0001'],
        createdAtSimMs: 0,
      });
      if (!started.ok) throw new Error('setup failed');
      return advanceDevelopment(
        started.value.state,
        technologyState,
        { tick: 1, deltaMs: 10 * HOUR, simTimeMs: 10 * HOUR },
        [makeEmployee({ profession: 'engineer', skill: 55, productivity: 55 })],
      );
    };

    expect(run()).toEqual(run());
  });
});

describe('Product Engine — quality formula', () => {
  it('is transparent and driven by the defined factors', () => {
    const definition = getProductDefinition('helix-workstation')!;
    const technologyState = makeTechnologyState({ unlocked: ['photonic-cores'] });

    const quality = calculateQuality(definition, 52, technologyState);
    const depth = getTechnologyDepth('photonic-cores');
    const expected = 35 + 52 * 0.35 + (depth - 1) * 2 + 0 + 8 - definition.complexity * 4;

    expect(quality).toBeCloseTo(expected, 2);
  });

  it('rises with the skill of the workforce', () => {
    const definition = getProductDefinition('helix-workstation')!;
    const technologyState = makeTechnologyState({ unlocked: ['photonic-cores'] });

    expect(calculateQuality(definition, 90, technologyState)).toBeGreaterThan(
      calculateQuality(definition, 30, technologyState),
    );
  });

  it('rises with the unlocked technology bonuses', () => {
    const definition = getProductDefinition('helix-workstation')!;

    const withoutBonus = calculateQuality(
      definition,
      50,
      makeTechnologyState({ unlocked: ['photonic-cores'] }),
    );
    const withBonus = calculateQuality(
      definition,
      50,
      makeTechnologyState({ unlocked: ['photonic-cores', 'neural-array'] }),
    );

    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('stays inside the 0..100 range', () => {
    const definition = getProductDefinition('helix-workstation')!;

    expect(calculateQuality(definition, 0, makeTechnologyState())).toBeGreaterThanOrEqual(0);
    expect(calculateQuality(definition, 100, makeTechnologyState())).toBeLessThanOrEqual(100);
  });

  it('derives the innovation and the market readiness', () => {
    const definition = getProductDefinition('helix-workstation')!;

    expect(calculateInnovation(definition, 80)).toBeGreaterThan(
      calculateInnovation(definition, 20),
    );
    expect(calculateMarketReadiness(60, 0)).toBeLessThan(
      calculateMarketReadiness(60, 100),
    );
  });
});

describe('Product Engine — market controls', () => {
  it('sets a valid price and rejects an invalid one', () => {
    const state = {
      ...createInitialProductState(),
      instances: [
        {
          id: 'prd_0001',
          definitionId: 'helix-workstation',
          name: 'Helix Workstation',
          status: 'ready' as const,
          progress: 1,
          quality: 60,
          innovation: 50,
          marketReadiness: 24,
          assignedEmployeeIds: [],
          costPaid: 0,
          createdAtSimMs: 0,
          completedAtSimMs: 0,
          price: 900,
          salesActive: false,
          inventory: 0,
          unitsSold: 0,
          revenue: 0,
        },
      ],
    };

    const updated = setProductPrice(state, 'prd_0001', 1_200);
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.instance.price).toBe(1_200);

    const invalid = setProductPrice(state, 'prd_0001', 0);
    expect(invalid.ok).toBe(false);
  });

  it('only activates the sales of a finished product', () => {
    const developing = {
      ...createInitialProductState(),
      instances: [
        {
          id: 'prd_0001',
          definitionId: 'helix-workstation',
          name: 'Helix Workstation',
          status: 'developing' as const,
          progress: 0.5,
          quality: 0,
          innovation: 0,
          marketReadiness: 0,
          assignedEmployeeIds: [],
          costPaid: 0,
          createdAtSimMs: 0,
          completedAtSimMs: null,
          price: 900,
          salesActive: false,
          inventory: 0,
          unitsSold: 0,
          revenue: 0,
        },
      ],
    };

    const rejected = setProductSalesActive(developing, 'prd_0001', true);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe('PRODUCT_NOT_READY');
  });

  it('validates the product state', () => {
    expect(isValidProductState(createInitialProductState())).toBe(true);
  });
});
