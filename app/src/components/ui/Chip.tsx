import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  /** Accessible name when the chip contains only an icon/element */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Small, touch-friendly button used for tool toggles and action chips.
 * 44px is the minimum recommended touch target size on mobile.
 */
export function Chip({
  variant = "primary",
  size = "md",
  ariaLabel,
  children,
  className = "",
  ...rest
}: ChipProps) {
  const variantClass = variant === "secondary" ? "chip-secondary" : "chip-primary";
  const sizeClass = size === "sm" ? "chip-sm" : "chip-md";
  const composed = `${className} chip ${variantClass} ${sizeClass}`.trim();

  return (
    <button
      type="button"
      className={composed}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </button>
  );
}
