import type { ButtonHTMLAttributes, CSSProperties } from "react";

export interface ColorSwatchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  label: string;
  symbol: string;
  /** Solid colour used for drawing. */
  color: string;
  /** Lighter colour used for the "selected/active" state. */
  altColor: string;
  selected: boolean;
  onChange: () => void;
}

/**
 * Drawn as a rounded square whose colour flips to `altColor` when selected.
 * The label and symbol sit under it for a clear, large tap target.
 */
export function ColorSwatch({
  label,
  symbol,
  color,
  altColor,
  selected,
  onChange,
  className = "",
  style,
  ...rest
}: ColorSwatchProps) {
  const swatchStyle = {
    "--sw-color": color,
    "--sw-alt": altColor,
    ...style,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`color-swatch ${selected ? "is-selected" : ""} ${className}`.trim()}
      style={swatchStyle}
      onClick={onChange}
      aria-pressed={selected}
      {...rest}
    >
      <span className="color-swatch-color" aria-hidden="true" />
      <span className="color-swatch-meta">
        <span className="color-swatch-symbol">{symbol}</span>
        <span className="color-swatch-label">{label}</span>
      </span>
    </button>
  );
}
