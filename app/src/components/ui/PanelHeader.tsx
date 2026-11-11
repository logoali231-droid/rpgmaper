import type { ReactNode } from "react";

export interface PanelHeaderProps {
  title: string;
  /** Optional right-hand actions */
  actions?: ReactNode;
}

/**
 * Column header used in the tool panes.
 * On narrow phones it collapses to a compact single-line row.
 */
export function PanelHeader({ title, actions }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <span className="panel-header-title">{title}</span>
      {actions ? <span className="panel-header-actions">{actions}</span> : null}
    </div>
  );
}
