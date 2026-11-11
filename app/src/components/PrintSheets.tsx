import type { Terrain, Tile } from "./MapGrid";
import {
  FEET_PER_SQUARE,
  collectNotes,
  columnLabel,
  describeSquare,
  patternFor,
  planPrint,
  units,
  wrapText,
  type NoteEntry,
  type PatternKind,
  type PrintLayout,
  type PrintOptions,
  type PrintPage,
  type PrintStyle,
} from "../features/map/print";

/* ============================================================
   Printable sheets
   ============================================================
   Every sheet is a standalone SVG sized in inches, so the grid
   prints at its true physical size (1 in squares for 25 mm
   miniatures) instead of being scaled by the browser.
   ============================================================ */

const INK = "#111111";
const INK_SOFT = "#4a4a4a";
const INK_FAINT = "#9a9a9a";
const PAPER = "#ffffff";
const FONT = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';

function patternDefs(prefix: string) {
  return (
    <defs>
      <pattern id={`${prefix}-dots`} patternUnits="userSpaceOnUse" width="11" height="11">
        <rect width="11" height="11" fill={PAPER} />
        <circle cx="5.5" cy="5.5" r="0.85" fill="#3c3c3c" />
      </pattern>
      <pattern id={`${prefix}-dots-dense`} patternUnits="userSpaceOnUse" width="6.5" height="6.5">
        <rect width="6.5" height="6.5" fill={PAPER} />
        <circle cx="3.25" cy="3.25" r="0.95" fill="#4a4a4a" />
      </pattern>
      <pattern id={`${prefix}-hatch`} patternUnits="userSpaceOnUse" width="8" height="8">
        <rect width="8" height="8" fill={PAPER} />
        <path d="M0 8 L8 0" stroke="#2b2b2b" strokeWidth="1" />
      </pattern>
      <pattern id={`${prefix}-cross`} patternUnits="userSpaceOnUse" width="9" height="9">
        <rect width="9" height="9" fill={PAPER} />
        <path d="M0 0 L9 9 M9 0 L0 9" stroke="#3a3a3a" strokeWidth="0.7" />
      </pattern>
      <pattern id={`${prefix}-waves`} patternUnits="userSpaceOnUse" width="12" height="9">
        <rect width="12" height="9" fill={PAPER} />
        <path d="M0 6 q3 -4 6 0 t6 0" stroke="#2f2f2f" strokeWidth="0.9" fill="none" />
      </pattern>
      <pattern id={`${prefix}-solid`} patternUnits="userSpaceOnUse" width="6" height="6">
        <rect width="6" height="6" fill="#3a3a3a" />
      </pattern>
    </defs>
  );
}

/** Colour print keeps the palette; ink print swaps in a texture. */
function fillFor(terrainId: string, style: PrintStyle, prefix: string, color: string) {
  if (style === "color") return color;
  const kind: PatternKind = patternFor(terrainId);
  if (kind === "plain") return PAPER;
  return `url(#${prefix}-${kind})`;
}

interface SheetProps {
  layout: PrintLayout;
  page: PrintPage;
  tiles: Tile[][];
  terrains: Terrain[];
  mapName: string;
  options: PrintOptions;
  /** Render at this pixel width instead of true paper size (screen preview). */
  pixelWidth?: number;
}

/** One map sheet: grid, coordinates, trim marks, title and legend. */
export function PrintSheet({
  layout,
  page,
  tiles,
  terrains,
  mapName,
  options,
  pixelWidth,
}: SheetProps) {
  const width = units(layout.pageWidthIn);
  const height = units(layout.pageHeightIn);
  const prefix = `sheet-${page.index}`;
  const byId = new Map(terrains.map((t) => [t.id, t]));

  const areaX = units(layout.area.x);
  const areaY = units(layout.area.y);
  const areaW = units(layout.area.widthIn);
  const areaH = units(layout.area.heightIn);
  const areaBottom = areaY + areaH;
  const cell = units(layout.gridIn);
  const gridX = areaX + units(layout.gutterIn);
  const gridY = areaY + units(layout.gutterIn);
  const gridW = page.cols * cell;
  const gridH = page.rows * cell;

  const endCol = page.startCol + page.cols - 1;
  const endRow = page.startRow + page.rows - 1;

  // Terrains actually present on this sheet, for a compact legend.
  const used: Terrain[] = [];
  for (let row = page.startRow; row <= endRow; row += 1) {
    for (let col = page.startCol; col <= endCol; col += 1) {
      const id = tiles[row]?.[col]?.terrain;
      const terrain = id ? byId.get(id) : undefined;
      if (terrain && !used.includes(terrain)) used.push(terrain);
    }
  }

  const legendFont = used.length > 5 ? 7.6 : 8.6;
  const legendItems = used.map((t) => ({
    terrain: t,
    width: 15 + t.name.length * legendFont * 0.56 + 9,
  }));
  const legendWidth = legendItems.reduce((sum, item) => sum + item.width, 0);
  let legendX = areaX + areaW - legendWidth;
  const footerY = areaBottom + 15;

  const titleMax = Math.floor((areaW * 0.62) / 8.2);
  const cleanName = mapName.trim() || "Untitled map";
  const title =
    cleanName.length > titleMax
      ? `${cleanName.slice(0, Math.max(4, titleMax - 1))}…`
      : cleanName;

  return (
    <svg
      className="print-svg"
      width={pixelWidth ?? `${layout.pageWidthIn}in`}
      height={pixelWidth ? (pixelWidth * height) / width : `${layout.pageHeightIn}in`}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${title}, sheet ${page.index} of ${layout.totalSheets}`}
    >
      {patternDefs(prefix)}
      <rect width={width} height={height} fill={PAPER} />

      {/* --- Title strip --- */}
      <text x={areaX} y={areaY - 12} fontFamily={FONT} fontSize="15" fontWeight="700" fill={INK}>
        {title}
      </text>
      <text
        x={areaX + areaW}
        y={areaY - 12}
        fontFamily={FONT}
        fontSize="10"
        fill={INK_SOFT}
        textAnchor="end"
      >
        {layout.singleSheet ? "Full map" : `Sheet ${page.index} of ${layout.totalSheets}`}
      </text>
      <line
        x1={areaX}
        y1={areaY - 6}
        x2={areaX + areaW}
        y2={areaY - 6}
        stroke={INK_FAINT}
        strokeWidth="0.7"
      />

      {/* --- Map cells --- */}
      <g>
        {Array.from({ length: page.rows }, (_, r) => {
          const row = page.startRow + r;
          return Array.from({ length: page.cols }, (_, c) => {
            const col = page.startCol + c;
            const tile = tiles[row]?.[col];
            const terrain = tile ? byId.get(tile.terrain) : undefined;
            const fill = tile
              ? fillFor(tile.terrain, options.style, prefix, terrain?.color ?? "#dddddd")
              : PAPER;
            return (
              <rect
                key={`${row}-${col}`}
                x={gridX + c * cell}
                y={gridY + r * cell}
                width={cell}
                height={cell}
                fill={fill}
                stroke={options.style === "ink" ? "#3d3d3d" : "rgba(0,0,0,0.42)"}
                strokeWidth={options.style === "ink" ? "0.7" : "0.75"}
              />
            );
          });
        })}
      </g>

      {/* --- Sheet outline + trim marks --- */}
      <rect
        x={gridX}
        y={gridY}
        width={gridW}
        height={gridH}
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
      />
      {[
        [gridX, gridY, -1, -1],
        [gridX + gridW, gridY, 1, -1],
        [gridX, gridY + gridH, -1, 1],
        [gridX + gridW, gridY + gridH, 1, 1],
      ].map(([x, y, dx, dy], i) => (
        <g key={i} stroke={INK_FAINT} strokeWidth="0.7">
          <line x1={x} y1={y} x2={x + dx * 12} y2={y} />
          <line x1={x} y1={y} x2={x} y2={y + dy * 12} />
        </g>
      ))}

      {/* --- Coordinates: letters across, numbers down --- */}
      {options.showCoords ? (
        <g fontFamily={FONT} fontSize="8" fill={INK_SOFT}>
          {Array.from({ length: page.cols }, (_, c) => (
            <text
              key={`col-${c}`}
              x={gridX + (c + 0.5) * cell}
              y={gridY - 4}
              textAnchor="middle"
            >
              {columnLabel(page.startCol + c)}
            </text>
          ))}
          {Array.from({ length: page.rows }, (_, r) => (
            <text
              key={`row-${r}`}
              x={gridX - 4}
              y={gridY + (r + 0.5) * cell + 3}
              textAnchor="end"
            >
              {page.startRow + r + 1}
            </text>
          ))}
        </g>
      ) : null}

      {/* --- Footer: sheet info + legend --- */}
      <g fontFamily={FONT}>
        <text x={areaX} y={footerY} fontSize="8.4" fill={INK_SOFT}>
          {`Cols ${columnLabel(page.startCol)}–${columnLabel(endCol)} · Rows ${page.startRow + 1}–${endRow + 1} · ${describeSquare(layout.gridIn)} squares · ${FEET_PER_SQUARE} ft per square`}
        </text>
        {options.showLegend
          ? legendItems.map(({ terrain, width: itemW }) => {
              const x = legendX;
              legendX += itemW;
              return (
                <g key={terrain.id}>
                  <rect
                    x={x}
                    y={footerY - 9}
                    width="10"
                    height="10"
                    fill={fillFor(terrain.id, options.style, prefix, terrain.color)}
                    stroke="#666666"
                    strokeWidth="0.6"
                  />
                  <text x={x + 14} y={footerY} fontSize={legendFont} fill={INK_SOFT}>
                    {terrain.name}
                  </text>
                </g>
              );
            })
          : null}
      </g>
    </svg>
  );
}

/* ---------- GM notes appendix ---------- */

const NOTES_LINE_H = 14.5;
const NOTES_FONT = 9.6;

/** Lines that fit on one notes page, so pagination matches the drawing. */
function notesCapacity(layout: PrintLayout): number {
  const areaH = units(layout.area.heightIn);
  return Math.max(1, Math.floor((areaH - 18) / NOTES_LINE_H));
}

function notesChars(layout: PrintLayout): number {
  const areaW = units(layout.area.widthIn);
  return Math.max(20, Math.floor((areaW - 6) / (NOTES_FONT * 0.5)));
}

interface NotesPageProps {
  layout: PrintLayout;
  entries: NoteEntry[];
  mapName: string;
  pageIndex: number;
  pageCount: number;
  pixelWidth?: number;
}

export function NotesSheet({
  layout,
  entries,
  mapName,
  pageIndex,
  pageCount,
  pixelWidth,
}: NotesPageProps) {
  const width = units(layout.pageWidthIn);
  const height = units(layout.pageHeightIn);
  const areaX = units(layout.area.x);
  const areaY = units(layout.area.y);
  const areaW = units(layout.area.widthIn);
  const capacity = notesCapacity(layout);
  const maxChars = notesChars(layout);

  type Line = { ref: string; terrain: string; text: string };
  const lines: Line[] = [];
  for (const entry of entries) {
    const wrapped = wrapText(entry.text, Math.max(12, maxChars - 12));
    wrapped.forEach((text, i) => {
      if (lines.length >= capacity) return;
      lines.push({
        ref: i === 0 ? entry.ref : "",
        terrain: i === 0 ? entry.terrain : "",
        text,
      });
    });
    if (lines.length >= capacity) break;
  }

  return (
    <svg
      className="print-svg"
      width={pixelWidth ?? `${layout.pageWidthIn}in`}
      height={pixelWidth ? (pixelWidth * height) / width : `${layout.pageHeightIn}in`}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`GM notes, page ${pageIndex} of ${pageCount}`}
    >
      <rect width={width} height={height} fill={PAPER} />
      <text x={areaX} y={areaY - 12} fontFamily={FONT} fontSize="15" fontWeight="700" fill={INK}>
        {`GM notes — ${mapName.trim() || "Untitled map"}`}
      </text>
      <text
        x={areaX + areaW}
        y={areaY - 12}
        fontFamily={FONT}
        fontSize="10"
        fill={INK_SOFT}
        textAnchor="end"
      >
        {`Page ${pageIndex} of ${pageCount}`}
      </text>
      <line
        x1={areaX}
        y1={areaY - 6}
        x2={areaX + areaW}
        y2={areaY - 6}
        stroke={INK_FAINT}
        strokeWidth="0.7"
      />
      <g fontFamily={FONT} fontSize={NOTES_FONT}>
        {lines.map((line, i) => (
          <text key={i} x={areaX} y={areaY + 12 + i * NOTES_LINE_H} fill={INK}>
            {line.ref ? (
              <>
                <tspan fontWeight="700">{line.ref}</tspan>
                <tspan fill={INK_FAINT}>{` · ${line.terrain} · `}</tspan>
              </>
            ) : null}
            {line.text}
          </text>
        ))}
      </g>
    </svg>
  );
}

/* ---------- Whole document ---------- */

interface DocumentProps {
  mapName: string;
  tiles: Tile[][];
  columns: number;
  rows: number;
  terrains: Terrain[];
  options: PrintOptions;
}

function paginateNotes(entries: NoteEntry[], layout: PrintLayout): NoteEntry[][] {
  const maxChars = Math.max(12, notesChars(layout) - 12);
  const capacity = notesCapacity(layout);
  const pages: NoteEntry[][] = [];
  let current: NoteEntry[] = [];
  let used = 0;
  for (const entry of entries) {
    const cost = Math.max(1, wrapText(entry.text, maxChars).length);
    if (used + cost > capacity && current.length) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(entry);
    used += cost;
  }
  if (current.length) pages.push(current);
  return pages;
}

/** Hidden on screen, one printed page per sheet. */
export function PrintDocument({
  mapName,
  tiles,
  columns,
  rows,
  terrains,
  options,
}: DocumentProps) {
  const layout = planPrint(columns, rows, options);
  const notes = options.includeNotes ? collectNotes(tiles, terrains) : [];
  const notesPages = notes.length ? paginateNotes(notes, layout) : [];

  return (
    <>
      <style>{`@page { size: ${layout.pageWidthIn}in ${layout.pageHeightIn}in; margin: 0; }`}</style>
      <div className="print-doc">
        {layout.sheets.map((page) => (
          <div className="print-sheet" key={`sheet-${page.index}`}>
            <PrintSheet
              layout={layout}
              page={page}
              tiles={tiles}
              terrains={terrains}
              mapName={mapName}
              options={options}
            />
          </div>
        ))}
        {notesPages.map((entries, i) => (
          <div className="print-sheet" key={`notes-${i}`}>
            <NotesSheet
              layout={layout}
              entries={entries}
              mapName={mapName}
              pageIndex={i + 1}
              pageCount={notesPages.length}
            />
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Screen preview ---------- */

interface PreviewProps extends DocumentProps {
  limit?: number;
  width?: number;
}

/** Thumbnails of the first few sheets, used inside the print dialog. */
export function PrintPreview({
  mapName,
  tiles,
  columns,
  rows,
  terrains,
  options,
  limit = 4,
  width = 150,
}: PreviewProps) {
  const layout = planPrint(columns, rows, options);
  const shown = layout.sheets.slice(0, limit);
  const extra = layout.totalSheets - shown.length;

  return (
    <div className="print-preview">
      {shown.map((page) => (
        <figure className="print-preview-item" key={page.index}>
          <PrintSheet
            layout={layout}
            page={page}
            tiles={tiles}
            terrains={terrains}
            mapName={mapName}
            options={options}
            pixelWidth={width}
          />
          <figcaption>Sheet {page.index}</figcaption>
        </figure>
      ))}
      {extra > 0 ? (
        <figure className="print-preview-item print-preview-more">
          <span>+{extra}</span>
          <figcaption>more sheets</figcaption>
        </figure>
      ) : null}
    </div>
  );
}
