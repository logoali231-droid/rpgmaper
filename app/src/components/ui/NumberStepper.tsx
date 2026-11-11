import { useCallback, useId } from "react";
import type { ChangeEvent, InputHTMLAttributes } from "react";

export interface NumberStepperProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  /** Current value as a string (input type="number" returns a string). */
  value: string;
  /** Called with the new string value. */
  onChange: (value: string) => void;
  /** Visible label rendered above the control. */
  label?: string;
}

/**
 * Accessible number input with up/down buttons.
 * Returns a string so we never fight React's `value` semantics.
 */
export function NumberStepper({
  value,
  onChange,
  id,
  label,
  ...rest
}: NumberStepperProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      if (next === "" || /^-?\d*\.?\d*$/.test(next)) {
        onChange(next);
      }
    },
    [onChange]
  );

  return (
    <div className="stepper">
      {label ? (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="stepper-control">
        <button
          type="button"
          className="stepper-btn"
          aria-label="Decrease value"
          onClick={() => onChange(String(Number(value) - 1))}
        >
          −
        </button>
        <input
          id={inputId}
          className="stepper-input"
          type="number"
          min={0}
          value={value}
          onChange={handleChange}
          {...rest}
        />
        <button
          type="button"
          className="stepper-btn"
          aria-label="Increase value"
          onClick={() => onChange(String(Number(value) + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
