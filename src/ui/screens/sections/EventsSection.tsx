import { useMemo, useState } from 'react';
import {
  Broadcast,
  CheckCircle,
  Clock,
  Megaphone,
  Newspaper,
  Siren,
  Timer,
} from '@phosphor-icons/react';
import { Badge, Button, IndicatorBar } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import {
  selectActiveEvents,
  selectEventHistory,
  selectNews,
  selectSimulationTime,
} from '@/game/state/selectors';
import { commands, getAvailableResponses } from '@/game/commands';
import { formatGameDateShort, toGameDate } from '@/game/clock/gameClock';
import { getEventDefinition, type EventEffectDefinition } from '@/simulation/events';

/**
 * Global Events section.
 *
 * Shows the active events with their real effects and the responses the
 * player may choose, the history of the events that ended and the news feed.
 * Every control performs a real action through the command layer.
 */
export function EventsSection() {
  const activeEvents = useGameStore(selectActiveEvents);
  const history = useGameStore(selectEventHistory);
  const news = useGameStore(selectNews);
  const simTimeMs = useGameStore(selectSimulationTime);
  const [feedback, setFeedback] = useState<string | null>(null);

  const unreadCount = useMemo(() => news.filter((item) => !item.read).length, [news]);

  const respond = (eventId: string, responseId: string): void => {
    const result = commands.respondToEvent(eventId, responseId);
    setFeedback(result.ok ? 'The response has been committed.' : result.error.message);
  };

  const markRead = (newsId: string): void => {
    const result = commands.markNewsRead(newsId);
    if (!result.ok) setFeedback(result.error.message);
  };

  return (
    <section className="section-block" aria-label="Global events">
      <h2 className="section-title">
        <Siren size={18} aria-hidden="true" /> Global Events
        {unreadCount > 0 ? (
          <span className="section-badge text-mono">{unreadCount} new</span>
        ) : null}
      </h2>

      {activeEvents.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No global event active</p>
          <p className="empty-note">
            The world conditions are stable. Events appear when the markets or the technology
            landscape shift.
          </p>
        </div>
      ) : (
        <div className="event-grid">
          {activeEvents.map((event) => {
            const definition = getEventDefinition(event.definitionId);
            const responses = getAvailableResponses(event);
            const total = Math.max(1, event.endsAtSimMs - event.startedAtSimMs);
            const elapsed = Math.min(total, Math.max(0, simTimeMs - event.startedAtSimMs));
            const remaining = Math.max(0, event.endsAtSimMs - simTimeMs);

            return (
              <article key={event.id} className="event-card">
                <header className="order-head">
                  <span className="order-name">{event.name}</span>
                  <div className="event-badges">
                    <Badge variant="brand">{event.category}</Badge>
                    <Badge
                      variant={
                        event.severity === 'high'
                          ? 'danger'
                          : event.severity === 'medium'
                            ? 'warning'
                            : 'pending'
                      }
                    >
                      {event.severity}
                    </Badge>
                  </div>
                </header>

                <p className="tech-description">
                  {definition?.description ?? 'An event shakes the world.'}
                </p>

                <IndicatorBar
                  label="Elapsed"
                  value={(elapsed / total) * 100}
                  tone={event.severity === 'high' ? 'warning' : 'cyan'}
                />

                <div className="tech-meta">
                  <span>
                    <Timer size={12} aria-hidden="true" /> {Math.ceil(remaining / 3_600_000)} h left
                  </span>
                  <span>
                    <Clock size={12} aria-hidden="true" /> {event.id}
                  </span>
                </div>

                <div className="tech-description">
                  {definition ? describeEffects(definition.effects) : 'No effects recorded.'}
                </div>

                {responses.length > 0 ? (
                  <div className="event-responses">
                    <span className="tech-group-title">Your response</span>
                    {responses.map((response) => (
                      <div key={response.id} className="event-response">
                        <div className="event-response-text">
                          <span className="tech-name">{response.label}</span>
                          <span className="tech-description">{response.description}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => respond(event.id, response.id)}
                        >
                          <Megaphone size={12} aria-hidden="true" /> Commit
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tech-description">
                    {event.appliedResponseIds.length > 0
                      ? 'The response has been committed.'
                      : 'No response is available for this event.'}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {feedback ? (
        <p className="hiring-feedback hiring-feedback--success" role="status">
          {feedback}
        </p>
      ) : null}

      {/* ------------------------------------------------------------- history */}
      {history.length > 0 ? (
        <>
          <h3 className="tech-group-title">Event History</h3>
          <div className="event-history">
            {history
              .slice()
              .reverse()
              .map((entry) => (
                <div key={entry.id} className="event-history-row">
                  <span className="text-mono">{formatGameDateShort(toGameDate(entry.endedAtSimMs))}</span>
                  <span>{entry.name}</span>
                  <Badge variant={entry.responded ? 'ok' : 'pending'}>
                    {entry.responded ? 'answered' : 'ignored'}
                  </Badge>
                </div>
              ))}
          </div>
        </>
      ) : null}

      {/* --------------------------------------------------------------- news */}
      <h3 className="tech-group-title">
        <Newspaper size={14} aria-hidden="true" /> News Feed
      </h3>
      {news.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No news yet</p>
          <p className="empty-note">
            The feed reports the global events, the decisions of the competitors and the
            technological breakthroughs of the sector.
          </p>
        </div>
      ) : (
        <div className="news-list">
          {news
            .slice()
            .reverse()
            .map((item) => (
              <article key={item.id} className={`news-item ${item.read ? 'news-item--read' : ''}`}>
                <div className="news-head">
                  <Badge
                    variant={
                      item.severity === 'high'
                        ? 'danger'
                        : item.severity === 'medium'
                          ? 'warning'
                          : item.severity === 'low'
                            ? 'pending'
                            : 'brand'
                    }
                  >
                    {item.category}
                  </Badge>
                  <span className="news-time text-mono">
                    {formatGameDateShort(toGameDate(item.simTimeMs))}
                  </span>
                  {!item.read ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => markRead(item.id)}
                      aria-label={`Mark "${item.headline}" as read`}
                    >
                      <CheckCircle size={12} aria-hidden="true" /> Mark read
                    </button>
                  ) : null}
                </div>
                <h4 className="news-headline">{item.headline}</h4>
                <p className="news-description">{item.description}</p>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}

/**
 * A short, readable summary of the effects of an event.
 */
function describeEffects(effects: EventEffectDefinition[]): string {
  const parts = effects.map((effect) => {
    const sign = effect.multiplier !== undefined && effect.multiplier >= 1 ? '+' : '';
    const value =
      effect.multiplier !== undefined
        ? `${sign}${Math.round((effect.multiplier - 1) * 100)}%`
        : `${effect.pressure !== undefined && effect.pressure >= 0 ? '+' : ''}${Math.round(
            (effect.pressure ?? 0) * 100,
          )}%`;

    const scope = effect.category ? ` (${effect.category})` : '';

    switch (effect.type) {
      case 'commodity-demand':
        return `commodity demand ${value}${scope}`;
      case 'commodity-supply':
        return `commodity supply ${value}${scope}`;
      case 'operating-cost':
        return `operating costs ${value}`;
      case 'research-speed':
        return `research speed ${value}`;
      case 'production-efficiency':
        return `production output ${value}`;
      case 'market-demand':
        return `market demand ${value}`;
      case 'city-infrastructure-pressure':
        return `city infrastructure pressure ${value}`;
      case 'city-environment-pressure':
        return `city environment pressure ${value}`;
      case 'city-commercial-activity':
        return `city commerce ${value}`;
      default:
        return `competitor activity ${value}`;
    }
  });

  return parts.join(' · ');
}

/** The icon of the section — kept for the design system consistency. */
export const EventsSectionIcon = Broadcast;
