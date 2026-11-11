/**
 * Global event commands — the player responses and the news feed.
 *
 * The commands are the only entry point for the player actions of the global
 * events. Every command validates its input, applies the domain rules and
 * writes the result to the game state exactly once. A failed command leaves
 * the game state completely unchanged.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import {
  applyEventResponse,
  getEventDefinition,
  markNewsRead,
  type ActiveEvent,
  type EventResponseDefinition,
  type NewsItem,
} from '@/simulation/events';
import { getResourceDefinition, getResourceUnitPrice, purchaseResource } from '@/simulation/resources';
import {
  chargeCorporation,
  failure,
  logCommandRejection,
  requireCorporation,
  storeCorporation,
} from './shared';

/**
 * The responses of an active event that the player can still choose.
 */
export function getAvailableResponses(event: ActiveEvent): EventResponseDefinition[] {
  const definition = getEventDefinition(event.definitionId);
  if (!definition || !definition.responses) return [];
  return definition.responses.filter(
    (response) => !event.appliedResponseIds.includes(response.id),
  );
}

/**
 * The player answers an active global event.
 *
 * The cost is charged through the corporate ledger. When the response also
 * buys resources, they are delivered through the Resource Engine — the whole
 * operation is atomic: a failure leaves neither the inventory nor the balance
 * changed.
 */
export function respondToEventCommand(
  eventId: string,
  responseId: string,
): Result<ActiveEvent, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const applied = applyEventResponse(store.events, eventId, responseId);
  if (!applied.ok) {
    logCommandRejection('respondToEvent', applied.error);
    return applied;
  }

  const definition = getEventDefinition(applied.value.event.definitionId);
  const response = definition?.responses?.find((candidate) => candidate.id === responseId);
  if (!response) {
    return failure('EVENT_RESPONSE_UNKNOWN', `Unknown response "${responseId}".`);
  }

  // The optional resource purchase of the response.
  let resources = store.resources;
  let totalCost = response.cost;

  if (response.resourcePurchase) {
    const { resourceId, quantity } = response.resourcePurchase;
    const resourceDefinition = getResourceDefinition(resourceId);
    if (!resourceDefinition) {
      return failure('RESOURCE_UNKNOWN', `Unknown resource "${resourceId}".`);
    }
    const unitPrice = getResourceUnitPrice(resourceDefinition, store.economy);

    const purchase = purchaseResource(store.resources, {
      resourceId,
      quantity,
      unitPrice,
      availableFunds: corporation.finances.balance,
      simTimeMs: store.simulation.simTimeMs,
    });

    if (!purchase.ok) {
      logCommandRejection('respondToEvent', purchase.error);
      return purchase;
    }

    resources = purchase.value.state;
    totalCost = response.cost + purchase.value.totalCost;
  }

  const charged = chargeCorporation(corporation, {
    type: response.resourcePurchase ? 'resource' : 'operating',
    amount: -totalCost,
    description: `Event response — ${response.label}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logCommandRejection('respondToEvent', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  store.applyResourceState(resources);
  store.applyEventsState(applied.value.state);

  logger.info('Event answered', { eventId, responseId, cost: totalCost });
  return { ok: true, value: applied.value.event };
}

/**
 * Marks a news item as read.
 */
export function markNewsReadCommand(newsId: string): Result<NewsItem, AppError> {
  const store = useGameStore.getState();

  const result = markNewsRead(store.events, newsId);
  if (!result.ok) {
    logCommandRejection('markNewsRead', result.error);
    return result;
  }

  store.applyEventsState(result.value);

  const item = result.value.news.find((candidate) => candidate.id === newsId);
  if (!item) {
    return failure('NEWS_NOT_FOUND', `No news item with id "${newsId}".`);
  }

  return { ok: true, value: item };
}
