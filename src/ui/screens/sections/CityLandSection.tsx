import { useMemo, useState } from 'react';
import { HandCoins, MapTrifold, ShoppingCart } from '@phosphor-icons/react';
import { Badge, Button, SelectField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectCity, selectPlayerCorporation } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import type { PlotStatus } from '@/simulation/city';

/**
 * Land Management.
 *
 * The finite land map of the city with its zoning, the purchase price and the
 * ownership state. Buying and selling are real actions — they go through the
 * command layer and are charged to the corporate ledger.
 */
export function CityLandSection() {
  const city = useGameStore(selectCity);
  const corporation = useGameStore(selectPlayerCorporation);
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  const plots = useMemo(() => {
    if (!city) return [];
    if (districtFilter === 'all') return city.plots;
    return city.plots.filter((plot) => plot.districtId === districtFilter);
  }, [city, districtFilter]);

  if (!city) return null;

  const districtOptions = [
    { value: 'all', label: 'All districts' },
    ...city.districts.map((district) => ({
      value: district.id,
      label: `${district.name} (${district.type})`,
    })),
  ];

  const buy = (plotId: string): void => {
    const result = commands.purchaseLand(plotId);
    setFeedback(result.ok ? 'The plot has been acquired.' : result.error.message);
  };

  const sell = (plotId: string): void => {
    const result = commands.sellLand(plotId);
    setFeedback(result.ok ? 'The plot has been sold.' : result.error.message);
  };

  return (
    <section className="section-block" aria-label="Land management">
      <h2 className="section-title">
        <MapTrifold size={18} aria-hidden="true" /> Land Management
      </h2>

      <div className="hiring-panel">
        <h3 className="tech-group-title">District filter</h3>
        <div className="hiring-fields">
          <SelectField
            label="District"
            options={districtOptions}
            value={districtFilter}
            onChange={(event) => {
              setDistrictFilter(event.target.value);
              setFeedback(null);
            }}
          />
        </div>
        <p className="tech-description">
          {plots.length} plot(s) shown · {city.statistics.availablePlotCount} available ·{' '}
          {city.statistics.occupiedPlotCount} occupied · {city.statistics.ownedPlotCount} owned
        </p>
      </div>

      {plots.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No plots in this district</p>
          <p className="empty-note">Choose another district to inspect its land map.</p>
        </div>
      ) : (
        <div className="resource-table">
          <div className="resource-head" aria-hidden="true">
            <span>Plot</span>
            <span>Zoning</span>
            <span>Price</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {plots.map((plot) => {
            const district = city.districts.find((candidate) => candidate.id === plot.districtId);
            const owned = plot.ownerId !== null && plot.ownerId === corporation?.id;
            const canBuy = plot.status === 'available' && Boolean(corporation);
            const canSell = plot.status === 'owned' && owned;

            return (
              <div key={plot.id} className="resource-row">
                <div className="resource-name">
                  <span className="text-mono">{plot.id}</span>
                  <span className="tech-description">{district?.name ?? plot.districtId}</span>
                </div>
                <span>{plot.zoning}</span>
                <span className="text-mono">
                  {BASE_CURRENCY_SYMBOL}
                  {plot.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span>
                  <Badge variant={statusVariant(plot.status)}>{plot.status}</Badge>
                </span>
                <span className="city-row-actions">
                  {canBuy ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => buy(plot.id)}
                      aria-label={`Buy plot ${plot.id}`}
                    >
                      <ShoppingCart size={12} aria-hidden="true" /> Buy
                    </button>
                  ) : null}
                  {canSell ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => sell(plot.id)}
                      aria-label={`Sell plot ${plot.id}`}
                    >
                      <HandCoins size={12} aria-hidden="true" /> Sell
                    </button>
                  ) : null}
                  {!canBuy && !canSell ? (
                    <span className="tech-description">—</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {feedback ? (
        <p className="hiring-feedback hiring-feedback--success" role="status">
          {feedback}
        </p>
      ) : null}

      {!corporation ? (
        <div className="empty-state">
          <p className="empty-title">No corporation established</p>
          <p className="empty-note">Establish a corporation to acquire land in the city.</p>
        </div>
      ) : null}

      <div className="hiring-panel">
        <h3 className="tech-group-title">Acquisition policy</h3>
        <p className="tech-description">
          A plot is bought at its listed price and charged to the corporate ledger. A plot that
          carries a building cannot be sold; an unoccupied plot is sold back for 60 % of its
          purchase price and is retired afterwards.
        </p>
        <div className="hiring-action">
          <Button variant="ghost" onClick={() => setFeedback(null)}>
            Clear message
          </Button>
        </div>
      </div>
    </section>
  );
}

/** The badge variant of a plot status. */
function statusVariant(status: PlotStatus): 'ok' | 'pending' | 'brand' | 'warning' | 'danger' {
  switch (status) {
    case 'owned':
      return 'ok';
    case 'occupied':
      return 'brand';
    case 'sold':
      return 'danger';
    default:
      return 'pending';
  }
}
