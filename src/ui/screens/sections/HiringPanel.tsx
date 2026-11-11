import { useMemo, useState } from 'react';
import { UserPlus } from '@phosphor-icons/react';
import { Button, SelectField, TextField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectPlayerCorporation } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { DEPARTMENTS, type DepartmentId } from '@/simulation/contracts';
import { getCorporationTier } from '@/simulation/corporation';
import {
  PROFESSIONS,
  calculateHiringCost,
  getProfession,
  type ProfessionId,
} from '@/simulation/employees';

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

/**
 * Hiring interface.
 * The form only collects input — every rule is executed by the command layer.
 */
export function HiringPanel() {
  const corporation = useGameStore(selectPlayerCorporation);

  const [profession, setProfession] = useState<ProfessionId>('engineer');
  const [department, setDepartment] = useState<DepartmentId>('engineering');
  const [salary, setSalary] = useState(
    () => String(getProfession('engineer')?.baseSalary ?? 0),
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const tier = corporation ? getCorporationTier(corporation.tierId) : undefined;
  const availableDepartments = useMemo(
    () => tier?.availableDepartments ?? [],
    [tier],
  );

  // The selected department may become unavailable after a tier change.
  const effectiveDepartment = availableDepartments.includes(department)
    ? department
    : (availableDepartments[0] ?? department);

  const professionOptions = useMemo(
    () =>
      PROFESSIONS.map((entry) => ({
        value: entry.id,
        label: `${entry.name} — base ${entry.baseSalary}`,
      })),
    [],
  );

  const departmentOptions = useMemo(
    () =>
      DEPARTMENTS.filter((entry) => availableDepartments.includes(entry.id)).map((entry) => ({
        value: entry.id,
        label: entry.name,
      })),
    [availableDepartments],
  );

  if (!corporation || !tier) {
    return null;
  }

  const numericSalary = Number(salary);
  const hiringCost =
    Number.isFinite(numericSalary) && numericSalary > 0
      ? calculateHiringCost(numericSalary, profession)
      : 0;

  const hire = (): void => {
    const result = commands.hireEmployee({
      profession,
      department: effectiveDepartment,
      salary: numericSalary,
    });

    if (!result.ok) {
      setFeedback({ type: 'error', message: result.error.message });
      return;
    }

    setFeedback({
      type: 'success',
      message: `${result.value.name} joined as ${getProfession(result.value.profession)?.name ?? result.value.profession}.`,
    });
  };

  const capacityReached = tier.employeeCapacity <= 0;

  return (
    <section className="section-block" aria-label="Hiring">
      <h2 className="section-title">
        <UserPlus size={18} aria-hidden="true" /> Hire Personnel
      </h2>

      <div className="hiring-panel">
        <div className="hiring-fields">
          <SelectField
            label="Profession"
            options={professionOptions}
            value={profession}
            onChange={(event) => {
              const next = event.target.value as ProfessionId;
              setProfession(next);
              setSalary(String(getProfession(next)?.baseSalary ?? 0));
              setFeedback(null);
            }}
            hint={`${tier.name} tier · capacity ${tier.employeeCapacity}`}
          />

          <SelectField
            label="Department"
            options={departmentOptions}
            value={effectiveDepartment}
            onChange={(event) => {
              setDepartment(event.target.value as DepartmentId);
              setFeedback(null);
            }}
            hint={
              departmentOptions.length === 0
                ? 'No department available at this tier'
                : undefined
            }
          />

          <TextField
            label="Salary per period"
            type="number"
            min={300}
            max={10000}
            step={50}
            value={salary}
            onChange={(event) => {
              setSalary(event.target.value);
              setFeedback(null);
            }}
            hint={`Hiring fee ${hiringCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
        </div>

        <div className="hiring-action">
          <Button
            variant="primary"
            onClick={hire}
            disabled={capacityReached || departmentOptions.length === 0}
          >
            Hire Employee
          </Button>
        </div>

        {feedback ? (
          <p
            className={`hiring-feedback hiring-feedback--${feedback.type}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
