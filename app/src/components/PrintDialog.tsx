import { useEffect, useRef } from "react";
import type { MapLabel, Terrain, Tile } from "./MapGrid";
import type { MapPin } from "../features/map/model";
import { Chip } from "./ui/Chip";
import { PrintPreview } from "./PrintSheets";
import {
  FEET_PER_SQUARE,
  GRID_CHOICES,
  OVERLAP_CHOICES,
  PAPERS,
  describeSquare,
  planPrint,
  type PrintOptions,
} from "../features/map/print";

interface PrintDialogProps {
  mapName: string;
  tiles: Tile[][];
  columns: number;
  rows: number;
  terrains: Terrain[];
  labels?: MapLabel[];
  pins?: MapPin[];
  options: PrintOptions;
  onChange: (next: PrintOptions) => void;
  onClose: () => void;
}

/**
 * Print setup for tabletop use: pick a paper size and a real square size,
 * see how many sheets the map needs, then hand it to the browser.
 */
export function PrintDialog({
  mapName,
  tiles,
  columns,
  rows,
  terrains,
  labels,
  pins,
  options,
  onChange,
  onClose,
}: PrintDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const layout = planPrint(columns, rows, options);
  const gridId =
    options.grid === "fit" ? "fit" : String(options.grid);

  const set = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => {
    onChange({ ...options, [key]: value });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sheetWord = layout.totalSheets === 1 ? "sheet" : "sheets";
  const heavy = layout.totalSheets > 24;

  return (
    <div className="print-backdrop" onClick={onClose}>
      <div
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-dialog-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="print-dialog-head">
          <div>
            <h2 id="print-dialog-title">Print for the table</h2>
            <p className="print-lede">
              Squares print at their true size — {FEET_PER_SQUARE} ft of map per
              square, so 25&nbsp;mm miniatures fit.
            </p>
          </div>
          <button
            type="button"
            className="print-close"
            onClick={onClose}
            aria-label="Close print setup"
          >
            ✕
          </button>
        </header>

        <div className="print-dialog-body">
          <div className="print-options">
            <label className="print-field">
              <span className="field-label">Paper</span>
              <select
                className="select"
                value={options.paperId}
                onChange={(e) => set("paperId", e.target.value)}
              >
                {PAPERS.map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="print-field">
              <span className="field-label">Orientation</span>
              <div className="print-segment">
                <Chip
                  size="sm"
                  variant={options.landscape ? "primary" : "secondary"}
                  aria-pressed={options.landscape}
                  onClick={() => set("landscape", true)}
                >
                  Landscape
                </Chip>
                <Chip
                  size="sm"
                  variant={options.landscape ? "secondary" : "primary"}
                  aria-pressed={!options.landscape}
                  onClick={() => set("landscape", false)}
                >
                  Portrait
                </Chip>
              </div>
            </div>

            <label className="print-field">
              <span className="field-label">Square size</span>
              <select
                className="select"
                value={gridId}
                onChange={(e) => {
                  const choice = GRID_CHOICES.find((c) => c.id === e.target.value);
                  if (choice) set("grid", choice.inches);
                }}
              >
                {GRID_CHOICES.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="print-field">
              <span className="field-label">Seam overlap</span>
              <select
                className="select"
                value={String(options.overlapIn)}
                onChange={(e) => set("overlapIn", Number(e.target.value))}
              >
                {OVERLAP_CHOICES.map((choice) => (
                  <option key={choice.id} value={String(choice.inches)}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="print-field">
              <span className="field-label">Ink</span>
              <div className="print-segment">
                <Chip
                  size="sm"
                  variant={options.style === "color" ? "primary" : "secondary"}
                  aria-pressed={options.style === "color"}
                  onClick={() => set("style", "color")}
                >
                  Colour
                </Chip>
                <Chip
                  size="sm"
                  variant={options.style === "ink" ? "primary" : "secondary"}
                  aria-pressed={options.style === "ink"}
                  onClick={() => set("style", "ink")}
                >
                  B/W patterns
                </Chip>
              </div>
            </div>

            <div className="print-field print-toggles">
              <span className="field-label">Sheet extras</span>
              <label className="print-check">
                <input
                  type="checkbox"
                  checked={options.showCoords}
                  onChange={(e) => set("showCoords", e.target.checked)}
                />
                <span>A1 coordinates</span>
              </label>
              <label className="print-check">
                <input
                  type="checkbox"
                  checked={options.showLegend}
                  onChange={(e) => set("showLegend", e.target.checked)}
                />
                <span>Terrain key</span>
              </label>
              <label className="print-check">
                <input
                  type="checkbox"
                  checked={options.includeNotes}
                  onChange={(e) => set("includeNotes", e.target.checked)}
                />
                <span>GM notes appendix</span>
              </label>
              <label className="print-check">
                <input
                  type="checkbox"
                  checked={options.includePins}
                  onChange={(e) => set("includePins", e.target.checked)}
                />
                <span>Pin key &amp; markers</span>
              </label>
            </div>
          </div>

          <div className="print-preview-col">
            <PrintPreview
              mapName={mapName}
              tiles={tiles}
              columns={columns}
              rows={rows}
              terrains={terrains}
              labels={labels}
              pins={pins}
              options={options}
            />
            <p className="print-summary">
              <strong>
                {layout.singleSheet
                  ? `Full map on one ${sheetWord}`
                  : `${layout.sheetsX} × ${layout.sheetsY} = ${layout.totalSheets} ${sheetWord}`}
              </strong>
              <span>
                {layout.singleSheet
                  ? `${columns} × ${rows} squares`
                  : `${layout.perSheet.cols} × ${layout.perSheet.rows} squares per sheet`}{" "}
                · {describeSquare(layout.gridIn)} · {FEET_PER_SQUARE} ft each
              </span>
            </p>
            {heavy ? (
              <p className="print-warning">
                That is a lot of paper. A smaller square size or “Fit one
                sheet” keeps it to a page or two.
              </p>
            ) : null}
          </div>
        </div>

        <footer className="print-dialog-foot">
          <span className="print-tip">
            Choose “Save as PDF” in the print dialog to keep a copy.
          </span>
          <div className="print-actions">
            <Chip variant="secondary" onClick={onClose}>
              Cancel
            </Chip>
            <Chip onClick={() => window.print()}>Print / Save PDF</Chip>
          </div>
        </footer>
      </div>
    </div>
  );
}
