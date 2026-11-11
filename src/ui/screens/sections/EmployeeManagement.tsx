import { useMemo } from 'react';
import { UserList } from '@phosphor-icons/react';
import { EmployeeRow } from '@/ui/components/EmployeeRow';
import { useGameStore } from '@/game/state/gameStore';
import { selectEmployees, selectPlayerCorporation } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import { getProfession } from '@/simulation/employees';

/**
 * Employee Management.
 * Lists every employee record of the corporation with their current figures.
 */
export function EmployeeManagement() {
  const corporation = useGameStore(selectPlayerCorporation);
  const employees = useGameStore(selectEmployees);

  const active = useMemo(
    () => employees.filter((employee) => employee.status !== 'departed'),
    [employees],
  );

  if (!corporation) {
    return null;
  }

  return (
    <section className="section-block" aria-label="Employee management">
      <h2 className="section-title">
        <UserList size={18} aria-hidden="true" /> Employee Management
      </h2>

      {active.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No employees yet</p>
          <p className="empty-note">
            Hire your first specialist to start generating revenue and growing the
            corporation.
          </p>
        </div>
      ) : (
        <div className="employee-grid">
          {active.map((employee) => (
            <EmployeeRow
              key={employee.id}
              name={employee.name}
              profession={getProfession(employee.profession)?.name ?? employee.profession}
              department={employee.department}
              skill={employee.skill}
              salary={employee.salary}
              productivity={employee.productivity}
              satisfaction={employee.satisfaction}
              morale={employee.morale}
              status={employee.status}
              symbol={BASE_CURRENCY_SYMBOL}
              onDismiss={() => {
                commands.dismissEmployee(employee.id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
