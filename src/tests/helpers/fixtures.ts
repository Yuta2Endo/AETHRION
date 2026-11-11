/**
 * Shared test fixtures for the Stage 04 domain engines.
 */

import {
  createInitialFinances,
  type Corporation,
} from '@/simulation/corporation';
import { createInitialEconomy, type EconomyState } from '@/simulation/economy';
import type { Employee } from '@/simulation/employees';
import {
  PRODUCT_DEFINITIONS,
  createInitialProductState,
  type ProductDefinition,
  type ProductInstance,
  type ProductState,
} from '@/simulation/products';
import { createInitialResourceState, type ResourceState } from '@/simulation/resources';
import { createInitialTechnologyState, type TechnologyState } from '@/simulation/technology';

export const HOUR = 3_600_000;

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp_0001',
    name: 'Aria Voss',
    profession: 'researcher',
    department: 'research',
    skill: 50,
    experience: 0,
    salary: 1_800,
    productivity: 50,
    satisfaction: 60,
    morale: 60,
    status: 'active',
    hiredAtSimMs: 0,
    lastDevelopmentPeriodId: null,
    development: [],
    ...overrides,
  };
}

export function makeCorporation(overrides: Partial<Corporation> = {}): Corporation {
  return {
    id: 'corp_001',
    name: 'Helion Dynamics',
    foundedAtSimMs: 0,
    tierId: 'startup',
    level: 1,
    status: 'active',
    reputation: 10,
    finances: createInitialFinances(50_000),
    transactions: [],
    financialHistory: [],
    lastPayrollPeriodId: null,
    missedPayrollCount: 0,
    transactionSequence: 0,
    ...overrides,
  };
}

export function makeEconomy(overrides: Partial<EconomyState> = {}): EconomyState {
  return { ...createInitialEconomy(), ...overrides };
}

export function makeTechnologyState(overrides: Partial<TechnologyState> = {}): TechnologyState {
  return { ...createInitialTechnologyState(), ...overrides };
}

export function makeResourceState(overrides: Partial<ResourceState> = {}): ResourceState {
  return { ...createInitialResourceState(), ...overrides };
}

export function makeProductState(overrides: Partial<ProductState> = {}): ProductState {
  return { ...createInitialProductState(), ...overrides };
}

export function makeProductInstance(overrides: Partial<ProductInstance> = {}): ProductInstance {
  const definition: ProductDefinition =
    PRODUCT_DEFINITIONS.find((entry) => entry.id === 'helix-workstation')!;
  return {
    id: 'prd_0001',
    definitionId: definition.id,
    name: definition.name,
    status: 'ready',
    progress: 1,
    quality: 60,
    innovation: 50,
    marketReadiness: 24,
    assignedEmployeeIds: ['emp_0001'],
    costPaid: definition.developmentCost,
    createdAtSimMs: 0,
    completedAtSimMs: 0,
    price: definition.basePrice,
    salesActive: true,
    inventory: 100,
    unitsSold: 0,
    revenue: 0,
    ...overrides,
  };
}
