import { useMemo, useState } from 'react';
import {
  Buildings,
  ChartLine,
  Coins,
  Cpu,
  Flag,
  Gauge,
  Skull,
  Sparkle,
  Target,
} from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar, StatCard } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectCompetitors, selectSimulationTime } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import {
  getCompetitorTechnologyProgress,
  getPersonalityProfile,
  type Competitor,
} from '@/simulation/competitors';
import { formatGameDateShort, toGameDate } from '@/game/clock/gameClock';

/**
 * Competitor Overview section.
 *
 * Shows the three AI corporations with their real financial state, their
 * market presence, their technology progress and their current objective.
 */
export function CompetitorOverviewSection() {
  const competitors = useGameStore(selectCompetitors);
  const simTimeMs = useGameStore(selectSimulationTime);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selected = useMemo(
    () => competitors.find((competitor) => competitor.id === selectedId) ?? null,
    [competitors, selectedId],
  );

  const inspect = (competitorId: string): void => {
    const result = commands.getCompetitor({ competitorId });
    setFeedback(
      result.ok
        ? `${result.value.name} — ${result.value.objective.label}.`
        : result.error.message,
    );
    setSelectedId(competitorId);
  };

  return (
    <section className="section-block" aria-label="Competitor overview">
      <h2 className="section-title">
        <Buildings size={18} aria-hidden="true" /> Competitor Overview
      </h2>

      <div className="competitor-grid">
        {competitors.map((competitor) => {
          const profile = getPersonalityProfile(competitor.currentPersonality);
          const research = getCompetitorTechnologyProgress(competitor);

          return (
            <article key={competitor.id} className="competitor-card">
              <header className="order-head">
                <span className="order-name">{competitor.name}</span>
                <Badge variant="brand">{competitor.tierId}</Badge>
              </header>

              <p className="tech-description">{competitor.specialization}</p>
              <p className="tech-description">Strategy — {competitor.strategy}</p>

              <div className="event-badges">
                <Badge variant="pending">{competitor.currentPersonality}</Badge>
                <Badge variant="ok">reputation {Math.round(competitor.reputation)}</Badge>
              </div>

              <IndicatorBar label="Market presence" value={competitor.marketPresence} />
              <IndicatorBar
                label="Financial stability"
                value={competitor.finances.stability}
                tone={competitor.finances.stability < 35 ? 'warning' : 'success'}
              />

              <div className="tech-meta">
                <span>
                  <Coins size={12} aria-hidden="true" />{' '}
                  {BASE_CURRENCY_SYMBOL}
                  {competitor.finances.balance.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span>
                  <Cpu size={12} aria-hidden="true" /> {research.unlocked} tech
                </span>
                <span>
                  <Gauge size={12} aria-hidden="true" /> {competitor.commodityCategories.length}{' '}
                  categories
                </span>
              </div>

              <div className="competitor-objective">
                <span className="tech-group-title">Current objective</span>
                <span className="tech-name">{competitor.objective.label}</span>
                <span className="tech-description">
                  Priority {Math.round(competitor.objective.priority)}% ·{' '}
                  {profile?.description ?? ''}
                </span>
              </div>

              <div className="tech-actions">
                <Button size="sm" variant="secondary" onClick={() => inspect(competitor.id)}>
                  <Target size={12} aria-hidden="true" /> Inspect dossier
                </Button>
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

      {selected ? (
        <>
          <h3 className="tech-group-title">Competitor Dossier — {selected.name}</h3>
          <CompetitorDossier competitor={selected} simTimeMs={simTimeMs} />
        </>
      ) : null}
    </section>
  );
}

/**
 * The detailed record of one AI corporation.
 */
function CompetitorDossier({
  competitor,
}: {
  competitor: Competitor;
  simTimeMs: number;
}) {
  const research = getCompetitorTechnologyProgress(competitor);
  const lastAction = competitor.history[competitor.history.length - 1];

  return (
    <div className="dossier-grid">
      <div className="stat-grid">
        <StatCard
          label="Balance"
          value={`${BASE_CURRENCY_SYMBOL}${competitor.finances.balance.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`}
          hint={`of ${BASE_CURRENCY_SYMBOL}${competitor.finances.startingCapital.toLocaleString(
            undefined,
            { maximumFractionDigits: 0 },
          )}`}
          icon={Coins}
          tone="brand"
        />
        <StatCard
          label="Net Result"
          value={`${BASE_CURRENCY_SYMBOL}${competitor.finances.netResult.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`}
          hint={`revenue ${BASE_CURRENCY_SYMBOL}${competitor.finances.lifetimeRevenue.toLocaleString(
            undefined,
            { maximumFractionDigits: 0 },
          )}`}
          icon={ChartLine}
          tone={competitor.finances.netResult >= 0 ? 'success' : 'warning'}
        />
        <StatCard
          label="Technologies"
          value={research.unlocked}
          hint={Object.entries(research.byCategory)
            .filter(([, count]) => count > 0)
            .map(([category, count]) => `${category} ${count}`)
            .join(' · ')}
          icon={Sparkle}
        />
        <StatCard
          label="Standing"
          value={Math.round(competitor.relationship.standing)}
          hint={
            competitor.relationship.lastInteractionSimMs !== null
              ? `last move ${formatGameDateShort(toGameDate(competitor.relationship.lastInteractionSimMs))}`
              : 'no contact yet'
          }
          icon={Flag}
          tone={competitor.relationship.standing < 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="tech-grid">
        <article className="tech-card">
          <header className="tech-head">
            <div className="tech-title-block">
              <span className="tech-name">Market activity</span>
              <span className="tech-description">
                {competitor.commodityCategories.join(', ')} · presence{' '}
                {Math.round(competitor.marketPresence)}
              </span>
            </div>
            <Badge variant="ok">active</Badge>
          </header>
          <div className="tech-meta">
            <span>operating cost {BASE_CURRENCY_SYMBOL}{competitor.operations.operatingCostPerHour}/h</span>
            <span>
              price pressure{' '}
              {competitor.operations.pricePressure > 0
                ? '+'
                : ''}
              {competitor.operations.pricePressure.toFixed(2)}
            </span>
            <span>
              competitive pressure{' '}
              {Math.round(competitor.relationship.competitivePressure)}
            </span>
          </div>
        </article>

        <article className="tech-card">
          <header className="tech-head">
            <div className="tech-title-block">
              <span className="tech-name">Research</span>
              <span className="tech-description">
                {competitor.research
                  ? 'A programme is running'
                  : 'No active programme'}
              </span>
            </div>
            <Badge variant={competitor.research ? 'brand' : 'pending'}>
              {competitor.research ? 'running' : 'idle'}
            </Badge>
          </header>
          {competitor.research ? (
            <IndicatorBar
              label="Progress"
              value={competitor.research.progress * 100}
              tone="cyan"
            />
          ) : (
            <p className="tech-description">The corporation is watching the research market.</p>
          )}
        </article>

        <article className="tech-card">
          <header className="tech-head">
            <div className="tech-title-block">
              <span className="tech-name">Recent actions</span>
              <span className="tech-description">
                {competitor.history.length} of a bounded record
              </span>
            </div>
            <Badge variant="ok">{competitor.history.length}</Badge>
          </header>
          {competitor.history.length === 0 ? (
            <p className="tech-description">No significant action yet.</p>
          ) : (
            <div className="tech-meta">
              {competitor.history
                .slice()
                .reverse()
                .slice(0, 4)
                .map((action) => (
                  <span key={action.id}>
                    <Skull size={12} aria-hidden="true" /> {action.description} (
                    {formatGameDateShort(toGameDate(action.simTimeMs))})
                  </span>
                ))}
            </div>
          )}
          {lastAction ? (
            <p className="tech-description">
              The last move was {lastAction.description.toLowerCase()} for{' '}
              {BASE_CURRENCY_SYMBOL}
              {lastAction.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}.
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
