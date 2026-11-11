import React, { useId } from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Optional supporting text rendered below the field. */
  hint?: string;
  /** Validation message. When set, the field is marked invalid. */
  error?: string | null;
}

/**
 * AETHRION labelled text input.
 * Accessible: the label is bound to the input, errors are announced.
 */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className = '', label, hint, error, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;

    return (
      <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
        <label className="field-label" htmlFor={fieldId}>
          {label}
        </label>
        <input
          ref={ref}
          id={fieldId}
          className="field-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...props}
        />
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

TextField.displayName = 'TextField';
