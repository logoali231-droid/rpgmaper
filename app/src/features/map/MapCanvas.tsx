import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapGrid,
  type Camera,
  type Tile,
  type Terrain,
} from "../../components/MapGrid";
import type { Cell } from "./painting";
import { NumberStepper } from "../../components/ui/NumberStepper";
import { PrintDialog } from "../../components/PrintDialog";
import { PrintDocument } from "../../components/PrintSheets";
import {
  DEFAULT_PRINT_OPTIONS,
  type PrintOptions,
} from "./print";

/** Default terrain set for an RPG map editor. Each terrain has a colour,
 * a lighter "alternate" colour used for the selected/highlight state, a
 * single letter symbol and a readable label.
 */
export const DEFAULT_TERRAINS: Terrain[] = [
  { id: "grass", name: "Grass", symbol: ".", color: "#6fab5a", altColor: "#8fc47f" },
  { id: "forest", name: "Forest", symbol: "\uD83C\uDF32", color: "#2e7d32", altColor: "#4caf50" },
  { id: "mountain", name: "Mountain", symbol: "\u2B1C", color: "#6b7a8f", altColor: "#94a3b8" },
  { id: "water", name: "Water", symbol: "~", color: "#1e4d8c", altColor: "#3b7dd8" },
  { id: "sand", name: "Sand", symbol: "S", color: "#e0c28a", altColor: "#f5d9a8" },
  { id: "wall", name: "Wall", symbol: "#", color: "#3d3d4a", altColor: "#5b5b6e" },
];

const MAP_COLS = 32;
const MAP_ROWS = 32;
const MIN_SIZE = 4;
const MAX_SIZE = 64;
const HISTORY_LIMIT = 50;

const DEFAULT_CAMERA: Camera = {
  x: 0,
  y: 0,
  zoom: 1,
  minZoom: 0.15,
  maxZoom: 6,
};

/** Build a blank map of the requested size. */
function createTiles(cols: number, rows: number): Tile[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ terrain: "grass", note: "" }))
  );
}

/** One undoable change: tile data plus the map dimensions it belonged to. */
interface Snapshot {
  cols: number;
  rows: number;
  tiles: Tile[][];
}

/** MapCanvas is the top-level editor screen. It owns the map document,
 * its undo history and the viewport, and hands them to MapGrid.
 */
export function MapCanvas() {
  const [mapName, setMapName] = useState("New Map");
  const [tiles, setTiles] = useState<Tile[][]>(() =>
    createTiles(MAP_COLS, MAP_ROWS)
  );
  const [dims, setDims] = useState({ cols: MAP_COLS, rows: MAP_ROWS });
  const [camera, setCamera] = useState<Camera>({ ...DEFAULT_CAMERA });
  const terrains = DEFAULT_TERRAINS;
  const [selectedTerrainId, setSelectedTerrainId] = useState<
    Terrain["id"] | null
  >("grass");
  const [selectedTile, setSelectedTile] = useState<{
    col: number;
    row: number;
  } | null>(null);

  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  const [printOpen, setPrintOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintOptions>(
    DEFAULT_PRINT_OPTIONS
  );

  // Size fields are typed freely; only an in-range number resizes the map.
  const [colsText, setColsText] = useState(String(MAP_COLS));
  const [rowsText, setRowsText] = useState(String(MAP_ROWS));

  useEffect(() => {
    setColsText(String(dims.cols));
    setRowsText(String(dims.rows));
  }, [dims.cols, dims.rows]);

  /** Map state captured before a stroke starts, so the drag undoes as one. */
  const strokeSnapshot = useRef<Snapshot | null>(null);

  const note = selectedTile
    ? (tiles[selectedTile.row]?.[selectedTile.col]?.note ?? "")
    : "";

  const pushHistory = useCallback((entry: Snapshot) => {
    setPast((prev) => [...prev, entry].slice(-HISTORY_LIMIT));
    setFuture([]);
  }, []);

  const onTileChange = useCallback(
    (col: number, row: number, updates: Partial<Tile>) => {
      setTiles((prev) => {
        const current = prev[row]?.[col];
        if (!current) return prev;
        const unchanged = (Object.keys(updates) as (keyof Tile)[]).every(
          (key) => current[key] === updates[key]
        );
        if (unchanged) return prev;
        const next = prev.map((r) => [...r]);
        next[row][col] = { ...current, ...updates };
        return next;
      });
    },
    []
  );

  /** Batch terrain paint: one state update per drag step or fill. */
  const onPaintCells = useCallback((cells: Cell[], terrainId: Terrain["id"]) => {
    setTiles((prev) => {
      let next = prev;
      let changed = false;

      for (const cell of cells) {
        const current = next[cell.row]?.[cell.col];
        if (!current || current.terrain === terrainId) continue;
        if (next === prev) next = prev.map((row) => [...row]);
        next[cell.row][cell.col] = { ...current, terrain: terrainId };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, []);

  const onTerrainChange = useCallback((id: Terrain["id"] | null) => {
    setSelectedTerrainId(id);
  }, []);

  const onCameraChange = useCallback((next: Camera) => {
    setCamera(next);
  }, []);

  const onStrokeStart = useCallback(() => {
    strokeSnapshot.current = { cols: dims.cols, rows: dims.rows, tiles };
  }, [dims.cols, dims.rows, tiles]);

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
    if (snapshot) setTiles(snapshot.tiles);
  }, []);

  const undo = useCallback(() => {
    const target = past[past.length - 1];
    if (!target) return;
    setFuture((f) => [...f, { cols: dims.cols, rows: dims.rows, tiles }]);
    setPast(past.slice(0, -1));
    setDims({ cols: target.cols, rows: target.rows });
    setTiles(target.tiles);
    setSelectedTile(null);
  }, [past, dims.cols, dims.rows, tiles]);

  const redo = useCallback(() => {
    const target = future[future.length - 1];
    if (!target) return;
    setPast((p) =>
      [...p, { cols: dims.cols, rows: dims.rows, tiles }].slice(-HISTORY_LIMIT)
    );
    setFuture(future.slice(0, -1));
    setDims({ cols: target.cols, rows: target.rows });
    setTiles(target.tiles);
    setSelectedTile(null);
  }, [future, dims.cols, dims.rows, tiles]);

  const clearMap = useCallback(() => {
    pushHistory({ cols: dims.cols, rows: dims.rows, tiles });
    setTiles(createTiles(dims.cols, dims.rows));
  }, [dims.cols, dims.rows, tiles, pushHistory]);

  const resizeMap = useCallback(
    (cols: number, rows: number) => {
      if (cols === dims.cols && rows === dims.rows) return;
      pushHistory({ cols: dims.cols, rows: dims.rows, tiles });
      setDims({ cols, rows });
      setTiles(
        Array.from({ length: rows }, (_, row) =>
          Array.from(
            { length: cols },
            (_, col) => tiles[row]?.[col] ?? { terrain: "grass", note: "" }
          )
        )
      );
      setSelectedTile(null);
    },
    [dims.cols, dims.rows, tiles, pushHistory]
  );

  /** Resize from a stepper: ignore empty, partial or out-of-range input. */
  const handleSizeChange = useCallback(
    (value: string, axis: "cols" | "rows") => {
      const next = Number(value);
      if (value.trim() === "" || !Number.isFinite(next)) return;
      if (next < MIN_SIZE || next > MAX_SIZE) return;
      if (axis === "cols") resizeMap(next, dims.rows);
      else resizeMap(dims.cols, next);
    },
    [dims.cols, dims.rows, resizeMap]
  );

  const saveMap = useCallback(() => {
    const payload = {
      name: mapName,
      columns: dims.cols,
      rows: dims.rows,
      terrains,
      tiles,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${mapName.trim() || "map"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [mapName, dims.cols, dims.rows, terrains, tiles]);

  return (
    <>
    <div className="map-screen">
      <div className="map-shell">
        <div className="map-toolbar">
          <div className="toolbar-group">
            <label className="field-label" htmlFor="map-name">
              Map name
            </label>
            <input
              id="map-name"
              className="text-input"
              type="text"
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
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
        </div>

        <MapGrid
          columns={dims.cols}
          rows={dims.rows}
          tiles={tiles}
          tile={selectedTile}
          camera={camera}
          terrains={terrains}
          selectedTerrainId={selectedTerrainId}
          tileNote={note}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onTileChange={onTileChange}
          onPaintCells={onPaintCells}
          onTerrainChange={onTerrainChange}
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
        />
      </div>

      {printOpen ? (
        <PrintDialog
          mapName={mapName}
          tiles={tiles}
          columns={dims.cols}
          rows={dims.rows}
          terrains={terrains}
          options={printOptions}
          onChange={setPrintOptions}
          onClose={() => setPrintOpen(false)}
        />
      ) : null}
      </div>

      {/* Kept outside the editor shell so print styles can hide the app. */}
      {printOpen ? (
        <PrintDocument
          mapName={mapName}
          tiles={tiles}
          columns={dims.cols}
          rows={dims.rows}
          terrains={terrains}
          options={printOptions}
        />
      ) : null}
    </>
  );
}
