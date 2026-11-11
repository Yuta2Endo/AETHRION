/**
 * Employee Engine module (Stage 01 placeholder).
 * Responsible for hiring, roles, salaries, and employee performance.
 * Typed interface only — no implementation in Stage 01.
 */

export interface Employee {
  id: string;
  name: string;
  role: string;
  salary: number;
}

export interface EmployeeState {
  employees: Employee[];
}

export const defaultEmployeeState: EmployeeState = {
  employees: [],
};

export function getEmployeeState(): EmployeeState {
  return { ...defaultEmployeeState };
}
