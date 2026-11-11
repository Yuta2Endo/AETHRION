import React from 'react';

export type StatCardTone = 'default' | 'accent' | 'brand' | 'success' | 'warning';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short uppercase label. */
  label: string;
  /** Primary value rendered in the mono typeface. */
  value: React.ReactNode;
  /** Optional supporting text below the value. */
  hint?: React.ReactNode;
  /** Optional icon rendered in the card corner. */
  icon?: React.ElementType;
  tone?: StatCardTone;
}

/**
 * AETHRION statistic card.
 * Displays a single simulated value with an optional label, hint and icon.
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className = '', label, value, hint, icon: Icon, tone = 'default', ...props }, ref) => {
    return (
      <div ref={ref} className={`stat-card stat-card--${tone} ${className}`} {...props}>
        <div className="stat-card-head">
          <span className="stat-card-label">{label}</span>
          {Icon ? (
            <span className="stat-card-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
          ) : null}
        </div>
        <div className="stat-card-value">{value}</div>
        {hint ? <div className="stat-card-hint">{hint}</div> : null}
      </div>
    );
  },
);

StatCard.displayName = 'StatCard';
