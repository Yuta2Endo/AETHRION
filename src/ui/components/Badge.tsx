import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'ok' | 'pending' | 'brand' | 'danger' | 'warning';
}

/**
 * AETHRION badge primitive. Small status label using token colors.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'brand', children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={`badge badge--${variant} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';
