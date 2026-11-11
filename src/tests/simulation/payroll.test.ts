import { describe, it, expect } from 'vitest';
import {
  MISSED_PAYROLL_MORALE_PENALTY,
  MISSED_PAYROLL_SATISFACTION_PENALTY,
  PAYROLL_PERIOD_MS,
  applyPayroll,
  calculatePayroll,
  getPayrollPeriod,
} from '@/simulation/employees';
import {
  applyTransaction,
  createCorporation,
  createInitialCorporationState,
  type Corporation,
} from '@/simulation/corporation';
import {
  createEmployee,
  type Employee,
  type EmployeeState,
} from '@/simulation/employees';

const HOUR = 3_600_000;

function corporationFixture(balance?: number): Corporation {
  const state = createInitialCorporationState();
  const result = createCorporation(state, {
    id: 'corp_001',
    name: 'Helion Dynamics',
    foundedAtSimMs: 0,
  });
  if (!result.ok) throw new Error('setup failed');
  if (balance === undefined) return result.value;
  return {
    ...result.value,
    finances: { ...result.value.finances, balance },
  };
}

function employeeFixture(salary: number, id = 'emp_0001'): Employee {
  const result = createEmployee({
    id,
    name: 'Aria Voss',
    profession: 'engineer',
    department: 'engineering',
    salary,
    hiredAtSimMs: 0,
  });
  if (!result.ok) throw new Error('setup failed');
  return result.value;
}

function employeeState(employees: Employee[]): EmployeeState {
  return { employees, sequence: employees.length, tick: 0 };
}

describe('Payroll — period model', () => {
  it('derives a stable period identifier from the elapsed simulated time', () => {
    expect(getPayrollPeriod(0).id).toBe('period_0000');
    expect(getPayrollPeriod(PAYROLL_PERIOD_MS).id).toBe('period_0001');
    expect(getPayrollPeriod(PAYROLL_PERIOD_MS * 3).id).toBe('period_0003');
  });

  it('keeps the same period inside a period boundary', () => {
    expect(getPayrollPeriod(0).id).toBe(getPayrollPeriod(PAYROLL_PERIOD_MS - 1).id);
    expect(getPayrollPeriod(PAYROLL_PERIOD_MS).id).not.toBe(
      getPayrollPeriod(PAYROLL_PERIOD_MS - 1).id,
    );
  });

  it('reports the progress through the current period', () => {
    const start = getPayrollPeriod(0);
    expect(start.progress).toBe(0);
    expect(start.remainingInPeriodMs).toBe(PAYROLL_PERIOD_MS);

    const half = getPayrollPeriod(PAYROLL_PERIOD_MS / 2);
    expect(half.progress).toBeCloseTo(0.5, 6);
    expect(half.remainingInPeriodMs).toBe(PAYROLL_PERIOD_MS / 2);
  });

  it('never reads the system clock', () => {
    expect(getPayrollPeriod(0).id).toBe(getPayrollPeriod(0).id);
    expect(getPayrollPeriod(-10).id).toBe('period_0000');
  });
});

describe('Payroll — calculation', () => {
  it('sums the salaries of the employed staff', () => {
    const employees = [employeeFixture(2_000, 'emp_0001'), employeeFixture(1_500, 'emp_0002')];

    const payroll = calculatePayroll(employees);

    expect(payroll.total).toBe(3_500);
    expect(payroll.employeeCount).toBe(2);
  });

  it('ignores departed employees', () => {
    const employees = [
      employeeFixture(2_000, 'emp_0001'),
      { ...employeeFixture(1_500, 'emp_0002'), status: 'departed' as const },
    ];

    const payroll = calculatePayroll(employees);

    expect(payroll.total).toBe(2_000);
    expect(payroll.employeeCount).toBe(1);
  });

  it('returns zero for an empty workforce', () => {
    expect(calculatePayroll([])).toEqual({ total: 0, employeeCount: 0 });
  });
});

describe('Payroll — processing', () => {
  it('pays the payroll and records a transaction', () => {
    const corporation = corporationFixture(50_000);
    const employees = employeeState([employeeFixture(2_000)]);

    const result = applyPayroll(corporation, employees.employees, {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });

    expect(result.summary.paid).toBe(true);
    expect(result.summary.total).toBe(2_000);
    expect(result.summary.shortfall).toBe(0);
    expect(result.summary.alreadyProcessed).toBe(false);
    expect(result.corporation.finances.balance).toBe(48_000);
    expect(result.corporation.finances.lifetimePayrollExpenses).toBe(2_000);
    expect(result.corporation.transactions).toHaveLength(1);
    expect(result.corporation.transactions[0].type).toBe('payroll');
    expect(result.corporation.transactions[0].amount).toBe(-2_000);
    expect(result.corporation.lastPayrollPeriodId).toBe('period_0000');
  });

  it('never processes the same period twice', () => {
    const corporation = corporationFixture(50_000);
    const employees = employeeState([employeeFixture(2_000)]);

    const first = applyPayroll(corporation, employees.employees, {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });
    const second = applyPayroll(first.corporation, employees.employees, {
      elapsedSimMs: HOUR * 2,
      simTimeMs: HOUR * 2,
    });

    expect(second.summary.alreadyProcessed).toBe(true);
    expect(second.corporation.finances.balance).toBe(first.corporation.finances.balance);
    expect(second.corporation.transactions).toHaveLength(1);
    expect(second.corporation.finances.lifetimePayrollExpenses).toBe(2_000);
  });

  it('processes the next period after a boundary is crossed', () => {
    const corporation = corporationFixture(50_000);
    const employees = employeeState([employeeFixture(2_000)]);

    const first = applyPayroll(corporation, employees.employees, {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });
    const second = applyPayroll(first.corporation, employees.employees, {
      elapsedSimMs: PAYROLL_PERIOD_MS + HOUR,
      simTimeMs: PAYROLL_PERIOD_MS + HOUR,
    });

    expect(second.summary.alreadyProcessed).toBe(false);
    expect(second.summary.periodId).toBe('period_0001');
    expect(second.corporation.finances.balance).toBe(46_000);
    expect(second.corporation.finances.lifetimePayrollExpenses).toBe(4_000);
  });

  it('closes the financial period and records a snapshot', () => {
    const corporation = corporationFixture(50_000);
    const employees = employeeState([employeeFixture(2_000)]);

    const result = applyPayroll(corporation, employees.employees, {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });

    expect(result.corporation.financialHistory).toHaveLength(1);
    expect(result.corporation.financialHistory[0].periodId).toBe('period_0000');
    expect(result.corporation.financialHistory[0].payrollExpenses).toBe(2_000);
    expect(result.corporation.financialHistory[0].balance).toBe(48_000);
    // The period counters are reset once the period is closed.
    expect(result.corporation.finances.periodPayrollExpenses).toBe(0);
  });

  it('does not create money when the balance is insufficient', () => {
    const corporation = corporationFixture(500);
    const employees = employeeState([employeeFixture(2_000)]);

    const result = applyPayroll(corporation, employees.employees, {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });

    expect(result.summary.paid).toBe(false);
    expect(result.summary.shortfall).toBe(1_500);
    expect(result.corporation.finances.balance).toBe(500);
    expect(result.corporation.finances.lifetimePayrollExpenses).toBe(0);
    expect(result.corporation.missedPayrollCount).toBe(1);
    expect(result.corporation.transactions[0].type).toBe('payroll-missed');
    expect(result.corporation.transactions[0].amount).toBe(0);
    expect(result.corporation.transactions[0].shortfall).toBe(1_500);
  });

  it('puts the workforce on alert after a missed payroll', () => {
    const corporation = corporationFixture(500);
    const employees = employeeState([employeeFixture(2_000)]);

    const result = applyPayroll(corporation, employees.employees, {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });

    const employee = result.employees[0];
    expect(employee.status).toBe('at-risk');
    expect(employee.satisfaction).toBeCloseTo(
      60 - MISSED_PAYROLL_SATISFACTION_PENALTY,
      2,
    );
    expect(employee.morale).toBeCloseTo(60 - MISSED_PAYROLL_MORALE_PENALTY, 2);
  });

  it('clears the alert status after a successful payroll', () => {
    const corporation = corporationFixture(500);
    const employees = employeeState([employeeFixture(2_000)]);

    const missed = applyPayroll(corporation, employees.employees, {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });
    const recovered = applyPayroll(
      { ...missed.corporation, finances: { ...missed.corporation.finances, balance: 50_000 } },
      missed.employees,
      { elapsedSimMs: PAYROLL_PERIOD_MS + HOUR, simTimeMs: PAYROLL_PERIOD_MS + HOUR },
    );

    expect(recovered.employees[0].status).toBe('active');
  });

  it('records no payroll when there is no workforce', () => {
    const corporation = corporationFixture(50_000);

    const result = applyPayroll(corporation, [], {
      elapsedSimMs: HOUR,
      simTimeMs: HOUR,
    });

    expect(result.summary.paid).toBe(true);
    expect(result.summary.total).toBe(0);
    expect(result.corporation.transactions).toHaveLength(0);
    expect(result.corporation.lastPayrollPeriodId).toBe('period_0000');
  });

  it('produces deterministic results', () => {
    const run = () => {
      const corporation = corporationFixture(50_000);
      const employees = employeeState([employeeFixture(2_000)]);
      return applyPayroll(corporation, employees.employees, {
        elapsedSimMs: HOUR,
        simTimeMs: HOUR,
      });
    };

    expect(run().corporation).toEqual(run().corporation);
    expect(run().summary).toEqual(run().summary);
  });

  it('rejects a transaction that would overdraw the balance', () => {
    const corporation = corporationFixture(100);

    const next = applyTransaction(corporation, {
      type: 'payroll',
      amount: -500,
      description: 'Overdraw',
      simTimeMs: 0,
    });

    expect(next).toBe(corporation);
  });
});
