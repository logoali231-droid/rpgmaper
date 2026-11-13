import { useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "./ui/Chip";
import {
  EXPORT_SIZES,
  MAX_EXPORT_PX,
  canvasToBlob,
  downloadBlob,
  renderMapImage,
  slugify,
} from "../features/map/exportImage";
import { buildWallsFile, extractWalls } from "../features/map/vtt";
import type {
  FogGrid,
  Layers,
  MapLabel,
  MapPin,
  Terrain,
} from "../features/map/model";

interface ExportDialogProps {
  mapName: string;
  columns: number;
  rows: number;
  layers: Layers;
  terrains: Terrain[];
  labels: MapLabel[];
  pins: MapPin[];
  fog: FogGrid;
  onClose: () => void;
}

/**
 * Export a map for a virtual tabletop: a flat image at a chosen pixels-per-
 * square, plus the wall file that lines up with it.
 */
export function ExportDialog({
  mapName,
  columns,
  rows,
  layers,
  terrains,
  labels,
  pins,
  fog,
  onClose,
}: ExportDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<"png" | "webp">("png");
  const [pxPerSquare, setPxPerSquare] = useState(96);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [includeGm, setIncludeGm] = useState(false);
  const [hideFog, setHideFog] = useState(true);
  const [lighting, setLighting] = useState(true);
  const [compass, setCompass] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const width = columns * pxPerSquare;
  const height = rows * pxPerSquare;
  const tooBig = width > MAX_EXPORT_PX || height > MAX_EXPORT_PX;

  const wallCounts = useMemo(
    () => extractWalls({ columns, rows, layers, terrains }),
    [columns, rows, layers, terrains]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Small live render of exactly what the export will contain. */
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const previewPx = Math.max(
        4,
        Math.min(pxPerSquare, Math.floor(420 / Math.max(columns, rows)))
      );
      const canvas = renderMapImage({
        columns,
        rows,
        layers,
        terrains,
        labels,
        pins,
        fog,
        options: {
          pxPerSquare: previewPx,
          showGrid,
          showLabels,
          includeGm,
          hideFog,
          lighting,
          compass,
          showPins,
        },
      });
      if (cancelled) return;
      setPreviewUrl(canvas.toDataURL("image/png"));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    columns,
    rows,
    layers,
    terrains,
    labels,
    pins,
    fog,
    showGrid,
    showLabels,
    includeGm,
    hideFog,
    lighting,
    compass,
    showPins,
    pxPerSquare,
  ]);

  const exportImage = async () => {
    if (busy || tooBig) return;
    setBusy(true);
    try {
      const canvas = renderMapImage({
        columns,
        rows,
        layers,
        terrains,
        labels,
        pins,
        fog,
        options: {
          pxPerSquare,
          showGrid,
          showLabels,
          includeGm,
          hideFog,
          lighting,
          compass,
          showPins,
        },
      });
      const type = format === "png" ? "image/png" : "image/webp";
      const blob = await canvasToBlob(
        canvas,
        type,
        format === "webp" ? quality : undefined
      );
      if (!blob) {
        setNote("This browser could not encode that image.");
        return;
      }
      downloadBlob(
        blob,
        `${slugify(mapName)}-${pxPerSquare}px.${format}`
      );
      setNote(
        `Saved ${canvas.width} × ${canvas.height} px · ${Math.round(
          blob.size / 1024
        )} KB`
      );
    } finally {
      setBusy(false);
    }
  };

  const exportWalls = () => {
    const file = buildWallsFile({
      name: mapName,
      columns,
      rows,
      layers,
      terrains,
      pxPerSquare,
    });
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `${slugify(mapName)}-walls.json`);
    setNote(
      `Walls JSON saved · ${file.counts.walls} wall lines, ${file.counts.doors} doors ` +
        `(${file.counts.secretDoors} secret), ${file.counts.lights} lights at ${pxPerSquare} px/sq`
    );
  };

  return (
    <div className="print-backdrop" onClick={onClose}>
      <div
        className="print-dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="print-dialog-head">
          <div>
            <h2 id="export-title">Export for a virtual tabletop</h2>
            <p className="print-lede">
              One flat image plus a wall file that uses the same pixels per
              square, so your light and movement blockers line up.
            </p>
          </div>
          <button
            type="button"
            className="print-close"
            onClick={onClose}
            aria-label="Close export"
          >
            ✕
          </button>
        </header>

        <div className="print-dialog-body export-body">
          <section className="export-section">
            <h3 className="export-title">Map image</h3>
            <p className="export-summary">
              {columns} × {rows} squares ·{" "}
              <strong>
                {width} × {height} px
              </strong>
            </p>
            {previewUrl ? (
              <img
                className="export-preview"
                src={previewUrl}
                alt="Preview of the exported map"
              />
            ) : null}

            <div className="export-row">
              <span className="field-label">Format</span>
              <div className="print-segment">
                <Chip
                  size="sm"
                  variant={format === "png" ? "primary" : "secondary"}
                  aria-pressed={format === "png"}
                  onClick={() => setFormat("png")}
                >
                  PNG
                </Chip>
                <Chip
                  size="sm"
                  variant={format === "webp" ? "primary" : "secondary"}
                  aria-pressed={format === "webp"}
                  onClick={() => setFormat("webp")}
                >
                  WebP
                </Chip>
              </div>
            </div>

            <div className="export-row">
              <span className="field-label">Pixels per square</span>
              <div className="print-segment">
                {EXPORT_SIZES.map((size) => (
                  <Chip
                    key={size}
                    size="sm"
                    variant={pxPerSquare === size ? "primary" : "secondary"}
                    aria-pressed={pxPerSquare === size}
                    onClick={() => setPxPerSquare(size)}
                    title={`${size} px per square (${columns * size} × ${
                      rows * size
                    } px)`}
                  >
                    {size}
                  </Chip>
                ))}
              </div>
            </div>

            {format === "webp" ? (
              <div className="export-row">
                <span className="field-label">Quality</span>
                <div className="print-segment">
                  {[
                    { value: 0.6, label: "Small" },
                    { value: 0.8, label: "Balanced" },
                    { value: 0.92, label: "Sharp" },
                  ].map((option) => (
                    <Chip
                      key={option.label}
                      size="sm"
                      variant={quality === option.value ? "primary" : "secondary"}
                      aria-pressed={quality === option.value}
                      onClick={() => setQuality(option.value)}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="export-row">
              <span className="field-label">Include</span>
              <div className="print-segment">
                <Chip
                  size="sm"
                  variant={showGrid ? "primary" : "secondary"}
                  aria-pressed={showGrid}
                  onClick={() => setShowGrid((value) => !value)}
                >
                  Grid
                </Chip>
                <Chip
                  size="sm"
                  variant={showLabels ? "primary" : "secondary"}
                  aria-pressed={showLabels}
                  onClick={() => setShowLabels((value) => !value)}
                >
                  Labels
                </Chip>
                <Chip
                  size="sm"
                  variant={includeGm ? "primary" : "secondary"}
                  aria-pressed={includeGm}
                  onClick={() => setIncludeGm((value) => !value)}
                  title="Burn GM marks into the image — players normally never see these"
                >
                  GM layer
                </Chip>
                <Chip
                  size="sm"
                  variant={hideFog ? "primary" : "secondary"}
                  aria-pressed={hideFog}
                  onClick={() => setHideFog((value) => !value)}
                  title="Black out squares still hidden by fog of war"
                >
                  Fog
                </Chip>
                <Chip
                  size="sm"
                  variant={lighting ? "primary" : "secondary"}
                  aria-pressed={lighting}
                  onClick={() => setLighting((value) => !value)}
                  title="Warm pools of light around campfires"
                >
                  Lighting
                </Chip>
                <Chip
                  size="sm"
                  variant={showPins ? "primary" : "secondary"}
                  aria-pressed={showPins}
                  onClick={() => setShowPins((value) => !value)}
                  title="Numbered points of interest"
                >
                  Pins
                </Chip>
                <Chip
                  size="sm"
                  variant={compass ? "primary" : "secondary"}
                  aria-pressed={compass}
                  onClick={() => setCompass((value) => !value)}
                  title="Compass rose and scale bar in the corners"
                >
                  Compass
                </Chip>
              </div>
            </div>

            {tooBig ? (
              <p className="export-warning">
                {width} × {height} px is beyond what a browser canvas can hold.
                Pick a smaller square size or a smaller map.
              </p>
            ) : null}

            <Chip onClick={() => void exportImage()} disabled={busy || tooBig}>
              {busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
            </Chip>
          </section>

          <section className="export-section">
            <h3 className="export-title">VTT walls</h3>
            <p className="export-summary">
              <strong>{wallCounts.walls.length}</strong> wall lines ·{" "}
              <strong>{wallCounts.doors.length}</strong>{" "}
              {wallCounts.doors.length === 1 ? "door" : "doors"} ({
                wallCounts.doors.filter((d) => d.kind === "secret-door").length
              }{" "}
              secret) · <strong>{wallCounts.lights.length}</strong>{" "}
              {wallCounts.lights.length === 1 ? "light" : "lights"}, at{" "}
              {pxPerSquare} px per square.
            </p>
            <p className="export-hint">
              Wall squares export as their outer edges, merged into long
              segments. Doors and secret doors come from their props and keep
              their facing; campfires become lights with 20/40 ft radii. The
              file also carries ready-to-paste Foundry <code>walls</code> and{" "}
              <code>lights</code> arrays.
            </p>
            <Chip variant="secondary" onClick={exportWalls}>
              Download walls JSON
            </Chip>
          </section>

          {note ? <p className="export-note">{note}</p> : null}
        </div>
      </div>
    </div>
  );
}
