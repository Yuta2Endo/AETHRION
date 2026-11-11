import { useMemo, useState } from 'react';
import { Hammer, Pause, Play, Trash, X } from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, SelectField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectCity, selectPlayerCorporation, selectTechnologyState } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import {
  BUILDING_DEFINITIONS,
  isDistrictCompatible,
  isZoningCompatible,
  type BuildingDefinition,
  type CityBuilding,
} from '@/simulation/city';

/**
 * Construction and Buildings.
 *
 * The building catalogue with its costs, durations, requirements and
 * compatibility, plus the list of the buildings the corporation owns. Every
 * control performs a real action through the command layer.
 */
export function CityConstructionSection() {
  const city = useGameStore(selectCity);
  const corporation = useGameStore(selectPlayerCorporation);
  const technology = useGameStore(selectTechnologyState);
  const [buildingTypeId, setBuildingTypeId] = useState<string>('residential-complex');
  const [plotId, setPlotId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const definition = useMemo(
    () => BUILDING_DEFINITIONS.find((entry) => entry.id === buildingTypeId),
    [buildingTypeId],
  );

  /** The owned plots the selected building may be built on. */
  const compatiblePlots = useMemo(() => {
    if (!city || !definition) return [];
    return city.plots.filter((plot) => {
      if (plot.status !== 'owned') return false;
      if (!isZoningCompatible(definition, plot.zoning)) return false;
      const district = city.districts.find((candidate) => candidate.id === plot.districtId);
      if (!district) return false;
      return isDistrictCompatible(definition, district.type);
    });
  }, [city, definition]);

  if (!city) return null;

  const construct = (): void => {
    const result = commands.startConstruction({ buildingTypeId, plotId });
    setFeedback(
      result.ok ? 'The construction has started.' : result.error.message,
    );
    if (result.ok) setPlotId('');
  };

  return (
    <section className="section-block" aria-label="City construction">
      <h2 className="section-title">
        <Hammer size={18} aria-hidden="true" /> Construction
      </h2>

      {/* ------------------------------------------------------ the catalogue */}
      <div className="tech-grid">
        {BUILDING_DEFINITIONS.map((entry) => {
          const locked = isLocked(entry, technology.unlocked, corporation?.tierId);
          return (
            <article
              key={entry.id}
              className={`tech-card ${locked ? 'tech-card--locked' : ''}`}
            >
              <header className="tech-head">
                <div className="tech-title-block">
                  <span className="tech-name">{entry.name}</span>
                  <span className="tech-description">{entry.description}</span>
                </div>
                <Badge variant={locked ? 'pending' : 'brand'}>{entry.category}</Badge>
              </header>

              <div className="tech-meta">
                <span>
                  {BASE_CURRENCY_SYMBOL}
                  {entry.constructionCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span>{Math.round(entry.constructionDurationMs / 3_600_000)} h</span>
                <span>{entry.workforceCapacity} jobs</span>
                <span>
                  {BASE_CURRENCY_SYMBOL}
                  {entry.operatingCostPerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  /h
                </span>
              </div>

              <div className="tech-description">
                Districts: {entry.compatibleDistricts.join(', ')} · Zoning:{' '}
                {entry.compatibleZoning.join(', ')}
              </div>

              <div className="tech-description">{describeEffects(entry)}</div>

              {locked ? (
                <div className="tech-prereq tech-prereq--locked">{locked}</div>
              ) : null}
            </article>
          );
        })}
      </div>

      {/* -------------------------------------------------- the build command */}
      <div className="hiring-panel">
        <h3 className="tech-group-title">Start a construction</h3>
        <div className="hiring-fields">
          <SelectField
            label="Building"
            options={BUILDING_DEFINITIONS.map((entry) => ({
              value: entry.id,
              label: `${entry.name} — ${BASE_CURRENCY_SYMBOL}${entry.constructionCost.toLocaleString(
                undefined,
                { maximumFractionDigits: 0 },
              )}`,
            }))}
            value={buildingTypeId}
            onChange={(event) => {
              setBuildingTypeId(event.target.value);
              setPlotId('');
              setFeedback(null);
            }}
          />
          <SelectField
            label="Plot"
            options={
              compatiblePlots.length > 0
                ? compatiblePlots.map((plot) => {
                    const district = city.districts.find(
                      (candidate) => candidate.id === plot.districtId,
                    );
                    return {
                      value: plot.id,
                      label: `${plot.id} — ${district?.name ?? plot.districtId} (${plot.zoning})`,
                    };
                  })
                : [{ value: '', label: 'No compatible owned plot' }]
            }
            value={plotId}
            onChange={(event) => {
              setPlotId(event.target.value);
              setFeedback(null);
            }}
          />
        </div>
        <div className="hiring-action">
          <Button
            variant="primary"
            onClick={construct}
            disabled={!plotId || !corporation}
          >
            <Hammer size={14} aria-hidden="true" /> Start construction
          </Button>
        </div>
        {feedback ? (
          <p className="hiring-feedback hiring-feedback--success" role="status">
            {feedback}
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------------------ the buildings */}
      <h3 className="tech-group-title">City Buildings</h3>
      {city.buildings.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No buildings yet</p>
          <p className="empty-note">
            Acquire a plot and start a construction to develop the city.
          </p>
        </div>
      ) : (
        <div className="facility-grid">
          {city.buildings.map((building) => (
            <BuildingCard key={building.id} building={building} />
          ))}
        </div>
      )}
    </section>
  );
}

/** A single city building with its lifecycle controls. */
function BuildingCard({ building }: { building: CityBuilding }) {
  const city = useGameStore(selectCity);
  const district = city?.districts.find((candidate) => candidate.id === building.districtId);

  const suspend = (): void => {
    commands.suspendBuilding(building.id);
  };
  const resume = (): void => {
    commands.resumeBuilding(building.id);
  };
  const cancel = (): void => {
    commands.cancelConstruction(building.id);
  };
  const demolish = (): void => {
    commands.demolishBuilding(building.id);
  };

  const constructing = building.status === 'constructing' || building.status === 'planned';

  return (
    <article className="facility-card">
      <header className="tech-head">
        <div className="tech-title-block">
          <span className="tech-name">{building.name}</span>
          <span className="tech-description">
            {district?.name ?? building.districtId} · plot {building.plotId}
          </span>
        </div>
        <Badge variant={statusVariant(building.status)}>{building.status}</Badge>
      </header>

      {constructing ? (
        <IndicatorBar label="Construction" value={building.progress * 100} tone="cyan" />
      ) : null}

      <div className="tech-meta">
        <span>{building.workforceCapacity} positions</span>
        <span>
          {BASE_CURRENCY_SYMBOL}
          {building.operatingCostPerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          /h
        </span>
        <span>
          Infrastructure {building.infrastructureSatisfied ? 'served' : 'short'}
        </span>
      </div>

      <div className="tech-description">
        Electricity {building.infrastructureDemand.electricity} · Water{' '}
        {building.infrastructureDemand.water} · Logistics {building.infrastructureDemand.logistics} ·
        Services {building.infrastructureDemand.publicServices}
      </div>

      <div className="tech-description">{describeBuildingEffects(building)}</div>

      <div className="tech-actions">
        {constructing ? (
          <button type="button" className="link-button" onClick={cancel}>
            <X size={12} aria-hidden="true" /> Cancel
          </button>
        ) : null}
        {building.status === 'suspended' ? (
          <button type="button" className="link-button" onClick={resume}>
            <Play size={12} aria-hidden="true" /> Resume
          </button>
        ) : null}
        {building.status === 'operational' || building.status === 'completed' ? (
          <button type="button" className="link-button" onClick={suspend}>
            <Pause size={12} aria-hidden="true" /> Suspend
          </button>
        ) : null}
        {building.status !== 'demolished' && !constructing ? (
          <button type="button" className="link-button" onClick={demolish}>
            <Trash size={12} aria-hidden="true" /> Demolish
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** The badge variant of a building status. */
function statusVariant(
  status: CityBuilding['status'],
): 'ok' | 'pending' | 'brand' | 'warning' | 'danger' {
  switch (status) {
    case 'operational':
      return 'ok';
    case 'constructing':
    case 'planned':
      return 'brand';
    case 'suspended':
      return 'warning';
    case 'demolished':
      return 'danger';
    default:
      return 'pending';
  }
}

/** A short description of the effects of a building definition. */
function describeEffects(definition: BuildingDefinition): string {
  const parts: string[] = [];
  const { effects } = definition;

  if (effects.populationCapacity > 0) parts.push(`housing ${effects.populationCapacity}`);
  if (effects.productionCapacity > 0) parts.push(`production ${effects.productionCapacity}`);
  if (effects.researchCapacity > 0) parts.push(`research ${effects.researchCapacity}`);
  if (effects.commercialActivity > 0) parts.push(`commerce ${effects.commercialActivity}`);
  if (effects.prosperity > 0) parts.push(`prosperity ${effects.prosperity}`);
  if (effects.environmentImpact !== 0) {
    parts.push(`environment ${effects.environmentImpact > 0 ? '+' : ''}${effects.environmentImpact}`);
  }

  const provided = effects.infrastructureProvided;
  if (provided.electricity > 0) parts.push(`power +${provided.electricity}`);
  if (provided.water > 0) parts.push(`water +${provided.water}`);
  if (provided.logistics > 0) parts.push(`logistics +${provided.logistics}`);
  if (provided.publicServices > 0) parts.push(`services +${provided.publicServices}`);

  return parts.length > 0 ? parts.join(' · ') : 'No direct urban effect';
}

/** A short description of the effects of a running building. */
function describeBuildingEffects(building: CityBuilding): string {
  const definition = BUILDING_DEFINITIONS.find((entry) => entry.id === building.typeId);
  return definition ? describeEffects(definition) : 'No direct urban effect';
}

/**
 * The requirement that still locks a building definition, or null when the
 * definition may be built.
 */
function isLocked(
  definition: BuildingDefinition,
  unlocked: readonly string[],
  tierId?: string,
): string | null {
  const requirements = definition.unlockRequirements;
  if (!requirements) return null;

  const missing = (requirements.technologies ?? []).filter((id) => !unlocked.includes(id));
  if (missing.length > 0) {
    return `Requires the ${missing.join(', ')} technology`;
  }

  if (requirements.corporationTier && tierId && requirements.corporationTier !== tierId) {
    return `Requires the ${requirements.corporationTier} corporation tier`;
  }

  return null;
}
