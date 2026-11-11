import { useState } from 'react';
import { Storefront, Tag } from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, StatCard, TextField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectMarketState, selectPlayerCorporation, selectProductState } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';

/**
 * Products & Market section.
 * Shows the finished products with their inventory, quality, price and sales
 * results, and allows adjusting the price and the market availability.
 */
export function MarketSection() {
  const corporation = useGameStore(selectPlayerCorporation);
  const products = useGameStore(selectProductState);
  const market = useGameStore(selectMarketState);

  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!corporation) {
    return null;
  }

  const finished = products.instances.filter((instance) => instance.status === 'ready');

  if (finished.length === 0) {
    return (
      <section className="section-block" aria-label="Products and market">
        <h2 className="section-title">
          <Storefront size={18} aria-hidden="true" /> Products &amp; Market
        </h2>
        <div className="empty-state">
          <p className="empty-title">No products on the market</p>
          <p className="empty-note">
            Complete a product development project to offer a product to the market.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="section-block" aria-label="Products and market">
      <h2 className="section-title">
        <Storefront size={18} aria-hidden="true" /> Products &amp; Market
      </h2>

      <div className="stat-grid">
        {finished.map((instance) => (
          <StatCard
            key={instance.id}
            label={instance.name}
            value={instance.inventory}
            hint={`${instance.unitsSold} sold · ${BASE_CURRENCY_SYMBOL}${instance.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={Storefront}
            tone="accent"
          />
        ))}
      </div>

      <div className="market-product-list">
        {finished.map((instance) => {
          const listing = market.listings.find(
            (candidate) => candidate.productInstanceId === instance.id,
          );
          const draft = priceDraft[instance.id] ?? String(instance.price);

          return (
            <article key={instance.id} className="market-product">
              <header className="order-head">
                <span className="order-name">{instance.name}</span>
                <Badge variant={instance.salesActive ? 'ok' : 'pending'}>
                  {instance.salesActive ? 'on sale' : 'withdrawn'}
                </Badge>
              </header>

              <div className="market-product-stats">
                <span>Quality {Math.round(instance.quality)}</span>
                <span>Innovation {Math.round(instance.innovation)}</span>
                <span>Readiness {Math.round(instance.marketReadiness)}</span>
                <span>In stock {instance.inventory}</span>
                <span>Sold {instance.unitsSold}</span>
              </div>

              <IndicatorBar
                label="Market readiness"
                value={instance.marketReadiness}
                tone="cyan"
              />

              <div className="market-product-controls">
                <TextField
                  label="Price"
                  type="number"
                  min={1}
                  step={10}
                  value={draft}
                  onChange={(event) => {
                    setPriceDraft((previous) => ({
                      ...previous,
                      [instance.id]: event.target.value,
                    }));
                    setFeedback(null);
                  }}
                  hint={`Demand ${listing ? listing.lastTickUnitsSold : 0} units last tick`}
                />
                <div className="market-product-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const result = commands.setProductPrice(instance.id, Number(draft));
                      setFeedback(result.ok ? 'Price updated.' : result.error.message);
                    }}
                  >
                    <Tag size={14} aria-hidden="true" /> Set price
                  </Button>
                  <Button
                    size="sm"
                    variant={instance.salesActive ? 'ghost' : 'primary'}
                    onClick={() => {
                      const result = commands.setProductSalesActive(
                        instance.id,
                        !instance.salesActive,
                      );
                      setFeedback(result.ok ? 'Market availability updated.' : result.error.message);
                    }}
                  >
                    {instance.salesActive ? 'Withdraw' : 'Offer on market'}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {feedback ? (
        <p className="hiring-feedback hiring-feedback--success" role="status">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
