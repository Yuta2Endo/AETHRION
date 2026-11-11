import { Badge } from '@/ui/components/Badge';

export interface EmployeeRowProps {
  name: string;
  profession: string;
  department: string;
  skill: number;
  salary: number;
  productivity: number;
  satisfaction: number;
  morale: number;
  status: 'active' | 'at-risk' | 'departed';
  /** Currency symbol of the salary. */
  symbol: string;
  /** Optional dismiss action. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * AETHRION employee card.
 * Renders one employee record — all values are read from the simulation.
 */
export function EmployeeRow({
  name,
  profession,
  department,
  skill,
  salary,
  productivity,
  satisfaction,
  morale,
  status,
  symbol,
  onDismiss,
  dismissLabel = 'Dismiss',
}: EmployeeRowProps) {
  const statusVariant =
    status === 'active' ? 'ok' : status === 'at-risk' ? 'warning' : 'danger';

  return (
    <article className={`employee-card employee-card--${status}`}>
      <header className="employee-head">
        <div className="employee-identity">
          <span className="employee-name">{name}</span>
          <span className="employee-role">
            {profession} · {department}
          </span>
        </div>
        <div className="employee-badges">
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
      </header>

      <dl className="employee-stats">
        <div className="employee-stat">
          <dt>Skill</dt>
          <dd className="text-mono">{Math.round(skill)}</dd>
        </div>
        <div className="employee-stat">
          <dt>Productivity</dt>
          <dd className="text-mono">{Math.round(productivity)}</dd>
        </div>
        <div className="employee-stat">
          <dt>Satisfaction</dt>
          <dd className="text-mono">{Math.round(satisfaction)}</dd>
        </div>
        <div className="employee-stat">
          <dt>Morale</dt>
          <dd className="text-mono">{Math.round(morale)}</dd>
        </div>
        <div className="employee-stat">
          <dt>Salary</dt>
          <dd className="text-mono">
            {symbol}
            {salary.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </dd>
        </div>
      </dl>

      {onDismiss ? (
        <footer className="employee-foot">
          <button type="button" className="link-button" onClick={onDismiss}>
            {dismissLabel}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
