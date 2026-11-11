import { useMemo } from 'react';
import {
  ChartLine,
  Clock,
  Coins,
  Globe,
  House,
  Pause,
  Play,
  ShieldCheck,
  Stop,
  Target,
} from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, MarketValue, StatCard } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import {
  selectCommodities,
  selectEconomy,
  selectSimulationDate,
  selectSimulationSpeed,
  selectSimulationStatus,
  selectSimulationTick,
  selectWorld,
} from '@/game/state/selectors';
import { SIMULATION_SPEEDS, simulation } from '@/game/simulationRunner';
import { formatGameDate } from '@/game/clock/gameClock';
import { getEconomyMetrics, getImbalance } from '@/simulation/economy';
import { getWorldMetrics, type RegionTier } from '@/simulation/world';
import { CorporationOverview } from '@/ui/screens/sections/CorporationOverview';
import { CityConstructionSection } from '@/ui/screens/sections/CityConstructionSection';
import { CityLandSection } from '@/ui/screens/sections/CityLandSection';
import { CityOverviewSection } from '@/ui/screens/sections/CityOverviewSection';
import { CompetitorOverviewSection } from '@/ui/screens/sections/CompetitorOverviewSection';
import { DiagnosticsSection } from '@/ui/screens/sections/DiagnosticsSection';
import { EmployeeManagement } from '@/ui/screens/sections/EmployeeManagement';
import { EventsSection } from '@/ui/screens/sections/EventsSection';
import { FinanceOverview } from '@/ui/screens/sections/FinanceOverview';
import { HiringPanel } from '@/ui/screens/sections/HiringPanel';
import { ManufacturingSection } from '@/ui/screens/sections/ManufacturingSection';
import { MarketSection } from '@/ui/screens/sections/MarketSection';
import { ProductSection } from '@/ui/screens/sections/ProductSection';
import { ResourceSection } from '@/ui/screens/sections/ResourceSection';
import { TechnologySection } from '@/ui/screens/sections/TechnologySection';
import type { SimulationStatus } from '@/core/types';

/**
 * AETHRION Empire Dashboard.
 *
 * Every value rendered here is read from the live simulation state — there is
 * no decorative or placeholder data.
 */
export function Dashboard() {
  const status = useGameStore(selectSimulationStatus);
  const tick = useGameStore(selectSimulationTick);
  const speed = useGameStore(selectSimulationSpeed);
  const date = useGameStore(selectSimulationDate);
  const world = useGameStore(selectWorld);
  const economy = useGameStore(selectEconomy);
  const commodities = useGameStore(selectCommodities);

  const worldMetrics = useMemo(() => getWorldMetrics(world), [world]);
  const economyMetrics = useMemo(() => getEconomyMetrics(economy), [economy]);

  const baseSymbol = economy.currencies[0]?.symbol ?? 'AΞ';

  return (
    <div className="dashboard-screen">
      <header className="dashboard-header">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">AETHRION</div>
            <div className="brand-slogan">BUILD YOUR EMPIRE. SHAPE THE FUTURE.</div>
          </div>
        </div>
        <div className="dashboard-actions">
          <div className="stat">
            <div className="stat-value text-mono">{formatGameDate(date)}</div>
            <div className="stat-label">
              <Clock size={12} weight="bold" aria-hidden="true" /> Simulated date
            </div>
          </div>
        </div>
      </header>

      <section className="dashboard-intro">
        <h1>Command Center</h1>
        <p>
          Live simulation state — world development and market activity, driven by the
          Game Core tick loop.
        </p>
      </section>

      {/* ------------------------------------------------ simulation controls */}
      <section className="panel sim-panel" aria-label="Simulation controls">
        <div className="sim-status">
          <StatusBadge status={status} />
          <div className="sim-meta">
            <span className="sim-tick text-mono">TICK {tick}</span>
            <span className="sim-speed text-mono">{speed}x</span>
          </div>
        </div>

        <div className="sim-actions">
          <Button
            size="sm"
            variant="primary"
            onClick={() => simulation.start()}
            disabled={status === 'running'}
          >
            <Play size={14} weight="fill" aria-hidden="true" /> Start
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => simulation.pause()}
            disabled={status !== 'running'}
          >
            <Pause size={14} weight="fill" aria-hidden="true" /> Pause
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => simulation.resume()}
            disabled={status !== 'paused'}
          >
            <Play size={14} weight="fill" aria-hidden="true" /> Resume
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => simulation.stop()}
            disabled={status !== 'running' && status !== 'paused'}
          >
            <Stop size={14} weight="fill" aria-hidden="true" /> Stop
          </Button>
        </div>

        <div className="sim-speeds" role="group" aria-label="Simulation speed">
          {SIMULATION_SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              className={`speed-chip ${speed === option ? 'active' : ''}`}
              aria-pressed={speed === option}
              onClick={() => simulation.setSpeed(option)}
            >
              {option}x
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ corporation overview */}
      <CorporationOverview />

      {/* ------------------------------------------------- technology & research */}
      <TechnologySection />

      {/* ---------------------------------------------------- product development */}
      <ProductSection />

      {/* ------------------------------------------------------ resource inventory */}
      <ResourceSection />

      {/* ---------------------------------------------------------- manufacturing */}
      <ManufacturingSection />

      {/* ------------------------------------------------------ products & market */}
      <MarketSection />

      {/* ---------------------------------------------------- employee management */}
      <EmployeeManagement />

      {/* ------------------------------------------------------------- hiring */}
      <HiringPanel />

      {/* ------------------------------------------------------ finance overview */}
      <FinanceOverview />

      {/* ---------------------------------------------------------- city engine */}
      <CityOverviewSection />

      <CityLandSection />

      <CityConstructionSection />

      {/* ----------------------------------------------------- global events */}
      <EventsSection />

      {/* --------------------------------------------------------- competitors */}
      <CompetitorOverviewSection />

      {/* ------------------------------------------------------ diagnostics */}
      <DiagnosticsSection />

      {/* ------------------------------------------------------ world overview */}
      <section className="section-block" aria-label="World overview">
        <h2 className="section-title">
          <Globe size={18} aria-hidden="true" /> World Overview
        </h2>
        <div className="world-summary">
          <StatCard
            label="Avg Development"
            value={worldMetrics.averageDevelopment}
            icon={ChartLine}
            tone="accent"
          />
          <StatCard
            label="Avg Infrastructure"
            value={worldMetrics.averageInfrastructure}
            icon={House}
          />
          <StatCard
            label="Avg Research"
            value={worldMetrics.averageResearchCapacity}
            icon={Target}
          />
          <StatCard
            label="Avg Stability"
            value={worldMetrics.averageStability}
            icon={ShieldCheck}
          />
        </div>

        <div className="region-grid">
          {world.regions.map((region) => (
            <article key={region.id} className="region-card">
              <header className="region-head">
                <div>
                  <h3 className="region-name">{region.name}</h3>
                  <span className="region-id text-mono">{region.id}</span>
                </div>
                <Badge variant={tierVariant(region.tier)}>{region.tier}</Badge>
              </header>

              <div className="region-indicators">
                <IndicatorBar label="Development" value={region.indicators.development} />
                <IndicatorBar
                  label="Infrastructure"
                  value={region.indicators.infrastructure}
                  tone="purple"
                />
                <IndicatorBar
                  label="Research"
                  value={region.indicators.researchCapacity}
                  tone="success"
                />
                <IndicatorBar
                  label="Market Activity"
                  value={region.indicators.marketActivity}
                  tone="warning"
                />
              </div>

              <footer className="region-foot">
                <span className="region-trend text-mono">
                  {region.developmentTrend >= 0 ? '+' : ''}
                  {region.developmentTrend.toFixed(2)} /h
                </span>
                <span className="region-stability text-mono">
                  stability {Math.round(region.stability * 100)}%
                </span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- economy overview */}
      <section className="section-block" aria-label="Economy overview">
        <h2 className="section-title">
          <Coins size={18} aria-hidden="true" /> Economy Overview
        </h2>
        <div className="world-summary">
          <StatCard
            label="Market Value"
            value={economyMetrics.totalMarketValue.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
            hint={`${economyMetrics.commodityCount} commodities`}
            icon={Coins}
            tone="brand"
          />
          <StatCard
            label="Avg Price Change"
            value={`${economyMetrics.averagePriceChange.toFixed(2)}%`}
            icon={ChartLine}
            tone="accent"
          />
          <StatCard
            label="Supply Index"
            value={economyMetrics.globalSupplyIndex.toFixed(1)}
            icon={Globe}
          />
          <StatCard
            label="Demand Index"
            value={economyMetrics.globalDemandIndex.toFixed(1)}
            icon={Target}
            tone="accent"
          />
        </div>

        <div className="market-list">
          <div className="market-head" aria-hidden="true">
            <span>Commodity</span>
            <span>Price</span>
            <span>Change</span>
            <span>Pressure</span>
          </div>
          {commodities.map((commodity) => {
            const previous =
              commodity.history.length > 1
                ? commodity.history[commodity.history.length - 2]
                : commodity.price;
            const changePercent =
              previous !== 0 ? ((commodity.price - previous) / previous) * 100 : 0;

            return (
              <MarketValue
                key={commodity.id}
                name={commodity.name}
                category={commodity.category}
                price={commodity.price}
                symbol={baseSymbol}
                changePercent={changePercent}
                imbalance={getImbalance(commodity)}
              />
            );
          })}
        </div>
      </section>

      <footer className="dashboard-footer">
        <div className="badge brand-badge">Premium Neon Sci-Fi</div>
        <div className="version-text">
          AETHRION v0.7.0 — Stage 07 Performance &amp; Web Workers
        </div>
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: SimulationStatus }) {
  switch (status) {
    case 'running':
      return <Badge variant="ok">Running</Badge>;
    case 'paused':
      return <Badge variant="pending">Paused</Badge>;
    case 'stopped':
      return <Badge variant="danger">Stopped</Badge>;
    default:
      return <Badge variant="brand">Idle</Badge>;
  }
}

function tierVariant(tier: RegionTier): 'ok' | 'pending' | 'brand' | 'warning' {
  switch (tier) {
    case 'core':
      return 'brand';
    case 'developed':
      return 'ok';
    case 'emerging':
      return 'pending';
    default:
      return 'warning';
  }
}
