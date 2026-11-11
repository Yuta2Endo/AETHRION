import { useMemo, useState } from 'react';
import { Storefront, Tag, UsersThree } from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, StatCard, TextField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectMarketState, selectPlayerCorporation, selectProductState } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import { buildCompetitorMarketSignal } from '@/simulation/competitors';
import { COMMODITY_CATEGORIES } from '@/simulation/economy';

/**
 * Products & Market section.
 * Shows the finished products with their inventory, quality, price and sales
 * results, allows adjusting the price and the market availability, and shows
 * the competitive pressure the AI corporations put on every commodity.
 */
export function MarketSection() {
  const corporation = useGameStore(selectPlayerCorporation);
  const products = useGameStore(selectProductState);
  const market = useGameStore(selectMarketState);
  const competitors = useGameStore((state) => state.competitors);
  const economy = useGameStore((state) => state.economy);

  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const competition = useMemo(() => buildCompetitorMarketSignal(competitors), [competitors]);

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
        <CompetitivePressure competition={competition} economy={economy} />
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

      <CompetitivePressure competition={competition} economy={economy} />
    </section>
  );
}

/**
 * The competitive pressure the AI corporations put on every commodity.
 *
 * It extends the existing market section — it never duplicates the market
 * dashboard of the economy overview.
 */
function CompetitivePressure({
  competition,
  economy,
}: {
  competition: ReturnType<typeof buildCompetitorMarketSignal>;
  economy: ReturnType<typeof useGameStore.getState>['economy'];
}) {
  return (
    <>
      <h3 className="tech-group-title">
        <UsersThree size={14} aria-hidden="true" /> Competitive Pressure
      </h3>
      {competition === null ? (
        <div className="empty-state">
          <p className="empty-title">No competitor activity</p>
          <p className="empty-note">The AI corporations are not competing in the markets yet.</p>
        </div>
      ) : (
        <div className="resource-table">
          <div className="resource-head" aria-hidden="true">
            <span>Commodity</span>
            <span>Price</span>
            <span>Supply pressure</span>
            <span>Demand pressure</span>
            <span>Price pressure</span>
          </div>
          {COMMODITY_CATEGORIES.map((category) => {
            const commodity = economy.commodities.find(
              (candidate) => candidate.category === category,
            );
            const pressure = competition.pricePressure[category] ?? 0;

            return (
              <div key={category} className="resource-row">
                <div className="resource-name">
                  <span className="text-mono">{category}</span>
                  <span className="tech-description">
                    {commodity ? commodity.name : 'market'}
                  </span>
                </div>
                <span className="text-mono">
                  {commodity
                    ? `${BASE_CURRENCY_SYMBOL}${commodity.price.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}`
                    : '—'}
                </span>
                <span className="text-mono">
                  {Math.round(competition.supplyPressure[category] ?? 0)}
                </span>
                <span className="text-mono">
                  {Math.round(competition.demandPressure[category] ?? 0)}
                </span>
                <span>
                  <Badge variant={pressure < 0 ? 'warning' : pressure > 0 ? 'ok' : 'pending'}>
                    {pressure > 0 ? '+' : ''}
                    {pressure.toFixed(2)}
                  </Badge>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
