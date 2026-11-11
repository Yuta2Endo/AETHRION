import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

/**
 * AETHRION button primitive.
 * Styled exclusively via CSS custom properties (design tokens). No hardcoded
 * brand colors. Accepts standard native button props.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`btn btn--${variant} btn--${size} ${className}`}
        {...props}
        disabled={props.disabled || isLoading}
        aria-busy={isLoading || undefined}
      >
        {isLoading && <span className="btn-loader" aria-hidden="true" />}
        <span className="btn-label">{children}</span>
      </button>
    );
  },
);

Button.displayName = 'Button';
