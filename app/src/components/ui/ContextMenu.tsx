import { useEffect, useRef } from "react";

export interface ContextMenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  /** Small heading, e.g. the square being clicked. */
  label?: string;
  actions: ContextMenuAction[];
  onClose: () => void;
}

/** A small floating menu of actions for one map square. It lives inside the
 * canvas wrapper, so coordinates are canvas-local pixels. */
export function ContextMenu({
  x,
  y,
  label,
  actions,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label="Map actions"
      style={{ left: x, top: y }}
    >
      {label ? <span className="context-menu-label">{label}</span> : null}
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          className="context-menu-item"
          disabled={action.disabled}
          onClick={() => {
            action.onSelect();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
