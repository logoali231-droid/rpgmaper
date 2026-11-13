import type { Terrain, Tile } from "../../components/MapGrid";
import type { MapPin } from "./model";

/* ============================================================
   Print layout for tabletop RPG maps
   ============================================================
   A tabletop map is measured in inches, not pixels: a square is
   1 in (25 mm) so a 25 mm miniature fits one square, and one
   square is 5 ft in game terms. Everything below is therefore
   computed in inches and only converted to SVG units (96 per
   inch) when drawn.
   ============================================================ */

/** SVG user units per inch. */
export const PRINT_DPI = 96;

/** Paper edge to content. Leaves room for trim marks. */
export const PAGE_MARGIN_IN = 0.35;
/** Title strip at the top of every sheet. */
export const HEADER_IN = 0.45;
/** Sheet info + legend strip at the bottom. */
export const FOOTER_IN = 0.4;
/** Space reserved for the A1 / 12 coordinate rulers. */
export const COORD_GUTTER_IN = 0.19;
/** Footprint of one square in game terms. */
export const FEET_PER_SQUARE = 5;

export interface Paper {
  id: string;
  name: string;
  widthIn: number;
  heightIn: number;
}

export const PAPERS: Paper[] = [
  { id: "letter", name: "Letter · 8.5 × 11 in", widthIn: 8.5, heightIn: 11 },
  { id: "a4", name: "A4 · 210 × 297 mm", widthIn: 210 / 25.4, heightIn: 297 / 25.4 },
  { id: "a3", name: "A3 · 297 × 420 mm", widthIn: 297 / 25.4, heightIn: 420 / 25.4 },
  { id: "tabloid", name: "Tabloid · 11 × 17 in", widthIn: 11, heightIn: 17 },
];

/** Square sizes offered in the print dialog. "fit" scales to one sheet. */
export const GRID_CHOICES: { id: string; label: string; inches: number | "fit" }[] = [
  { id: "fit", label: "Fit one sheet", inches: "fit" },
  { id: "1", label: "1 in (25 mm) — miniatures", inches: 1 },
  { id: "0.75", label: "3/4 in — compact", inches: 0.75 },
  { id: "0.5", label: "1/2 in — overview", inches: 0.5 },
  { id: "1.25", label: "1 1/4 in — large minis", inches: 1.25 },
];

export const OVERLAP_CHOICES: { id: string; label: string; inches: number }[] = [
  { id: "0", label: "None", inches: 0 },
  { id: "0.25", label: "1/4 in", inches: 0.25 },
  { id: "0.5", label: "1/2 in (recommended)", inches: 0.5 },
  { id: "1", label: "1 in", inches: 1 },
];

export type PrintStyle = "color" | "ink";

export interface PrintOptions {
  paperId: string;
  landscape: boolean;
  /** Inches per square, or "fit" to squeeze the whole map on one sheet. */
  grid: number | "fit";
  /** Extra map printed on neighbouring sheets so they can be taped. */
  overlapIn: number;
  style: PrintStyle;
  showCoords: boolean;
  showLegend: boolean;
  includeNotes: boolean;
  /** Numbered markers on the map and a printed key of pins and notes. */
  includePins: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paperId: "letter",
  landscape: true,
  grid: 1,
  overlapIn: 0.5,
  style: "color",
  showCoords: true,
  showLegend: true,
  includeNotes: true,
  includePins: true,
};

export interface PrintPage {
  /** 1-based sheet number across the map. */
  index: number;
  /** Position of this sheet in the sheet grid (0-based). */
  sheetX: number;
  sheetY: number;
  startCol: number;
  startRow: number;
  cols: number;
  rows: number;
}

export interface PrintLayout {
  paper: Paper;
  /** Page box in inches, already turned for the chosen orientation. */
  pageWidthIn: number;
  pageHeightIn: number;
  /** Square size actually used, in inches. */
  gridIn: number;
  /** Full map band on the sheet, in inches (title/footer excluded). */
  area: { x: number; y: number; widthIn: number; heightIn: number };
  gutterIn: number;
  perSheet: { cols: number; rows: number };
  sheetsX: number;
  sheetsY: number;
  totalSheets: number;
  sheets: PrintPage[];
  /** True when the whole map lands on a single sheet. */
  singleSheet: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function findPaper(id: string): Paper {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0];
}

/** Inches → SVG user units. */
export const units = (inches: number) => inches * PRINT_DPI;

/** Column label: 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Tabletop reference for a tile, e.g. "C7". */
export function tileRef(col: number, row: number): string {
  return `${columnLabel(col)}${row + 1}`;
}

export function planPrint(
  columns: number,
  rows: number,
  options: PrintOptions
): PrintLayout {
  const paper = findPaper(options.paperId);
  const pageWidthIn = options.landscape ? paper.heightIn : paper.widthIn;
  const pageHeightIn = options.landscape ? paper.widthIn : paper.heightIn;

  const area = {
    x: PAGE_MARGIN_IN,
    y: PAGE_MARGIN_IN + HEADER_IN,
    widthIn: pageWidthIn - PAGE_MARGIN_IN * 2,
    heightIn: pageHeightIn - PAGE_MARGIN_IN * 2 - HEADER_IN - FOOTER_IN,
  };

  const gutterIn = options.showCoords ? COORD_GUTTER_IN : 0;
  const gridAreaW = Math.max(0.1, area.widthIn - gutterIn);
  const gridAreaH = Math.max(0.1, area.heightIn - gutterIn);

  let gridIn: number;
  if (options.grid === "fit") {
    // Round down to 1/20 in so the printed size is a tidy number.
    gridIn = Math.floor(Math.min(gridAreaW / columns, gridAreaH / rows) * 20) / 20;
    gridIn = clamp(gridIn, 0.2, 2.5);
  } else {
    gridIn = options.grid;
  }

  const perSheetCols = Math.max(1, Math.floor(gridAreaW / gridIn + 1e-6));
  const perSheetRows = Math.max(1, Math.floor(gridAreaH / gridIn + 1e-6));

  const overlapCells = clamp(
    Math.round(options.overlapIn / gridIn),
    0,
    Math.max(0, perSheetCols - 1)
  );
  const stepX = Math.max(1, perSheetCols - overlapCells);
  const stepY = Math.max(1, perSheetRows - overlapCells);

  const sheetsX = columns <= perSheetCols ? 1 : 1 + Math.ceil((columns - perSheetCols) / stepX);
  const sheetsY = rows <= perSheetRows ? 1 : 1 + Math.ceil((rows - perSheetRows) / stepY);

  const sheets: PrintPage[] = [];
  for (let sheetY = 0; sheetY < sheetsY; sheetY += 1) {
    for (let sheetX = 0; sheetX < sheetsX; sheetX += 1) {
      const startCol = Math.min(sheetX * stepX, Math.max(0, columns - perSheetCols));
      const startRow = Math.min(sheetY * stepY, Math.max(0, rows - perSheetRows));
      sheets.push({
        index: sheets.length + 1,
        sheetX,
        sheetY,
        startCol,
        startRow,
        cols: Math.min(perSheetCols, columns - startCol),
        rows: Math.min(perSheetRows, rows - startRow),
      });
    }
  }

  return {
    paper,
    pageWidthIn,
    pageHeightIn,
    gridIn,
    area,
    gutterIn,
    perSheet: { cols: perSheetCols, rows: perSheetRows },
    sheetsX,
    sheetsY,
    totalSheets: sheets.length,
    sheets,
    singleSheet: sheets.length === 1,
  };
}

/* ---------- Ink patterns ---------- */

export type PatternKind =
  | "plain"
  | "dots"
  | "dots-dense"
  | "hatch"
  | "cross"
  | "waves"
  | "solid";

/** Which black-and-white texture stands in for each terrain.
 * Open ground stays blank: a GM's pen is for walls, water and cover. */
const PATTERN_BY_TERRAIN: Record<string, PatternKind> = {
  grass: "plain",
  forest: "hatch",
  mountain: "cross",
  water: "waves",
  sand: "dots-dense",
  wall: "solid",
};

export function patternFor(terrainId: string): PatternKind {
  return PATTERN_BY_TERRAIN[terrainId] ?? "hatch";
}

/* ---------- GM notes ---------- */

export interface NoteEntry {
  ref: string;
  col: number;
  row: number;
  terrain: string;
  text: string;
}

/** Every tile with a note, ordered the way a GM reads the map. */
export function collectNotes(
  tiles: Tile[][],
  terrains: Terrain[]
): NoteEntry[] {
  const names = new Map(terrains.map((t) => [t.id, t.name]));
  const entries: NoteEntry[] = [];
  tiles.forEach((rowTiles, row) => {
    rowTiles.forEach((tile, col) => {
      const text = tile.note.trim();
      if (!text) return;
      entries.push({
        ref: tileRef(col, row),
        col,
        row,
        terrain: names.get(tile.terrain) ?? tile.terrain,
        text,
      });
    });
  });
  return entries.sort((a, b) => a.row - b.row || a.col - b.col);
}

/* ---------- Pin key ---------- */

export interface PinEntry {
  /** Badge text as it appears on the map, e.g. "3". */
  label: string;
  /** Tabletop reference for its square, e.g. "C7". */
  ref: string;
  col: number;
  row: number;
  note: string;
}

/** Pins in badge order so the key reads 1, 2, 3… down the page. */
export function collectPins(pins: MapPin[]): PinEntry[] {
  const asNumber = (label: string) => {
    const value = Number(label);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  return pins
    .map((pin) => ({
      label: pin.label.trim() || "?",
      ref: tileRef(pin.col, pin.row),
      col: pin.col,
      row: pin.row,
      note: pin.note.trim(),
    }))
    .sort(
      (a, b) =>
        asNumber(a.label) - asNumber(b.label) ||
        a.label.localeCompare(b.label) ||
        a.row - b.row ||
        a.col - b.col
    );
}

/** Greedy word wrap; the SVG text renderer needs explicit lines. */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + " " + word).length <= maxChars) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
    }
    while (line.length > maxChars) {
      lines.push(line.slice(0, maxChars));
      line = line.slice(maxChars);
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Square size written the way a tabletop GM reads it: 1 in (25 mm). */
export function describeSquare(gridIn: number): string {
  const mm = Math.round(gridIn * 25.4);
  const inches =
    gridIn === 1
      ? "1 in"
      : gridIn === 0.5
        ? "1/2 in"
        : gridIn === 0.25
          ? "1/4 in"
          : `${Number(gridIn.toFixed(2))} in`;
  return `${inches} (${mm} mm)`;
}
