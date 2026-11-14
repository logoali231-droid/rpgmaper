import type { Tile } from "./model";

/** A single map square. */
export interface Cell {
  col: number;
  row: number;
}

export type ToolId =
  | "paint"
  | "line"
  | "rect"
  | "fill"
  | "pick"
  | "erase"
  | "scatter"
  | "fog"
  | "select"
  | "text"
  | "pin"
  | "light"
  | "ruler";

export const MIN_BRUSH = 1;
export const MAX_BRUSH = 8;

const inBounds = (col: number, row: number, cols: number, rows: number) =>
  col >= 0 && col < cols && row >= 0 && row < rows;

/** Stable key so strokes can skip squares they already touched. */
export const cellKey = (col: number, row: number) => `${col},${row}`;

/**
 * Squares covered by a square brush centred on (col, row).
 * Even sizes lean up/left so the brush stays under the cursor.
 */
export function brushCells(
  col: number,
  row: number,
  size: number,
  cols: number,
  rows: number
): Cell[] {
  const span = Math.max(1, Math.min(MAX_BRUSH, size));
  const radius = Math.floor((span - 1) / 2);
  const cells: Cell[] = [];

  for (let r = row - radius; r < row - radius + span; r += 1) {
    for (let c = col - radius; c < col - radius + span; c += 1) {
      if (inBounds(c, r, cols, rows)) cells.push({ col: c, row: r });
    }
  }

  return cells;
}

/**
 * Every square on the line between two cells (Bresenham), so a fast drag
 * paints a continuous stroke instead of a dotted trail.
 */
export function lineCells(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = [];
  let col = from.col;
  let row = from.row;
  const dx = Math.abs(to.col - from.col);
  const dy = Math.abs(to.row - from.row);
  const stepX = to.col > from.col ? 1 : -1;
  const stepY = to.row > from.row ? 1 : -1;
  let error = dx - dy;

  for (;;) {
    cells.push({ col, row });
    if (col === to.col && row === to.row) break;
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      col += stepX;
    }
    if (doubled < dx) {
      error += dx;
      row += stepY;
    }
  }

  return cells;
}

/** Filled or hollow rectangle between two corners. */
export function rectCells(from: Cell, to: Cell, outline = false): Cell[] {
  const c0 = Math.min(from.col, to.col);
  const c1 = Math.max(from.col, to.col);
  const r0 = Math.min(from.row, to.row);
  const r1 = Math.max(from.row, to.row);
  const cells: Cell[] = [];

  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const edge =
        row === r0 || row === r1 || col === c0 || col === c1;
      if (outline && !edge) continue;
      cells.push({ col, row });
    }
  }

  return cells;
}

/**
 * Connected region of squares sharing the terrain under `start`
 * (4-neighbour flood fill, capped so a 64×64 map can never hang).
 */
export function floodFill(
  tiles: Tile[][],
  start: Cell,
  cols: number,
  rows: number,
  limit = cols * rows
): Cell[] {
  const target = tiles[start.row]?.[start.col]?.terrain;
  if (target === undefined) return [];

  const seen = new Uint8Array(cols * rows);
  const stack: Cell[] = [{ col: start.col, row: start.row }];
  const cells: Cell[] = [];
  seen[start.row * cols + start.col] = 1;

  while (stack.length > 0 && cells.length < limit) {
    const current = stack.pop() as Cell;
    if (tiles[current.row]?.[current.col]?.terrain !== target) continue;
    cells.push(current);

    const neighbours: Cell[] = [
      { col: current.col - 1, row: current.row },
      { col: current.col + 1, row: current.row },
      { col: current.col, row: current.row - 1 },
      { col: current.col, row: current.row + 1 },
    ];

    for (const next of neighbours) {
      if (!inBounds(next.col, next.row, cols, rows)) continue;
      const index = next.row * cols + next.col;
      if (seen[index]) continue;
      seen[index] = 1;
      stack.push(next);
    }
  }

  return cells;
}

/** Mirror squares across the vertical, horizontal or both axes. */
export function mirrorCells(
  cells: Cell[],
  cols: number,
  rows: number
): Cell[] {
  const out: Cell[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    const mirrored: Cell[] = [
      { col: cols - 1 - cell.col, row: cell.row },
      { col: cell.col, row: rows - 1 - cell.row },
      { col: cols - 1 - cell.col, row: rows - 1 - cell.row },
    ];
    for (const next of [cell, ...mirrored]) {
      const key = cellKey(next.col, next.row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
    }
  }

  return out;
}

/** Drop squares already covered by this stroke or already the target terrain. */
export function freshCells(
  cells: Cell[],
  terrainId: string,
  tiles: Tile[][],
  touched: Set<string>
): Cell[] {
  const fresh: Cell[] = [];

  for (const cell of cells) {
    const key = cellKey(cell.col, cell.row);
    if (touched.has(key)) continue;
    touched.add(key);
    if (tiles[cell.row]?.[cell.col]?.terrain === terrainId) continue;
    fresh.push(cell);
  }

  return fresh;
}
