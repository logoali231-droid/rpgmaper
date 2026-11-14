/** Shared map document model: terrain definitions, layers and tiles.
 * Kept outside the React tree so rendering, printing and generators can
 * all agree on one shape.
 */

export type TerrainId = string;
export type TerrainName = string;

/** Ground paints a floor, walls autotile, props are objects drawn on top. */
export type TerrainKind = "ground" | "wall" | "prop";

export type LayerId = "floor" | "objects" | "walls" | "gm";

export interface Terrain {
  id: TerrainId;
  name: TerrainName;
  symbol: string;
  color: string;
  altColor: string;
  kind: TerrainKind;
  /** Layers this terrain can be painted on. */
  layers: LayerId[];
  /** Imported tileset: a data URL used as this terrain's texture. */
  image?: string;
}

/** A numbered point of interest, with an optional private note. */
export interface MapPin {
  id: string;
  col: number;
  row: number;
  /** Short badge text, usually a key number. */
  label: string;
  /** What is here, for the GM. */
  note: string;
}

/** A text label placed on the map, e.g. a room name or key number. */
export interface MapLabel {
  id: string;
  col: number;
  row: number;
  text: string;
}

export interface Tile {
  terrain: TerrainId;
  note: string;
  /** Random [0,1) per square, used for texture variation. */
  variant?: number;
  /** Quarter turns, for directional props like doors. */
  rotation?: number;
  /** Prop size multiplier. */
  scale?: number;
}

export type LayerGrid = Tile[][];
export type Layers = Record<LayerId, LayerGrid>;

/** Fog of war: true marks a square players have not seen yet. */
export type FogGrid = boolean[][];

/** No terrain on this layer — the layers underneath show through. */
export const EMPTY_TERRAIN = "";

export const LAYER_IDS: LayerId[] = ["floor", "objects", "walls", "gm"];

export const LAYER_LABELS: Record<LayerId, string> = {
  floor: "Floor",
  objects: "Objects",
  walls: "Walls",
  gm: "GM",
};

export const LAYER_HINTS: Record<LayerId, string> = {
  floor: "Ground and water",
  objects: "Props drawn on top",
  walls: "Autotiled walls",
  gm: "Notes players never see",
};

/** Base palette plus the built-in prop set. */
export const MAP_TERRAINS: Terrain[] = [
  {
    id: "grass",
    name: "Grass",
    symbol: ".",
    color: "#6fab5a",
    altColor: "#8fc47f",
    kind: "ground",
    layers: ["floor", "gm"],
  },
  {
    id: "forest",
    name: "Forest",
    symbol: "\uD83C\uDF32",
    color: "#2e7d32",
    altColor: "#4caf50",
    kind: "ground",
    layers: ["floor", "gm"],
  },
  {
    id: "mountain",
    name: "Mountain",
    symbol: "\u2B1C",
    color: "#6b7a8f",
    altColor: "#94a3b8",
    kind: "ground",
    layers: ["floor", "gm"],
  },
  {
    id: "water",
    name: "Water",
    symbol: "~",
    color: "#1e4d8c",
    altColor: "#3b7dd8",
    kind: "ground",
    layers: ["floor", "gm"],
  },
  {
    id: "sand",
    name: "Sand",
    symbol: "S",
    color: "#e0c28a",
    altColor: "#f5d9a8",
    kind: "ground",
    layers: ["floor", "gm"],
  },
  {
    id: "floor-stone",
    name: "Stone",
    symbol: "\u25A6",
    color: "#8a8f9c",
    altColor: "#a9aeba",
    kind: "ground",
    layers: ["floor", "gm", "walls"],
  },
  {
    id: "wall",
    name: "Wall",
    symbol: "#",
    color: "#3d3d4a",
    altColor: "#5b5b6e",
    kind: "wall",
    layers: ["walls", "floor", "gm"],
  },
  {
    id: "tree",
    name: "Tree",
    symbol: "\uD83C\uDF33",
    color: "#3f8f45",
    altColor: "#72c274",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "bush",
    name: "Bush",
    symbol: "\u2740",
    color: "#4f9a4d",
    altColor: "#7cc47a",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "rock",
    name: "Rock",
    symbol: "\u25C6",
    color: "#7b7f88",
    altColor: "#9aa0a9",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "chest",
    name: "Chest",
    symbol: "\u25A4",
    color: "#9c6b2f",
    altColor: "#c08a45",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "table",
    name: "Table",
    symbol: "\u25AD",
    color: "#8a5a33",
    altColor: "#a97347",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "pillar",
    name: "Pillar",
    symbol: "\u25EF",
    color: "#9aa1ac",
    altColor: "#c2c8d2",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "door",
    name: "Door",
    symbol: "\u25A9",
    color: "#8a5a33",
    altColor: "#b07a48",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "barrel",
    name: "Barrel",
    symbol: "\u25CE",
    color: "#8a6a3c",
    altColor: "#b08750",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "campfire",
    name: "Campfire",
    symbol: "\u25B2",
    color: "#d97a2b",
    altColor: "#f6b544",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "stairs",
    name: "Stairs",
    symbol: "\u2261",
    color: "#9aa1ac",
    altColor: "#c8cdd6",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "chair",
    name: "Chair",
    symbol: "\u2294",
    color: "#8a5a33",
    altColor: "#b0783f",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "bed",
    name: "Bed",
    symbol: "\u25AD",
    color: "#8a5a33",
    altColor: "#c9b9a0",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "crate",
    name: "Crate",
    symbol: "\u25A3",
    color: "#9c6b2f",
    altColor: "#c08a45",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "bookshelf",
    name: "Bookshelf",
    symbol: "\u25A4",
    color: "#6f4a2a",
    altColor: "#a4743f",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "fountain",
    name: "Fountain",
    symbol: "\u25CD",
    color: "#2f6c9e",
    altColor: "#8fa3b8",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "rug",
    name: "Rug",
    symbol: "\u25A7",
    color: "#8a3b3b",
    altColor: "#c96a5a",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "statue",
    name: "Statue",
    symbol: "\u265C",
    color: "#8c93a0",
    altColor: "#c3c9d4",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "torch",
    name: "Torch",
    symbol: "\u2726",
    color: "#6b4a2a",
    altColor: "#ffcf8a",
    kind: "prop",
    layers: ["objects"],
  },
  {
    id: "secret-door",
    name: "Secret door",
    symbol: "?",
    color: "#7a5a33",
    altColor: "#c9a05c",
    kind: "prop",
    layers: ["objects"],
  },
];

/** Terrains a layer can paint, in palette order. */
export function terrainsForLayer(
  terrains: Terrain[],
  layer: LayerId
): Terrain[] {
  return terrains.filter((terrain) => terrain.layers.includes(layer));
}

export function emptyTile(): Tile {
  return { terrain: EMPTY_TERRAIN, note: "" };
}

export function createLayer(
  cols: number,
  rows: number,
  terrainId: TerrainId = EMPTY_TERRAIN
): LayerGrid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      terrain: terrainId,
      note: "",
    }))
  );
}

/** A fresh document: grass floor, everything else empty. */
export function createLayers(cols: number, rows: number): Layers {
  return {
    floor: createLayer(cols, rows, "grass"),
    objects: createLayer(cols, rows),
    walls: createLayer(cols, rows),
    gm: createLayer(cols, rows),
  };
}

export function createFog(cols: number, rows: number): FogGrid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );
}

/** Grow/shrink the fog mask, keeping whatever is already hidden. */
export function resizeFog(
  fog: FogGrid,
  cols: number,
  rows: number
): FogGrid {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => fog[row]?.[col] === true)
  );
}

/** Grow/shrink every layer, keeping whatever already exists. */
export function resizeLayers(
  layers: Layers,
  cols: number,
  rows: number
): Layers {
  const next = {} as Layers;
  for (const id of LAYER_IDS) {
    next[id] = Array.from({ length: rows }, (_, row) =>
      Array.from(
        { length: cols },
        (_, col) => layers[id][row]?.[col] ?? emptyTile()
      )
    );
  }
  return next;
}

/** Copy-on-write helper: returns a new layer grid with one cell replaced. */
export function patchLayer(
  layers: Layers,
  layer: LayerId,
  changes: { col: number; row: number; tile: Tile }[]
): Layers {
  const grid = layers[layer];
  let nextGrid = grid;
  let changed = false;

  for (const change of changes) {
    const current = nextGrid[change.row]?.[change.col];
    if (!current) continue;
    if (nextGrid === grid) nextGrid = grid.map((row) => [...row]);
    nextGrid[change.row][change.col] = change.tile;
    changed = true;
  }

  if (!changed) return layers;
  return { ...layers, [layer]: nextGrid };
}

/**
 * Flatten every layer into one tile grid for printing.
 * The topmost solid terrain wins; props are decoration only, and notes
 * from every layer are kept so GM scribbles still reach the appendix.
 */
export function compositeLayers(
  layers: Layers,
  cols: number,
  rows: number
): Tile[][] {
  const propIds = new Set(
    MAP_TERRAINS.filter((t) => t.kind === "prop").map((t) => t.id)
  );

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      let terrain = layers.floor[row]?.[col]?.terrain || "grass";
      const notes: string[] = [];

      for (const id of LAYER_IDS) {
        const tile = layers[id][row]?.[col];
        if (!tile) continue;
        if (tile.note.trim()) notes.push(tile.note.trim());
        if (
          id !== "floor" &&
          tile.terrain &&
          !propIds.has(tile.terrain)
        ) {
          terrain = tile.terrain;
        }
      }

      return { terrain, note: notes.join(" \u2014 ") };
    })
  );
}
