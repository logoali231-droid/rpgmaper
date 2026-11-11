import { useCallback, useEffect, useRef, useState } from "react";
import { Chip } from "./ui/Chip";
import { NumberStepper } from "./ui/NumberStepper";
import { ColorSwatch } from "./ui/ColorSwatch";
import { PanelHeader } from "./ui/PanelHeader";
import {
  MAX_BRUSH,
  MIN_BRUSH,
  brushCells,
  floodFill,
  freshCells,
  lineCells,
  rectCells,
  type Cell,
  type ToolId,
} from "../features/map/painting";

export type TerrainId = string;
export type TerrainName = string;

export interface Terrain {
  id: TerrainId;
  name: TerrainName;
  symbol: string;
  color: string;
  altColor: string;
}

export interface Tile {
  terrain: TerrainId;
  note: string;
}

/** Camera viewport for pan/zoom. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

/** Base size of one tile in CSS pixels at zoom 1. */
export const TILE_SIZE = 24;

/** Drawing tools, with the keyboard shortcut shown to veterans. */
const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: "paint", label: "Paint", key: "B" },
  { id: "line", label: "Line", key: "L" },
  { id: "rect", label: "Rect", key: "R" },
  { id: "fill", label: "Fill", key: "F" },
  { id: "pick", label: "Pick", key: "I" },
  { id: "erase", label: "Erase", key: "E" },
];

const TOOL_BY_KEY: Record<string, ToolId> = {
  b: "paint",
  p: "paint",
  l: "line",
  r: "rect",
  f: "fill",
  i: "pick",
  e: "erase",
};

const clampZoom = (camera: Camera, zoom: number) =>
  Math.min(camera.maxZoom, Math.max(camera.minZoom, zoom));

interface MapGridProps {
  columns: number;
  rows: number;
  tiles: Tile[][];
  tile: { col: number; row: number } | null;
  camera: Camera;
  terrains: Terrain[];
  selectedTerrainId: TerrainId | null;
  tileNote: string;
  canUndo: boolean;
  canRedo: boolean;
  onTileChange: (col: number, row: number, updates: Partial<Tile>) => void;
  /** Batch paint used by every tool; one call per drag step. */
  onPaintCells: (cells: Cell[], terrainId: TerrainId) => void;
  onTerrainChange: (terrainId: TerrainId | null) => void;
  /** Called once before the first square of a stroke lands, for undo grouping. */
  onStrokeStart: () => void;
  onStrokeEnd?: () => void;
  /** Called when a stroke is abandoned (e.g. a second finger starts a pinch). */
  onStrokeCancel?: () => void;
  onCenterChange?: (tile: { col: number; row: number } | null) => void;
  onCameraChange?: (camera: Camera) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
  onPrint: () => void;
}

/** Translate pointer position to a world (col, row) tile coordinate. */
export function screenToTile(
  colCount: number,
  rowCount: number,
  camera: Camera,
  clientX: number,
  clientY: number
): { col: number; row: number } {
  const scale = camera.zoom * TILE_SIZE;
  const worldX = (clientX - camera.x) / scale;
  const worldY = (clientY - camera.y) / scale;

  return {
    col: Math.max(0, Math.min(colCount - 1, Math.floor(worldX))),
    row: Math.max(0, Math.min(rowCount - 1, Math.floor(worldY))),
  };
}

/** Translate a tile coordinate to its screen pixel position (top-left of the cell). */
export function tileToScreen(
  col: number,
  row: number,
  camera: Camera
): { screenX: number; screenY: number } {
  const scale = camera.zoom * TILE_SIZE;
  return {
    screenX: col * scale + camera.x,
    screenY: row * scale + camera.y,
  };
}

/** State captured when a second finger lands, so gestures never drift. */
interface Gesture {
  distance: number;
  midX: number;
  midY: number;
  zoom: number;
  camX: number;
  camY: number;
}

/** A line or rectangle being dragged out, before it is committed. */
interface Draft {
  tool: ToolId;
  anchor: Cell;
  current: Cell;
  outline: boolean;
}

/** Live state of the stroke under the pointer. */
interface StrokeState {
  active: boolean;
  started: boolean;
  tool: ToolId;
  anchor: Cell | null;
  last: Cell | null;
  outline: boolean;
  touched: Set<string>;
}

const emptyStroke = (): StrokeState => ({
  active: false,
  started: false,
  tool: "paint",
  anchor: null,
  last: null,
  outline: false,
  touched: new Set<string>(),
});

export function MapGrid({
  columns,
  rows,
  tiles,
  tile,
  camera,
  terrains,
  selectedTerrainId,
  tileNote,
  canUndo,
  canRedo,
  onTileChange,
  onPaintCells,
  onTerrainChange,
  onStrokeStart,
  onStrokeEnd,
  onStrokeCancel,
  onCenterChange,
  onCameraChange,
  onUndo,
  onRedo,
  onClear,
  onSave,
  onPrint,
}: MapGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  const [tool, setTool] = useState<ToolId>("paint");
  const [brushSize, setBrushSize] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  /** Set once the user zooms, so the fit-to-view effect stops overriding them. */
  const userZoomed = useRef(false);
  /** Live pointer positions, keyed by pointerId. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const stroke = useRef<StrokeState>(emptyStroke());
  /** Draft mirror so pointer-up always sees the latest corner. */
  const draftRef = useRef<Draft | null>(null);
  const pan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    camX: number;
    camY: number;
  } | null>(null);

  /** Terrain a tool paints: Erase always returns ground to the base terrain. */
  const strokeTerrain = useCallback(
    (activeTool: ToolId): TerrainId | null => {
      if (activeTool === "erase") return terrains[0]?.id ?? null;
      return selectedTerrainId;
    },
    [terrains, selectedTerrainId]
  );

  const updateDraft = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  /** Pointer position relative to the canvas box. */
  const localPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  /** Zoom by a factor around the centre of the canvas. */
  const zoomBy = useCallback(
    (factor: number) => {
      if (!onCameraChange) return;
      const parent = canvasRef.current?.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const zoom = clampZoom(camera, camera.zoom * factor);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const worldX = (cx - camera.x) / camera.zoom;
      const worldY = (cy - camera.y) / camera.zoom;
      userZoomed.current = true;
      onCameraChange({
        ...camera,
        zoom,
        x: cx - worldX * zoom,
        y: cy - worldY * zoom,
      });
    },
    [camera, onCameraChange]
  );

  /** Fit the whole map into the canvas and centre it. */
  const fitView = useCallback(() => {
    if (!onCameraChange) return;
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const fit = Math.min(
      rect.width / (columns * TILE_SIZE),
      rect.height / (rows * TILE_SIZE)
    );
    const zoom = clampZoom(camera, fit);
    userZoomed.current = false;
    onCameraChange({
      ...camera,
      zoom,
      x: (rect.width - columns * TILE_SIZE * zoom) / 2,
      y: (rect.height - rows * TILE_SIZE * zoom) / 2,
    });
  }, [columns, rows, camera, onCameraChange]);

  /** Paint a batch, skipping squares this stroke already handled. */
  const paintCells = useCallback(
    (cells: Cell[], terrainId: TerrainId) => {
      const fresh = freshCells(cells, terrainId, tiles, stroke.current.touched);
      if (fresh.length === 0) return;
      if (!stroke.current.started) {
        stroke.current.started = true;
        onStrokeStart();
      }
      onPaintCells(fresh, terrainId);
    },
    [tiles, onStrokeStart, onPaintCells]
  );

  const finishStroke = useCallback(() => {
    const current = stroke.current;
    const started = current.started;
    stroke.current = emptyStroke();
    if (started) onStrokeEnd?.();
  }, [onStrokeEnd]);

  const cancelStroke = useCallback(() => {
    const started = stroke.current.started;
    stroke.current = emptyStroke();
    updateDraft(null);
    if (started) onStrokeCancel?.();
  }, [onStrokeCancel, updateDraft]);

  const pickTerrainAt = useCallback(
    (target: Cell) => {
      const id = tiles[target.row]?.[target.col]?.terrain;
      if (id) onTerrainChange(id);
    },
    [tiles, onTerrainChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = localPoint(e);
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Synthetic or already-released pointer: gestures still work without it.
      }
      pointers.current.set(e.pointerId, point);

      // Second finger: abandon any stroke and start pan/zoom.
      if (pointers.current.size === 2) {
        if (stroke.current.active) cancelStroke();
        setDragging(false);
        const [a, b] = [...pointers.current.values()];
        gesture.current = {
          distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
          zoom: camera.zoom,
          camX: camera.x,
          camY: camera.y,
        };
        userZoomed.current = true;
        return;
      }

      if (pointers.current.size > 2) return;

      const target = screenToTile(columns, rows, camera, point.x, point.y);
      onCenterChange?.(target);
      setHover(target);

      // Right-click, Alt+click or the Pick tool sample the terrain under it.
      if (tool === "pick" || e.altKey || e.button === 2) {
        pickTerrainAt(target);
        return;
      }

      // Middle-drag pans, the desktop convention for a big canvas.
      if (e.button === 1) {
        pan.current = {
          pointerId: e.pointerId,
          x: point.x,
          y: point.y,
          camX: camera.x,
          camY: camera.y,
        };
        setDragging(true);
        return;
      }

      if (e.button !== 0) return;

      stroke.current.touched.clear();

      if (tool === "fill") {
        const terrainId = strokeTerrain("fill");
        if (!terrainId) return;
        paintCells(floodFill(tiles, target, columns, rows), terrainId);
        finishStroke();
        return;
      }

      if (tool === "line" || tool === "rect") {
        stroke.current.active = true;
        stroke.current.tool = tool;
        stroke.current.anchor = target;
        stroke.current.outline = e.shiftKey;
        updateDraft({
          tool,
          anchor: target,
          current: target,
          outline: e.shiftKey,
        });
        setDragging(true);
        return;
      }

      const terrainId = strokeTerrain(tool);
      if (!terrainId) return;
      stroke.current.active = true;
      stroke.current.tool = tool;
      stroke.current.last = target;
      paintCells(
        brushCells(target.col, target.row, brushSize, columns, rows),
        terrainId
      );
      setDragging(true);
    },
    [
      localPoint,
      camera,
      columns,
      rows,
      tool,
      brushSize,
      tiles,
      paintCells,
      finishStroke,
      cancelStroke,
      pickTerrainAt,
      strokeTerrain,
      updateDraft,
      onCenterChange,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = localPoint(e);
      const tracked = pointers.current.has(e.pointerId);

      if (tracked) pointers.current.set(e.pointerId, point);

      // Middle-drag panning.
      if (pan.current && pan.current.pointerId === e.pointerId) {
        onCameraChange?.({
          ...camera,
          x: pan.current.camX + (point.x - pan.current.x),
          y: pan.current.camY + (point.y - pan.current.y),
        });
        return;
      }

      // Two-finger pinch zoom + pan.
      if (gesture.current && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const g = gesture.current;
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const zoom = Math.min(
          camera.maxZoom,
          Math.max(camera.minZoom, g.zoom * (distance / g.distance))
        );
        // The world point under the starting midpoint follows the fingers.
        const worldX = (g.midX - g.camX) / g.zoom;
        const worldY = (g.midY - g.camY) / g.zoom;
        onCameraChange?.({
          ...camera,
          zoom,
          x: midX - worldX * zoom,
          y: midY - worldY * zoom,
        });
        return;
      }

      const target = screenToTile(columns, rows, camera, point.x, point.y);
      const current = stroke.current;

      if (current.active) {
        onCenterChange?.(target);

        if (current.tool === "line" || current.tool === "rect") {
          // Shapes only preview while dragging; the tiles land on release.
          const base = draftRef.current;
          if (base) updateDraft({ ...base, current: target });
          return;
        }

        const terrainId = strokeTerrain(current.tool);
        if (terrainId) {
          // Join the last square to this one so fast drags leave no gaps.
          const path = current.last
            ? lineCells(current.last, target)
            : [target];
          const cells: Cell[] = [];
          for (const step of path) {
            cells.push(
              ...brushCells(step.col, step.row, brushSize, columns, rows)
            );
          }
          current.last = target;
          paintCells(cells, terrainId);
        }
        return;
      }

      setHover((prev) =>
        prev && prev.col === target.col && prev.row === target.row
          ? prev
          : target
      );
      if (!tracked) onCenterChange?.(target);
    },
    [
      localPoint,
      camera,
      columns,
      rows,
      brushSize,
      paintCells,
      strokeTerrain,
      updateDraft,
      onCenterChange,
      onCameraChange,
    ]
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) gesture.current = null;

      if (pan.current && pan.current.pointerId === e.pointerId) {
        pan.current = null;
        if (pointers.current.size === 0) setDragging(false);
        return;
      }

      if (pointers.current.size > 0) return;

      const current = stroke.current;
      const base = draftRef.current;

      if (current.active && base && (current.tool === "line" || current.tool === "rect")) {
        const terrainId = strokeTerrain(current.tool);
        if (terrainId) {
          const cells =
            current.tool === "line"
              ? lineCells(base.anchor, base.current)
              : rectCells(base.anchor, base.current, current.outline);
          paintCells(cells, terrainId);
        }
      }

      updateDraft(null);
      setDragging(false);
      finishStroke();
    },
    [paintCells, finishStroke, strokeTerrain, updateDraft]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!onCameraChange) return;
      e.preventDefault();
      userZoomed.current = true;
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const zoom = clampZoom(camera, camera.zoom * factor);
      const worldX = (x - camera.x) / camera.zoom;
      const worldY = (y - camera.y) / camera.zoom;
      onCameraChange({
        ...camera,
        zoom,
        x: x - worldX * zoom,
        y: y - worldY * zoom,
      });
    },
    [camera, onCameraChange]
  );

  // --- Keyboard shortcuts: tools, terrain, brush size, undo/redo ---
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT")
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;

      if (command && key === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (command && key === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
      if (event.altKey || event.metaKey || event.ctrlKey) return;

      if (event.key === "[") {
        setBrushSize((size) => Math.max(MIN_BRUSH, size - 1));
        return;
      }
      if (event.key === "]") {
        setBrushSize((size) => Math.min(MAX_BRUSH, size + 1));
        return;
      }
      if (event.key === "Escape") {
        cancelStroke();
        return;
      }

      const nextTool = TOOL_BY_KEY[key];
      if (nextTool) {
        setTool(nextTool);
        return;
      }

      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= terrains.length) {
        onTerrainChange(terrains[index - 1].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelStroke, onRedo, onTerrainChange, onUndo, terrains]);

  // --- Fit the whole map into the canvas until the user zooms ---
  useEffect(() => {
    if (!onCameraChange || userZoomed.current) return;
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const fit = Math.min(
      rect.width / (columns * TILE_SIZE),
      rect.height / (rows * TILE_SIZE)
    );
    const zoom = clampZoom(camera, fit);
    const x = (rect.width - columns * TILE_SIZE * zoom) / 2;
    const y = (rect.height - rows * TILE_SIZE * zoom) / 2;

    if (
      Math.abs(zoom - camera.zoom) > 0.005 ||
      Math.abs(x - camera.x) > 0.5 ||
      Math.abs(y - camera.y) > 0.5
    ) {
      onCameraChange({ ...camera, zoom, x, y });
    }
  }, [columns, rows, camera, onCameraChange]);

  // --- Canvas rendering ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const paint = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(0, 0, rect.width, rect.height);

      const cell = camera.zoom * TILE_SIZE;
      const byTerrain = new Map(terrains.map((t) => [t.id, t]));

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          const cellX = col * cell + camera.x;
          const cellY = row * cell + camera.y;
          if (cellX + cell < 0 || cellY + cell < 0) continue;
          if (cellX > rect.width || cellY > rect.height) continue;

          const id = tiles[row]?.[col]?.terrain ?? "grass";
          ctx.fillStyle = byTerrain.get(id)?.color ?? "#1b2430";
          ctx.fillRect(cellX, cellY, cell, cell);
        }
      }

      // Grid lines.
      ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let col = 0; col <= columns; col += 1) {
        const lineX = Math.round(col * cell + camera.x) + 0.5;
        ctx.moveTo(lineX, camera.y);
        ctx.lineTo(lineX, camera.y + rows * cell);
      }
      for (let row = 0; row <= rows; row += 1) {
        const lineY = Math.round(row * cell + camera.y) + 0.5;
        ctx.moveTo(camera.x, lineY);
        ctx.lineTo(camera.x + columns * cell, lineY);
      }
      ctx.stroke();

      // Ghost preview of a line or rectangle that is still being dragged.
      if (draft) {
        const preview =
          draft.tool === "line"
            ? lineCells(draft.anchor, draft.current)
            : rectCells(draft.anchor, draft.current, draft.outline);
        const terrainId = draft.tool === "erase" ? terrains[0]?.id : selectedTerrainId;
        const colour = byTerrain.get(terrainId ?? "")?.color ?? "#4f8ef7";

        ctx.save();
        ctx.globalAlpha = 0.62;
        ctx.fillStyle = colour;
        let minCol = columns;
        let minRow = rows;
        let maxCol = -1;
        let maxRow = -1;
        for (const step of preview) {
          ctx.fillRect(
            step.col * cell + camera.x,
            step.row * cell + camera.y,
            cell,
            cell
          );
          minCol = Math.min(minCol, step.col);
          minRow = Math.min(minRow, step.row);
          maxCol = Math.max(maxCol, step.col);
          maxRow = Math.max(maxRow, step.row);
        }
        ctx.restore();

        if (maxCol >= minCol) {
          ctx.strokeStyle = "#4f8ef7";
          ctx.lineWidth = 2;
          ctx.strokeRect(
            minCol * cell + camera.x + 1,
            minRow * cell + camera.y + 1,
            (maxCol - minCol + 1) * cell - 2,
            (maxRow - minRow + 1) * cell - 2
          );
        }
      }

      // Selected tile outline.
      if (tile) {
        ctx.strokeStyle = "#4f8ef7";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          tile.col * cell + camera.x + 1,
          tile.row * cell + camera.y + 1,
          Math.max(0, cell - 2),
          Math.max(0, cell - 2)
        );
      }

      // Brush footprint under the pointer, so the size is never a surprise.
      if (!draft && hover && tool !== "pick" && cell >= 6) {
        const span =
          tool === "paint" || tool === "erase"
            ? brushSize
            : 1;
        const radius = Math.floor((span - 1) / 2);
        const c0 = Math.max(0, hover.col - radius);
        const r0 = Math.max(0, hover.row - radius);
        const c1 = Math.min(columns - 1, hover.col - radius + span - 1);
        const r1 = Math.min(rows - 1, hover.row - radius + span - 1);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          c0 * cell + camera.x + 0.75,
          r0 * cell + camera.y + 0.75,
          (c1 - c0 + 1) * cell - 1.5,
          (r1 - r0 + 1) * cell - 1.5
        );
      }
    };

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [
    columns,
    rows,
    tiles,
    camera,
    terrains,
    tile,
    draft,
    hover,
    tool,
    brushSize,
    selectedTerrainId,
  ]);

  return (
    <div className="map-grid">
      <PanelHeader
        title="Map Canvas"
        actions={
          <span className="map-grid-actions">
            <Chip
              variant="secondary"
              size="sm"
              onClick={onUndo}
              disabled={!canUndo}
              ariaLabel="Undo last stroke"
            >
              Undo
            </Chip>
            <Chip
              variant="secondary"
              size="sm"
              onClick={onRedo}
              disabled={!canRedo}
              ariaLabel="Redo last stroke"
            >
              Redo
            </Chip>
            <Chip
              variant="secondary"
              size="sm"
              onClick={onClear}
              ariaLabel="Clear the map"
            >
              Clear
            </Chip>
            <Chip
              variant="secondary"
              size="sm"
              onClick={onSave}
              ariaLabel="Download the map as JSON"
            >
              Save
            </Chip>
            <Chip
              variant="secondary"
              size="sm"
              onClick={onPrint}
              ariaLabel="Print the map for the table"
            >
              Print
            </Chip>
          </span>
        }
      />

      <div className="map-tools">
        <div className="tool-group" role="group" aria-label="Drawing tools">
          {TOOLS.map((entry) => (
            <Chip
              key={entry.id}
              variant={tool === entry.id ? "primary" : "secondary"}
              size="sm"
              className="tool-chip"
              ariaLabel={`${entry.label} tool (${entry.key})`}
              title={`${entry.label} (${entry.key})`}
              aria-pressed={tool === entry.id}
              onClick={() => setTool(entry.id)}
            >
              {entry.label}
            </Chip>
          ))}
        </div>

        <div className="tool-size">
          <NumberStepper
            label="Brush"
            value={String(brushSize)}
            onChange={(value) => {
              const next = Number(value);
              if (!Number.isFinite(next)) return;
              setBrushSize(
                Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, Math.round(next)))
              );
            }}
          />
        </div>

        <p className="tool-hint">
          Drag to paint · Shift = hollow · Alt/right-click picks · 1–6 terrain ·
          B L R F I E · [ ] size
        </p>
      </div>

      <div className="map-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`map-canvas tool-${tool} ${dragging ? "is-painting" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={() => setHover(null)}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="map-zoom">
          <button
            type="button"
            className="zoom-btn"
            onClick={() => zoomBy(1 / 1.25)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={fitView}
            aria-label="Fit map to view"
          >
            ⤢
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={() => zoomBy(1.25)}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className="map-inspect">
        <div className="inspect-col">
          <PanelHeader title="Terrain" />
          <div className="terrain-list">
            {terrains.map((t) => (
              <ColorSwatch
                key={t.id}
                label={t.name}
                symbol={t.symbol}
                color={t.color}
                altColor={t.altColor}
                selected={t.id === selectedTerrainId}
                onChange={() => onTerrainChange(t.id)}
              />
            ))}
          </div>
        </div>
        <div className="inspect-col">
          <PanelHeader title="Selected Tile" />
          <div className="inspector">
            <NumberStepper
              label="Col"
              value={tile ? String(tile.col) : ""}
              onChange={() => {}}
              disabled
            />
            <NumberStepper
              label="Row"
              value={tile ? String(tile.row) : ""}
              onChange={() => {}}
              disabled
            />
            <input
              className="note-input"
              type="text"
              value={tileNote}
              placeholder={
                tile ? "Tile note..." : "Pick a tile to add a note"
              }
              disabled={!tile}
              onChange={(e) => {
                if (!tile) return;
                onTileChange(tile.col, tile.row, { note: e.target.value });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
