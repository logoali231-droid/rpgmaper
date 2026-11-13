import { useCallback, useEffect, useRef, useState } from "react";
import { Chip } from "./ui/Chip";
import { NumberStepper } from "./ui/NumberStepper";
import { ColorSwatch } from "./ui/ColorSwatch";
import { StampCard } from "./StampCard";
import { PanelHeader } from "./ui/PanelHeader";
import { ContextMenu } from "./ui/ContextMenu";
import {
  MAX_BRUSH,
  MIN_BRUSH,
  brushCells,
  floodFill,
  freshCells,
  lineCells,
  mirrorCells,
  rectCells,
  type Cell,
  type ToolId,
} from "../features/map/painting";
import {
  EMPTY_TERRAIN,
  LAYER_HINTS,
  LAYER_IDS,
  LAYER_LABELS,
  terrainsForLayer,
  type LayerId,
  type Layers,
  type MapLabel,
  type MapPin,
  type Terrain,
  type TerrainId,
  type Tile,
} from "../features/map/model";
import {
  drawProp,
  drawShoreline,
  drawTileTexture,
  drawWallEdges,
  onTextureReady,
} from "../features/map/textures";
import {
  drawCompass,
  drawLight,
  drawPin,
  drawScaleBar,
} from "../features/map/overlay";
import { LIGHT_PROPS } from "../features/map/vtt";

export type {
  MapLabel,
  Terrain,
  TerrainId,
  TerrainName,
  Tile,
} from "../features/map/model";

/** Tools whose drag paints; a long press must never cancel them mid-stroke. */
function isBrushTool(tool: ToolId) {
  return (
    tool === "paint" ||
    tool === "erase" ||
    tool === "scatter" ||
    tool === "line" ||
    tool === "rect" ||
    tool === "fog" ||
    tool === "fill"
  );
}

/** Base size of one tile in CSS pixels at zoom 1. */
export const TILE_SIZE = 24;
const FEET_PER_SQUARE = 5;

/** Camera viewport for pan/zoom. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

/** Drawing tools, with the keyboard shortcut shown to veterans. */
const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: "paint", label: "Paint", key: "B" },
  { id: "line", label: "Line", key: "L" },
  { id: "rect", label: "Rect", key: "R" },
  { id: "fill", label: "Fill", key: "F" },
  { id: "pick", label: "Pick", key: "I" },
  { id: "erase", label: "Erase", key: "E" },
  { id: "fog", label: "Fog", key: "G" },
  { id: "scatter", label: "Scatter", key: "S" },
  { id: "select", label: "Select", key: "V" },
  { id: "text", label: "Text", key: "T" },
  { id: "pin", label: "Pin", key: "N" },
  { id: "ruler", label: "Ruler", key: "M" },
];

const TOOL_BY_KEY: Record<string, ToolId> = {
  b: "paint",
  p: "paint",
  l: "line",
  r: "rect",
  f: "fill",
  i: "pick",
  e: "erase",
  g: "fog",
  s: "scatter",
  v: "select",
  t: "text",
  n: "pin",
  m: "ruler",
};

const clampZoom = (camera: Camera, zoom: number) =>
  Math.min(camera.maxZoom, Math.max(camera.minZoom, zoom));

interface Selection {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

interface AreaWrite {
  layer: LayerId;
  col: number;
  row: number;
  tile: Tile;
}

interface AreaClear {
  layer: LayerId;
  col: number;
  row: number;
}

/** A copied block, kept per layer so props and walls travel with the floor. */
interface Clipboard {
  w: number;
  h: number;
  tiles: Record<LayerId, Tile[]>;
}

const normalise = (a: Cell, b: Cell): Selection => ({
  c0: Math.min(a.col, b.col),
  r0: Math.min(a.row, b.row),
  c1: Math.max(a.col, b.col),
  r1: Math.max(a.row, b.row),
});

interface MapGridProps {
  columns: number;
  rows: number;
  layers: Layers;
  layerVisible: Record<LayerId, boolean>;
  activeLayer: LayerId;
  tile: { col: number; row: number } | null;
  camera: Camera;
  terrains: Terrain[];
  selectedTerrainId: TerrainId | null;
  tileNote: string;
  labels: MapLabel[];
  pins: MapPin[];
  showGrid: boolean;
  textures: boolean;
  symmetry: boolean;
  fog: boolean[][];
  showFog: boolean;
  playerView: boolean;
  lights: boolean;
  compass: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTileChange: (col: number, row: number, updates: { note: string }) => void;
  /** Batch paint used by every tool; one call per drag step. */
  onPaintCells: (
    cells: Cell[],
    terrainId: TerrainId,
    layerId: LayerId,
    randomize?: boolean
  ) => void;
  /** Selection move / paste / delete: any layers, as one undo step. */
  onApplyArea: (writes: AreaWrite[], clears: AreaClear[]) => void;
  onSetLabel: (col: number, row: number, text: string) => void;
  onMoveLabel: (id: string, col: number, row: number) => void;
  /** Opens and closes one undo step around a label edit or drag. */
  onLabelStart: () => void;
  onLabelCommit: () => void;
  onAddPin: (col: number, row: number) => string;
  onSetPin: (id: string, changes: Partial<MapPin>) => void;
  onRemovePin: (id: string) => void;
  onMovePin: (id: string, col: number, row: number) => void;
  onPinStart: () => void;
  onPinCommit: () => void;
  onTerrainChange: (terrainId: TerrainId | null) => void;
  onLayerChange: (layerId: LayerId) => void;
  onToggleLayer: (layerId: LayerId) => void;
  onToggleGrid: () => void;
  onToggleTextures: () => void;
  onToggleSymmetry: () => void;
  onToggleFog: () => void;
  onTogglePlayerView: () => void;
  onToggleLights: () => void;
  onToggleCompass: () => void;
  onToggleFogCells: (cells: Cell[]) => void;
  onShowShortcuts: () => void;
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
  onExport: () => void;
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
  layers,
  layerVisible,
  activeLayer,
  tile,
  camera,
  terrains,
  selectedTerrainId,
  tileNote,
  labels,
  pins,
  showGrid,
  textures,
  symmetry,
  fog,
  showFog,
  playerView,
  lights,
  compass,
  canUndo,
  canRedo,
  onTileChange,
  onPaintCells,
  onApplyArea,
  onSetLabel,
  onMoveLabel,
  onLabelStart,
  onLabelCommit,
  onAddPin,
  onSetPin,
  onRemovePin,
  onMovePin,
  onPinStart,
  onPinCommit,
  onTerrainChange,
  onLayerChange,
  onToggleLayer,
  onToggleGrid,
  onToggleTextures,
  onToggleSymmetry,
  onToggleFog,
  onTogglePlayerView,
  onToggleLights,
  onToggleCompass,
  onToggleFogCells,
  onShowShortcuts,
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
  onExport,
}: MapGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  const [tool, setTool] = useState<ToolId>("paint");
  const [brushSize, setBrushSize] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [marquee, setMarquee] = useState<{ anchor: Cell; current: Cell } | null>(
    null
  );
  const [moving, setMoving] = useState<{ dx: number; dy: number } | null>(null);
  const [labelTarget, setLabelTarget] = useState<Cell | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    cell: Cell;
  } | null>(null);
  const [ruler, setRuler] = useState<{ from: Cell; to: Cell } | null>(null);
  /** Phones only: the layer tabs and palette live in a bottom sheet. */
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Phones only: fold the tools strip to give the canvas more height. */
  const [toolsOpen, setToolsOpen] = useState(true);
  const [, bumpTextures] = useState(0);
  /** Set once the user zooms, so the fit-to-view effect stops overriding them. */
  const userZoomed = useRef(false);
  /** Live pointer positions, keyed by pointerId. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const stroke = useRef<StrokeState>(emptyStroke());
  /** Draft mirror so pointer-up always sees the latest corner. */
  const draftRef = useRef<Draft | null>(null);
  const marqueeRef = useRef<{ anchor: Cell; current: Cell } | null>(null);
  const movingRef = useRef<{ dx: number; dy: number } | null>(null);
  /** Label being dragged with the Text tool. */
  const labelDrag = useRef<{ id: string; moved: boolean } | null>(null);
  /** Pin being dragged with the Pin tool. */
  const pinDrag = useRef<{ id: string } | null>(null);
  /** Touch long-press pending: opens the square menu without right-click. */
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  const pan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    camX: number;
    camY: number;
  } | null>(null);

  const layerTiles = layers[activeLayer];
  const layerTerrains = terrainsForLayer(terrains, activeLayer);
  const labelValue = labelTarget
    ? (labels.find(
        (label) =>
          label.col === labelTarget.col && label.row === labelTarget.row
      )?.text ?? "")
    : "";
  const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;
  const activeTerrain =
    layerTerrains.find((terrain) => terrain.id === selectedTerrainId) ?? null;

  /** Layer tabs, shown above the canvas on desktop and in the meld sheet on
   * phones. */
  const renderLayerTabs = () => (
    <div className="layer-group" role="group" aria-label="Layers">
      {LAYER_IDS.map((id) => (
        <span
          key={id}
          className={`layer-chip ${activeLayer === id ? "is-active" : ""}`}
        >
          <button
            type="button"
            className="layer-name"
            aria-pressed={activeLayer === id}
            title={LAYER_HINTS[id]}
            onClick={() => onLayerChange(id)}
          >
            {LAYER_LABELS[id]}
          </button>
          <button
            type="button"
            className="layer-eye"
            aria-pressed={layerVisible[id]}
            aria-label={`${layerVisible[id] ? "Hide" : "Show"} ${
              LAYER_LABELS[id]
            } layer`}
            onClick={() => onToggleLayer(id)}
          >
            {layerVisible[id] ? "\u25C9" : "\u25CC"}
          </button>
        </span>
      ))}
    </div>
  );

  // Imported tilesets decode asynchronously: repaint once they arrive.
  useEffect(() => onTextureReady(() => bumpTextures((n) => n + 1)), []);

  /** Terrain a tool paints: Erase clears the active layer instead. */
  const strokeTerrain = useCallback(
    (activeTool: ToolId): TerrainId | null => {
      if (activeTool === "erase") return EMPTY_TERRAIN;
      return selectedTerrainId;
    },
    [selectedTerrainId]
  );

  const updateDraft = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const updateMarquee = useCallback(
    (next: { anchor: Cell; current: Cell } | null) => {
      marqueeRef.current = next;
      setMarquee(next);
    },
    []
  );

  const updateMoving = useCallback((next: { dx: number; dy: number } | null) => {
    movingRef.current = next;
    setMoving(next);
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
    (cells: Cell[], terrainId: TerrainId, randomize = false) => {
      const shaped = symmetry ? mirrorCells(cells, columns, rows) : cells;
      const fresh = freshCells(
        shaped,
        randomize ? `${terrainId}:random` : terrainId,
        layerTiles,
        stroke.current.touched
      );
      if (fresh.length === 0) return;
      if (!stroke.current.started) {
        stroke.current.started = true;
        onStrokeStart();
      }
      onPaintCells(fresh, terrainId, activeLayer, randomize);
    },
    [
      symmetry,
      columns,
      rows,
      layerTiles,
      activeLayer,
      onStrokeStart,
      onPaintCells,
    ]
  );

  /** Fog is a toggle, so each square is flipped at most once per stroke. */
  const fogCells = useCallback(
    (cells: Cell[]) => {
      const shaped = symmetry ? mirrorCells(cells, columns, rows) : cells;
      const fresh: Cell[] = [];
      for (const cell of shaped) {
        const key = `${cell.col},${cell.row}`;
        if (stroke.current.touched.has(key)) continue;
        stroke.current.touched.add(key);
        fresh.push(cell);
      }
      if (fresh.length === 0) return;
      if (!stroke.current.started) {
        stroke.current.started = true;
        onStrokeStart();
      }
      onToggleFogCells(fresh);
    },
    [symmetry, columns, rows, onStrokeStart, onToggleFogCells]
  );

  const finishStroke = useCallback(() => {
    const current = stroke.current;
    const started = current.started;
    stroke.current = emptyStroke();
    if (started) onStrokeEnd?.();
  }, [onStrokeEnd]);

  const clearLongPress = useCallback(() => {
    const pending = longPress.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      longPress.current = null;
    }
  }, []);

  // A pending long-press must not fire after the canvas goes away.
  useEffect(() => clearLongPress, [clearLongPress]);

  const cancelStroke = useCallback(() => {
    const started = stroke.current.started;
    stroke.current = emptyStroke();
    labelDrag.current = null;
    pinDrag.current = null;
    updateDraft(null);
    updateMarquee(null);
    updateMoving(null);
    if (started) onStrokeCancel?.();
  }, [onStrokeCancel, updateDraft, updateMarquee, updateMoving]);

  const pickTerrainAt = useCallback(
    (target: Cell) => {
      const clicked = layers[activeLayer][target.row]?.[target.col];
      if (clicked?.terrain) onTerrainChange(clicked.terrain);
    },
    [layers, activeLayer, onTerrainChange]
  );

  // --- Selection actions ---
  /** Every cell of a selection, in row-major order. */
  const areaCells = useCallback((area: Selection): Cell[] => {
    const cells: Cell[] = [];
    for (let row = area.r0; row <= area.r1; row += 1) {
      for (let col = area.c0; col <= area.c1; col += 1) cells.push({ col, row });
    }
    return cells;
  }, []);

  /** Labels are hit-tested in screen space, since their text runs wider
   * than the cell that anchors it. */
  const labelAt = useCallback(
    (point: { x: number; y: number }) => {
      const cell = camera.zoom * TILE_SIZE;
      for (const label of labels) {
        if (!label.text.trim()) continue;
        const x = label.col * cell + camera.x + cell / 2;
        const y = label.row * cell + camera.y + cell / 2;
        const fontSize = Math.max(9, Math.min(18, cell * 0.42));
        const width = Math.max(cell, label.text.length * fontSize * 0.6) + 12;
        const height = fontSize + 10;
        if (
          Math.abs(point.x - x) <= width / 2 &&
          Math.abs(point.y - y) <= height / 2
        ) {
          return label;
        }
      }
      return null;
    },
    [camera, labels]
  );

  const copySelection = useCallback(() => {
    if (!selection) return;
    const w = selection.c1 - selection.c0 + 1;
    const h = selection.r1 - selection.r0 + 1;
    const tiles = {} as Record<LayerId, Tile[]>;
    for (const id of LAYER_IDS) {
      const list: Tile[] = [];
      for (let row = 0; row < h; row += 1) {
        for (let col = 0; col < w; col += 1) {
          const source = layers[id][selection.r0 + row]?.[selection.c0 + col];
          list.push(
            source ? { ...source } : { terrain: EMPTY_TERRAIN, note: "" }
          );
        }
      }
      tiles[id] = list;
    }
    setClipboard({ w, h, tiles });
  }, [selection, layers]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const clears: AreaClear[] = [];
    for (const id of LAYER_IDS) {
      for (const cell of areaCells(selection)) {
        clears.push({ layer: id, ...cell });
      }
    }
    onApplyArea([], clears);
    setSelection(null);
  }, [selection, areaCells, onApplyArea]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard) return;
    const origin = selection
      ? { col: selection.c0, row: selection.r0 }
      : { col: 0, row: 0 };
    const writes: AreaWrite[] = [];
    const clears: AreaClear[] = [];
    for (const id of LAYER_IDS) {
      for (let row = 0; row < clipboard.h; row += 1) {
        for (let col = 0; col < clipboard.w; col += 1) {
          const targetCol = origin.col + col;
          const targetRow = origin.row + row;
          if (targetCol >= columns || targetRow >= rows) continue;
          clears.push({ layer: id, col: targetCol, row: targetRow });
          const tile = clipboard.tiles[id][row * clipboard.w + col];
          if (!tile || (!tile.terrain && !tile.note.trim())) continue;
          writes.push({
            layer: id,
            col: targetCol,
            row: targetRow,
            tile: { ...tile },
          });
        }
      }
    }
    if (clears.length === 0) return;
    onApplyArea(writes, clears);
    setSelection({
      c0: origin.col,
      r0: origin.row,
      c1: Math.min(columns - 1, origin.col + clipboard.w - 1),
      r1: Math.min(rows - 1, origin.row + clipboard.h - 1),
    });
  }, [clipboard, selection, columns, rows, onApplyArea]);

  const commitMove = useCallback(() => {
    const move = movingRef.current;
    const area = selection;
    if (!move || !area) return;
    if (move.dx === 0 && move.dy === 0) return;

    const writes: AreaWrite[] = [];
    const clears: AreaClear[] = [];
    for (const id of LAYER_IDS) {
      for (let row = area.r0; row <= area.r1; row += 1) {
        for (let col = area.c0; col <= area.c1; col += 1) {
          clears.push({ layer: id, col, row });
          const source = layers[id][row]?.[col];
          if (!source || (!source.terrain && !source.note.trim())) continue;
          const targetCol = col + move.dx;
          const targetRow = row + move.dy;
          if (targetCol < 0 || targetCol >= columns) continue;
          if (targetRow < 0 || targetRow >= rows) continue;
          writes.push({
            layer: id,
            col: targetCol,
            row: targetRow,
            tile: { ...source },
          });
        }
      }
    }
    onApplyArea(writes, clears);
    setSelection({
      c0: Math.max(0, Math.min(columns - 1, area.c0 + move.dx)),
      r0: Math.max(0, Math.min(rows - 1, area.r0 + move.dy)),
      c1: Math.max(0, Math.min(columns - 1, area.c1 + move.dx)),
      r1: Math.max(0, Math.min(rows - 1, area.r1 + move.dy)),
    });
  }, [selection, layers, columns, rows, onApplyArea]);

  /** Fill the whole selection with the current terrain, in one undo step. */
  const fillSelection = useCallback(() => {
    if (!selection || !selectedTerrainId) return;
    onStrokeStart();
    onPaintCells(areaCells(selection), selectedTerrainId, activeLayer);
    onStrokeEnd?.();
  }, [
    selection,
    selectedTerrainId,
    areaCells,
    onStrokeStart,
    onPaintCells,
    activeLayer,
    onStrokeEnd,
  ]);

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
        clearLongPress();
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

      // Touch has no right-click: hold a square still to open its menu. The
      // stroke a tap already started is rolled back, so holding to open the
      // menu never leaves an accidental tile behind. Brush tools are exempt:
      // a slow stroke on a small grid holds still for longer than this, and
      // cancelling it mid-drag would break painting.
      if (e.pointerType === "touch" && !isBrushTool(tool)) {
        clearLongPress();
        const canvasWidth = e.currentTarget.clientWidth;
        const canvasHeight = e.currentTarget.clientHeight;
        longPress.current = {
          x: point.x,
          y: point.y,
          timer: window.setTimeout(() => {
            longPress.current = null;
            cancelStroke();
            setDragging(false);
            setMenu({
              x: Math.min(point.x, Math.max(0, canvasWidth - 200)),
              y: Math.min(point.y, Math.max(0, canvasHeight - 284)),
              cell: target,
            });
          }, 480),
        };
      }

      // Alt+click or the Pick tool sample the terrain under it.
      if (tool !== "select" && (tool === "pick" || e.altKey)) {
        pickTerrainAt(target);
        return;
      }

      // Right-click opens the quick-action menu for this square, kept
      // inside the canvas so it never spills off screen.
      if (e.button === 2) {
        const maxX = Math.max(0, e.currentTarget.clientWidth - 200);
        const maxY = Math.max(0, e.currentTarget.clientHeight - 284);
        setMenu({
          x: Math.min(point.x, maxX),
          y: Math.min(point.y, maxY),
          cell: target,
        });
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

      if (tool === "select") {
        const inside =
          selection &&
          target.col >= selection.c0 &&
          target.col <= selection.c1 &&
          target.row >= selection.r0 &&
          target.row <= selection.r1;
        stroke.current.active = true;
        stroke.current.tool = "select";
        stroke.current.anchor = target;
        if (inside) {
          updateMoving({ dx: 0, dy: 0 });
        } else {
          updateMarquee({ anchor: target, current: target });
        }
        setDragging(true);
        return;
      }

      if (tool === "ruler") {
        stroke.current.active = true;
        stroke.current.tool = "ruler";
        stroke.current.anchor = target;
        setRuler({ from: target, to: target });
        setDragging(true);
        return;
      }

      if (tool === "text") {
        const hit = labelAt(point);
        onLabelStart();
        if (hit) {
          stroke.current.active = true;
          stroke.current.tool = "text";
          stroke.current.anchor = target;
          labelDrag.current = { id: hit.id, moved: false };
          setDragging(true);
        } else {
          setLabelTarget(target);
        }
        return;
      }

      if (tool === "pin") {
        const hit = pins.find(
          (pin) => pin.col === target.col && pin.row === target.row
        );
        if (hit) {
          setSelectedPinId(hit.id);
          onPinStart();
          pinDrag.current = { id: hit.id };
          stroke.current.active = true;
          stroke.current.tool = "pin";
          stroke.current.anchor = target;
          setDragging(true);
        } else {
          setSelectedPinId(onAddPin(target.col, target.row));
        }
        return;
      }

      stroke.current.touched.clear();

      if (tool === "fog") {
        stroke.current.active = true;
        stroke.current.tool = "fog";
        stroke.current.last = target;
        fogCells(
          brushCells(target.col, target.row, brushSize, columns, rows)
        );
        setDragging(true);
        return;
      }

      if (tool === "fill") {
        const terrainId = strokeTerrain("fill");
        if (!terrainId) return;
        paintCells(floodFill(layerTiles, target, columns, rows), terrainId);
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
        terrainId,
        tool === "scatter"
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
      layerTiles,
      selection,
      paintCells,
      finishStroke,
      cancelStroke,
      pickTerrainAt,
      strokeTerrain,
      updateDraft,
      updateMarquee,
      updateMoving,
      labelAt,
      onLabelStart,
      onCenterChange,
      fogCells,
      pins,
      onAddPin,
      onPinStart,
      clearLongPress,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = localPoint(e);
      const tracked = pointers.current.has(e.pointerId);

      if (tracked) pointers.current.set(e.pointerId, point);

      // Moving a finger cancels a pending long-press, so panning and painting
      // never pop the menu open mid-gesture.
      const pendingPress = longPress.current;
      if (
        pendingPress &&
        Math.hypot(point.x - pendingPress.x, point.y - pendingPress.y) > 8
      ) {
        clearLongPress();
      }

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

        if (current.tool === "select") {
          const move = movingRef.current;
          const base = current.anchor;
          if (move && base) {
            updateMoving({
              dx: target.col - base.col,
              dy: target.row - base.row,
            });
          } else {
            updateMarquee({ anchor: base ?? target, current: target });
          }
          return;
        }

        if (current.tool === "ruler") {
          const base = current.anchor;
          if (base) setRuler({ from: base, to: target });
          return;
        }

        if (current.tool === "text") {
          const drag = labelDrag.current;
          if (drag) {
            if (drag.id) onMoveLabel(drag.id, target.col, target.row);
            drag.moved = true;
          }
          return;
        }

        if (current.tool === "pin") {
          const drag = pinDrag.current;
          if (drag) onMovePin(drag.id, target.col, target.row);
          return;
        }

        if (current.tool === "line" || current.tool === "rect") {
          // Shapes only preview while dragging; the tiles land on release.
          const base = draftRef.current;
          if (base) updateDraft({ ...base, current: target });
          return;
        }

        if (current.tool === "fog") {
          const path = current.last ? lineCells(current.last, target) : [target];
          const cells: Cell[] = [];
          for (const step of path) {
            cells.push(
              ...brushCells(step.col, step.row, brushSize, columns, rows)
            );
          }
          current.last = target;
          fogCells(cells);
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
          paintCells(cells, terrainId, current.tool === "scatter");
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
      updateMarquee,
      updateMoving,
      onMoveLabel,
      onCenterChange,
      onCameraChange,
      fogCells,
      onMovePin,
      clearLongPress,
    ]
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      clearLongPress();
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
      const area = marqueeRef.current;
      const move = movingRef.current;

      if (current.tool === "select") {
        if (move) {
          commitMove();
        } else if (area) {
          setSelection(normalise(area.anchor, area.current));
        }
        updateMarquee(null);
        updateMoving(null);
        stroke.current = emptyStroke();
        setDragging(false);
        return;
      }

      if (current.tool === "ruler") {
        stroke.current = emptyStroke();
        setDragging(false);
        return;
      }

      if (current.tool === "text") {
        const drag = labelDrag.current;
        labelDrag.current = null;
        stroke.current = emptyStroke();
        setDragging(false);
        if (drag) {
          if (!drag.moved) {
            const label = labels.find((item) => item.id === drag.id);
            if (label) setLabelTarget({ col: label.col, row: label.row });
          }
          onLabelCommit();
        }
        return;
      }

      if (current.tool === "pin") {
        const drag = pinDrag.current;
        pinDrag.current = null;
        stroke.current = emptyStroke();
        setDragging(false);
        if (drag) onPinCommit();
        return;
      }

      if (
        current.active &&
        base &&
        (current.tool === "line" || current.tool === "rect")
      ) {
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
    [
      paintCells,
      finishStroke,
      strokeTerrain,
      updateDraft,
      updateMarquee,
      updateMoving,
      commitMove,
      labels,
      onLabelCommit,
      onPinCommit,
      clearLongPress,
    ]
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

  // --- Keyboard shortcuts: tools, terrain, brush size, selection, undo/redo ---
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

      if (command) {
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) onRedo();
          else onUndo();
          return;
        }
        if (key === "y") {
          event.preventDefault();
          onRedo();
          return;
        }
        if (key === "c" && selection) {
          event.preventDefault();
          copySelection();
          return;
        }
        if (key === "x" && selection) {
          event.preventDefault();
          copySelection();
          deleteSelection();
          return;
        }
        if (key === "v" && clipboard) {
          event.preventDefault();
          pasteClipboard();
          return;
        }
        return;
      }

      if (event.altKey) return;

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
        setSelection(null);
        if (labelTarget) onLabelCommit();
        setLabelTarget(null);
        setRuler(null);
        setMenu(null);
        setSelectedPinId(null);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        onShowShortcuts();
        return;
      }

      const nextTool = TOOL_BY_KEY[key];
      if (nextTool) {
        setTool(nextTool);
        return;
      }

      const index = Number(event.key);
      if (
        Number.isInteger(index) &&
        index >= 1 &&
        index <= layerTerrains.length
      ) {
        onTerrainChange(layerTerrains[index - 1].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancelStroke,
    clipboard,
    copySelection,
    deleteSelection,
    labelTarget,
    layerTerrains,
    onLabelCommit,
    onRedo,
    onShowShortcuts,
    onTerrainChange,
    onUndo,
    pasteClipboard,
    selection,
  ]);

  // --- Fit the whole map into the canvas until the user zooms ---
  useEffect(() => {
    if (!onCameraChange) return;
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;

    const fitToParent = () => {
      if (userZoomed.current) return;
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
    };

    fitToParent();
    // Recentre when the canvas changes size (rotation, window resize, or the
    // mobile URL bar moving) so the map never drifts off-centre.
    const observer = new ResizeObserver(fitToParent);
    observer.observe(parent);
    return () => observer.disconnect();
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
      const inView = (x: number, y: number) =>
        x + cell >= 0 && y + cell >= 0 && x <= rect.width && y <= rect.height;

      const fillTile = (terrain: Terrain, x: number, y: number, alpha = 1) => {
        ctx.globalAlpha = alpha;
        if (textures) {
          drawTileTexture(
            ctx,
            terrain,
            x,
            y,
            cell,
            camera.x,
            camera.y,
            camera.zoom
          );
        } else {
          ctx.fillStyle = terrain.color;
          ctx.fillRect(x, y, cell, cell);
        }
        ctx.globalAlpha = 1;
      };

      // 1. Floor.
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          const x = col * cell + camera.x;
          const y = row * cell + camera.y;
          if (!inView(x, y)) continue;
          const id = layers.floor[row]?.[col]?.terrain;
          const terrain = byTerrain.get(id ?? "") ?? byTerrain.get("grass");
          if (terrain) fillTile(terrain, x, y);
        }
      }

      // 2. Shorelines where water meets land.
      if (textures) {
        const waterAt = (col: number, row: number) =>
          layers.floor[row]?.[col]?.terrain === "water";
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            if (!waterAt(col, row)) continue;
            const x = col * cell + camera.x;
            const y = row * cell + camera.y;
            if (!inView(x, y)) continue;
            drawShoreline(ctx, waterAt, col, row, x, y, cell);
          }
        }
      }

      // 3. Objects (props sit on top of the floor). Doors are held back for
      // the wall pass, so they can sit in the wall they open through.
      if (layerVisible.objects) {
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
            if (playerView && placed.terrain === "secret-door") continue;
            const x = col * cell + camera.x;
            const y = row * cell + camera.y;
            if (!inView(x, y)) continue;
            const terrain = byTerrain.get(placed.terrain);
            if (terrain) drawProp(ctx, terrain, x, y, cell, placed);
          }
        }
      }

      // 4. Walls, auto-tiled against their neighbours.
      if (layerVisible.walls) {
        const wallAt = (col: number, row: number) => {
          if (col < 0 || col >= columns || row < 0 || row >= rows) return false;
          const id = layers.walls[row]?.[col]?.terrain;
          return byTerrain.get(id ?? "")?.kind === "wall";
        };
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            const id = layers.walls[row]?.[col]?.terrain;
            if (!id) continue;
            const x = col * cell + camera.x;
            const y = row * cell + camera.y;
            if (!inView(x, y)) continue;
            const terrain = byTerrain.get(id);
            if (!terrain) continue;
            fillTile(terrain, x, y);
            if (terrain.kind === "wall") {
              drawWallEdges(ctx, wallAt, col, row, x, y, cell);
            }
          }
        }
      }

      // 4b. Doors, above the walls they cut through.
      if (layerVisible.objects) {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            const placed = layers.objects[row]?.[col];
            if (
              placed?.terrain !== "door" &&
              placed?.terrain !== "secret-door"
            ) {
              continue;
            }
            if (playerView && placed.terrain === "secret-door") continue;
            const x = col * cell + camera.x;
            const y = row * cell + camera.y;
            if (!inView(x, y)) continue;
            const terrain = byTerrain.get(placed.terrain);
            if (terrain) drawProp(ctx, terrain, x, y, cell, placed);
          }
        }
      }

      // 4c. Light pools from campfires and other light props.
      if (lights) {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            const placed = layers.objects[row]?.[col];
            const light = placed?.terrain
              ? LIGHT_PROPS[placed.terrain]
              : undefined;
            if (!light) continue;
            const x = col * cell + camera.x;
            const y = row * cell + camera.y;
            if (!inView(x, y)) continue;
            drawLight(
              ctx,
              x,
              y,
              cell,
              light.brightFeet,
              light.dimFeet,
              light.color
            );
          }
        }
      }

      // 5. GM layer: a translucent wash only the GM can see.
      if (layerVisible.gm && !playerView) {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            const mark = layers.gm[row]?.[col];
            if (!mark?.terrain) continue;
            const x = col * cell + camera.x;
            const y = row * cell + camera.y;
            if (!inView(x, y)) continue;
            const terrain = byTerrain.get(mark.terrain);
            if (terrain) fillTile(terrain, x, y, 0.45);
            if (cell > 10) {
              ctx.strokeStyle = "rgba(196, 143, 245, 0.75)";
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.strokeRect(x + 12.5, y + 12.5, cell - 25, cell - 25);
              ctx.setLineDash([]);
            }
          }
        }
      }

      // 6. Grid (off in theater-of-the-mind mode).
      if (showGrid) {
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
      }

      // 7. Ghost preview of a line or rectangle that is still being dragged.
      if (draft) {
        const preview =
          draft.tool === "line"
            ? lineCells(draft.anchor, draft.current)
            : rectCells(draft.anchor, draft.current, draft.outline);
        const terrainId = strokeTerrain(draft.tool);
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

      // 8. Selection, marquee or the block being moved.
      const drawArea = (area: Selection, offsetCol = 0, offsetRow = 0) => {
        const x = (area.c0 + offsetCol) * cell + camera.x;
        const y = (area.r0 + offsetRow) * cell + camera.y;
        const w = (area.c1 - area.c0 + 1) * cell;
        const h = (area.r1 - area.r0 + 1) * cell;
        ctx.fillStyle = "rgba(79, 142, 247, 0.16)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#4f8ef7";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.setLineDash([]);
      };

      if (selection) {
        const move = moving ?? { dx: 0, dy: 0 };
        drawArea(selection, move.dx, move.dy);
      }
      if (marquee) {
        drawArea(normalise(marquee.anchor, marquee.current));
      }

      // 9. Ruler: a tape measure in squares and feet.
      if (ruler) {
        const ax = ruler.from.col * cell + camera.x + cell / 2;
        const ay = ruler.from.row * cell + camera.y + cell / 2;
        const bx = ruler.to.col * cell + camera.x + cell / 2;
        const by = ruler.to.row * cell + camera.y + cell / 2;
        const squares = Math.max(
          Math.abs(ruler.to.col - ruler.from.col),
          Math.abs(ruler.to.row - ruler.from.row)
        );
        const label = `${squares} sq · ${squares * FEET_PER_SQUARE} ft`;

        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffd166";
        for (const [x, y] of [
          [ax, ay],
          [bx, by],
        ]) {
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.font = "600 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const metrics = ctx.measureText(label);
        const midX = (ax + bx) / 2;
        const midY = (ay + by) / 2 - 14;
        ctx.fillStyle = "rgba(8, 12, 18, 0.85)";
        ctx.fillRect(
          midX - metrics.width / 2 - 6,
          midY - 9,
          metrics.width + 12,
          18
        );
        ctx.fillStyle = "#ffd166";
        ctx.fillText(label, midX, midY);
      }

      // 10. Text labels.
      for (const label of labels) {
        const x = label.col * cell + camera.x + cell / 2;
        const y = label.row * cell + camera.y + cell / 2;
        if (x < -220 || x > rect.width + 220) continue;
        if (y < -60 || y > rect.height + 60) continue;
        const fontSize = Math.max(9, Math.min(18, cell * 0.42));
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, fontSize * 0.28);
        ctx.strokeStyle = "rgba(6, 10, 16, 0.88)";
        ctx.strokeText(label.text, x, y);
        ctx.fillStyle = "#f6f9ff";
        ctx.fillText(label.text, x, y);
      }

      // 10a. Pins: numbered points of interest, above the labels.
      for (const pin of pins) {
        const cx = pin.col * cell + camera.x + cell / 2;
        const cy = pin.row * cell + camera.y + cell / 2;
        if (cx < -40 || cx > rect.width + 40) continue;
        if (cy < -40 || cy > rect.height + 40) continue;
        const radius = Math.max(6, Math.min(cell * 0.34, 18));
        if (pin.id === selectedPinId) {
          ctx.strokeStyle = "#ffd166";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy - radius * 0.2, radius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        drawPin(ctx, cx, cy, radius, pin.label);
      }

      // 10b. Fog of war: hidden squares cover everything beneath them.
      if (showFog || playerView) {
        ctx.fillStyle = playerView ? "#05080d" : "rgba(7, 11, 18, 0.68)";
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            if (!fog[row]?.[col]) continue;
            const x = col * cell + camera.x;
            const y = row * cell + camera.y;
            if (!inView(x, y)) continue;
            ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
          }
        }

        if (cell >= 10) {
          ctx.strokeStyle = playerView
            ? "rgba(80, 110, 150, 0.35)"
            : "rgba(130, 170, 215, 0.45)";
          ctx.lineWidth = 1;
          for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < columns; col += 1) {
              if (!fog[row]?.[col]) continue;
              const x = col * cell + camera.x;
              const y = row * cell + camera.y;
              if (!inView(x, y)) continue;
              ctx.beginPath();
              if (row === 0 || !fog[row - 1]?.[col]) {
                ctx.moveTo(x, y + 0.5);
                ctx.lineTo(x + cell, y + 0.5);
              }
              if (row === rows - 1 || !fog[row + 1]?.[col]) {
                ctx.moveTo(x, y + cell - 0.5);
                ctx.lineTo(x + cell, y + cell - 0.5);
              }
              if (col === 0 || !fog[row]?.[col - 1]) {
                ctx.moveTo(x + 0.5, y);
                ctx.lineTo(x + 0.5, y + cell);
              }
              if (col === columns - 1 || !fog[row]?.[col + 1]) {
                ctx.moveTo(x + cell - 0.5, y);
                ctx.lineTo(x + cell - 0.5, y + cell);
              }
              ctx.stroke();
            }
          }
        }
      }

      // 11. Selected tile outline.
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

      // 12. Brush footprint under the pointer, so the size is never a surprise.
      const footprintTools: ToolId[] = [
        "paint",
        "erase",
        "scatter",
        "line",
        "rect",
        "fill",
      ];
      if (!draft && hover && footprintTools.includes(tool) && cell >= 6) {
        const span = tool === "paint" || tool === "erase" || tool === "scatter"
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

      // 13. Compass rose and scale bar.
      if (compass) {
        const radius = Math.max(18, Math.min(cell * 1.3, 30));
        drawCompass(ctx, rect.width - radius - 12, radius + 12, radius);
        drawScaleBar(
          ctx,
          16,
          rect.height - 24,
          Math.max(10, Math.min(cell, 26))
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
    layers,
    layerVisible,
    camera,
    terrains,
    tile,
    labels,
    draft,
    hover,
    tool,
    brushSize,
    selectedTerrainId,
    showGrid,
    textures,
    selection,
    marquee,
    moving,
    ruler,
    strokeTerrain,
    fog,
    showFog,
    playerView,
    lights,
    compass,
    pins,
    selectedPinId,
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
            <Chip
              variant="secondary"
              size="sm"
              onClick={onExport}
              ariaLabel="Export an image or walls for a virtual tabletop"
            >
              Export
            </Chip>
            <Chip
              variant="secondary"
              size="sm"
              onClick={onShowShortcuts}
              ariaLabel="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              ?
            </Chip>
          </span>
        }
      />

      <div className={`map-tools ${toolsOpen ? "is-open" : "is-collapsed"}`}>
        <button
          type="button"
          className="tools-toggle"
          aria-expanded={toolsOpen}
          aria-controls="map-tools-body"
          onClick={() => setToolsOpen((open) => !open)}
        >
          <span>{TOOLS.find((entry) => entry.id === tool)?.label ?? "Tools"}</span>
          <span className="tools-toggle-caret">
            {toolsOpen ? "Hide tools" : "Show tools"}
          </span>
        </button>
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

        <div className="view-group" role="group" aria-label="Canvas view">
          <Chip
            size="sm"
            variant={showGrid ? "primary" : "secondary"}
            aria-pressed={showGrid}
            title="Toggle grid — theater of the mind"
            onClick={onToggleGrid}
          >
            Grid
          </Chip>
          <Chip
            size="sm"
            variant={textures ? "primary" : "secondary"}
            aria-pressed={textures}
            title="Toggle terrain textures"
            onClick={onToggleTextures}
          >
            Textures
          </Chip>
          <Chip
            size="sm"
            variant={symmetry ? "primary" : "secondary"}
            aria-pressed={symmetry}
            title="Mirror every stroke across both axes"
            onClick={onToggleSymmetry}
          >
            Symmetry
          </Chip>
          <Chip
            size="sm"
            variant={showFog ? "primary" : "secondary"}
            aria-pressed={showFog}
            title="Show fog of war while editing"
            onClick={onToggleFog}
          >
            Fog
          </Chip>
          <Chip
            size="sm"
            variant={playerView ? "primary" : "secondary"}
            aria-pressed={playerView}
            title="Hide GM marks and secret doors, and black out fogged squares"
            onClick={onTogglePlayerView}
          >
            Player
          </Chip>
          <Chip
            size="sm"
            variant={lights ? "primary" : "secondary"}
            aria-pressed={lights}
            title="Warm pools of light around campfires"
            onClick={onToggleLights}
          >
            Lights
          </Chip>
          <Chip
            size="sm"
            variant={compass ? "primary" : "secondary"}
            aria-pressed={compass}
            title="Compass rose and scale bar"
            onClick={onToggleCompass}
          >
            Compass
          </Chip>
        </div>

        <p className="tool-hint">
          {LAYER_HINTS[activeLayer]} · Shift = hollow · Alt-click picks ·
          right-click menu · B L R F I E S V T M G N · [ ] size · ? shortcuts
        </p>
      </div>

      <div className="map-layers">{renderLayerTabs()}</div>

      {selection || clipboard ? (
        <div className="selection-bar">
          <span className="selection-info">
            {selection
              ? `${selection.c1 - selection.c0 + 1} × ${
                  selection.r1 - selection.r0 + 1
                } selected · all layers`
              : `${clipboard?.w} × ${clipboard?.h} copied`}
          </span>
          <Chip
            size="sm"
            variant="secondary"
            onClick={copySelection}
            disabled={!selection}
          >
            Copy
          </Chip>
          <Chip
            size="sm"
            variant="secondary"
            onClick={() => {
              copySelection();
              deleteSelection();
            }}
            disabled={!selection}
          >
            Cut
          </Chip>
          <Chip
            size="sm"
            variant="secondary"
            onClick={pasteClipboard}
            disabled={!clipboard}
          >
            Paste
          </Chip>
          <Chip
            size="sm"
            variant="secondary"
            onClick={fillSelection}
            disabled={!selection || !selectedTerrainId}
            title="Fill the selection with the current terrain"
          >
            Fill
          </Chip>
          <Chip
            size="sm"
            variant="secondary"
            onClick={deleteSelection}
            disabled={!selection}
          >
            Delete
          </Chip>
          <Chip
            size="sm"
            variant="secondary"
            onClick={() =>
              setSelection({
                c0: 0,
                r0: 0,
                c1: columns - 1,
                r1: rows - 1,
              })
            }
            title="Select the whole map"
          >
            All
          </Chip>
          <Chip
            size="sm"
            variant="secondary"
            onClick={() => setSelection(null)}
            disabled={!selection}
          >
            Deselect
          </Chip>
        </div>
      ) : null}

      {labelTarget ? (
        <div className="label-editor">
          <span className="selection-info">
            Label at {labelTarget.col + 1}, {labelTarget.row + 1}
          </span>
          <input
            className="text-input"
            type="text"
            value={labelValue}
            autoFocus
            placeholder="Room name or key number…"
            onChange={(e) =>
              onSetLabel(labelTarget.col, labelTarget.row, e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                onLabelCommit();
                setLabelTarget(null);
              }
            }}
          />
          <Chip
            size="sm"
            variant="secondary"
            onClick={() => {
              onSetLabel(labelTarget.col, labelTarget.row, "");
              onLabelCommit();
              setLabelTarget(null);
            }}
          >
            Remove
          </Chip>
          <Chip
            size="sm"
            variant="secondary"
            onClick={() => {
              onLabelCommit();
              setLabelTarget(null);
            }}
          >
            Done
          </Chip>
        </div>
      ) : null}

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

        {menu ? (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            label={`Square ${menu.cell.col + 1}, ${menu.cell.row + 1}`}
            onClose={() => setMenu(null)}
            actions={[
              {
                label: "Pick terrain",
                onSelect: () => pickTerrainAt(menu.cell),
              },
              {
                label: "Drop pin here",
                onSelect: () =>
                  setSelectedPinId(
                    onAddPin(menu.cell.col, menu.cell.row)
                  ),
              },
              {
                label: "Add label",
                onSelect: () => {
                  setTool("text");
                  setLabelTarget(menu.cell);
                },
              },
              {
                label: "Fill with terrain",
                disabled: !selectedTerrainId,
                onSelect: () => {
                  if (!selectedTerrainId) return;
                  onStrokeStart();
                  onPaintCells(
                    floodFill(layerTiles, menu.cell, columns, rows),
                    selectedTerrainId,
                    activeLayer
                  );
                  onStrokeEnd?.();
                },
              },
              {
                label: "Clear tile",
                disabled: !LAYER_IDS.some(
                  (id) => layers[id][menu.cell.row]?.[menu.cell.col]?.terrain
                ),
                onSelect: () =>
                  onApplyArea(
                    [],
                    LAYER_IDS.map((id) => ({ layer: id, ...menu.cell }))
                  ),
              },
              {
                label: "Toggle fog",
                onSelect: () => {
                  onStrokeStart();
                  onToggleFogCells([menu.cell]);
                  onStrokeEnd?.();
                },
              },
              {
                label: "Select all",
                onSelect: () => {
                  setTool("select");
                  setSelection({
                    c0: 0,
                    r0: 0,
                    c1: columns - 1,
                    r1: rows - 1,
                  });
                },
              },
            ]}
          />
        ) : null}
      </div>

      <div className={`map-inspect ${paletteOpen ? "is-open" : "is-collapsed"}`}>
        <button
          type="button"
          className="sheet-toggle"
          aria-expanded={paletteOpen}
          aria-controls="palette-body"
          onClick={() => setPaletteOpen((open) => !open)}
        >
          <span className="sheet-toggle-text">
            <strong>{LAYER_LABELS[activeLayer]}</strong>
            <span>{activeTerrain?.name ?? "Pick a terrain"}</span>
          </span>
          <span className="sheet-toggle-caret">
            {paletteOpen ? "Close" : "Palette"}
          </span>
        </button>
        <div className="sheet-layers">{renderLayerTabs()}</div>
        <div className="inspect-col">
          <PanelHeader
            title={
              activeLayer === "objects"
                ? "Stamp library"
                : `${LAYER_LABELS[activeLayer]} terrain`
            }
          />
          {activeLayer === "objects" ? (
            <div className="stamp-grid">
              {layerTerrains.map((t) => (
                <StampCard
                  key={t.id}
                  terrain={t}
                  selected={t.id === selectedTerrainId}
                  onSelect={() => onTerrainChange(t.id)}
                />
              ))}
            </div>
          ) : (
            <div className="terrain-list">
              {layerTerrains.map((t) => (
                <ColorSwatch
                  key={t.id}
                  label={t.name}
                  symbol={t.symbol}
                  color={t.color}
                  altColor={t.altColor}
                  image={t.image}
                  selected={t.id === selectedTerrainId}
                  onChange={() => onTerrainChange(t.id)}
                />
              ))}
            </div>
          )}
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
              placeholder={tile ? "Tile note..." : "Pick a tile to add a note"}
              disabled={!tile}
              onChange={(e) => {
                if (!tile) return;
                onTileChange(tile.col, tile.row, { note: e.target.value });
              }}
            />
          </div>

          {selectedPin ? (
            <div className="pin-editor">
              <PanelHeader title={`Pin ${selectedPin.label || "?"}`} />
              <label className="field-label" htmlFor="pin-badge">
                Badge
              </label>
              <input
                id="pin-badge"
                className="text-input pin-input"
                value={selectedPin.label}
                maxLength={8}
                placeholder="1"
                onFocus={onPinStart}
                onBlur={onPinCommit}
                onChange={(e) =>
                  onSetPin(selectedPin.id, { label: e.target.value })
                }
              />
              <label className="field-label" htmlFor="pin-note">
                GM note
              </label>
              <input
                id="pin-note"
                className="note-input"
                value={selectedPin.note}
                placeholder="What is here?"
                onFocus={onPinStart}
                onBlur={onPinCommit}
                onChange={(e) =>
                  onSetPin(selectedPin.id, { note: e.target.value })
                }
              />
              <Chip
                size="sm"
                variant="secondary"
                onClick={() => {
                  onRemovePin(selectedPin.id);
                  setSelectedPinId(null);
                }}
              >
                Remove pin
              </Chip>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
