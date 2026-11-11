import { Package, Sparkle } from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, StatCard } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectEmployees, selectPlayerCorporation, selectProductState } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import { PRODUCT_DEFINITIONS, type ProductInstance } from '@/simulation/products';
import { getTechnologyDefinition } from '@/simulation/technology';
import type { Employee } from '@/simulation/employees';

/**
 * Product Development section.
 * Shows the product concepts, the running development projects and the
 * finished products.
 */
export function ProductSection() {
  const corporation = useGameStore(selectPlayerCorporation);
  const products = useGameStore(selectProductState);
  const employees = useGameStore(selectEmployees);

  if (!corporation) {
    return null;
  }

  const developers = employees.filter(
    (employee) =>
      employee.status !== 'departed' &&
      (employee.profession === 'engineer' || employee.profession === 'researcher'),
  );

  return (
    <section className="section-block" aria-label="Product development">
      <h2 className="section-title">
        <Package size={18} aria-hidden="true" /> Product Development
      </h2>

      <div className="product-grid">
        {PRODUCT_DEFINITIONS.map((definition) => {
          const instance = products.instances.find(
            (candidate) =>
              candidate.definitionId === definition.id && candidate.status === 'developing',
          );
          const required = getTechnologyDefinition(definition.requiresTechnology);

          return (
            <article key={definition.id} className="product-card">
              <header className="tech-head">
                <div className="tech-title-block">
                  <span className="tech-name">{definition.name}</span>
                  <span className="tech-description">{definition.description}</span>
                </div>
                <Badge variant="brand">{definition.category}</Badge>
              </header>

              <div className="tech-meta">
                <span>
                  Requires {required?.name ?? definition.requiresTechnology}
                </span>
                <span>
                  Development {BASE_CURRENCY_SYMBOL}
                  {definition.developmentCost.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span>Complexity {definition.complexity}</span>
                <span>
                  Reference price {BASE_CURRENCY_SYMBOL}
                  {definition.basePrice.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>

              {instance ? (
                <>
                  <IndicatorBar
                    label="Development progress"
                    value={instance.progress * 100}
                    tone="cyan"
                  />
                  <div className="tech-assigned">
                    {assignedNames(instance, employees) || 'No one assigned'}
                  </div>
                </>
              ) : (
                <div className="tech-actions">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!required || developers.length === 0}
                    onClick={() => {
                      if (!required) return;
                      const assigned = developers
                        .filter((employee) => employee.profession === 'engineer')
                        .slice(0, 1)
                        .map((employee) => employee.id);
                      commands.startProductDevelopment({
                        definitionId: definition.id,
                        employeeIds:
                          assigned.length > 0
                            ? assigned
                            : developers.slice(0, 1).map((employee) => employee.id),
                      });
                    }}
                  >
                    <Sparkle size={14} aria-hidden="true" /> Develop
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {products.instances.filter((instance) => instance.status === 'ready').length > 0 ? (
        <div className="stat-grid">
          {products.instances
            .filter((instance) => instance.status === 'ready')
            .map((instance) => (
              <StatCard
                key={instance.id}
                label={instance.name}
                value={`${Math.round(instance.quality)}`}
                hint={`quality · innovation ${Math.round(instance.innovation)}`}
                icon={Sparkle}
                tone="accent"
              />
            ))}
        </div>
      ) : null}
    </section>
  );
}

function assignedNames(instance: ProductInstance, employees: Employee[]): string {
  return instance.assignedEmployeeIds
    .map((id) => employees.find((employee) => employee.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(', ');
}
