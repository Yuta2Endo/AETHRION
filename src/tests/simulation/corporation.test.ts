import { describe, it, expect } from 'vitest';
import {
  CORPORATION_TIERS,
  INITIAL_CORPORATION_BALANCE,
  createCorporation,
  createInitialCorporationState,
  createInitialFinances,
  findCorporation,
  getCorporationStatistics,
  getNetProfit,
  getPeriodNetProfit,
  getPlayerCorporation,
  isValidCorporation,
  isValidCorporationName,
  isValidCorporationState,
  applyTransaction,
  accrueFinances,
  resolveTier,
  updateProgression,
  type Corporation,
  type CorporationContext,
} from '@/simulation/corporation';

function baseContext(overrides: Partial<CorporationContext> = {}): CorporationContext {
  return {
    tick: 1,
    deltaMs: 3_600_000,
    elapsedSimMs: 3_600_000,
    periodId: 'period_0000',
    workforceProductivity: 0,
    employeeCount: 0,
    ...overrides,
  };
}

function foundedCorporation(overrides: Partial<Corporation> = {}): Corporation {
  const state = createInitialCorporationState();
  const result = createCorporation(state, {
    id: 'corp_001',
    name: 'Helion Dynamics',
    foundedAtSimMs: 0,
  });
  if (!result.ok) throw new Error('setup failed');
  return { ...result.value, ...overrides };
}

describe('Corporation Engine — creation', () => {
  it('creates a corporation with a valid initial state', () => {
    const result = createCorporation(createInitialCorporationState(), {
      id: 'corp_001',
      name: 'Helion Dynamics',
      foundedAtSimMs: 1_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.id).toBe('corp_001');
    expect(result.value.name).toBe('Helion Dynamics');
    expect(result.value.foundedAtSimMs).toBe(1_000);
    expect(result.value.level).toBe(1);
    expect(result.value.tierId).toBe('startup');
    expect(result.value.status).toBe('active');
    expect(result.value.finances.balance).toBe(INITIAL_CORPORATION_BALANCE);
    expect(result.value.reputation).toBe(10);
    expect(result.value.transactions).toHaveLength(0);
    expect(result.value.financialHistory).toHaveLength(0);
    expect(isValidCorporation(result.value)).toBe(true);
  });

  it('rejects an invalid corporation name', () => {
    const cases = ['', ' ', 'a', 'x'.repeat(49), 42, null];

    cases.forEach((name) => {
      const result = createCorporation(createInitialCorporationState(), {
        id: 'corp_001',
        name: name as string,
        foundedAtSimMs: 0,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CORPORATION_INVALID_NAME');
    });
  });

  it('accepts a name at the length boundaries', () => {
    expect(isValidCorporationName('ab')).toBe(true);
    expect(isValidCorporationName('x'.repeat(48))).toBe(true);
    expect(isValidCorporationName('a')).toBe(false);
    expect(isValidCorporationName('x'.repeat(49))).toBe(false);
  });

  it('rejects a duplicate corporation id', () => {
    const state = createInitialCorporationState();
    const first = createCorporation(state, {
      id: 'corp_001',
      name: 'Helion Dynamics',
      foundedAtSimMs: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const stateWithCorporation = { ...state, corporations: [first.value] };
    const second = createCorporation(stateWithCorporation, {
      id: 'corp_001',
      name: 'Another Corp',
      foundedAtSimMs: 0,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('CORPORATION_DUPLICATE_ID');
  });

  it('refuses to create a second player corporation', () => {
    const state = createInitialCorporationState();
    const first = createCorporation(state, {
      id: 'corp_001',
      name: 'Helion Dynamics',
      foundedAtSimMs: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const stateWithPlayer = { ...state, corporations: [first.value], playerCorporationId: first.value.id };
    const second = createCorporation(stateWithPlayer, {
      id: 'corp_002',
      name: 'Another Corp',
      foundedAtSimMs: 0,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('CORPORATION_ALREADY_EXISTS');
  });

  it('rejects an invalid founding date and id', () => {
    const invalidDate = createCorporation(createInitialCorporationState(), {
      id: 'corp_001',
      name: 'Helion Dynamics',
      foundedAtSimMs: Number.NaN,
    });
    expect(invalidDate.ok).toBe(false);

    const invalidId = createCorporation(createInitialCorporationState(), {
      id: '',
      name: 'Helion Dynamics',
      foundedAtSimMs: 0,
    });
    expect(invalidId.ok).toBe(false);
    if (!invalidId.ok) expect(invalidId.error.code).toBe('CORPORATION_INVALID_ID');
  });

  it('validates the whole corporation state', () => {
    const corporation = foundedCorporation();
    const state = { corporations: [corporation], playerCorporationId: corporation.id, tick: 0 };

    expect(isValidCorporationState(state)).toBe(true);

    const duplicated = {
      corporations: [corporation, corporation],
      playerCorporationId: corporation.id,
      tick: 0,
    };
    expect(isValidCorporationState(duplicated)).toBe(false);
  });
});

describe('Corporation Engine — departments and tiers', () => {
  it('initialises the startup tier with its departments', () => {
    const corporation = foundedCorporation();
    const tier = resolveTier(corporation, 0);

    expect(tier.id).toBe('startup');
    expect(tier.availableDepartments).toContain('engineering');
    expect(tier.availableDepartments).not.toContain('finance');
    expect(tier.employeeCapacity).toBe(5);
  });

  it('exposes a data driven, extensible tier table', () => {
    expect(CORPORATION_TIERS.length).toBeGreaterThan(1);
    const levels = CORPORATION_TIERS.map((tier) => tier.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    CORPORATION_TIERS.forEach((tier) => {
      expect(tier.employeeCapacity).toBeGreaterThan(0);
      expect(tier.availableDepartments.length).toBeGreaterThan(0);
    });
  });

  it('resolves a higher tier once the requirements are met', () => {
    const corporation = foundedCorporation({
      reputation: 60,
      finances: createInitialFinances(10_000),
    });
    const wealthy = {
      ...corporation,
      finances: { ...corporation.finances, lifetimeRevenue: 150_000 },
    };

    const tier = resolveTier(wealthy, 5);

    expect(tier.id).toBe('growth');
    expect(tier.employeeCapacity).toBe(12);
  });
});

describe('Corporation Engine — finances', () => {
  it('applies a transaction and updates the balance', () => {
    const corporation = foundedCorporation();

    const next = applyTransaction(corporation, {
      type: 'revenue',
      amount: 1_000,
      description: 'Contract revenue',
      simTimeMs: 0,
    });

    expect(next.finances.balance).toBe(INITIAL_CORPORATION_BALANCE + 1_000);
    expect(next.transactions).toHaveLength(1);
    expect(next.transactions[0].amount).toBe(1_000);
    expect(next.transactions[0].balanceAfter).toBe(INITIAL_CORPORATION_BALANCE + 1_000);
    expect(next.transactionSequence).toBe(1);
  });

  it('rejects a transaction that would overdraw the balance', () => {
    const corporation = foundedCorporation();

    const next = applyTransaction(corporation, {
      type: 'payroll',
      amount: -INITIAL_CORPORATION_BALANCE - 1,
      description: 'Too much',
      simTimeMs: 0,
    });

    expect(next).toBe(corporation);
    expect(next.finances.balance).toBe(INITIAL_CORPORATION_BALANCE);
    expect(next.transactions).toHaveLength(0);
  });

  it('rejects a transaction with a non-finite amount', () => {
    const corporation = foundedCorporation();

    expect(
      applyTransaction(corporation, {
        type: 'revenue',
        amount: Number.NaN,
        description: 'Invalid',
        simTimeMs: 0,
      }),
    ).toBe(corporation);

    expect(
      applyTransaction(corporation, {
        type: 'revenue',
        amount: Number.POSITIVE_INFINITY,
        description: 'Invalid',
        simTimeMs: 0,
      }),
    ).toBe(corporation);
  });

  it('bounds the transaction ledger', () => {
    let corporation = foundedCorporation();

    for (let i = 0; i < 80; i += 1) {
      corporation = applyTransaction(corporation, {
        type: 'revenue',
        amount: 10,
        description: `Revenue ${i}`,
        simTimeMs: i,
      });
    }

    expect(corporation.transactions.length).toBeLessThanOrEqual(50);
    expect(corporation.transactions[corporation.transactions.length - 1].description).toBe(
      'Revenue 79',
    );
  });

  it('accrues revenue from the workforce and operating costs', () => {
    const corporation = foundedCorporation();

    const next = accrueFinances(corporation, baseContext({ workforceProductivity: 100, employeeCount: 2 }));

    expect(next.finances.lifetimeRevenue).toBeGreaterThan(0);
    expect(next.finances.lifetimeOperatingExpenses).toBeGreaterThan(0);
    expect(next.finances.periodRevenue).toBe(next.finances.lifetimeRevenue);
    expect(getNetProfit(next.finances)).toBe(
      next.finances.lifetimeRevenue - next.finances.lifetimeOperatingExpenses,
    );
  });

  it('computes the period net profit', () => {
    const finances = {
      ...createInitialFinances(1_000),
      periodRevenue: 900,
      periodOperatingExpenses: 300,
      periodPayrollExpenses: 200,
    };

    expect(getPeriodNetProfit(finances)).toBe(400);
  });

  it('updates reputation, tier and status from the progression rules', () => {
    const corporation = foundedCorporation();

    const accrued = accrueFinances(
      corporation,
      baseContext({ workforceProductivity: 200, employeeCount: 3 }),
    );
    const next = updateProgression(accrued, baseContext({ workforceProductivity: 200, employeeCount: 3 }));

    expect(next.reputation).not.toBe(corporation.reputation);
    expect(next.reputation).toBeGreaterThan(0);
    expect(next.reputation).toBeLessThanOrEqual(100);
    expect(['active', 'thriving', 'strained', 'insolvent']).toContain(next.status);
  });
});

describe('Corporation Engine — statistics', () => {
  it('derives workforce statistics without storing them', () => {
    const corporation = foundedCorporation();
    const workforce = [
      { department: 'engineering' as const, productivity: 60, satisfaction: 70, morale: 65, skill: 55, status: 'active' },
      { department: 'research' as const, productivity: 40, satisfaction: 50, morale: 45, skill: 35, status: 'active' },
    ];

    const statistics = getCorporationStatistics(corporation, workforce);

    expect(statistics.employeeCount).toBe(2);
    expect(statistics.workforceProductivity).toBe(100);
    expect(statistics.averageProductivity).toBe(50);
    expect(statistics.averageSatisfaction).toBe(60);
    expect(statistics.departmentHeadcount.engineering).toBe(1);
    expect(statistics.departmentHeadcount.research).toBe(1);
    expect(statistics.departmentHeadcount.finance).toBe(0);
  });

  it('returns zeroed statistics for an empty workforce', () => {
    const statistics = getCorporationStatistics(foundedCorporation(), []);

    expect(statistics.employeeCount).toBe(0);
    expect(statistics.averageProductivity).toBe(0);
    expect(statistics.netProfit).toBe(0);
  });
});

describe('Corporation Engine — state accessors', () => {
  it('finds the player corporation', () => {
    const corporation = foundedCorporation();
    const state = {
      corporations: [corporation],
      playerCorporationId: corporation.id,
      tick: 0,
    };

    expect(getPlayerCorporation(state)).toBe(corporation);
    expect(findCorporation(state, corporation.id)).toBe(corporation);
    expect(getPlayerCorporation({ corporations: [], playerCorporationId: null, tick: 0 })).toBeNull();
  });
});
