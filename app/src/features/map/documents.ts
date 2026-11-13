import {
  LAYER_IDS,
  MAP_TERRAINS,
  createFog,
  createLayers,
  emptyTile,
  type FogGrid,
  type LayerId,
  type Layers,
  type MapLabel,
  type MapPin,
  type Terrain,
  type Tile,
} from "./model";

/** One open map. Tabs are documents; the workspace is the tab list. */
export interface MapDocument {
  id: string;
  name: string;
  cols: number;
  rows: number;
  layers: Layers;
  labels: MapLabel[];
  /** Numbered points of interest. */
  pins: MapPin[];
  /** Imported tilesets that belong to this map. */
  terrains: Terrain[];
  /** Fog of war, one flag per square. */
  fog: FogGrid;
}

export interface Workspace {
  version: number;
  activeId: string;
  docs: MapDocument[];
}

/** The JSON a saved map downloads as, and the shape import accepts. */
export interface SavedMapFile {
  format?: string;
  version?: number;
  name: string;
  columns: number;
  rows: number;
  terrains?: Terrain[];
  layers: Layers;
  labels?: MapLabel[];
  pins?: MapPin[];
  fog?: FogGrid;
}

export const WORKSPACE_KEY = "rpgmaper:workspace:v1";
export const SAVED_MAP_FORMAT = "rpgmaper-map";
export const DOC_COLS = 32;
export const DOC_ROWS = 32;
/** Largest map an imported file may describe. */
const MAX_IMPORT_SIZE = 200;

function newDocId(): string {
  return `map-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function createDocument(
  name = "New Map",
  cols = DOC_COLS,
  rows = DOC_ROWS
): MapDocument {
  return {
    id: newDocId(),
    name,
    cols,
    rows,
    layers: createLayers(cols, rows),
    labels: [],
    pins: [],
    terrains: [],
    fog: createFog(cols, rows),
  };
}

function isDocument(value: unknown): value is MapDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<MapDocument>;
  if (typeof doc.id !== "string" || typeof doc.name !== "string") return false;
  if (typeof doc.cols !== "number" || typeof doc.rows !== "number") return false;
  if (!doc.layers || typeof doc.layers !== "object") return false;
  return LAYER_IDS.every((id) => Array.isArray(doc.layers?.[id]));
}

/** Restore the last workspace, ignoring anything malformed. */
export function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Workspace>;
    const docs = (parsed.docs ?? []).filter(isDocument).map((doc) => {
      const cols = Math.max(1, Math.round(doc.cols));
      const rows = Math.max(1, Math.round(doc.rows));
      return {
        ...doc,
        cols,
        rows,
        labels: Array.isArray(doc.labels) ? doc.labels : [],
        pins: normalisePins(doc.pins, cols, rows),
        terrains: Array.isArray(doc.terrains) ? doc.terrains : [],
        fog: normaliseFog(doc.fog, cols, rows),
      };
    });
    if (docs.length === 0) return null;
    const activeId = docs.some((doc) => doc.id === parsed.activeId)
      ? (parsed.activeId as string)
      : docs[0].id;
    return { version: 1, activeId, docs };
  } catch {
    return null;
  }
}

/** Persist the workspace. Returns false when the browser refuses the write
 * (storage full, private mode), so the UI can say autosave stopped. */
export function saveWorkspace(workspace: Workspace): boolean {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

/** The payload behind the Save button: everything needed to reopen the map. */
export function buildSavedMap(
  doc: MapDocument,
  terrains: Terrain[]
): SavedMapFile {
  return {
    format: SAVED_MAP_FORMAT,
    version: 1,
    name: doc.name,
    columns: doc.cols,
    rows: doc.rows,
    terrains,
    layers: doc.layers,
    labels: doc.labels,
    pins: doc.pins,
    fog: doc.fog,
  };
}

function normaliseTile(value: unknown): Tile {
  if (!value || typeof value !== "object") return emptyTile();
  const tile = value as Partial<Tile>;
  const next: Tile = {
    terrain: typeof tile.terrain === "string" ? tile.terrain : "",
    note: typeof tile.note === "string" ? tile.note : "",
  };
  if (typeof tile.variant === "number") next.variant = tile.variant;
  if (typeof tile.rotation === "number") next.rotation = tile.rotation;
  if (typeof tile.scale === "number") next.scale = tile.scale;
  return next;
}

function normaliseFog(value: unknown, cols: number, rows: number): FogGrid {
  const fog = createFog(cols, rows);
  if (!Array.isArray(value)) return fog;
  for (let row = 0; row < rows; row += 1) {
    const line = value[row];
    if (!Array.isArray(line)) continue;
    for (let col = 0; col < cols; col += 1) {
      fog[row][col] = line[col] === true;
    }
  }
  return fog;
}

function normaliseLabels(
  value: unknown,
  cols: number,
  rows: number
): MapLabel[] {
  if (!Array.isArray(value)) return [];
  const labels: MapLabel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = item as Partial<MapLabel>;
    if (typeof label.text !== "string" || !label.text.trim()) continue;
    if (typeof label.col !== "number" || typeof label.row !== "number") continue;
    const col = Math.round(label.col);
    const row = Math.round(label.row);
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
    labels.push({
      id:
        typeof label.id === "string" && label.id
          ? label.id
          : `label-${col}-${row}-${labels.length}`,
      col,
      row,
      text: label.text.slice(0, 120),
    });
  }
  return labels;
}

function normalisePins(
  value: unknown,
  cols: number,
  rows: number
): MapPin[] {
  if (!Array.isArray(value)) return [];
  const pins: MapPin[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const pin = item as Partial<MapPin>;
    if (typeof pin.col !== "number" || typeof pin.row !== "number") continue;
    const col = Math.round(pin.col);
    const row = Math.round(pin.row);
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
    const key = `${col},${row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      typeof pin.label === "string" ? pin.label.trim().slice(0, 8) : "";
    pins.push({
      id:
        typeof pin.id === "string" && pin.id
          ? pin.id
          : `pin-${col}-${row}-${pins.length}`,
      col,
      row,
      label: label || String(pins.length + 1),
      note: typeof pin.note === "string" ? pin.note.slice(0, 300) : "",
    });
  }
  return pins;
}

/** Keep only tilesets this map brought with it; the built-in palette is
 * already available to every map. */
function normaliseTerrains(value: unknown): Terrain[] {
  if (!Array.isArray(value)) return [];
  const builtin = new Set(MAP_TERRAINS.map((terrain) => terrain.id));
  const seen = new Set<string>();
  const terrains: Terrain[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const terrain = item as Partial<Terrain>;
    if (typeof terrain.id !== "string" || !terrain.id) continue;
    if (builtin.has(terrain.id) || seen.has(terrain.id)) continue;
    if (typeof terrain.name !== "string") continue;
    const layers = Array.isArray(terrain.layers)
      ? terrain.layers.filter((id): id is LayerId =>
          LAYER_IDS.includes(id as LayerId)
        )
      : [];
    seen.add(terrain.id);
    terrains.push({
      id: terrain.id,
      name: terrain.name.slice(0, 24),
      symbol:
        typeof terrain.symbol === "string" ? terrain.symbol.slice(0, 2) : "\u25A6",
      color: typeof terrain.color === "string" ? terrain.color : "#6b7280",
      altColor:
        typeof terrain.altColor === "string" ? terrain.altColor : "#94a3b8",
      kind:
        terrain.kind === "wall" || terrain.kind === "prop"
          ? terrain.kind
          : "ground",
      layers: layers.length > 0 ? layers : ["floor"],
      image:
        typeof terrain.image === "string" && terrain.image.startsWith("data:")
          ? terrain.image
          : undefined,
    });
  }
  return terrains;
}

/**
 * Read a saved map file back into a document. The result always gets a fresh
 * id, so importing the same map twice opens two tabs instead of clobbering the
 * map already in the workspace.
 */
export function importMapFile(
  text: string,
  fallbackName = "Imported map"
): { doc: MapDocument } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "That file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "That file does not contain a map." };
  }

  const data = raw as Record<string, unknown>;
  const rawLayers = data.layers;
  if (!rawLayers || typeof rawLayers !== "object") {
    return { error: "That file has no layers, so it is not a saved map." };
  }
  const source = rawLayers as Record<string, unknown>;
  if (!LAYER_IDS.some((id) => Array.isArray(source[id]))) {
    return { error: "That file has no layer grids to import." };
  }

  const cols = Number(data.columns);
  const rows = Number(data.rows);
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 1 ||
    rows < 1
  ) {
    return { error: "That map is missing a valid width and height." };
  }
  if (cols > MAX_IMPORT_SIZE || rows > MAX_IMPORT_SIZE) {
    return {
      error: `That map is ${cols} × ${rows}; the editor stops at ${MAX_IMPORT_SIZE} squares.`,
    };
  }

  const layers = {} as Layers;
  for (const id of LAYER_IDS) {
    const grid = Array.isArray(source[id]) ? (source[id] as unknown[]) : [];
    layers[id] = Array.from({ length: rows }, (_, row) => {
      const line = Array.isArray(grid[row]) ? (grid[row] as unknown[]) : [];
      return Array.from({ length: cols }, (_, col) =>
        normaliseTile(line[col])
      );
    });
  }

  const rawName =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : fallbackName;
  const name = (rawName || "Imported map").slice(0, 40);

  return {
    doc: {
      id: newDocId(),
      name,
      cols,
      rows,
      layers,
      labels: normaliseLabels(data.labels, cols, rows),
      pins: normalisePins(data.pins, cols, rows),
      terrains: normaliseTerrains(data.terrains),
      fog: normaliseFog(data.fog, cols, rows),
    },
  };
}
