import { TrendDown, TrendUp } from '@phosphor-icons/react';

export interface TrendIndicatorProps {
  /** Signed relative change, in percent. */
  value: number;
  /** Optional prefix rendered before the percentage. */
  label?: string;
}

/**
 * AETHRION trend indicator.
 * Shows the direction and magnitude of a signed change.
 */
export function TrendIndicator({ value, label }: TrendIndicatorProps) {
  const safe = Number.isFinite(value) ? value : 0;
  const isUp = safe > 0;
  const isFlat = Math.abs(safe) < 0.005;
  const tone = isFlat ? 'flat' : isUp ? 'up' : 'down';
  const Icon = isUp ? TrendUp : TrendDown;

  return (
    <span className={`trend trend--${tone}`}>
      <Icon size={14} weight="bold" aria-hidden="true" />
      <span className="trend-value text-mono">
        {isFlat ? '0.00' : Math.abs(safe).toFixed(2)}%
      </span>
      {label ? <span className="trend-label">{label}</span> : null}
    </span>
  );
}
