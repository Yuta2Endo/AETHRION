import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  bordered?: boolean;
}

/**
 * AETHRION card primitive. Surface container using design tokens.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', padded = true, bordered = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`card ${padded ? 'card--padded' : ''} ${bordered ? 'card--bordered' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';
