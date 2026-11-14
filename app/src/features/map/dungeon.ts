/** Random dungeon layout: rooms carved into a binary space partition, joined
 * by L-shaped corridors, with walls traced around every open square. The
 * result is plain cells, so the editor can apply it as one undoable edit. */
import type { Cell } from "./painting";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Node {
  rect: Rect;
  left?: Node;
  right?: Node;
  room?: Rect;
}

export interface DungeonPlan {
  floors: Cell[];
  walls: Cell[];
}

const randInt = (min: number, max: number) =>
  min + Math.floor(Math.random() * Math.max(1, max - min + 1));

function split(node: Node, depth: number, minLeaf: number): void {
  const { rect } = node;
  if (depth <= 0) return;
  const canSplitVertically = rect.w >= minLeaf * 2 + 3;
  const canSplitHorizontally = rect.h >= minLeaf * 2 + 3;
  if (!canSplitVertically && !canSplitHorizontally) return;

  let vertical: boolean;
  if (canSplitVertically && !canSplitHorizontally) vertical = true;
  else if (canSplitHorizontally && !canSplitVertically) vertical = false;
  else if (rect.w / rect.h >= 1.2) vertical = true;
  else if (rect.h / rect.w >= 1.2) vertical = false;
  else vertical = Math.random() < 0.5;

  if (vertical) {
    const cut = randInt(minLeaf + 1, rect.w - minLeaf - 2);
    node.left = { rect: { x: rect.x, y: rect.y, w: cut, h: rect.h } };
    node.right = {
      rect: { x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h },
    };
  } else {
    const cut = randInt(minLeaf + 1, rect.h - minLeaf - 2);
    node.left = { rect: { x: rect.x, y: rect.y, w: rect.w, h: cut } };
    node.right = {
      rect: { x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut },
    };
  }

  split(node.left, depth - 1, minLeaf);
  split(node.right, depth - 1, minLeaf);
}

function carveRooms(node: Node, rooms: Rect[]): void {
  if (node.left || node.right) {
    if (node.left) carveRooms(node.left, rooms);
    if (node.right) carveRooms(node.right, rooms);
    return;
  }
  const { rect } = node;
  const maxWidth = rect.w - 2;
  const maxHeight = rect.h - 2;
  if (maxWidth < 3 || maxHeight < 3) return;

  const w = randInt(3, Math.min(maxWidth, 9));
  const h = randInt(3, Math.min(maxHeight, 9));
  const room: Rect = {
    x: randInt(rect.x + 1, rect.x + rect.w - w - 1),
    y: randInt(rect.y + 1, rect.y + rect.h - h - 1),
    w,
    h,
  };
  node.room = room;
  rooms.push(room);
}

const centre = (rect: Rect) => ({
  x: rect.x + Math.floor((rect.w - 1) / 2),
  y: rect.y + Math.floor((rect.h - 1) / 2),
});

/** Build rooms, corridors and their surrounding walls for a map of this size. */
export function buildDungeon(cols: number, rows: number): DungeonPlan {
  const floors = new Set<string>();
  const add = (col: number, row: number) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    floors.add(`${col},${row}`);
  };

  const root: Node = {
    rect: {
      x: 1,
      y: 1,
      w: Math.max(7, cols - 2),
      h: Math.max(7, rows - 2),
    },
  };
  split(root, 4, 5);

  const rooms: Rect[] = [];
  carveRooms(root, rooms);
  if (rooms.length === 0) {
    rooms.push({
      x: Math.max(1, Math.floor(cols / 2) - 2),
      y: Math.max(1, Math.floor(rows / 2) - 2),
      w: Math.max(2, Math.min(5, cols - 2)),
      h: Math.max(2, Math.min(5, rows - 2)),
    });
  }

  for (const room of rooms) {
    for (let row = room.y; row < room.y + room.h; row += 1) {
      for (let col = room.x; col < room.x + room.w; col += 1) add(col, row);
    }
  }

  // Corridors join consecutive rooms, so every room ends up reachable.
  for (let i = 1; i < rooms.length; i += 1) {
    const from = centre(rooms[i - 1]);
    const to = centre(rooms[i]);
    const horizontal = (a: number, b: number, row: number) => {
      for (let col = Math.min(a, b); col <= Math.max(a, b); col += 1) {
        add(col, row);
      }
    };
    const vertical = (a: number, b: number, col: number) => {
      for (let row = Math.min(a, b); row <= Math.max(a, b); row += 1) {
        add(col, row);
      }
    };
    if (Math.random() < 0.5) {
      horizontal(from.x, to.x, from.y);
      vertical(from.y, to.y, to.x);
    } else {
      vertical(from.y, to.y, from.x);
      horizontal(from.x, to.x, to.y);
    }
  }

  const isFloor = (col: number, row: number) => floors.has(`${col},${row}`);
  const floorCells: Cell[] = [];
  for (const key of floors) {
    const [col, row] = key.split(",").map(Number);
    floorCells.push({ col, row });
  }

  // A wall ring around every open square, diagonals included, so corners close.
  const wallCells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (isFloor(col, row)) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy += 1) {
        for (let dx = -1; dx <= 1 && !touches; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (isFloor(col + dx, row + dy)) touches = true;
        }
      }
      if (touches) wallCells.push({ col, row });
    }
  }

  return { floors: floorCells, walls: wallCells };
}
