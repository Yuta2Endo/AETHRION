import { describe, it, expect } from 'vitest';
import {
  createInitialEconomy,
  findCommodity,
  getEconomyMetrics,
  getImbalance,
  isValidEconomyState,
  updateEconomy,
  ECONOMY_RULES,
  type EconomyState,
  type MarketCommodity,
} from '@/simulation/economy';

const HOUR = 3_600_000;
const CONTEXT = { tick: 1, deltaMs: HOUR, marketActivityIndex: 50 };

function withCommodity(
  overrides: Partial<MarketCommodity>,
): EconomyState {
  const base = createInitialEconomy();
  return {
    ...base,
    commodities: [{ ...base.commodities[0], ...overrides }],
  };
}

describe('Economy Engine', () => {
  it('creates a valid initial economy', () => {
    const economy = createInitialEconomy();

    expect(isValidEconomyState(economy)).toBe(true);
    expect(economy.commodities.length).toBeGreaterThan(0);
    expect(economy.currencies.length).toBeGreaterThan(0);
    expect(economy.globalSupplyIndex).toBe(100);
    expect(economy.globalDemandIndex).toBe(100);
    expect(economy.tick).toBe(0);
  });

  it('gives every commodity a unique identifier', () => {
    const economy = createInitialEconomy();
    const ids = economy.commodities.map((commodity) => commodity.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('raises the price when demand exceeds supply', () => {
    const economy = withCommodity({ supply: 500, demand: 1500, baseSupply: 1000, baseDemand: 1000 });
    const before = economy.commodities[0].price;

    const updated = updateEconomy(economy, CONTEXT);

    expect(updated.commodities[0].price).toBeGreaterThan(before);
    expect(updated.commodities[0].trend).toBeGreaterThan(0);
  });

  it('lowers the price when supply exceeds demand', () => {
    const economy = withCommodity({ supply: 1500, demand: 500, baseSupply: 1000, baseDemand: 1000 });
    const before = economy.commodities[0].price;

    const updated = updateEconomy(economy, CONTEXT);

    expect(updated.commodities[0].price).toBeLessThan(before);
    expect(updated.commodities[0].trend).toBeLessThan(0);
  });

  it('keeps the price stable when supply equals demand', () => {
    const economy = withCommodity({
      supply: 1000,
      demand: 1000,
      baseSupply: 1000,
      baseDemand: 1000,
      supplyGrowth: 0,
      demandGrowth: 0,
    });
    const before = economy.commodities[0].price;

    const updated = updateEconomy(economy, CONTEXT);

    expect(updated.commodities[0].price).toBeCloseTo(before, 6);
  });

  it('follows the documented price formula', () => {
    const economy = withCommodity({
      supply: 800,
      demand: 1200,
      baseSupply: 1000,
      baseDemand: 1000,
      supplyGrowth: 0,
      demandGrowth: 0,
      price: 4200,
    });

    const updated = updateEconomy(economy, CONTEXT);
    const imbalance = (1200 - 800) / (1200 + 800);
    const target = 4200 * (1 + imbalance * ECONOMY_RULES.elasticity);
    const expected = 4200 + (target - 4200) * ECONOMY_RULES.adjustmentRate * 1;

    expect(updated.commodities[0].price).toBeCloseTo(expected, 3);
  });

  it('clamps the price between the floor and the ceiling', () => {
    const economy = withCommodity({
      supply: 100,
      demand: 5000,
      baseSupply: 1000,
      baseDemand: 1000,
      price: 8000,
      priceFloor: 2100,
      priceCeiling: 8400,
    });

    const updated = updateEconomy(economy, CONTEXT);

    expect(updated.commodities[0].price).toBeLessThanOrEqual(8400);
    expect(updated.commodities[0].price).toBeGreaterThanOrEqual(2100);
  });

  it('evolves supply and demand over time', () => {
    const economy = createInitialEconomy();
    const before = economy.commodities.map((c) => ({ supply: c.supply, demand: c.demand }));

    const updated = updateEconomy(economy, CONTEXT);

    updated.commodities.forEach((commodity, index) => {
      expect(commodity.supply).not.toBe(before[index].supply);
      expect(commodity.demand).not.toBe(before[index].demand);
      expect(commodity.supply).toBeGreaterThanOrEqual(0);
      expect(commodity.demand).toBeGreaterThanOrEqual(0);
    });
    expect(updated.tick).toBe(1);
  });

  it('scales demand with the commercial activity of the world', () => {
    const low = updateEconomy(createInitialEconomy(), {
      tick: 1,
      deltaMs: HOUR,
      marketActivityIndex: 0,
    });
    const high = updateEconomy(createInitialEconomy(), {
      tick: 1,
      deltaMs: HOUR,
      marketActivityIndex: 100,
    });

    const lowDemand = low.commodities.find((c) => c.id === 'nano-lattice')!.demand;
    const highDemand = high.commodities.find((c) => c.id === 'nano-lattice')!.demand;

    expect(highDemand).toBeGreaterThan(lowDemand);
  });

  it('produces reproducible results over repeated ticks', () => {
    const run = (): EconomyState => {
      let economy = createInitialEconomy();
      for (let i = 0; i < 40; i += 1) {
        economy = updateEconomy(economy, {
          tick: i + 1,
          deltaMs: HOUR,
          marketActivityIndex: 50 + i,
        });
      }
      return economy;
    };

    expect(run()).toEqual(run());
  });

  it('bounds the retained price history', () => {
    let economy = createInitialEconomy();

    for (let i = 0; i < 60; i += 1) {
      economy = updateEconomy(economy, CONTEXT);
    }

    economy.commodities.forEach((commodity) => {
      expect(commodity.history.length).toBeLessThanOrEqual(ECONOMY_RULES.historyLength);
    });
  });

  it('rejects invalid numeric values and leaves the state unchanged', () => {
    const economy = createInitialEconomy();
    const invalid: EconomyState = {
      ...economy,
      commodities: [
        { ...economy.commodities[0], supply: Number.NaN },
        ...economy.commodities.slice(1),
      ],
    };

    expect(isValidEconomyState(invalid)).toBe(false);
    expect(updateEconomy(invalid, CONTEXT)).toBe(invalid);
  });

  it('rejects a price outside the allowed band', () => {
    const economy = createInitialEconomy();
    const invalid: EconomyState = {
      ...economy,
      commodities: [
        { ...economy.commodities[0], price: 999999 },
        ...economy.commodities.slice(1),
      ],
    };

    expect(isValidEconomyState(invalid)).toBe(false);
  });

  it('rejects an invalid tick context', () => {
    const economy = createInitialEconomy();

    expect(updateEconomy(economy, { tick: 1, deltaMs: -5, marketActivityIndex: 10 })).toBe(economy);
    expect(
      updateEconomy(economy, { tick: 1, deltaMs: HOUR, marketActivityIndex: Number.NaN }),
    ).toBe(economy);
  });

  it('computes the supply / demand imbalance', () => {
    const economy = createInitialEconomy();
    const commodity = findCommodity(economy, 'quantum-core')!;

    const expected =
      (commodity.demand - commodity.supply) / (commodity.demand + commodity.supply);

    expect(getImbalance(commodity)).toBeCloseTo(expected, 10);
    // Quantum Core starts oversupplied, Nano Lattice undersupplied.
    expect(getImbalance(commodity)).toBeLessThan(0);
    expect(getImbalance(findCommodity(economy, 'nano-lattice')!)).toBeGreaterThan(0);
    expect(Math.abs(getImbalance(commodity))).toBeLessThanOrEqual(1);
  });

  it('computes aggregate economy metrics', () => {
    const economy = updateEconomy(createInitialEconomy(), CONTEXT);
    const metrics = getEconomyMetrics(economy);

    expect(metrics.commodityCount).toBe(economy.commodities.length);
    expect(metrics.totalMarketValue).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.averagePriceChange)).toBe(true);
    expect(Number.isFinite(metrics.globalSupplyIndex)).toBe(true);
  });
});
