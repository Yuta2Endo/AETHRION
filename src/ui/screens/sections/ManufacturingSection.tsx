import { useMemo, useState } from 'react';
import { Factory, Plus, X } from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, SelectField, TextField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectEmployees, selectPlayerCorporation, selectProductionState, selectProductState } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import { FACILITY_DEFINITIONS, type FacilityType } from '@/simulation/production';

/**
 * Manufacturing section.
 * Shows the corporate facilities, the production queue and allows creating
 * facilities and starting production orders.
 */
export function ManufacturingSection() {
  const corporation = useGameStore(selectPlayerCorporation);
  const production = useGameStore(selectProductionState);
  const products = useGameStore(selectProductState);
  const employees = useGameStore(selectEmployees);

  const [facilityName, setFacilityName] = useState('');
  const [facilityType, setFacilityType] = useState<FacilityType>('electronics-factory');
  const [productId, setProductId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [quantity, setQuantity] = useState('5');
  const [feedback, setFeedback] = useState<string | null>(null);

  const readyProducts = useMemo(
    () => products.instances.filter((instance) => instance.status === 'ready'),
    [products.instances],
  );

  if (!corporation) {
    return null;
  }

  const createFacility = (): void => {
    const result = commands.createFacility({ name: facilityName, type: facilityType });
    setFeedback(result.ok ? 'Facility constructed.' : result.error.message);
    if (result.ok) setFacilityName('');
  };

  const startProduction = (): void => {
    const result = commands.startProduction({
      productInstanceId: productId,
      facilityId: facilityId,
      quantity: Number(quantity),
    });
    setFeedback(result.ok ? 'Production started.' : result.error.message);
  };

  return (
    <section className="section-block" aria-label="Manufacturing">
      <h2 className="section-title">
        <Factory size={18} aria-hidden="true" /> Manufacturing
      </h2>

      {production.facilities.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No facilities yet</p>
          <p className="empty-note">
            Build a manufacturing facility to turn resources into finished products.
          </p>
        </div>
      ) : (
        <div className="facility-grid">
          {production.facilities.map((facility) => (
            <article key={facility.id} className="facility-card">
              <header className="tech-head">
                <div className="tech-title-block">
                  <span className="tech-name">{facility.name}</span>
                  <span className="tech-description">
                    {facility.capacity} units/batch · efficiency{' '}
                    {facility.efficiency.toFixed(2)}
                  </span>
                </div>
                <Badge variant={facility.status === 'producing' ? 'brand' : 'ok'}>
                  {facility.status}
                </Badge>
              </header>
              <div className="tech-meta">
                <span>
                  Operating cost {BASE_CURRENCY_SYMBOL}
                  {facility.operatingCost}/h
                </span>
                <span>{facility.queue.length} order(s) queued</span>
              </div>
              <div className="tech-assigned">
                {facility.assignedEmployeeIds.length > 0
                  ? facility.assignedEmployeeIds
                      .map(
                        (id) =>
                          employees.find((employee) => employee.id === id)?.name ?? id,
                      )
                      .join(', ')
                  : 'No staff assigned'}
              </div>
            </article>
          ))}
        </div>
      )}

      {production.orders.filter((order) => order.status !== 'cancelled').length > 0 ? (
        <div className="order-list">
          {production.orders
            .filter((order) => order.status !== 'cancelled')
            .map((order) => {
              const product = products.instances.find(
                (instance) => instance.id === order.productInstanceId,
              );
              return (
                <div key={order.id} className="order-card">
                  <div className="order-head">
                    <span className="order-name">{product?.name ?? order.productDefinitionId}</span>
                    <Badge
                      variant={
                        order.status === 'completed'
                          ? 'ok'
                          : order.status === 'running'
                            ? 'brand'
                            : 'pending'
                      }
                    >
                      {order.status}
                    </Badge>
                  </div>
                  <IndicatorBar
                    label={`${order.produced} / ${order.quantity} units`}
                    value={order.progress * 100}
                    tone="cyan"
                  />
                  <div className="order-foot">
                    <span className="text-mono">
                      Operating cost {BASE_CURRENCY_SYMBOL}
                      {order.operatingCost.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    {order.status !== 'completed' ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          commands.cancelProduction(order.id);
                        }}
                      >
                        <X size={12} aria-hidden="true" /> Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}

      <div className="hiring-panel">
        <h3 className="tech-group-title">Build a facility</h3>
        <div className="hiring-fields">
          <TextField
            label="Facility name"
            placeholder="e.g. Foundry East"
            value={facilityName}
            onChange={(event) => {
              setFacilityName(event.target.value);
              setFeedback(null);
            }}
          />
          <SelectField
            label="Facility type"
            options={FACILITY_DEFINITIONS.map((definition) => ({
              value: definition.type,
              label: `${definition.name} — ${definition.capacity}/batch`,
            }))}
            value={facilityType}
            onChange={(event) => {
              setFacilityType(event.target.value as FacilityType);
              setFeedback(null);
            }}
          />
        </div>
        <div className="hiring-action">
          <Button variant="primary" onClick={createFacility}>
            <Plus size={14} aria-hidden="true" /> Construct
          </Button>
        </div>
      </div>

      <div className="hiring-panel">
        <h3 className="tech-group-title">Start production</h3>
        <div className="hiring-fields">
          <SelectField
            label="Product"
            options={
              readyProducts.length > 0
                ? readyProducts.map((instance) => ({
                    value: instance.id,
                    label: instance.name,
                  }))
                : [{ value: '', label: 'No finished product' }]
            }
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setFeedback(null);
            }}
          />
          <SelectField
            label="Facility"
            options={
              production.facilities.length > 0
                ? production.facilities.map((facility) => ({
                    value: facility.id,
                    label: facility.name,
                  }))
                : [{ value: '', label: 'No facility' }]
            }
            value={facilityId}
            onChange={(event) => {
              setFacilityId(event.target.value);
              setFeedback(null);
            }}
          />
          <TextField
            label="Quantity"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setFeedback(null);
            }}
          />
        </div>
        <div className="hiring-action">
          <Button
            variant="primary"
            onClick={startProduction}
            disabled={!productId || !facilityId || readyProducts.length === 0}
          >
            <Factory size={14} aria-hidden="true" /> Start Production
          </Button>
        </div>
        {feedback ? (
          <p className="hiring-feedback hiring-feedback--success" role="status">
            {feedback}
          </p>
        ) : null}
      </div>
    </section>
  );
}
