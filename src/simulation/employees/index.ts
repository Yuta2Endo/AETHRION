/**
 * Employee Engine — public surface.
 * Stage 03 implementation.
 */

export {
  MAX_DEVELOPMENT_ENTRIES,
  MAX_EMPLOYEE_SALARY,
  MIN_EMPLOYEE_SALARY,
  PROFESSIONS,
  createInitialEmployeeState,
  findEmployee,
  generateEmployeeId,
  generateEmployeeName,
  getActiveEmployees,
  getProfession,
  getWorkforceProductivity,
  isProfessionId,
  isValidEmployee,
  isValidEmployeeState,
} from './employeeState';
export type {
  Employee,
  EmployeeDevelopment,
  EmployeeId,
  EmployeeState,
  EmploymentStatus,
  Profession,
  ProfessionId,
} from './employeeState';

export {
  HIRING_FLAT_FEE,
  INITIAL_MORALE,
  INITIAL_SATISFACTION,
  MORALE_BASE,
  MORALE_DRIFT,
  PRODUCTIVITY_MAX,
  SALARY_FAIRNESS_WEIGHT,
  SATISFACTION_DRIFT,
  SKILL_CONVERGENCE,
  SKILL_PER_EXPERIENCE,
  calculateHiringCost,
  createEmployee,
  developEmployees,
  dismissEmployee,
  hireEmployee,
  isValidSalary,
} from './employeeRules';
export type {
  CreateEmployeeInput,
  DismissEmployeeResult,
  EmployeeContext,
  HireEmployeeInput,
  HireEmployeeResult,
} from './employeeRules';

export {
  MISSED_PAYROLL_MORALE_PENALTY,
  MISSED_PAYROLL_SATISFACTION_PENALTY,
  PAYROLL_PERIOD_MS,
  applyPayroll,
  calculatePayroll,
  getPayrollPeriod,
} from './payroll';
export type {
  ApplyPayrollContext,
  ApplyPayrollResult,
  PayrollPeriod,
  PayrollSummary,
} from './payroll';
