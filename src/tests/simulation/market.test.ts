import { describe, it, expect } from 'vitest';
import {
  SALE_TRANSACTION_THRESHOLD,
  buildCorporateMarketSignal,
  createInitialMarketState,
  ensureListing,
  getProductDemand,
  isValidMarketState,
  processSales,
} from '@/simulation/market';
import { createInitialProductState } from '@/simulation/products';
import { updateEconomy } from '@/simulation/economy';
import { getTechnologyDefinition } from '@/simulation/technology';
import { HOUR, makeEconomy, makeProductInstance } from '@/tests/helpers/fixtures';

describe('Market Engine — demand', () => {
  it('scales the demand with the commercial activity', () => {
    const product = makeProductInstance();

    const low = getProductDemand(product, 10, {
      deltaMs: HOUR,
      marketActivityIndex: 20,
      marketReach: 1,
      simTimeMs: 0,
    });
    const high = getProductDemand(product, 10, {
      deltaMs: HOUR,
      marketActivityIndex: 80,
      marketReach: 1,
      simTimeMs: 0,
    });

    expect(high).toBeGreaterThan(low);
  });

  it('reduces the demand when the price rises', () => {
    const product = makeProductInstance({ price: 900 });
    const context = {
      deltaMs: HOUR,
      marketActivityIndex: 100,
      marketReach: 1,
      simTimeMs: 0,
    };

    const cheap = getProductDemand(product, 10, context);
    const expensive = getProductDemand({ ...product, price: 1_800 }, 10, context);

    expect(expensive).toBeLessThan(cheap);
  });

  it('raises the demand with the product quality', () => {
    const context = {
      deltaMs: HOUR,
      marketActivityIndex: 100,
      marketReach: 1,
      simTimeMs: 0,
    };

    const low = getProductDemand(makeProductInstance({ quality: 20 }), 10, context);
    const high = getProductDemand(makeProductInstance({ quality: 90 }), 10, context);

    expect(high).toBeGreaterThan(low);
  });

  it('raises the demand with the market reach of the unlocked technologies', () => {
    const context = {
      deltaMs: HOUR,
      marketActivityIndex: 100,
      simTimeMs: 0,
    };

    const normal = getProductDemand(makeProductInstance(), 10, { ...context, marketReach: 1 });
    const wide = getProductDemand(makeProductInstance(), 10, { ...context, marketReach: 1.5 });

    expect(wide).toBeGreaterThan(normal);
  });
});

describe('Market Engine — sales', () => {
  it('sells the accumulated demand and reduces the inventory', () => {
    const product = makeProductInstance({ inventory: 100 });
    const products = { ...createInitialProductState(), instances: [product] };
    const market = ensureListing(createInitialMarketState(), product.id, product.price, true);

    const sales = processSales(products, market, {
      deltaMs: 10 * HOUR,
      marketActivityIndex: 100,
      marketReach: 1,
      simTimeMs: 10 * HOUR,
    });

    expect(sales.unitsSold[product.id]).toBeGreaterThan(0);
    expect(sales.products.instances[0].inventory).toBeLessThan(100);
    expect(sales.products.instances[0].unitsSold).toBe(sales.unitsSold[product.id]);
    expect(sales.products.instances[0].revenue).toBeGreaterThan(0);
  });

  it('never sells more than the available inventory', () => {
    const product = makeProductInstance({ inventory: 3 });
    const products = { ...createInitialProductState(), instances: [product] };
    const market = ensureListing(createInitialMarketState(), product.id, product.price, true);

    const sales = processSales(products, market, {
      deltaMs: 100 * HOUR,
      marketActivityIndex: 100,
      marketReach: 1,
      simTimeMs: 100 * HOUR,
    });

    expect(sales.unitsSold[product.id]).toBe(3);
    expect(sales.products.instances[0].inventory).toBe(0);
  });

  it('does not sell an inactive listing', () => {
    const product = makeProductInstance({ inventory: 100 });
    const products = { ...createInitialProductState(), instances: [product] };
    const market = ensureListing(createInitialMarketState(), product.id, product.price, false);

    const sales = processSales(products, market, {
      deltaMs: 100 * HOUR,
      marketActivityIndex: 100,
      marketReach: 1,
      simTimeMs: 100 * HOUR,
    });

    expect(sales.unitsSold[product.id]).toBeUndefined();
    expect(sales.products.instances[0].inventory).toBe(100);
  });

  it('batches the revenue until the transaction threshold is reached', () => {
    const product = makeProductInstance({ inventory: 1_000 });
    const products = { ...createInitialProductState(), instances: [product] };
    const market = ensureListing(createInitialMarketState(), product.id, product.price, true);

    // A moderate sale produces revenue but stays below the batch threshold.
    const small = processSales(products, market, {
      deltaMs: 2 * HOUR,
      marketActivityIndex: 50,
      marketReach: 1,
      simTimeMs: 2 * HOUR,
    });

    expect(small.revenueToRecord).toBe(0);
    expect(small.market.listings[0].pendingRevenue).toBeGreaterThan(0);
    expect(small.market.listings[0].pendingRevenue).toBeLessThan(
      SALE_TRANSACTION_THRESHOLD,
    );

    // A large sale crosses the threshold and is recorded.
    const large = processSales(small.products, small.market, {
      deltaMs: 10 * HOUR,
      marketActivityIndex: 100,
      marketReach: 1,
      simTimeMs: 10 * HOUR,
    });

    expect(large.revenueToRecord).toBeGreaterThanOrEqual(SALE_TRANSACTION_THRESHOLD);
    expect(large.market.listings[0].pendingRevenue).toBe(0);
  });

  it('produces reproducible results', () => {
    const run = () => {
      const product = makeProductInstance({ inventory: 100 });
      const products = { ...createInitialProductState(), instances: [product] };
      const market = ensureListing(createInitialMarketState(), product.id, product.price, true);
      return processSales(products, market, {
        deltaMs: 10 * HOUR,
        marketActivityIndex: 100,
        marketReach: 1,
        simTimeMs: 10 * HOUR,
      });
    };

    expect(run().products).toEqual(run().products);
    expect(run().market).toEqual(run().market);
  });

  it('validates the market state', () => {
    expect(isValidMarketState(createInitialMarketState())).toBe(true);
  });
});

describe('Market Engine — economy integration', () => {
  it('leaves the Stage 02 behaviour unchanged without a corporate signal', () => {
    const economy = makeEconomy();
    const context = { tick: 1, deltaMs: HOUR, marketActivityIndex: 50 };

    const withoutSignal = updateEconomy(economy, context);
    const withEmptySignal = updateEconomy(economy, { ...context, corporateSignal: undefined });

    expect(withEmptySignal).toEqual(withoutSignal);
  });

  it('amplifies the commodity supply with a corporate supply signal', () => {
    const economy = makeEconomy();
    const context = { tick: 1, deltaMs: HOUR, marketActivityIndex: 50 };

    const withoutSignal = updateEconomy(economy, context);
    const withSignal = updateEconomy(economy, {
      ...context,
      corporateSignal: {
        demandPressure: 0,
        supplyPressure: 100,
        productivity: 50,
      },
    });

    const base = withoutSignal.commodities.find((c) => c.id === 'quantum-core')!;
    const boosted = withSignal.commodities.find((c) => c.id === 'quantum-core')!;

    expect(boosted.supply).toBeGreaterThan(base.supply);
  });

  it('amplifies the commodity demand with a corporate demand signal', () => {
    const economy = makeEconomy();
    const context = { tick: 1, deltaMs: HOUR, marketActivityIndex: 50 };

    const withoutSignal = updateEconomy(economy, context);
    const withSignal = updateEconomy(economy, {
      ...context,
      corporateSignal: {
        demandPressure: 100,
        supplyPressure: 0,
        productivity: 50,
      },
    });

    const base = withoutSignal.commodities.find((c) => c.id === 'quantum-core')!;
    const boosted = withSignal.commodities.find((c) => c.id === 'quantum-core')!;

    expect(boosted.demand).toBeGreaterThan(base.demand);
  });
});

describe('Market Engine — corporate signal', () => {
  it('builds a bounded signal from the corporate activity', () => {
    const signal = buildCorporateMarketSignal({
      workforceProductivity: 60,
      marketReach: 1.2,
      productionCapacity: 100,
      activeProducts: 4,
    });

    expect(signal.demandPressure).toBeGreaterThan(0);
    expect(signal.demandPressure).toBeLessThanOrEqual(100);
    expect(signal.supplyPressure).toBeGreaterThan(0);
    expect(signal.supplyPressure).toBeLessThanOrEqual(100);
    expect(signal.productivity).toBe(60);
  });

  it('is bounded for extreme inputs', () => {
    const signal = buildCorporateMarketSignal({
      workforceProductivity: 5_000,
      marketReach: 10,
      productionCapacity: 10_000,
      activeProducts: 500,
    });

    expect(signal.demandPressure).toBeLessThanOrEqual(100);
    expect(signal.supplyPressure).toBeLessThanOrEqual(100);
  });

  it('uses the market reach of the unlocked technologies', () => {
    const definition = getTechnologyDefinition('quantum-commerce')!;
    expect(definition.effects.marketReach).toBeGreaterThan(1);
  });
});
