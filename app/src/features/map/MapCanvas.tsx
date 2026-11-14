import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapGrid, type Camera } from "../../components/MapGrid";
import { NumberStepper } from "../../components/ui/NumberStepper";
import { Chip } from "../../components/ui/Chip";
import { PrintDialog } from "../../components/PrintDialog";
import { PrintDocument } from "../../components/PrintSheets";
import { ExportDialog } from "../../components/ExportDialog";
import { CloudDialog } from "../../components/CloudDialog";
import { getSession, loadCloudMap, type CloudSession } from "./cloud";
import { buildDungeon } from "./dungeon";
import { ShortcutsDialog } from "../../components/ShortcutsDialog";
import { DEFAULT_PRINT_OPTIONS, type PrintOptions } from "./print";
import type { Cell } from "./painting";
import {
  EMPTY_TERRAIN,
  LAYER_IDS,
  MAP_TERRAINS,
  compositeLayers,
  createFog,
  createLayers,
  resizeFog,
  resizeLayers,
  terrainsForLayer,
  type FogGrid,
  type LayerId,
  type Layers,
  type MapLabel,
  type MapPin,
  type Terrain,
  type TerrainId,
  type Tile,
} from "./model";
import {
  buildSavedMap,
  createDocument,
  importMapFile,
  loadWorkspace,
  saveWorkspace,
  type MapDocument,
} from "./documents";

/** Default terrain set for an RPG map editor. */
export const DEFAULT_TERRAINS: Terrain[] = MAP_TERRAINS;

const MIN_SIZE = 4;
const MAX_SIZE = 64;
const HISTORY_LIMIT = 50;
/** Tiles a single imported sheet may produce. */
const SLICE_LIMIT = 64;
const SLICE_MIN = 8;
const SLICE_MAX = 256;
/** How often the workspace is written to localStorage, in ms. */
const AUTOSAVE_MS = 5000;

const DEFAULT_CAMERA: Camera = {
  x: 0,
  y: 0,
  zoom: 1,
  minZoom: 0.15,
  maxZoom: 6,
};

const DEFAULT_VISIBILITY: Record<LayerId, boolean> = {
  floor: true,
  objects: true,
  walls: true,
  gm: true,
};

/** One undoable change: every layer plus the dimensions and labels it had. */
interface Snapshot {
  cols: number;
  rows: number;
  layers: Layers;
  labels: MapLabel[];
  pins: MapPin[];
  fog: FogGrid;
}

/** A tile written somewhere by a selection move or paste. */
interface AreaWrite {
  layer: LayerId;
  col: number;
  row: number;
  tile: Tile;
}

/** A cell emptied on one layer by a move, paste or delete. */
interface AreaClear {
  layer: LayerId;
  col: number;
  row: number;
}

interface DocHistory {
  past: Snapshot[];
  future: Snapshot[];
}

const EMPTY_HISTORY: DocHistory = { past: [], future: [] };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = src;
  });
}

/** Cut a sprite sheet into square tiles, row by row, as data URLs. */
function sliceSheet(image: HTMLImageElement, size: number): string[] {
  const cols = Math.floor(image.width / size);
  const rows = Math.floor(image.height / size);
  if (cols < 1 || rows < 1) return [];

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const urls: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(image, col * size, row * size, size, size, 0, 0, size, size);
      urls.push(canvas.toDataURL("image/png"));
      if (urls.length >= SLICE_LIMIT) return urls;
    }
  }
  return urls;
}

const snapshotOf = (doc: MapDocument): Snapshot => ({
  cols: doc.cols,
  rows: doc.rows,
  layers: doc.layers,
  labels: doc.labels,
  pins: doc.pins,
  fog: doc.fog,
});

/** MapCanvas is the top-level editor screen. It owns the open maps, their
 * undo histories, autosave and the viewport, and hands the active map to
 * MapGrid.
 */
export function MapCanvas() {
  const restored = useRef(loadWorkspace());
  const [docs, setDocs] = useState<MapDocument[]>(() =>
    restored.current && restored.current.docs.length > 0
      ? restored.current.docs
      : [createDocument()]
  );
  const [activeId, setActiveId] = useState<string>(
    () => restored.current?.activeId ?? ""
  );
  const doc = docs.find((item) => item.id === activeId) ?? docs[0];

  const [camera, setCamera] = useState<Camera>({ ...DEFAULT_CAMERA });
  const terrains = useMemo(
    () => [...MAP_TERRAINS, ...doc.terrains],
    [doc.terrains]
  );
  const [selectedTerrainId, setSelectedTerrainId] = useState<TerrainId | null>(
    "grass"
  );
  const [selectedTile, setSelectedTile] = useState<{
    col: number;
    row: number;
  } | null>(null);

  const [activeLayer, setActiveLayer] = useState<LayerId>("floor");
  const [layerVisible, setLayerVisible] =
    useState<Record<LayerId, boolean>>(DEFAULT_VISIBILITY);
  const [showGrid, setShowGrid] = useState(true);
  const [textures, setTextures] = useState(true);
  const [symmetry, setSymmetry] = useState(false);
  const [showFog, setShowFog] = useState(true);
  const [playerView, setPlayerView] = useState(false);
  const [lights, setLights] = useState(true);
  const [compass, setCompass] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Presentation mode: only the map is on screen, as players should see it. */
  const [presenting, setPresenting] = useState(false);

  const [history, setHistory] = useState<Record<string, DocHistory>>({});

  const [session, setSession] = useState<CloudSession | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintOptions>(
    DEFAULT_PRINT_OPTIONS
  );

  // Size fields are typed freely; only an in-range number resizes the map.
  const [colsText, setColsText] = useState(String(doc.cols));
  const [rowsText, setRowsText] = useState(String(doc.rows));
  const [sheetMode, setSheetMode] = useState(false);
  const [sheetSize, setSheetSize] = useState(32);
  const [sheetSizeText, setSheetSizeText] = useState("32");
  const [importNote, setImportNote] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<{
    at: number | null;
    error: string | null;
  }>({
    at: restored.current ? Date.now() : null,
    error: null,
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const mapFileRef = useRef<HTMLInputElement>(null);

  /** Latest document id, so batched writers always hit the visible map. */
  const docId = doc.id;

  const updateDoc = useCallback(
    (updater: (current: MapDocument) => MapDocument) => {
      setDocs((prev) =>
        prev.map((item) => (item.id === docId ? updater(item) : item))
      );
    },
    [docId]
  );

  useEffect(() => {
    setColsText(String(doc.cols));
    setRowsText(String(doc.rows));
  }, [doc.cols, doc.rows]);

  // Who is signed in, for the account chip. The server still decides access.
  useEffect(() => {
    let alive = true;
    void getSession().then((next) => {
      if (alive) setSession(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Import and save confirmations fade out on their own.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (docs.some((item) => item.id === activeId)) return;
    setActiveId(docs[0].id);
  }, [docs, activeId]);

  /** Keep the palette honest when switching maps. */
  useEffect(() => {
    setSelectedTerrainId((current) => {
      if (current && terrains.some((terrain) => terrain.id === current)) {
        return current;
      }
      return terrainsForLayer(terrains, activeLayer)[0]?.id ?? null;
    });
  }, [terrains, activeLayer]);

  /** Map state captured before a stroke starts, so the drag undoes as one. */
  const strokeSnapshot = useRef<Snapshot | null>(null);
  /** Document state captured when a label editor or drag opens. */
  const labelSnapshot = useRef<Snapshot | null>(null);
  /** Whether the open label editor actually changed anything. */
  const labelDirty = useRef(false);
  /** Same grouping for a pin drag or a badge/note edit. */
  const pinSnapshot = useRef<Snapshot | null>(null);
  const pinDirty = useRef(false);

  const docHistory = history[doc.id] ?? EMPTY_HISTORY;
  const canUndo = docHistory.past.length > 0;
  const canRedo = docHistory.future.length > 0;

  const note = selectedTile
    ? (doc.layers[activeLayer][selectedTile.row]?.[selectedTile.col]?.note ??
      "")
    : "";

  /** Flattened view of every layer, for printing. */
  const printTiles = useMemo(
    () => compositeLayers(doc.layers, doc.cols, doc.rows),
    [doc.layers, doc.cols, doc.rows]
  );

  const pushHistory = useCallback(
    (entry: Snapshot) => {
      setHistory((prev) => {
        const current = prev[docId] ?? EMPTY_HISTORY;
        return {
          ...prev,
          [docId]: {
            past: [...current.past, entry].slice(-HISTORY_LIMIT),
            future: [],
          },
        };
      });
    },
    [docId]
  );

  const onTileChange = useCallback(
    (col: number, row: number, updates: Partial<{ note: string }>) => {
      updateDoc((current) => {
        const grid = current.layers[activeLayer];
        const tile = grid[row]?.[col];
        if (!tile || tile.note === updates.note) return current;
        const nextGrid = grid.map((line) => [...line]);
        nextGrid[row][col] = { ...tile, ...updates };
        return {
          ...current,
          layers: { ...current.layers, [activeLayer]: nextGrid },
        };
      });
    },
    [activeLayer, updateDoc]
  );

  /** Batch terrain paint: one state update per drag step or fill. */
  const onPaintCells = useCallback(
    (
      cells: Cell[],
      terrainId: TerrainId,
      layerId: LayerId,
      randomize = false
    ) => {
      updateDoc((current) => {
        const grid = current.layers[layerId];
        let next = grid;
        let changed = false;

        for (const cell of cells) {
          const existing = next[cell.row]?.[cell.col];
          if (!existing) continue;
          if (!randomize && existing.terrain === terrainId) continue;
          // Scattering props thins them out so a forest looks organic instead
          // of one tree in every square.
          if (randomize && layerId === "objects" && Math.random() < 0.45) {
            continue;
          }

          const tile = randomize
            ? {
                ...existing,
                terrain: terrainId,
                variant: Math.random(),
                rotation: Math.floor(Math.random() * 4),
                scale: 0.75 + Math.random() * 0.4,
              }
            : { ...existing, terrain: terrainId };

          if (next === grid) next = grid.map((row) => [...row]);
          next[cell.row][cell.col] = tile;
          changed = true;
        }

        if (!changed) return current;
        return { ...current, layers: { ...current.layers, [layerId]: next } };
      });
    },
    [updateDoc]
  );

  /** Selection moves, pastes and deletes: any number of layers, one step. */
  const onApplyArea = useCallback(
    (writes: AreaWrite[], clears: AreaClear[]) => {
      if (writes.length === 0 && clears.length === 0) return;
      pushHistory(snapshotOf(doc));
      updateDoc((current) => {
        const next: Layers = { ...current.layers };
        const touched = new Set<LayerId>();
        const writable = (layer: LayerId) => {
          if (!touched.has(layer)) {
            next[layer] = current.layers[layer].map((row) => [...row]);
            touched.add(layer);
          }
          return next[layer];
        };

        for (const cell of clears) {
          const grid = writable(cell.layer);
          const existing = grid[cell.row]?.[cell.col];
          if (!existing) continue;
          if (!existing.terrain && !existing.note) continue;
          grid[cell.row][cell.col] = {
            ...existing,
            terrain: EMPTY_TERRAIN,
            note: "",
            rotation: undefined,
            scale: undefined,
          };
        }
        for (const item of writes) {
          const grid = writable(item.layer);
          if (!grid[item.row]?.[item.col]) continue;
          grid[item.row][item.col] = { ...item.tile };
        }

        if (touched.size === 0) return current;
        return { ...current, layers: next };
      });
    },
    [doc, pushHistory, updateDoc]
  );

  /** Fog tool: flip the touched squares, as one undo step per stroke. */
  const onToggleFogCells = useCallback(
    (cells: Cell[]) => {
      if (cells.length === 0) return;
      updateDoc((current) => {
        const next = current.fog.map((line) => [...line]);
        let changed = false;
        for (const cell of cells) {
          const line = next[cell.row];
          if (!line || line[cell.col] === undefined) continue;
          line[cell.col] = !line[cell.col];
          changed = true;
        }
        return changed ? { ...current, fog: next } : current;
      });
    },
    [updateDoc]
  );

  const onSetLabel = useCallback(
    (col: number, row: number, text: string) => {
      labelDirty.current = true;
      updateDoc((current) => {
        const existing = current.labels.find(
          (label) => label.col === col && label.row === row
        );
        if (!text.trim()) {
          return existing
            ? {
                ...current,
                labels: current.labels.filter((label) => label !== existing),
              }
            : current;
        }
        if (existing) {
          if (existing.text === text) return current;
          return {
            ...current,
            labels: current.labels.map((label) =>
              label === existing ? { ...label, text } : label
            ),
          };
        }
        return {
          ...current,
          labels: [
            ...current.labels,
            {
              id: `label-${col}-${row}-${Date.now().toString(36)}`,
              col,
              row,
              text,
            },
          ],
        };
      });
    },
    [updateDoc]
  );

  const onMoveLabel = useCallback(
    (id: string, col: number, row: number) => {
      updateDoc((current) => {
        const target = current.labels.find((label) => label.id === id);
        if (!target || (target.col === col && target.row === row)) {
          return current;
        }
        labelDirty.current = true;
        return {
          ...current,
          labels: current.labels.map((label) =>
            label.id === id ? { ...label, col, row } : label
          ),
        };
      });
    },
    [updateDoc]
  );

  /** Open one undo step for a label edit or drag. */
  const onLabelStart = useCallback(() => {
    labelSnapshot.current = snapshotOf(doc);
    labelDirty.current = false;
  }, [doc]);

  /** Close that step, keeping it only when the label really changed. */
  const onLabelCommit = useCallback(() => {
    const snapshot = labelSnapshot.current;
    labelSnapshot.current = null;
    if (!snapshot || !labelDirty.current) return;
    labelDirty.current = false;
    pushHistory(snapshot);
  }, [pushHistory]);

  /** Next badge number: one past the highest numbered pin. */
  const nextPinLabel = useCallback(() => {
    const highest = doc.pins.reduce((max, pin) => {
      const value = Number(pin.label);
      return Number.isFinite(value) ? Math.max(max, Math.round(value)) : max;
    }, 0);
    return String(highest + 1);
  }, [doc.pins]);

  /** Drop a pin on a square and return its id so the caller can select it. */
  const onAddPin = useCallback(
    (col: number, row: number) => {
      // One pin per square: an occupied square re-selects its pin instead of
      // stacking a second badge on the same tile.
      const existing = doc.pins.find(
        (item) => item.col === col && item.row === row
      );
      if (existing) return existing.id;
      const pin: MapPin = {
        id: `pin-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 5)}`,
        col,
        row,
        label: nextPinLabel(),
        note: "",
      };
      pushHistory(snapshotOf(doc));
      updateDoc((current) => ({ ...current, pins: [...current.pins, pin] }));
      return pin.id;
    },
    [doc, nextPinLabel, pushHistory, updateDoc]
  );

  const onSetPin = useCallback(
    (id: string, changes: Partial<MapPin>) => {
      pinDirty.current = true;
      updateDoc((current) => ({
        ...current,
        pins: current.pins.map((pin) =>
          pin.id === id ? { ...pin, ...changes } : pin
        ),
      }));
    },
    [updateDoc]
  );

  const onRemovePin = useCallback(
    (id: string) => {
      if (!doc.pins.some((pin) => pin.id === id)) return;
      pushHistory(snapshotOf(doc));
      updateDoc((current) => ({
        ...current,
        pins: current.pins.filter((pin) => pin.id !== id),
      }));
    },
    [doc, pushHistory, updateDoc]
  );

  const onMovePin = useCallback(
    (id: string, col: number, row: number) => {
      updateDoc((current) => {
        const target = current.pins.find((pin) => pin.id === id);
        if (!target || (target.col === col && target.row === row)) {
          return current;
        }
        // One pin per square, so a drag onto another pin stops short.
        const taken = current.pins.some(
          (pin) => pin.id !== id && pin.col === col && pin.row === row
        );
        if (taken) return current;
        pinDirty.current = true;
        return {
          ...current,
          pins: current.pins.map((pin) =>
            pin.id === id ? { ...pin, col, row } : pin
          ),
        };
      });
    },
    [updateDoc]
  );

  /** Open and close one undo step around a pin drag or inspector edit. */
  const onPinStart = useCallback(() => {
    pinSnapshot.current = snapshotOf(doc);
    pinDirty.current = false;
  }, [doc]);

  const onPinCommit = useCallback(() => {
    const snapshot = pinSnapshot.current;
    pinSnapshot.current = null;
    if (!snapshot || !pinDirty.current) return;
    pinDirty.current = false;
    pushHistory(snapshot);
  }, [pushHistory]);

  /** Import PNG tilesets: a whole image or a sliced sprite sheet. */
  const importTilesets = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const imported: Terrain[] = [];
      let index = 0;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        try {
          const image = await readAsDataUrl(file);
          const base =
            file.name.replace(/\.[^.]+$/, "").slice(0, 16) || "Tileset";

          const pushTerrain = (name: string, src: string) => {
            imported.push({
              id: `tileset-${Date.now().toString(36)}-${index}`,
              name: name.slice(0, 18),
              symbol: "\u25A6",
              color: "#6b7280",
              altColor: "#94a3b8",
              kind: "ground",
              layers: ["floor", "walls", "gm"],
              image: src,
            });
            index += 1;
          };

          if (sheetMode) {
            const element = await loadImage(image);
            const pieces = sliceSheet(element, sheetSize);
            if (pieces.length === 0) {
              pushTerrain(base, image);
              continue;
            }
            pieces.forEach((src, i) => pushTerrain(`${base} ${i + 1}`, src));
            continue;
          }

          pushTerrain(base, image);
        } catch {
          // Unreadable file: skip it rather than losing the whole import.
        }
      }

      if (imported.length === 0) return;
      updateDoc((current) => ({
        ...current,
        terrains: [...current.terrains, ...imported],
      }));
      setActiveLayer("floor");
      setSelectedTerrainId(imported[0].id);
      setImportNote(
        sheetMode
          ? `${imported.length} tile${imported.length === 1 ? "" : "s"} from sheet`
          : `${imported.length} tileset${imported.length === 1 ? "" : "s"} imported`
      );
    },
    [sheetMode, sheetSize, updateDoc]
  );

  /** Drop every imported tileset, and any tiles still using one. */
  const clearTilesets = useCallback(() => {
    if (doc.terrains.length === 0) return;
    pushHistory(snapshotOf(doc));
    const builtin = new Set(MAP_TERRAINS.map((terrain) => terrain.id));
    updateDoc((current) => {
      const next: Layers = { ...current.layers };
      for (const id of LAYER_IDS) {
        next[id] = current.layers[id].map((row) =>
          row.map((tile) => {
            if (!tile.terrain || builtin.has(tile.terrain)) return tile;
            return {
              ...tile,
              terrain: id === "floor" ? "grass" : EMPTY_TERRAIN,
              note: id === "floor" ? tile.note : "",
            };
          })
        );
      }
      return { ...current, layers: next, terrains: [] };
    });
    setSelectedTerrainId((current) =>
      current && builtin.has(current) ? current : "grass"
    );
    setImportNote(null);
  }, [doc, pushHistory, updateDoc]);

  const onTerrainChange = useCallback((id: TerrainId | null) => {
    setSelectedTerrainId(id);
  }, []);

  const onLayerChange = useCallback((layerId: LayerId) => {
    setActiveLayer(layerId);
    // Keep the palette honest: switch terrain if it cannot live on this layer.
    const options = terrainsForLayer(MAP_TERRAINS, layerId);
    setSelectedTerrainId((current) =>
      options.some((terrain) => terrain.id === current)
        ? current
        : (options[0]?.id ?? null)
    );
  }, []);

  const onToggleLayer = useCallback((layerId: LayerId) => {
    setLayerVisible((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const onCameraChange = useCallback((next: Camera) => {
    setCamera(next);
  }, []);

  const onStrokeStart = useCallback(() => {
    strokeSnapshot.current = snapshotOf(doc);
  }, [doc]);

  /** Grid only opens a snapshot on the first square that really changes,
   * so a snapshot means there is something to undo — even for shapes and
   * fills that paint and finish inside a single event. */
  const onStrokeEnd = useCallback(() => {
    const snapshot = strokeSnapshot.current;
    strokeSnapshot.current = null;
    if (snapshot) pushHistory(snapshot);
  }, [pushHistory]);

  /** A pinch started mid-stroke: drop the tiles that stroke already painted. */
  const onStrokeCancel = useCallback(() => {
    const snapshot = strokeSnapshot.current;
    strokeSnapshot.current = null;
    if (snapshot) {
      updateDoc((current) => ({ ...current, layers: snapshot.layers }));
    }
  }, [updateDoc]);

  const undo = useCallback(() => {
    const target = docHistory.past[docHistory.past.length - 1];
    if (!target) return;
    const current = snapshotOf(doc);
    setHistory((prev) => {
      const entry = prev[docId] ?? EMPTY_HISTORY;
      return {
        ...prev,
        [docId]: {
          past: entry.past.slice(0, -1),
          future: [...entry.future, current],
        },
      };
    });
    updateDoc((item) => ({
      ...item,
      cols: target.cols,
      rows: target.rows,
      layers: target.layers,
      labels: target.labels,
      pins: target.pins,
      fog: target.fog,
    }));
    setSelectedTile(null);
  }, [docHistory, doc, docId, updateDoc]);

  const redo = useCallback(() => {
    const target = docHistory.future[docHistory.future.length - 1];
    if (!target) return;
    const current = snapshotOf(doc);
    setHistory((prev) => {
      const entry = prev[docId] ?? EMPTY_HISTORY;
      return {
        ...prev,
        [docId]: {
          past: [...entry.past, current].slice(-HISTORY_LIMIT),
          future: entry.future.slice(0, -1),
        },
      };
    });
    updateDoc((item) => ({
      ...item,
      cols: target.cols,
      rows: target.rows,
      layers: target.layers,
      labels: target.labels,
      pins: target.pins,
      fog: target.fog,
    }));
    setSelectedTile(null);
  }, [docHistory, doc, docId, updateDoc]);

  const clearMap = useCallback(() => {
    pushHistory(snapshotOf(doc));
    updateDoc((current) => ({
      ...current,
      layers: createLayers(current.cols, current.rows),
      labels: [],
      pins: [],
      fog: createFog(current.cols, current.rows),
    }));
  }, [doc, pushHistory, updateDoc]);

  const resizeMap = useCallback(
    (cols: number, rows: number) => {
      if (cols === doc.cols && rows === doc.rows) return;
      pushHistory(snapshotOf(doc));
      updateDoc((current) => ({
        ...current,
        cols,
        rows,
        layers: resizeLayers(current.layers, cols, rows),
        labels: current.labels.filter(
          (label) => label.col < cols && label.row < rows
        ),
        pins: current.pins.filter(
          (pin) => pin.col < cols && pin.row < rows
        ),
        fog: resizeFog(current.fog, cols, rows),
      }));
      setSelectedTile(null);
    },
    [doc, pushHistory, updateDoc]
  );

  /** Resize from a stepper: ignore empty, partial or out-of-range input. */
  const handleSizeChange = useCallback(
    (value: string, axis: "cols" | "rows") => {
      const next = Number(value);
      if (value.trim() === "" || !Number.isFinite(next)) return;
      if (next < MIN_SIZE || next > MAX_SIZE) return;
      if (axis === "cols") resizeMap(next, doc.rows);
      else resizeMap(doc.cols, next);
    },
    [doc.cols, doc.rows, resizeMap]
  );

  const enterPlayerMode = useCallback(() => {
    setPlayerView(true);
    setPresenting(true);
    const root = document.documentElement;
    if (root.requestFullscreen) {
      void root.requestFullscreen().catch(() => {
        // Blocked or unsupported: the CSS still fills the screen.
      });
    }
    // The canvas is about to grow; let the grid refit to the new size.
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
  }, []);

  const exitPlayerMode = useCallback(() => {
    setPresenting(false);
    setPlayerView(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Esc leaves presentation mode; so does the browser's own fullscreen exit.
  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitPlayerMode();
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        setPresenting(false);
        setPlayerView(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [presenting, exitPlayerMode]);

  /** Fill the current map with a fresh random dungeon, as one undo step. */
  const generateDungeon = useCallback(() => {
    const ok = window.confirm(
      "Generate a random dungeon? It replaces this map's floor, walls, objects and fog."
    );
    if (!ok) return;
    const plan = buildDungeon(doc.cols, doc.rows);
    pushHistory(snapshotOf(doc));
    updateDoc((current) => {
      const blank = (terrain: string) =>
        Array.from({ length: current.rows }, () =>
          Array.from({ length: current.cols }, () => ({ terrain, note: "" }))
        );
      const floor = blank("grass");
      const walls = blank("");
      for (const cell of plan.floors) {
        floor[cell.row][cell.col] = { terrain: "floor-stone", note: "" };
      }
      for (const cell of plan.walls) {
        walls[cell.row][cell.col] = { terrain: "wall", note: "" };
      }
      return {
        ...current,
        layers: {
          floor,
          walls,
          objects: blank(""),
          gm: blank(""),
        },
        fog: Array.from({ length: current.rows }, () =>
          Array.from({ length: current.cols }, () => false)
        ),
      };
    });
    setSelectedTile(null);
    setNotice("Rolled a dungeon — reshape it with the brush");
  }, [doc, pushHistory, updateDoc]);

  const saveMap = useCallback(() => {
    const payload = buildSavedMap(doc, terrains);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${doc.name.trim() || "map"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Saved “${doc.name.trim() || "map"}”.json`);
  }, [doc, terrains]);

  /** Open a saved map JSON file as a new tab, next to the workspace maps. */
  const importMapJson = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    let text = "";
    try {
      text = await file.text();
    } catch {
      setNotice("Could not read that file.");
      return;
    }
    const result = importMapFile(
      text,
      file.name.replace(/\.[^.]+$/, "")
    );
    if ("error" in result) {
      setNotice(result.error);
      return;
    }
    setDocs((prev) => [...prev, result.doc]);
    setActiveId(result.doc.id);
    setSelectedTile(null);
    setNotice(`Imported “${result.doc.name}” as a new tab`);
  }, []);

  // --- Tabs ---
  const addDoc = useCallback(() => {
    const next = createDocument(
      `Map ${docs.length + 1}`,
      doc.cols,
      doc.rows
    );
    setDocs((prev) => [...prev, next]);
    setActiveId(next.id);
    setSelectedTile(null);
  }, [docs.length, doc.cols, doc.rows]);

  const closeDoc = useCallback(
    (id: string) => {
      if (docs.length <= 1) return;
      const index = docs.findIndex((item) => item.id === id);
      const rest = docs.filter((item) => item.id !== id);
      setDocs(rest);
      if (id === doc.id) {
        setActiveId(rest[Math.max(0, index - 1)].id);
        setSelectedTile(null);
      }
      setHistory((prev) => {
        if (!(id in prev)) return prev;
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    },
    [docs, doc.id]
  );

  const switchDoc = useCallback((id: string) => {
    setActiveId(id);
    setSelectedTile(null);
  }, []);

  /** Open a cloud save as a tab, keeping its cloud id so re-saving updates
   * the same entry instead of creating a duplicate. */
  const openCloudMap = useCallback(
    async (id: string, name: string) => {
      if (docs.some((item) => item.id === id)) {
        switchDoc(id);
        setCloudOpen(false);
        return;
      }
      const text = await loadCloudMap(id);
      const result = importMapFile(text, name);
      if ("error" in result) {
        setNotice(result.error);
        return;
      }
      const opened = { ...result.doc, id };
      setDocs((prev) => [...prev, opened]);
      setActiveId(id);
      setSelectedTile(null);
      setHistory((prev) => {
        if (!(id in prev)) return prev;
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setNotice(`Opened “${opened.name}” from your cloud maps`);
      setCloudOpen(false);
    },
    [docs, switchDoc]
  );

  // --- Autosave: write on idle, on a cadence, and when the tab hides ---
  const latest = useRef({ docs, activeId });
  latest.current = { docs, activeId };
  const savedSignature = useRef<string>(
    restored.current ? JSON.stringify(restored.current.docs) : ""
  );

  /** Write the workspace if it differs from the last good save. A failed
   * write keeps the error visible but leaves the change dirty, so the next
   * tick retries instead of giving up on autosave. */
  const saveNow = useCallback(() => {
    const { docs: currentDocs, activeId: currentId } = latest.current;
    const signature = JSON.stringify(currentDocs);
    if (signature === savedSignature.current) return;
    const ok = saveWorkspace({
      version: 1,
      activeId: currentId,
      docs: currentDocs,
    });
    if (ok) {
      savedSignature.current = signature;
      setSaveState({ at: Date.now(), error: null });
    } else {
      setSaveState((prev) => ({
        at: prev.at,
        error: "Storage full — retrying on the next autosave",
      }));
    }
  }, []);

  // Save shortly after edits stop, so a crash costs little, and keep a fixed
  // cadence for long painting sessions where edits never stop.
  useEffect(() => {
    const idle = window.setTimeout(saveNow, 1200);
    return () => window.clearTimeout(idle);
  }, [docs, activeId, saveNow]);

  useEffect(() => {
    const timer = window.setInterval(saveNow, AUTOSAVE_MS);
    const flush = () => saveNow();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [saveNow]);

  const saveLabel = saveState.error
    ? saveState.error
    : saveState.at
      ? `Autosaved ${new Date(saveState.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "Autosave on";

  return (
    <>
      <div className={`map-screen ${presenting ? "is-presenting" : ""}`}>
        <div className="map-shell">
          <div className="map-tabs">
            <div className="map-tab-list" role="tablist" aria-label="Open maps">
              {docs.map((item) => (
                <span
                  key={item.id}
                  className={`map-tab ${item.id === doc.id ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={item.id === doc.id}
                    className="map-tab-name"
                    title={item.name}
                    onClick={() => switchDoc(item.id)}
                  >
                    {item.name}
                  </button>
                  {docs.length > 1 ? (
                    <button
                      type="button"
                      className="map-tab-close"
                      aria-label={`Close ${item.name}`}
                      onClick={() => closeDoc(item.id)}
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
            <Chip
              size="sm"
              variant="secondary"
              onClick={addDoc}
              ariaLabel="Open another map"
            >
              + Map
            </Chip>
            <Chip
              size="sm"
              variant="secondary"
              onClick={() => mapFileRef.current?.click()}
              ariaLabel="Import a saved map JSON file"
              title="Open a map JSON saved from here as a new tab"
            >
              Import
            </Chip>
            <Chip
              size="sm"
              variant="secondary"
              onClick={generateDungeon}
              ariaLabel="Generate a random dungeon"
              title="Fill this map with random rooms, corridors and walls"
            >
              Dungeon
            </Chip>
            <input
              ref={mapFileRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void importMapJson(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            {session?.supported ? (
              session.user ? (
                <Chip
                  size="sm"
                  variant="secondary"
                  title={session.user.email ?? "Cloud saves"}
                  onClick={() => setCloudOpen(true)}
                >
                  {session.user.name?.trim().split(" ")[0] ?? "Cloud"}
                </Chip>
              ) : (
                <a
                  className="chip chip-secondary chip-sm"
                  href="/auth/freebuff/signin?returnTo=/"
                >
                  Sign in
                </a>
              )
            ) : null}
            {notice ? <span className="map-notice">{notice}</span> : null}
            <span
              className={`autosave-status ${saveState.error ? "is-error" : ""}`}
            >
              {saveLabel}
            </span>
          </div>

          {/* Phones start with the settings folded away so the canvas is the
              first thing on screen; desktop CSS ignores the class. */}
          <button
            type="button"
            className="settings-toggle"
            aria-expanded={settingsOpen}
            aria-controls="map-settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <span>
              Map settings · {doc.cols} × {doc.rows}
            </span>
          </button>

          <div
            id="map-settings"
            className={`map-toolbar ${settingsOpen ? "is-open" : "is-collapsed"}`}
          >
            <div className="toolbar-group">
              <label className="field-label" htmlFor="map-name">
                Map name
              </label>
              <input
                id="map-name"
                className="text-input"
                type="text"
                value={doc.name}
                onChange={(e) => {
                  const name = e.target.value;
                  updateDoc((current) => ({ ...current, name }));
                }}
              />
            </div>
            <div className="toolbar-group">
              <NumberStepper
                label="Columns"
                value={colsText}
                onChange={(value) => {
                  setColsText(value);
                  handleSizeChange(value, "cols");
                }}
              />
            </div>
            <div className="toolbar-group">
              <NumberStepper
                label="Rows"
                value={rowsText}
                onChange={(value) => {
                  setRowsText(value);
                  handleSizeChange(value, "rows");
                }}
              />
            </div>
            <div className="toolbar-group tileset-group">
              <span className="field-label">Tilesets</span>
              <div className="tileset-actions">
                <Chip
                  size="sm"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  Import PNG
                </Chip>
                <Chip
                  size="sm"
                  variant={sheetMode ? "primary" : "secondary"}
                  aria-pressed={sheetMode}
                  title="Cut a sprite sheet into separate tiles"
                  onClick={() => setSheetMode((value) => !value)}
                >
                  Sheet
                </Chip>
                {sheetMode ? (
                  <span className="tileset-size">
                    <input
                      className="text-input tileset-size-input"
                      type="number"
                      inputMode="numeric"
                      min={SLICE_MIN}
                      max={SLICE_MAX}
                      step={8}
                      aria-label="Tile size in pixels"
                      value={sheetSizeText}
                      onChange={(e) => {
                        setSheetSizeText(e.target.value);
                        const next = Number(e.target.value);
                        if (
                          Number.isFinite(next) &&
                          next >= SLICE_MIN &&
                          next <= SLICE_MAX
                        ) {
                          setSheetSize(Math.round(next));
                        }
                      }}
                    />
                    <span className="tileset-size-label">px tiles</span>
                  </span>
                ) : null}
                {doc.terrains.length > 0 ? (
                  <Chip
                    size="sm"
                    variant="secondary"
                    title="Remove imported tilesets"
                    onClick={clearTilesets}
                  >
                    Clear
                  </Chip>
                ) : null}
              </div>
              {importNote ? (
                <span className="tileset-count">{importNote}</span>
              ) : doc.terrains.length > 0 ? (
                <span className="tileset-count">
                  {doc.terrains.length} imported
                </span>
              ) : null}
              <input
                ref={fileRef}
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => {
                  void importTilesets(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          <MapGrid
            columns={doc.cols}
            rows={doc.rows}
            layers={doc.layers}
            layerVisible={layerVisible}
            activeLayer={activeLayer}
            tile={selectedTile}
            camera={camera}
            terrains={terrains}
            selectedTerrainId={selectedTerrainId}
            tileNote={note}
            labels={doc.labels}
            pins={doc.pins}
            showGrid={showGrid}
            textures={textures}
            symmetry={symmetry}
            fog={doc.fog}
            showFog={showFog}
            playerView={playerView}
            lights={lights}
            compass={compass}
            canUndo={canUndo}
            canRedo={canRedo}
            onTileChange={onTileChange}
            onPaintCells={onPaintCells}
            onApplyArea={onApplyArea}
            onSetLabel={onSetLabel}
            onMoveLabel={onMoveLabel}
            onLabelStart={onLabelStart}
            onLabelCommit={onLabelCommit}
            onAddPin={onAddPin}
            onSetPin={onSetPin}
            onRemovePin={onRemovePin}
            onMovePin={onMovePin}
            onPinStart={onPinStart}
            onPinCommit={onPinCommit}
            onTerrainChange={onTerrainChange}
            onLayerChange={onLayerChange}
            onToggleLayer={onToggleLayer}
            onToggleGrid={() => setShowGrid((value) => !value)}
            onToggleTextures={() => setTextures((value) => !value)}
            onToggleSymmetry={() => setSymmetry((value) => !value)}
            onToggleFog={() => setShowFog((value) => !value)}
            onEnterPlayerMode={enterPlayerMode}
            onToggleLights={() => setLights((value) => !value)}
            onToggleCompass={() => setCompass((value) => !value)}
            onToggleFogCells={onToggleFogCells}
            onShowShortcuts={() => setHelpOpen(true)}
            onStrokeStart={onStrokeStart}
            onStrokeEnd={onStrokeEnd}
            onStrokeCancel={onStrokeCancel}
            onCenterChange={setSelectedTile}
            onCameraChange={onCameraChange}
            onUndo={undo}
            onRedo={redo}
            onClear={clearMap}
            onSave={saveMap}
            onPrint={() => setPrintOpen(true)}
            onExport={() => setExportOpen(true)}
          />
        </div>

        {presenting ? (
          <button
            type="button"
            className="presenter-exit"
            onClick={exitPlayerMode}
          >
            Exit presentation (Esc)
          </button>
        ) : null}

        {cloudOpen && session?.user ? (
          <CloudDialog
            doc={doc}
            terrains={terrains}
            user={session.user}
            onOpenMap={openCloudMap}
            onClose={() => setCloudOpen(false)}
          />
        ) : null}

        {printOpen ? (
          <PrintDialog
            mapName={doc.name}
            tiles={printTiles}
            columns={doc.cols}
            rows={doc.rows}
            terrains={terrains}
            labels={doc.labels}
            pins={doc.pins}
            options={printOptions}
            onChange={setPrintOptions}
            onClose={() => setPrintOpen(false)}
          />
        ) : null}

        {exportOpen ? (
          <ExportDialog
            mapName={doc.name}
            columns={doc.cols}
            rows={doc.rows}
            layers={doc.layers}
            terrains={terrains}
            labels={doc.labels}
            pins={doc.pins}
            fog={doc.fog}
            onClose={() => setExportOpen(false)}
          />
        ) : null}

        {helpOpen ? (
          <ShortcutsDialog onClose={() => setHelpOpen(false)} />
        ) : null}
      </div>

      {/* Kept outside the editor shell so print styles can hide the app. */}
      {printOpen ? (
        <PrintDocument
          mapName={doc.name}
          tiles={printTiles}
          columns={doc.cols}
          rows={doc.rows}
          terrains={terrains}
          labels={doc.labels}
          pins={doc.pins}
          options={printOptions}
        />
      ) : null}
    </>
  );
}
