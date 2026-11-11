import { describe, it, expect } from 'vitest';
import {
  MAX_EMPLOYEE_SALARY,
  MIN_EMPLOYEE_SALARY,
  PROFESSIONS,
  calculateHiringCost,
  createEmployee,
  createInitialEmployeeState,
  developEmployees,
  dismissEmployee,
  findEmployee,
  generateEmployeeId,
  generateEmployeeName,
  getActiveEmployees,
  getProfession,
  getWorkforceProductivity,
  hireEmployee,
  isProfessionId,
  isValidEmployee,
  isValidEmployeeState,
  isValidSalary,
  type EmployeeContext,
  type EmployeeState,
} from '@/simulation/employees';
import { createCorporation, createInitialCorporationState } from '@/simulation/corporation';

const HOUR = 3_600_000;

function context(overrides: Partial<EmployeeContext> = {}): EmployeeContext {
  return {
    tick: 1,
    deltaMs: HOUR,
    elapsedSimMs: HOUR,
    periodId: 'period_0000',
    ...overrides,
  };
}

function corporationFixture() {
  const state = createInitialCorporationState();
  const result = createCorporation(state, {
    id: 'corp_001',
    name: 'Helion Dynamics',
    foundedAtSimMs: 0,
  });
  if (!result.ok) throw new Error('setup failed');
  return result.value;
}

describe('Employee Engine — model', () => {
  it('creates an employee with a valid initial state', () => {
    const result = createEmployee({
      id: 'emp_0001',
      name: 'Aria Voss',
      profession: 'engineer',
      department: 'engineering',
      salary: 2_000,
      hiredAtSimMs: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const employee = result.value;
    expect(employee.id).toBe('emp_0001');
    expect(employee.profession).toBe('engineer');
    expect(employee.department).toBe('engineering');
    expect(employee.skill).toBeGreaterThan(0);
    expect(employee.experience).toBe(0);
    expect(employee.productivity).toBeGreaterThan(0);
    expect(employee.satisfaction).toBe(60);
    expect(employee.morale).toBe(60);
    expect(employee.status).toBe('active');
    expect(employee.development).toHaveLength(0);
    expect(isValidEmployee(employee)).toBe(true);
  });

  it('rejects an invalid profession', () => {
    const result = createEmployee({
      id: 'emp_0001',
      name: 'Aria Voss',
      profession: 'astronaut' as never,
      department: 'engineering',
      salary: 2_000,
      hiredAtSimMs: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('EMPLOYEE_INVALID_PROFESSION');
  });

  it('rejects an invalid department', () => {
    const result = createEmployee({
      id: 'emp_0001',
      name: 'Aria Voss',
      profession: 'engineer',
      department: 'moon-base' as never,
      salary: 2_000,
      hiredAtSimMs: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('EMPLOYEE_INVALID_DEPARTMENT');
  });

  it('rejects an invalid salary', () => {
    const build = (salary: number) =>
      createEmployee({
        id: 'emp_0001',
        name: 'Aria Voss',
        profession: 'engineer',
        department: 'engineering',
        salary,
        hiredAtSimMs: 0,
      });

    expect(build(0).ok).toBe(false);
    expect(build(-100).ok).toBe(false);
    expect(build(Number.NaN).ok).toBe(false);
    expect(build(MAX_EMPLOYEE_SALARY + 1).ok).toBe(false);
    expect(build(MIN_EMPLOYEE_SALARY).ok).toBe(true);
    expect(build(MAX_EMPLOYEE_SALARY).ok).toBe(true);
  });

  it('validates salaries at the boundaries', () => {
    expect(isValidSalary(MIN_EMPLOYEE_SALARY)).toBe(true);
    expect(isValidSalary(MIN_EMPLOYEE_SALARY - 1)).toBe(false);
    expect(isValidSalary(MAX_EMPLOYEE_SALARY)).toBe(true);
    expect(isValidSalary(MAX_EMPLOYEE_SALARY + 1)).toBe(false);
    expect(isValidSalary(Number.NaN)).toBe(false);
  });

  it('supports every required profession', () => {
    const required = ['manager', 'researcher', 'engineer', 'production-worker', 'marketer'];
    required.forEach((id) => {
      expect(isProfessionId(id)).toBe(true);
      const profession = getProfession(id as never);
      expect(profession).toBeDefined();
      expect(profession!.baseSalary).toBeGreaterThan(0);
      expect(profession!.baseSkill).toBeGreaterThan(0);
    });
    expect(PROFESSIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('generates deterministic names and identifiers', () => {
    expect(generateEmployeeName(0)).toBe(generateEmployeeName(0));
    expect(generateEmployeeName(0)).not.toBe(generateEmployeeName(1));
    expect(generateEmployeeId(7)).toBe('emp_0007');
    expect(generateEmployeeId(7)).toBe(generateEmployeeId(7));
  });

  it('validates the whole employee state', () => {
    const state = createInitialEmployeeState();
    expect(isValidEmployeeState(state)).toBe(true);

    const hired = hireEmployee(state, corporationFixture(), {
      profession: 'engineer',
      department: 'engineering',
    });
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;

    expect(isValidEmployeeState(hired.value.state)).toBe(true);

    const duplicated: EmployeeState = {
      ...hired.value.state,
      employees: [hired.value.employee, hired.value.employee],
    };
    expect(isValidEmployeeState(duplicated)).toBe(false);
  });
});

describe('Employee Engine — hiring', () => {
  it('hires an employee into an available department', () => {
    const state = createInitialEmployeeState();

    const result = hireEmployee(state, corporationFixture(), {
      profession: 'researcher',
      department: 'research',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.employee.department).toBe('research');
    expect(result.value.employee.profession).toBe('researcher');
    expect(result.value.employee.salary).toBe(getProfession('researcher')!.baseSalary);
    expect(result.value.cost).toBeGreaterThan(0);
    expect(result.value.state.employees).toHaveLength(1);
    expect(result.value.state.sequence).toBe(1);
  });

  it('generates unique identifiers for consecutive hires', () => {
    const corporation = corporationFixture();
    let state = createInitialEmployeeState();

    for (let i = 0; i < 3; i += 1) {
      const result = hireEmployee(state, corporation, {
        profession: 'engineer',
        department: 'engineering',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.value.state;
    }

    const ids = state.employees.map((employee) => employee.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['emp_0001', 'emp_0002', 'emp_0003']);
  });

  it('rejects a department that the tier cannot staff', () => {
    const result = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'engineer',
      department: 'finance',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CORPORATION_DEPARTMENT_UNAVAILABLE');
  });

  it('rejects hiring beyond the employee capacity', () => {
    const corporation = corporationFixture();
    let state = createInitialEmployeeState();

    for (let i = 0; i < 5; i += 1) {
      const result = hireEmployee(state, corporation, {
        profession: 'engineer',
        department: 'engineering',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.value.state;
    }

    expect(state.employees).toHaveLength(5);

    const overflow = hireEmployee(state, corporation, {
      profession: 'engineer',
      department: 'engineering',
    });

    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.error.code).toBe('CORPORATION_CAPACITY_REACHED');
  });

  it('rejects hiring when the corporation cannot afford the fee', () => {
    const corporation = {
      ...corporationFixture(),
      finances: { ...corporationFixture().finances, balance: 10 },
    };

    const result = hireEmployee(createInitialEmployeeState(), corporation, {
      profession: 'manager',
      department: 'management',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CORPORATION_INSUFFICIENT_FUNDS');
  });

  it('computes the hiring cost from the salary and the profession', () => {
    const cost = calculateHiringCost(2_000, 'engineer');
    expect(cost).toBeGreaterThan(0);
    expect(calculateHiringCost(4_000, 'engineer')).toBeGreaterThan(cost);
  });

  it('dismisses an employee', () => {
    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'engineer',
      department: 'engineering',
    });
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;

    const result = dismissEmployee(hired.value.state, hired.value.employee.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.employee.status).toBe('departed');
    expect(getActiveEmployees(result.value.state)).toHaveLength(0);
    expect(findEmployee(result.value.state, hired.value.employee.id)?.status).toBe('departed');
  });

  it('rejects dismissing an unknown or already departed employee', () => {
    const unknown = dismissEmployee(createInitialEmployeeState(), 'emp_9999');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('EMPLOYEE_NOT_FOUND');

    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'engineer',
      department: 'engineering',
    });
    if (!hired.ok) throw new Error('setup failed');

    const departed = dismissEmployee(hired.value.state, hired.value.employee.id);
    expect(departed.ok).toBe(true);
    if (!departed.ok) return;

    const again = dismissEmployee(departed.value.state, hired.value.employee.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('EMPLOYEE_ALREADY_DEPARTED');
  });
});

describe('Employee Engine — development', () => {
  it('grows experience deterministically', () => {
    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'researcher',
      department: 'research',
    });
    if (!hired.ok) throw new Error('setup failed');

    const developed = developEmployees(hired.value.state, context({ deltaMs: HOUR * 10 }));
    const employee = developed.employees[0];

    expect(employee.experience).toBeCloseTo(
      getProfession('researcher')!.experienceRate * 10,
      2,
    );
  });

  it('grows the skill level towards the experience based target', () => {
    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'researcher',
      department: 'research',
    });
    if (!hired.ok) throw new Error('setup failed');

    const before = hired.value.employee.skill;
    const developed = developEmployees(hired.value.state, context({ deltaMs: HOUR * 50 }));

    expect(developed.employees[0].skill).toBeGreaterThan(before);
    expect(developed.employees[0].skill).toBeLessThanOrEqual(100);
  });

  it('derives productivity from the skill level', () => {
    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'engineer',
      department: 'engineering',
    });
    if (!hired.ok) throw new Error('setup failed');

    const developed = developEmployees(hired.value.state, context({ deltaMs: HOUR * 20 }));
    const employee = developed.employees[0];

    expect(employee.productivity).toBeGreaterThan(0);
    expect(employee.productivity).toBeLessThanOrEqual(100);
  });

  it('moves satisfaction towards the target of the profession', () => {
    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'manager',
      department: 'management',
    });
    if (!hired.ok) throw new Error('setup failed');

    const developed = developEmployees(hired.value.state, context({ deltaMs: HOUR * 40 }));
    const target = getProfession('manager')!.satisfactionTarget;

    expect(developed.employees[0].satisfaction).toBeGreaterThan(hired.value.employee.satisfaction);
    expect(developed.employees[0].satisfaction).toBeLessThanOrEqual(target + 0.01);
  });

  it('rewards an above-market salary with higher satisfaction', () => {
    const corporation = corporationFixture();
    const base = hireEmployee(createInitialEmployeeState(), corporation, {
      profession: 'engineer',
      department: 'engineering',
      salary: getProfession('engineer')!.baseSalary,
    });
    const generous = hireEmployee(createInitialEmployeeState(), corporation, {
      profession: 'engineer',
      department: 'engineering',
      salary: getProfession('engineer')!.baseSalary * 2,
    });
    if (!base.ok || !generous.ok) throw new Error('setup failed');

    const developedBase = developEmployees(base.value.state, context({ deltaMs: HOUR * 30 }));
    const developedGenerous = developEmployees(generous.value.state, context({ deltaMs: HOUR * 30 }));

    expect(developedGenerous.employees[0].satisfaction).toBeGreaterThan(
      developedBase.employees[0].satisfaction,
    );
  });

  it('records a bounded development history per period', () => {
    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'engineer',
      department: 'engineering',
    });
    if (!hired.ok) throw new Error('setup failed');

    let state = hired.value.state;
    for (let period = 0; period < 20; period += 1) {
      state = developEmployees(state, context({
        tick: period + 1,
        elapsedSimMs: period * 7 * 24 * HOUR,
        periodId: `period_${String(period).padStart(4, '0')}`,
      }));
    }

    const employee = state.employees[0];
    expect(employee.development.length).toBeGreaterThan(0);
    expect(employee.development.length).toBeLessThanOrEqual(12);
  });

  it('produces reproducible results', () => {
    const run = (): EmployeeState => {
      const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
        profession: 'engineer',
        department: 'engineering',
      });
      if (!hired.ok) throw new Error('setup failed');
      let state = hired.value.state;
      for (let i = 0; i < 20; i += 1) {
        state = developEmployees(state, context({ tick: i + 1, elapsedSimMs: i * HOUR }));
      }
      return state;
    };

    expect(run()).toEqual(run());
  });

  it('summarises the workforce productivity', () => {
    const hired = hireEmployee(createInitialEmployeeState(), corporationFixture(), {
      profession: 'engineer',
      department: 'engineering',
    });
    if (!hired.ok) throw new Error('setup failed');

    expect(getWorkforceProductivity(hired.value.state)).toBe(
      hired.value.employee.productivity,
    );
  });
});
