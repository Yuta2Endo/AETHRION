import { useMemo, useState } from 'react';
import {
  Buildings,
  ChartLine,
  Drop,
  Factory,
  Gauge,
  HardDrives,
  MapPin,
  Users,
  UsersThree,
} from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, StatCard, TextField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectCity } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import {
  INFRASTRUCTURE_KEYS,
  getDistrictMetrics,
  type InfrastructureKey,
} from '@/simulation/city';

/**
 * City Overview, District Management and Infrastructure.
 *
 * Every value rendered here is read from the live simulation state — there is
 * no decorative or placeholder data. The only write action is the city name,
 * which goes through the command layer.
 */
export function CityOverviewSection() {
  const city = useGameStore(selectCity);
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const districtMetrics = useMemo(() => {
    if (!city) return [];
    return city.districts.map((district) => ({
      district,
      metrics: getDistrictMetrics(city, district),
    }));
  }, [city]);

  if (!city) {
    return (
      <section className="section-block" aria-label="City overview">
        <h2 className="section-title">
          <MapPin size={18} aria-hidden="true" /> City Overview
        </h2>
        <div className="empty-state">
          <p className="empty-title">No city yet</p>
          <p className="empty-note">A city has not been founded in this empire.</p>
        </div>
      </section>
    );
  }

  const { statistics } = city;

  const rename = (): void => {
    const result = commands.renameCity(name);
    setFeedback(result.ok ? 'The city has been renamed.' : result.error.message);
    if (result.ok) setName('');
  };

  return (
    <section className="section-block" aria-label="City overview">
      <h2 className="section-title">
        <MapPin size={18} aria-hidden="true" /> City Overview
      </h2>

      <div className="stat-grid">
        <StatCard label="City" value={city.name} hint={`Level ${city.level}`} icon={Buildings} tone="brand" />
        <StatCard
          label="Population"
          value={Math.round(city.population)}
          hint={`${Math.round(statistics.employment)} employed`}
          icon={Users}
        />
        <StatCard
          label="Housing Capacity"
          value={Math.round(statistics.housingCapacity)}
          hint="Residents the city can house"
          icon={HardDrives}
        />
        <StatCard
          label="Employment"
          value={Math.round(statistics.employment)}
          hint={`${Math.round(statistics.employmentCapacity)} positions`}
          icon={UsersThree}
          tone="accent"
        />
        <StatCard
          label="Unemployment"
          value={`${city.unemployment.toFixed(1)}%`}
          hint={`${Math.round(statistics.availableWorkforce)} available`}
          icon={Gauge}
          tone={city.unemployment > 25 ? 'warning' : 'success'}
        />
        <StatCard
          label="Prosperity"
          value={city.prosperity.toFixed(1)}
          icon={ChartLine}
          tone="accent"
        />
        <StatCard
          label="Infrastructure"
          value={city.infrastructure.toFixed(1)}
          icon={Gauge}
          tone={city.infrastructure < 50 ? 'warning' : 'default'}
        />
        <StatCard
          label="Environment"
          value={city.environment.toFixed(1)}
          icon={Drop}
          tone={city.environment < 50 ? 'warning' : 'success'}
        />
        <StatCard
          label="Public Services"
          value={city.publicServices.toFixed(1)}
          icon={Users}
        />
      </div>

      <div className="hiring-panel">
        <h3 className="tech-group-title">City identity</h3>
        <div className="hiring-fields">
          <TextField
            label="City name"
            placeholder={city.name}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFeedback(null);
            }}
          />
        </div>
        <div className="hiring-action">
          <Button variant="primary" onClick={rename} disabled={name.trim().length === 0}>
            <Buildings size={14} aria-hidden="true" /> Rename city
          </Button>
        </div>
        {feedback ? (
          <p className="hiring-feedback hiring-feedback--success" role="status">
            {feedback}
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------------ district management */}
      <div className="region-grid">
        {districtMetrics.map(({ district, metrics }) => (
          <article key={district.id} className="region-card">
            <header className="region-head">
              <div>
                <h3 className="region-name">{district.name}</h3>
                <span className="region-id text-mono">{district.id}</span>
              </div>
              <Badge variant="brand">{district.type}</Badge>
            </header>

            <div className="region-indicators">
              <IndicatorBar label="Development" value={district.development} />
              <IndicatorBar
                label="Capacity Provided"
                value={metrics.infrastructureCapacity.electricity}
                max={Math.max(
                  metrics.infrastructureCapacity.electricity,
                  statistics.infrastructure.capacity.electricity,
                  1,
                )}
                tone="purple"
              />
            </div>

            <footer className="region-foot">
              <span className="region-trend text-mono">
                {metrics.availablePlots}/{metrics.plotCount} plots free
              </span>
              <span className="region-stability text-mono">
                {metrics.operationalBuildingCount}/{metrics.buildingCount} running
              </span>
            </footer>

            <div className="tech-meta">
              <span>Housing {Math.round(metrics.housingCapacity)}</span>
              <span>Positions {Math.round(metrics.employmentCapacity)}</span>
              <span>Owned {metrics.ownedPlots}</span>
            </div>
          </article>
        ))}
      </div>

      {/* ------------------------------------------------------- infrastructure */}
      <h3 className="tech-group-title">Urban Infrastructure</h3>
      <div className="tech-grid">
        {INFRASTRUCTURE_KEYS.map((key: InfrastructureKey) => {
          const capacity = statistics.infrastructure.capacity[key];
          const demand = statistics.infrastructure.demand[key];
          const shortage = statistics.infrastructure.shortages[key];
          const utilization = statistics.infrastructure.utilization[key];

          return (
            <article key={key} className="tech-card">
              <header className="tech-head">
                <div className="tech-title-block">
                  <span className="tech-name">{networkLabel(key)}</span>
                  <span className="tech-description">
                    {Math.round(capacity)} capacity · {Math.round(demand)} demand
                  </span>
                </div>
                <Badge variant={shortage > 0 ? 'danger' : 'ok'}>
                  {shortage > 0 ? `short ${Math.round(shortage)}` : 'balanced'}
                </Badge>
              </header>
              <IndicatorBar label="Utilisation" value={utilization} tone={shortage > 0 ? 'warning' : 'success'} />
            </article>
          );
        })}
      </div>

      <div className="stat-grid">
        <StatCard
          label="Operating Cost"
          value={`${BASE_CURRENCY_SYMBOL}${statistics.operatingCostPerHour.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}/h`}
          hint="Running city buildings"
          icon={Factory}
        />
        <StatCard
          label="Industrial Capacity"
          value={Math.round(statistics.industrialCapacity)}
          hint="Units per batch"
          icon={Factory}
          tone="accent"
        />
        <StatCard
          label="Research Capacity"
          value={statistics.researchCapacity.toFixed(1)}
          icon={ChartLine}
        />
        <StatCard
          label="Commercial Activity"
          value={statistics.commercialActivity.toFixed(1)}
          icon={Buildings}
          tone="accent"
        />
      </div>
    </section>
  );
}

/** Human readable label of an infrastructure network. */
function networkLabel(key: InfrastructureKey): string {
  switch (key) {
    case 'electricity':
      return 'Electricity';
    case 'water':
      return 'Water';
    case 'logistics':
      return 'Logistics';
    default:
      return 'Civic Services';
  }
}
