import { describe, it, expect } from 'vitest';
import {
  AI_PERSONALITIES,
  COMPETITOR_ACTION_COOLDOWN_MS,
  COMPETITOR_DECISION_INTERVAL_MS,
  COMPETITOR_DEFINITIONS,
  MAX_COMPETITOR_HISTORY,
  advanceCompetitors,
  buildCompetitorMarketSignal,
  createInitialCompetitorsState,
  evaluateObjectives,
  findCompetitor,
  getCompetitorDefinition,
  getCompetitorOperatingCostPerHour,
  getCompetitorRevenuePerHour,
  getCompetitorStability,
  getCompetitorTechnologyProgress,
  getPersonalityProfile,
  isValidCompetitor,
  isValidCompetitorsState,
  resolvePersonality,
  scoreObjective,
  selectResearchTarget,
  type CompetitorContext,
  type CompetitorsState,
} from '@/simulation/competitors';
import { createNeutralModifiers } from '@/simulation/events';
import { getTechnologyDefinition } from '@/simulation/technology';

const HOUR = 3_600_000;

function context(overrides: Partial<CompetitorContext> = {}): CompetitorContext {
  return {
    tick: 1,
    deltaMs: HOUR,
    simTimeMs: 0,
    marketActivityIndex: 60,
    globalDemandIndex: 100,
    globalSupplyIndex: 100,
    playerPresence: 20,
    modifiers: createNeutralModifiers(),
    hasShortage: false,
    hasSurplus: false,
    ...overrides,
  };
}

/** Advances the competitors by the given number of simulated hours. */
function advanceHours(state: CompetitorsState, hours: number, ctx: Partial<CompetitorContext> = {}): CompetitorsState {
  let working = state;
  for (let hour = 1; hour <= hours; hour += 1) {
    working = advanceCompetitors(
      working,
      context({ deltaMs: HOUR, simTimeMs: hour * HOUR, ...ctx }),
    ).state;
  }
  return working;
}

describe('Competitor AI Engine — initialization', () => {
  it('creates three AI corporations with unique identifiers', () => {
    const state = createInitialCompetitorsState();

    expect(state.competitors).toHaveLength(3);
    expect(new Set(state.competitors.map((competitor) => competitor.id)).size).toBe(3);
    expect(isValidCompetitorsState(state)).toBe(true);
  });

  it('creates the documented corporations', () => {
    const state = createInitialCompetitorsState();
    const names = state.competitors.map((competitor) => competitor.name);

    expect(names).toContain('NEXORA INDUSTRIES');
    expect(names).toContain('VANTEX GLOBAL');
    expect(names).toContain('HELION DYNAMICS');
  });

  it('creates a valid financial model for every corporation', () => {
    const state = createInitialCompetitorsState();

    state.competitors.forEach((competitor) => {
      expect(isValidCompetitor(competitor)).toBe(true);
      expect(competitor.finances.balance).toBe(competitor.finances.startingCapital);
      expect(competitor.finances.balance).toBeGreaterThan(0);
      expect(competitor.finances.stability).toBeGreaterThanOrEqual(0);
      expect(competitor.finances.stability).toBeLessThanOrEqual(100);
    });
  });

  it('produces the same state on every call', () => {
    expect(JSON.stringify(createInitialCompetitorsState())).toBe(
      JSON.stringify(createInitialCompetitorsState()),
    );
  });

  it('defines the three corporations as data', () => {
    expect(COMPETITOR_DEFINITIONS).toHaveLength(3);
    COMPETITOR_DEFINITIONS.forEach((definition) => {
      expect(getCompetitorDefinition(definition.id)).toBe(definition);
      expect(definition.startingCapital).toBeGreaterThan(0);
      expect(definition.commodityCategories.length).toBeGreaterThan(0);
      expect(definition.technologyCategories.length).toBeGreaterThan(0);
    });
  });
});

describe('Competitor AI Engine — the personality profiles', () => {
  it('defines at least five profiles with weights for every objective', () => {
    expect(AI_PERSONALITIES.length).toBeGreaterThanOrEqual(5);

    AI_PERSONALITIES.forEach((profile) => {
      expect(getPersonalityProfile(profile.id)).toBe(profile);
      const weights = Object.values(profile.weights);
      expect(weights.length).toBe(9);
      weights.forEach((weight) => {
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
    });
  });

  it('gives every profile a distinct weight profile', () => {
    const signatures = AI_PERSONALITIES.map((profile) =>
      Object.values(profile.weights).join(','),
    );
    expect(new Set(signatures).size).toBe(AI_PERSONALITIES.length);
  });

  it('changes the score of the objectives with the personality', () => {
    const state = createInitialCompetitorsState();
    const competitor = state.competitors[0];
    const ctx = context();

    const aggressive = scoreObjective(
      { ...competitor, currentPersonality: 'aggressive' },
      'expand-production',
      ctx,
    );
    const conservative = scoreObjective(
      { ...competitor, currentPersonality: 'conservative' },
      'expand-production',
      ctx,
    );

    expect(aggressive).toBeGreaterThan(conservative);
    expect(aggressive).toBeLessThanOrEqual(1);
    expect(conservative).toBeGreaterThanOrEqual(0);
  });

  it('shifts the personality of a corporation in trouble', () => {
    const state = createInitialCompetitorsState();
    const competitor = state.competitors[0];
    const troubled = {
      ...competitor,
      finances: { ...competitor.finances, stability: 20 },
    };

    expect(resolvePersonality(troubled, context(), false)).toBe('defensive');
  });

  it('shifts the personality of a corporation facing a shortage', () => {
    const state = createInitialCompetitorsState();
    const competitor = state.competitors[0];

    expect(resolvePersonality(competitor, context({ hasShortage: true }), false)).toBe(
      'opportunistic',
    );
  });

  it('shifts the personality of the market leader', () => {
    const state = createInitialCompetitorsState();
    const competitor = {
      ...state.competitors[0],
      finances: { ...state.competitors[0].finances, stability: 80 },
    };

    expect(resolvePersonality(competitor, context(), true)).toBe('aggressive');
  });

  it('keeps the base personality otherwise', () => {
    const state = createInitialCompetitorsState();

    state.competitors.forEach((competitor) => {
      expect(resolvePersonality(competitor, context(), false)).toBe(competitor.basePersonality);
    });
  });
});

describe('Competitor AI Engine — the decision engine', () => {
  it('does not decide before the decision interval', () => {
    const state = createInitialCompetitorsState();
    const after = advanceHours(state, 2);

    after.competitors.forEach((competitor) => {
      expect(competitor.history).toHaveLength(0);
    });
  });

  it('decides at the decision interval', () => {
    const state = createInitialCompetitorsState();
    const after = advanceHours(state, 30);

    const decided = after.competitors.filter((competitor) => competitor.history.length > 0);
    expect(decided.length).toBeGreaterThan(0);
  });

  it('never spends money the corporation does not have', () => {
    let state = createInitialCompetitorsState();

    for (let hour = 1; hour <= 400; hour += 1) {
      const result = advanceCompetitors(
        state,
        context({ deltaMs: HOUR, simTimeMs: hour * HOUR }),
      );
      state = result.state;

      state.competitors.forEach((competitor) => {
        expect(competitor.finances.balance).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('never repeats the same action type before the cooldown', () => {
    let state = createInitialCompetitorsState();

    for (let hour = 1; hour <= 400; hour += 1) {
      state = advanceCompetitors(
        state,
        context({ deltaMs: HOUR, simTimeMs: hour * HOUR }),
      ).state;
    }

    state.competitors.forEach((competitor) => {
      const actions = competitor.history;
      for (let index = 1; index < actions.length; index += 1) {
        const previous = actions[index - 1];
        const current = actions[index];
        if (previous.type === current.type) {
          expect(current.simTimeMs - previous.simTimeMs).toBeGreaterThanOrEqual(
            COMPETITOR_ACTION_COOLDOWN_MS,
          );
        }
      }
    });
  });

  it('keeps the action history bounded', () => {
    let state = createInitialCompetitorsState();

    for (let hour = 1; hour <= 800; hour += 1) {
      state = advanceCompetitors(
        state,
        context({ deltaMs: HOUR, simTimeMs: hour * HOUR }),
      ).state;
    }

    state.competitors.forEach((competitor) => {
      expect(competitor.history.length).toBeLessThanOrEqual(MAX_COMPETITOR_HISTORY);
    });
  });

  it('scores the objectives between zero and one', () => {
    const state = createInitialCompetitorsState();
    const ctx = context();

    state.competitors.forEach((competitor) => {
      (
        [
          'invest-research',
          'expand-production',
          'increase-market-presence',
          'enter-category',
          'cut-prices',
          'raise-prices',
          'reduce-expenses',
          'accumulate-resources',
          'recover-financials',
        ] as const
      ).forEach((objective) => {
        const score = scoreObjective(competitor, objective, ctx);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });
  });

  it('never chooses an objective the corporation cannot afford', () => {
    const state = createInitialCompetitorsState();
    const broke = {
      ...state.competitors[0],
      finances: { ...state.competitors[0].finances, balance: 100 },
    };

    const decision = evaluateObjectives(broke, context());

    if (decision) {
      expect(decision.objective).not.toBe('invest-research');
      expect(decision.objective).not.toBe('expand-production');
      expect(decision.objective).not.toBe('enter-category');
    }
  });
});

describe('Competitor AI Engine — the financial model', () => {
  it('accrues revenue and expenses with the simulated time', () => {
    const state = createInitialCompetitorsState();
    const competitor = state.competitors[0];

    const revenue = getCompetitorRevenuePerHour(competitor, context());
    const cost = getCompetitorOperatingCostPerHour(competitor, 0);

    expect(revenue).toBeGreaterThan(0);
    expect(cost).toBeGreaterThan(0);

    const after = advanceHours(state, 10);
    const updated = after.competitors[0];

    expect(updated.finances.lifetimeRevenue).toBeGreaterThan(0);
    expect(updated.finances.lifetimeOperatingExpenses).toBeGreaterThan(0);
  });

  it('never generates unlimited revenue', () => {
    const state = createInitialCompetitorsState();
    const competitor = state.competitors[0];

    // The revenue is bounded by the market presence and the world activity.
    const maximum = getCompetitorRevenuePerHour(
      { ...competitor, marketPresence: 100 },
      context({ marketActivityIndex: 100 }),
    );

    expect(maximum).toBeLessThanOrEqual(140);
    expect(maximum).toBeGreaterThan(0);
  });

  it('never lets a corporation lose more money than it has', () => {
    let state = createInitialCompetitorsState();
    // A corporation without any presence loses money every hour.
    state = {
      ...state,
      competitors: state.competitors.map((competitor) => ({
        ...competitor,
        marketPresence: 0,
      })),
    };

    for (let hour = 1; hour <= 100; hour += 1) {
      state = advanceCompetitors(
        state,
        context({ deltaMs: HOUR, simTimeMs: hour * HOUR }),
      ).state;
    }

    state.competitors.forEach((competitor) => {
      expect(competitor.finances.balance).toBeGreaterThanOrEqual(0);
    });
  });

  it('recovers the financial stability of a struggling corporation', () => {
    const state = createInitialCompetitorsState();
    const struggling = {
      ...state,
      competitors: state.competitors.map((competitor) => ({
        ...competitor,
        finances: { ...competitor.finances, balance: 1_000, stability: 10 },
      })),
    };

    const after = advanceHours(struggling, 200);

    expect(after.competitors[0].finances.stability).toBeGreaterThan(10);
  });

  it('derives the stability from the capital and the profit', () => {
    const state = createInitialCompetitorsState();
    const finances = state.competitors[0].finances;

    expect(getCompetitorStability(finances, 0, 30)).toBeCloseTo(50, 4);
    expect(getCompetitorStability(finances, 30, 30)).toBeGreaterThan(50);
    expect(getCompetitorStability(finances, -30, 30)).toBeLessThan(50);
    expect(getCompetitorStability(finances, 0, 30)).toBeLessThanOrEqual(100);
    expect(getCompetitorStability(finances, 0, 30)).toBeGreaterThanOrEqual(0);
  });

  it('never modifies the financial state of the player', () => {
    const state = createInitialCompetitorsState();
    const before = JSON.stringify(state);

    advanceHours(state, 100);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('Competitor AI Engine — the market signal', () => {
  it('produces no signal without any corporation', () => {
    const state = { competitors: [], sequence: 0, tick: 0 };

    expect(buildCompetitorMarketSignal(state)).toBeNull();
  });

  it('produces a bounded signal', () => {
    const state = createInitialCompetitorsState();
    const signal = buildCompetitorMarketSignal(state);

    expect(signal).not.toBeNull();
    if (!signal) return;

    (['compute', 'energy', 'materials', 'logistics'] as const).forEach((category) => {
      expect(signal.supplyPressure[category]).toBeGreaterThanOrEqual(0);
      expect(signal.supplyPressure[category]).toBeLessThanOrEqual(100);
      expect(signal.demandPressure[category]).toBeGreaterThanOrEqual(0);
      expect(signal.demandPressure[category]).toBeLessThanOrEqual(100);
      expect(signal.pricePressure[category]).toBeGreaterThanOrEqual(-1);
      expect(signal.pricePressure[category]).toBeLessThanOrEqual(1);
    });
  });

  it('never exceeds the bounds with a very large presence', () => {
    const state = createInitialCompetitorsState();
    const inflated = {
      ...state,
      competitors: state.competitors.map((competitor) => ({
        ...competitor,
        marketPresence: 100,
        operations: {
          ...competitor.operations,
          categoryCapacity: {
            compute: 1_000,
            energy: 1_000,
            materials: 1_000,
            logistics: 1_000,
          },
        },
      })),
    };

    const signal = buildCompetitorMarketSignal(inflated);
    if (!signal) throw new Error('setup failed');

    (['compute', 'energy', 'materials', 'logistics'] as const).forEach((category) => {
      expect(signal.supplyPressure[category]).toBeLessThanOrEqual(100);
      expect(signal.demandPressure[category]).toBeLessThanOrEqual(100);
    });
  });

  it('reacts to the price move of a corporation', () => {
    const state = createInitialCompetitorsState();
    const undercutting = {
      ...state,
      competitors: state.competitors.map((competitor) => ({
        ...competitor,
        operations: { ...competitor.operations, pricePressure: -0.8 },
      })),
    };

    const signal = buildCompetitorMarketSignal(undercutting);
    if (!signal) throw new Error('setup failed');

    expect(signal.pricePressure.compute).toBeLessThan(0);
  });
});

describe('Competitor AI Engine — the technology competition', () => {
  it('selects a technology of the specialisation of the corporation', () => {
    const state = createInitialCompetitorsState();
    const nexora = state.competitors.find(
      (competitor) => competitor.id === 'nexora-industries',
    )!;

    const target = selectResearchTarget(nexora);

    expect(target).not.toBeNull();
    if (!target) return;
    const definition = getTechnologyDefinition(target.technologyId);
    expect(definition).toBeDefined();
    expect(nexora.technologyCategories).toContain(definition!.category);
  });

  it('obeys the prerequisites of the technology tree', () => {
    const state = createInitialCompetitorsState();
    const competitor = state.competitors[0];

    const target = selectResearchTarget(competitor);
    if (!target) throw new Error('setup failed');
    const definition = getTechnologyDefinition(target.technologyId)!;

    // Every prerequisite is unlocked by the corporation already.
    definition.requires.forEach((id) => {
      expect(competitor.unlockedTechnologies).toContain(id);
    });
  });

  it('never starts a research it cannot afford', () => {
    const state = createInitialCompetitorsState();
    const broke = {
      ...state.competitors[0],
      finances: { ...state.competitors[0].finances, balance: 500 },
    };

    expect(selectResearchTarget(broke)).toBeNull();
  });

  it('progresses and completes a research programme over the simulated time', () => {
    let state = createInitialCompetitorsState();
    const competitor = state.competitors[0];
    const target = selectResearchTarget(competitor);
    if (!target) throw new Error('setup failed');

    const started = {
      ...state,
      competitors: state.competitors.map((entry) =>
        entry.id === competitor.id
          ? {
              ...entry,
              // The decision of the corporation must not interfere with the
              // programme under test.
              nextDecisionSimMs: 100_000 * HOUR,
              research: {
                technologyId: target.technologyId,
                progress: 0,
                startedAtSimMs: 0,
                costPaid: target.cost,
              },
            }
          : entry,
      ),
    };

    const after = advanceHours(started, 400);
    const updated = findCompetitor(after, competitor.id)!;

    expect(updated.unlockedTechnologies).toContain(target.technologyId);
    expect(updated.research).toBeNull();
  });

  it('reports the technology progress by category', () => {
    const state = createInitialCompetitorsState();
    const competitor = {
      ...state.competitors[0],
      unlockedTechnologies: ['quantum-lattice', 'photonic-cores', 'helion-fusion'],
    };

    const progress = getCompetitorTechnologyProgress(competitor);

    expect(progress.unlocked).toBe(3);
    expect(progress.byCategory.computing).toBe(2);
    expect(progress.byCategory.energy).toBe(1);
  });
});

describe('Competitor AI Engine — determinism and safety', () => {
  it('produces the same state for identical runs', () => {
    const run = (): string => {
      let state = createInitialCompetitorsState();
      for (let hour = 1; hour <= 120; hour += 1) {
        state = advanceCompetitors(
          state,
          context({ deltaMs: HOUR, simTimeMs: hour * HOUR }),
        ).state;
      }
      return JSON.stringify(state);
    };

    expect(run()).toBe(run());
  });

  it('rejects an invalid state and leaves it unchanged', () => {
    const state = createInitialCompetitorsState();
    const broken = { ...state, tick: -1 };

    const result = advanceCompetitors(broken, context());

    expect(result.state).toBe(broken);
  });

  it('rejects an invalid tick context', () => {
    const state = createInitialCompetitorsState();

    expect(advanceCompetitors(state, context({ deltaMs: -1 })).state).toBe(state);
    expect(advanceCompetitors(state, context({ deltaMs: Number.NaN })).state).toBe(state);
  });

  it('keeps the decision interval at the documented value', () => {
    expect(COMPETITOR_DECISION_INTERVAL_MS).toBe(24 * HOUR);
  });

  it('keeps the state valid over a long run', () => {
    let state = createInitialCompetitorsState();

    for (let hour = 1; hour <= 600; hour += 1) {
      state = advanceCompetitors(
        state,
        context({ deltaMs: HOUR, simTimeMs: hour * HOUR }),
      ).state;
    }

    expect(isValidCompetitorsState(state)).toBe(true);
  });
});
