import { useMemo, useState } from 'react';
import { Cube, ShoppingCart } from '@phosphor-icons/react';
import { Button, SelectField, TextField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectPlayerCorporation, selectResourceState } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL, type ResourceId } from '@/simulation/contracts';
import {
  RESOURCES,
  getAvailableQuantity,
  getResourceUnitPrice,
} from '@/simulation/resources';

/**
 * Resource Inventory section.
 * Shows the resource balances, the reservations and allows purchases.
 */
export function ResourceSection() {
  const corporation = useGameStore(selectPlayerCorporation);
  const resources = useGameStore(selectResourceState);
  const economy = useGameStore((state) => state.economy);

  const [selectedId, setSelectedId] = useState<ResourceId>('electronics');
  const [quantity, setQuantity] = useState('10');
  const [feedback, setFeedback] = useState<string | null>(null);

  const prices = useMemo(() => {
    const map = {} as Record<ResourceId, number>;
    for (const definition of RESOURCES) {
      map[definition.id] = getResourceUnitPrice(definition, economy);
    }
    return map;
  }, [economy]);

  if (!corporation) {
    return null;
  }

  const purchase = (): void => {
    const amount = Number(quantity);
    const result = commands.purchaseResource({
      resourceId: selectedId,
      quantity: amount,
    });
    setFeedback(result.ok ? 'Purchase completed.' : result.error.message);
  };

  return (
    <section className="section-block" aria-label="Resource inventory">
      <h2 className="section-title">
        <Cube size={18} aria-hidden="true" /> Resource Inventory
      </h2>

      <div className="resource-table">
        <div className="resource-head" aria-hidden="true">
          <span>Resource</span>
          <span>Owned</span>
          <span>Reserved</span>
          <span>Available</span>
          <span>Price</span>
        </div>
        {resources.balances.map((balance) => {
          const definition = RESOURCES.find((entry) => entry.id === balance.resourceId);
          return (
            <div key={balance.resourceId} className="resource-row">
              <span className="resource-name">
                {definition?.name ?? balance.resourceId}
                <span className="resource-unit">{definition?.unit}</span>
              </span>
              <span className="text-mono">{balance.quantity}</span>
              <span className="text-mono">{balance.reserved}</span>
              <span className="text-mono">
                {getAvailableQuantity(resources, balance.resourceId)}
              </span>
              <span className="text-mono">
                {BASE_CURRENCY_SYMBOL}
                {prices[balance.resourceId].toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          );
        })}
      </div>

      <div className="hiring-panel">
        <div className="hiring-fields">
          <SelectField
            label="Resource"
            options={RESOURCES.map((definition) => ({
              value: definition.id,
              label: definition.name,
            }))}
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value as ResourceId);
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
            hint={`Cost ${BASE_CURRENCY_SYMBOL}${(Number(quantity) * (prices[selectedId] ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
        </div>
        <div className="hiring-action">
          <Button variant="primary" onClick={purchase}>
            <ShoppingCart size={14} aria-hidden="true" /> Purchase
          </Button>
        </div>
        {feedback ? (
          <p className="hiring-feedback hiring-feedback--success" role="status">
            {feedback}
          </p>
        ) : null}
      </div>

      {resources.transactions.length > 0 ? (
        <div className="transaction-list">
          <div className="transaction-head" aria-hidden="true">
            <span>Resource transaction</span>
            <span>Quantity</span>
            <span>Balance</span>
          </div>
          {[...resources.transactions].reverse().slice(0, 8).map((transaction) => (
            <div key={transaction.id} className="transaction-row">
              <div className="transaction-main">
                <span className="transaction-type">{transaction.type}</span>
                <span className="transaction-description">{transaction.resourceId}</span>
              </div>
              <span className="transaction-amount text-mono">
                {transaction.quantity === 0 ? '—' : transaction.quantity}
              </span>
              <span className="transaction-balance text-mono">{transaction.balanceAfter}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
