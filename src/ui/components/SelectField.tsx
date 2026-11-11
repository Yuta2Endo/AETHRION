import React, { useId } from 'react';

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: SelectFieldOption[];
  hint?: string;
  error?: string | null;
}

/**
 * AETHRION labelled select.
 * Accessible: the label is bound to the control, errors are announced.
 */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ className = '', label, options, hint, error, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;

    return (
      <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
        <label className="field-label" htmlFor={fieldId}>
          {label}
        </label>
        <select
          ref={ref}
          id={fieldId}
          className="field-input field-select"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {error ? (
          <p className="field-error" id={errorId} role="alert">
            {error}
          </p>
        ) : hint ? (
          <p className="field-hint" id={hintId}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

SelectField.displayName = 'SelectField';
