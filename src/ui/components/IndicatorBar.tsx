export type IndicatorTone = 'cyan' | 'purple' | 'success' | 'warning';

export interface IndicatorBarProps {
  /** Label describing the indicator. */
  label: string;
  /** Current value. Clamped to the 0..max range. */
  value: number;
  /** Upper bound of the indicator. Defaults to 100. */
  max?: number;
  /** Optional unit suffix rendered after the numeric value. */
  unit?: string;
  tone?: IndicatorTone;
}

/**
 * AETHRION indicator bar.
 * Renders a labelled 0..max progress bar for development indicators.
 */
export function IndicatorBar({
  label,
  value,
  max = 100,
  unit,
  tone = 'cyan',
}: IndicatorBarProps) {
  const safeMax = max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percent = (safeValue / safeMax) * 100;

  return (
    <div className="indicator">
      <div className="indicator-head">
        <span className="indicator-label">{label}</span>
        <span className="indicator-value text-mono">
          {Math.round(safeValue * 10) / 10}
          {unit ? <span className="indicator-unit">{unit}</span> : null}
        </span>
      </div>
      <div
        className="indicator-track"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(safeValue * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={safeMax}
      >
        <div
          className={`indicator-fill indicator-fill--${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
