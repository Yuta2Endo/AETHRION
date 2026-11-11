import { TrendIndicator } from '@/ui/components/TrendIndicator';

export interface MarketValueProps {
  /** Commodity display name. */
  name: string;
  /** Commodity category. */
  category: string;
  /** Current market price. */
  price: number;
  /** Currency symbol used for the price. */
  symbol: string;
  /** Signed price change in percent. */
  changePercent: number;
  /** Supply / demand imbalance, -1..1. */
  imbalance: number;
}

/**
 * AETHRION market value row.
 * Renders a single traded commodity with its price and market pressure.
 */
export function MarketValue({
  name,
  category,
  price,
  symbol,
  changePercent,
  imbalance,
}: MarketValueProps) {
  const pressure = Math.abs(imbalance) < 0.02 ? 'balanced' : imbalance > 0 ? 'demand' : 'supply';

  return (
    <div className="market-row">
      <div className="market-main">
        <span className="market-name">{name}</span>
        <span className="market-category">{category}</span>
      </div>
      <div className="market-price text-mono">
        {symbol}
        {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <TrendIndicator value={changePercent} />
      <span className={`market-pressure market-pressure--${pressure}`}>
        {pressure === 'balanced' ? 'Balanced' : pressure === 'demand' ? 'Demand' : 'Supply'}
      </span>
    </div>
  );
}
