import { TILE_SIZE } from "../../components/MapGrid";
import {
  drawProp,
  drawShoreline,
  drawTileTexture,
  drawWallEdges,
} from "./textures";
import { drawCompass, drawLight, drawPin, drawScaleBar } from "./overlay";
import { LIGHT_PROPS } from "./vtt";
import type { FogGrid, Layers, MapLabel, MapPin, Terrain } from "./model";

export interface ImageExportOptions {
  /** Pixels per map square. */
  pxPerSquare: number;
  showGrid: boolean;
  showLabels: boolean;
  includeGm: boolean;
  /** Burn unexplored squares in as black. */
  hideFog?: boolean;
  /** Warm pools under campfires and other light props. */
  lighting?: boolean;
  /** Compass rose and scale bar in the corners. */
  compass?: boolean;
  /** Numbered points of interest. */
  showPins?: boolean;
}

/** Square sizes offered in the export dialog. */
export const EXPORT_SIZES = [24, 48, 72, 96, 144];

/** Browsers refuse very large canvases; stay well inside the safe range. */
export const MAX_EXPORT_PX = 8192;

export interface MapRenderArgs {
  columns: number;
  rows: number;
  layers: Layers;
  terrains: Terrain[];
  labels: MapLabel[];
  pins?: MapPin[];
  fog?: FogGrid;
  options: ImageExportOptions;
}

/**
 * Draw the whole map off-screen at a fixed resolution, with no camera and no
 * UI. This is the same order the editor uses (floor, waterline, props, walls,
 * GM wash, grid, labels), so an export looks like the canvas.
 */
export function renderMapImage({
  columns,
  rows,
  layers,
  terrains,
  labels,
  pins,
  fog,
  options,
}: MapRenderArgs): HTMLCanvasElement {
  const cell = options.pxPerSquare;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(columns * cell);
  canvas.height = Math.round(rows * cell);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const byTerrain = new Map(terrains.map((terrain) => [terrain.id, terrain]));
  const scale = cell / TILE_SIZE;

  const fillTile = (terrain: Terrain, x: number, y: number, alpha = 1) => {
    ctx.globalAlpha = alpha;
    drawTileTexture(ctx, terrain, x, y, cell, 0, 0, scale);
    ctx.globalAlpha = 1;
  };

  const waterAt = (col: number, row: number) =>
    layers.floor[row]?.[col]?.terrain === "water";
  const wallAt = (col: number, row: number) => {
    if (col < 0 || col >= columns || row < 0 || row >= rows) return false;
    const id = layers.walls[row]?.[col]?.terrain;
    return byTerrain.get(id ?? "")?.kind === "wall";
  };

  // 1. Floor.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const id = layers.floor[row]?.[col]?.terrain;
      const terrain = byTerrain.get(id ?? "") ?? byTerrain.get("grass");
      if (!terrain) continue;
      fillTile(terrain, col * cell, row * cell);
    }
  }

  // 2. Shorelines.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (!waterAt(col, row)) continue;
      drawShoreline(ctx, waterAt, col, row, col * cell, row * cell, cell);
    }
  }

  // 3. Props (doors are drawn after the walls, see step 4b).
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const placed = layers.objects[row]?.[col];
      if (
        !placed?.terrain ||
        placed.terrain === "door" ||
        placed.terrain === "secret-door"
      ) {
        continue;
      }
      const terrain = byTerrain.get(placed.terrain);
      if (terrain) drawProp(ctx, terrain, col * cell, row * cell, cell, placed);
    }
  }

  // 4. Walls with their bevels.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const id = layers.walls[row]?.[col]?.terrain;
      if (!id) continue;
      const terrain = byTerrain.get(id);
      if (!terrain) continue;
      fillTile(terrain, col * cell, row * cell);
      if (terrain.kind === "wall") {
        drawWallEdges(ctx, wallAt, col, row, col * cell, row * cell, cell);
      }
    }
  }

  // 4b. Doors, above the walls they cut through.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const placed = layers.objects[row]?.[col];
      if (
        placed?.terrain !== "door" &&
        placed?.terrain !== "secret-door"
      ) {
        continue;
      }
      const terrain = byTerrain.get(placed.terrain);
      if (terrain) drawProp(ctx, terrain, col * cell, row * cell, cell, placed);
    }
  }

  // 4c. Light pools, above the props that cast them.
  if (options.lighting) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const placed = layers.objects[row]?.[col];
        const light = placed?.terrain ? LIGHT_PROPS[placed.terrain] : undefined;
        if (!light) continue;
        drawLight(
          ctx,
          col * cell,
          row * cell,
          cell,
          light.brightFeet,
          light.dimFeet,
          light.color
        );
      }
    }
  }

  // 5. GM layer, only when asked for.
  if (options.includeGm) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const mark = layers.gm[row]?.[col];
        if (!mark?.terrain) continue;
        const terrain = byTerrain.get(mark.terrain);
        if (!terrain) continue;
        fillTile(terrain, col * cell, row * cell, 0.45);
      }
    }
  }

  // 6. Grid.
  if (options.showGrid) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = Math.max(1, cell / 24);
    ctx.beginPath();
    for (let col = 0; col <= columns; col += 1) {
      const x = Math.round(col * cell) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rows * cell);
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = Math.round(row * cell) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(columns * cell, y);
    }
    ctx.stroke();
  }

  // 7. Labels.
  if (options.showLabels) {
    for (const label of labels) {
      if (!label.text.trim()) continue;
      const x = label.col * cell + cell / 2;
      const y = label.row * cell + cell / 2;
      const fontSize = Math.max(10, Math.min(64, cell * 0.42));
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, fontSize * 0.28);
      ctx.strokeStyle = "rgba(6, 10, 16, 0.88)";
      ctx.strokeText(label.text, x, y);
      ctx.fillStyle = "#f6f9ff";
      ctx.fillText(label.text, x, y);
    }
  }

  // 7b. Pins.
  if (options.showPins && pins) {
    const radius = Math.max(9, Math.min(cell * 0.34, 26));
    for (const pin of pins) {
      drawPin(
        ctx,
        pin.col * cell + cell / 2,
        pin.row * cell + cell / 2,
        radius,
        pin.label
      );
    }
  }

  // 8. Fog of war, on top of labels so hidden rooms stay hidden.
  if (options.hideFog && fog) {
    ctx.fillStyle = "#05080d";
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        if (!fog[row]?.[col]) continue;
        ctx.fillRect(col * cell, row * cell, cell, cell);
      }
    }
  }

  // 9. Compass rose and scale bar for the printed sheet.
  if (options.compass) {
    const inset = Math.max(8, cell * 0.5);
    const radius = Math.max(16, Math.min(cell * 1.15, 46));
    drawCompass(ctx, canvas.width - inset - radius, inset + radius, radius);
    drawScaleBar(
      ctx,
      inset,
      canvas.height - inset - Math.max(5, Math.min(12, cell * 0.18)),
      cell
    );
  }

  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** File-safe version of a map name. */
export function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "map"
  );
}
