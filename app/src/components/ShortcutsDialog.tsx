import { useEffect, useRef } from "react";

interface ShortcutsDialogProps {
  onClose: () => void;
}

const TOOL_KEYS: { keys: string; action: string }[] = [
  { keys: "B · P", action: "Paint" },
  { keys: "L", action: "Line" },
  { keys: "R", action: "Rectangle (Shift = hollow)" },
  { keys: "F", action: "Fill area" },
  { keys: "I", action: "Pick terrain (or Alt-click)" },
  { keys: "E", action: "Erase" },
  { keys: "S", action: "Scatter" },
  { keys: "V", action: "Select" },
  { keys: "T", action: "Text label" },
  { keys: "N", action: "Drop a numbered pin" },
  { keys: "M", action: "Ruler" },
  { keys: "G", action: "Fog of war toggle" },
];

const EDIT_KEYS: { keys: string; action: string }[] = [
  { keys: "Ctrl/⌘ Z", action: "Undo" },
  { keys: "Ctrl/⌘ ⇧ Z · Ctrl/⌘ Y", action: "Redo" },
  { keys: "Ctrl/⌘ C · X · V", action: "Copy, cut, paste selection" },
  { keys: "Delete · Backspace", action: "Clear the selection" },
  { keys: "[ · ]", action: "Smaller or larger brush" },
  { keys: "1 – 9", action: "Pick a palette terrain" },
  { keys: "Esc", action: "Cancel stroke, selection or label" },
  { keys: "?", action: "Open this sheet" },
];

const VIEW_KEYS: { keys: string; action: string }[] = [
  { keys: "Wheel", action: "Zoom at the pointer" },
  { keys: "Middle-drag", action: "Pan the map" },
  { keys: "Two fingers", action: "Pinch zoom and pan on touch" },
  { keys: "Right-click", action: "Open the square's quick-action menu" },
  { keys: "Hold", action: "Same menu on touch (not while a brush tool is active)" },
  { keys: "Alt-click", action: "Pick the terrain under the pointer" },
];

function ShortcutList({
  title,
  entries,
}: {
  title: string;
  entries: { keys: string; action: string }[];
}) {
  return (
    <section className="shortcut-section">
      <h3 className="export-title">{title}</h3>
      <dl className="shortcut-list">
        {entries.map((entry) => (
          <div className="shortcut-row" key={entry.keys}>
            <dt>
              <kbd>{entry.keys}</kbd>
            </dt>
            <dd>{entry.action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Quick reference for every key the canvas listens to. */
export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="print-backdrop" onClick={onClose}>
      <div
        className="print-dialog shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="print-dialog-head">
          <div>
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <p className="print-lede">
              Everything the canvas listens for. Shortcuts pause while you are
              typing in a field.
            </p>
          </div>
          <button
            type="button"
            className="print-close"
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            ✕
          </button>
        </header>

        <div className="print-dialog-body shortcuts-body">
          <ShortcutList title="Tools" entries={TOOL_KEYS} />
          <ShortcutList title="Editing" entries={EDIT_KEYS} />
          <ShortcutList title="View" entries={VIEW_KEYS} />
        </div>
      </div>
    </div>
  );
}
