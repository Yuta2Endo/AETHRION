import { useMemo, useState } from 'react';
import { Flask, Lock, MagnifyingGlass, X } from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, SelectField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectEmployees, selectPlayerCorporation, selectTechnologyState } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import {
  TECHNOLOGIES,
  getMissingPrerequisites,
  getTechnologyStatus,
  type TechnologyDefinition,
  type TechnologyState,
  type TechnologyStatus,
} from '@/simulation/technology';
import type { Employee } from '@/simulation/employees';

/**
 * Technology & Research section.
 * Shows every technology of the tree with its status, cost, prerequisites and
 * the running research projects.
 */
export function TechnologySection() {
  const corporation = useGameStore(selectPlayerCorporation);
  const technology = useGameStore(selectTechnologyState);
  const employees = useGameStore(selectEmployees);

  const tierId = corporation?.tierId;

  const grouped = useMemo(() => {
    const buckets = new Map<string, TechnologyDefinition[]>();
    for (const definition of TECHNOLOGIES) {
      const bucket = buckets.get(definition.category) ?? [];
      bucket.push(definition);
      buckets.set(definition.category, bucket);
    }
    return Array.from(buckets.entries());
  }, []);

  if (!corporation) {
    return null;
  }

  return (
    <section className="section-block" aria-label="Technology and research">
      <h2 className="section-title">
        <Flask size={18} aria-hidden="true" /> Technology &amp; Research
      </h2>

      {grouped.map(([category, definitions]) => (
        <div key={category} className="tech-group">
          <h3 className="tech-group-title">{category}</h3>
          <div className="tech-grid">
            {definitions.map((definition) => (
              <TechnologyCard
                key={definition.id}
                definition={definition}
                technology={technology}
                employees={employees}
                tierId={tierId}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

interface TechnologyCardProps {
  definition: TechnologyDefinition;
  technology: TechnologyState;
  employees: Employee[];
  tierId: string | undefined;
}

function TechnologyCard({
  definition,
  technology,
  employees,
  tierId,
}: TechnologyCardProps) {
  const status = getTechnologyStatus(technology, definition, tierId);
  const missing = getMissingPrerequisites(technology, definition);
  const project = technology.projects.find(
    (candidate) => candidate.technologyId === definition.id && candidate.status === 'active',
  );

  const eligible = employees.filter(
    (employee) =>
      employee.status !== 'departed' &&
      (definition.requiredProfession === undefined ||
        employee.profession === definition.requiredProfession),
  );

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(eligible[0]?.id ?? '');

  const assignedNames = project
    ? project.assignedEmployeeIds
        .map((id) => employees.find((employee) => employee.id === id)?.name)
        .filter((name): name is string => Boolean(name))
    : [];

  return (
    <article className={`tech-card tech-card--${status}`}>
      <header className="tech-head">
        <div className="tech-title-block">
          <span className="tech-name">{definition.name}</span>
          <span className="tech-description">{definition.description}</span>
        </div>
        <Badge variant={statusVariant(status)}>{status}</Badge>
      </header>

      <div className="tech-meta">
        <span>
          Cost {BASE_CURRENCY_SYMBOL}
          {definition.researchCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
        {missing.length > 0 ? (
          <span className="tech-prereq">
            <Lock size={12} weight="fill" aria-hidden="true" /> {missing.join(', ')}
          </span>
        ) : (
          <span className="tech-prereq tech-prereq--ready">prerequisites met</span>
        )}
      </div>

      {project ? (
        <>
          <IndicatorBar
            label="Research progress"
            value={project.progress * 100}
            tone="purple"
          />
          <div className="tech-assigned">
            {assignedNames.length > 0 ? assignedNames.join(', ') : 'No one assigned'}
          </div>
          <div className="tech-actions">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                commands.cancelResearch(project.id);
              }}
            >
              <X size={14} aria-hidden="true" /> Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="tech-actions">
          <SelectField
            label="Assigned"
            options={
              eligible.length > 0
                ? eligible.map((employee) => ({
                    value: employee.id,
                    label: `${employee.name} — ${employee.profession} ${Math.round(employee.skill)}`,
                  }))
                : [{ value: '', label: 'No eligible employee' }]
            }
            value={selectedEmployeeId}
            disabled={status !== 'available' || eligible.length === 0}
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={status !== 'available' || eligible.length === 0 || !selectedEmployeeId}
            onClick={() => {
              if (!selectedEmployeeId) return;
              commands.startResearch({
                technologyId: definition.id,
                employeeIds: [selectedEmployeeId],
              });
            }}
          >
            <MagnifyingGlass size={14} aria-hidden="true" /> Research
          </Button>
        </div>
      )}
    </article>
  );
}

function statusVariant(status: TechnologyStatus): 'ok' | 'pending' | 'brand' | 'danger' | 'warning' {
  switch (status) {
    case 'completed':
      return 'ok';
    case 'researching':
      return 'brand';
    case 'available':
      return 'pending';
    default:
      return 'danger';
  }
}
