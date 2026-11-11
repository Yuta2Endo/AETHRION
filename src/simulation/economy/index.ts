/**
 * Economy Engine module (Stage 01 placeholder).
 * Responsible for markets, currencies, pricing, and global trade.
 * Typed interface only — no implementation in Stage 01.
 */

export interface EconomySnapshot {
  gdp: number;
  inflation: number;
  marketVolatility: number;
}

export const defaultEconomy: EconomySnapshot = {
  gdp: 0,
  inflation: 0,
  marketVolatility: 0,
};

export function getEconomySnapshot(): EconomySnapshot {
  return { ...defaultEconomy };
}
