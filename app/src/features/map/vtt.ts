import { FEET_PER_SQUARE } from "./print";
import type { Layers, Terrain } from "./model";

/** A wall as a plain line segment, in grid units. */
export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "wall" | "door" | "secret-door";
}

export interface LightSource {
  /** Grid position of the light, at the square's centre. */
  col: number;
  row: number;
  /** Feet of bright and dim light, in tabletop terms. */
  brightFeet: number;
  dimFeet: number;
  color: string;
}

export interface WallExtraction {
  walls: WallSegment[];
  doors: WallSegment[];
  lights: LightSource[];
}

export interface WallExportArgs {
  name: string;
  columns: number;
  rows: number;
  layers: Layers;
  terrains: Terrain[];
  pxPerSquare: number;
}

/** Lights carried by props already on the map. */
export const LIGHT_PROPS: Record<
  string,
  { brightFeet: number; dimFeet: number; color: string }
> = {
  campfire: { brightFeet: 20, dimFeet: 40, color: "#ffb15c" },
};

/**
 * Turn painted wall squares into the boundary lines a virtual tabletop needs.
 * Only edges between wall and open space are emitted, and collinear runs are
 * merged, so a 10-square wall is one segment instead of ten.
 *
 * Doors are objects, not walls: each one becomes a short segment across its
 * square, angled by the door's rotation. Secret doors use the same line, only
 * flagged so the VTT keeps them hidden. Campfires become light sources.
 */
export function extractWalls({
  columns,
  rows,
  layers,
  terrains,
}: Omit<WallExportArgs, "name" | "pxPerSquare">): WallExtraction {
  const byTerrain = new Map(terrains.map((terrain) => [terrain.id, terrain]));
  const solid = (col: number, row: number) => {
    if (col < 0 || col >= columns || row < 0 || row >= rows) return false;
    const id = layers.walls[row]?.[col]?.terrain;
    return !!id && byTerrain.get(id)?.kind === "wall";
  };

  const walls: WallSegment[] = [];

  // Horizontal edges, merged along each grid line.
  for (let row = 0; row <= rows; row += 1) {
    let start: number | null = null;
    for (let col = 0; col <= columns; col += 1) {
      const edge = col < columns && solid(col, row - 1) !== solid(col, row);
      if (edge && start === null) start = col;
      if (!edge && start !== null) {
        walls.push({ x1: start, y1: row, x2: col, y2: row, kind: "wall" });
        start = null;
      }
    }
  }

  // Vertical edges, merged down each grid line.
  for (let col = 0; col <= columns; col += 1) {
    let start: number | null = null;
    for (let row = 0; row <= rows; row += 1) {
      const edge = row < rows && solid(col - 1, row) !== solid(col, row);
      if (edge && start === null) start = row;
      if (!edge && start !== null) {
        walls.push({ x1: col, y1: start, x2: col, y2: row, kind: "wall" });
        start = null;
      }
    }
  }

  const doors: WallSegment[] = [];
  const lights: LightSource[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const placed = layers.objects[row]?.[col];
      if (!placed?.terrain) continue;

      if (placed.terrain === "door" || placed.terrain === "secret-door") {
        const kind = placed.terrain === "secret-door" ? "secret-door" : "door";
        const quarter = (((placed.rotation ?? 0) % 4) + 4) % 4;
        if (quarter % 2 === 0) {
          doors.push({
            x1: col,
            y1: row + 0.5,
            x2: col + 1,
            y2: row + 0.5,
            kind,
          });
        } else {
          doors.push({
            x1: col + 0.5,
            y1: row,
            x2: col + 0.5,
            y2: row + 1,
            kind,
          });
        }
        continue;
      }

      const light = LIGHT_PROPS[placed.terrain];
      if (light) {
        lights.push({
          col,
          row,
          brightFeet: light.brightFeet,
          dimFeet: light.dimFeet,
          color: light.color,
        });
      }
    }
  }

  return { walls, doors, lights };
}

export interface VttWallsFile {
  format: "vtt-walls";
  version: number;
  map: string;
  grid: {
    columns: number;
    rows: number;
    pxPerSquare: number;
    feetPerSquare: number;
  };
  image: { width: number; height: number };
  counts: { walls: number; doors: number; secretDoors: number; lights: number };
  walls: { x1: number; y1: number; x2: number; y2: number; type: "wall" }[];
  doors: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    type: "door" | "secret-door";
  }[];
  lights: {
    x: number;
    y: number;
    bright: number;
    dim: number;
    color: string;
  }[];
  /** Ready-to-paste Foundry VTT Wall documents. */
  foundry: {
    c: [number, number, number, number];
    door: number;
    ds: number;
    sight: number;
    light: number;
    move: number;
  }[];
  /** Foundry VTT AmbientLight documents, in feet and pixels. */
  foundryLights: {
    x: number;
    y: number;
    config: {
      bright: number;
      dim: number;
      color: string;
      angle: number;
      alpha: number;
      vision: boolean;
    };
  }[];
}

/** Build the wall export payload: boundary lines plus Foundry documents,
 * in pixels of an image exported at the same px-per-square. */
export function buildWallsFile(args: WallExportArgs): VttWallsFile {
  const { name, columns, rows, pxPerSquare } = args;
  const { walls, doors, lights } = extractWalls(args);
  const px = (segment: WallSegment) => ({
    x1: Math.round(segment.x1 * pxPerSquare),
    y1: Math.round(segment.y1 * pxPerSquare),
    x2: Math.round(segment.x2 * pxPerSquare),
    y2: Math.round(segment.y2 * pxPerSquare),
  });

  const secretDoors = doors.filter(
    (segment) => segment.kind === "secret-door"
  ).length;

  return {
    format: "vtt-walls",
    version: 1,
    map: name,
    grid: {
      columns,
      rows,
      pxPerSquare,
      feetPerSquare: FEET_PER_SQUARE,
    },
    image: { width: columns * pxPerSquare, height: rows * pxPerSquare },
    counts: {
      walls: walls.length,
      doors: doors.length,
      secretDoors,
      lights: lights.length,
    },
    walls: walls.map((segment) => ({ ...px(segment), type: "wall" as const })),
    doors: doors.map((segment) => ({
      ...px(segment),
      type: segment.kind === "secret-door" ? ("secret-door" as const) : ("door" as const),
    })),
    lights: lights.map((light) => ({
      x: Math.round((light.col + 0.5) * pxPerSquare),
      y: Math.round((light.row + 0.5) * pxPerSquare),
      bright: light.brightFeet,
      dim: light.dimFeet,
      color: light.color,
    })),
    foundry: [...walls, ...doors].map((segment) => {
      const line = px(segment);
      return {
        c: [line.x1, line.y1, line.x2, line.y2] as [
          number,
          number,
          number,
          number,
        ],
        door:
          segment.kind === "secret-door" ? 2 : segment.kind === "door" ? 1 : 0,
        ds: 0,
        sight: 1,
        light: 1,
        move: 1,
      };
    }),
    foundryLights: lights.map((light) => ({
      x: Math.round((light.col + 0.5) * pxPerSquare),
      y: Math.round((light.row + 0.5) * pxPerSquare),
      config: {
        bright: light.brightFeet,
        dim: light.dimFeet,
        color: light.color,
        angle: 360,
        alpha: 0.4,
        vision: false,
      },
    })),
  };
}
