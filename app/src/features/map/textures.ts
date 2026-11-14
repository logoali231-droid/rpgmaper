import type { Terrain, Tile } from "./model";

/** Deterministic tiny PRNG so a terrain always textures the same way. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTURE_SIZE = 48;
const textureCache = new Map<string, HTMLCanvasElement>();
const imageCache = new Map<string, HTMLImageElement>();
const textureListeners = new Set<() => void>();

/** Notified when an imported tileset image finishes loading. */
export function onTextureReady(listener: () => void): () => void {
  textureListeners.add(listener);
  return () => textureListeners.delete(listener);
}

function shade(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const num = parseInt(full, 16);
  const channel = (shift: number) => {
    const part = (num >> shift) & 0xff;
    const next = Math.max(0, Math.min(255, Math.round(part + amount * 255)));
    return next.toString(16).padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** A small repeating texture for one terrain, generated once per colour. */
export function textureFor(terrain: Terrain): HTMLCanvasElement {
  const key = `${terrain.id}:${
    terrain.image ? `img${terrain.image.length}` : terrain.color
  }`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Imported tileset: paint the image once it has decoded.
  if (terrain.image) {
    let image = imageCache.get(terrain.image);
    if (!image) {
      image = new Image();
      image.onload = () => {
        textureListeners.forEach((listener) => listener());
      };
      image.onerror = () => {
        textureListeners.forEach((listener) => listener());
      };
      image.src = terrain.image;
      imageCache.set(terrain.image, image);
    }
    if (image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      // A light grid keeps imported tiles readable as squares.
      ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, TEXTURE_SIZE - 1, TEXTURE_SIZE - 1);
      canvas.dataset.ready = "1";
      textureCache.set(key, canvas);
    }
    return canvas;
  }

  ctx.fillStyle = terrain.color;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const random = mulberry32(hashString(key));
  const light = shade(terrain.color, 0.09);
  const dark = shade(terrain.color, -0.09);

  if (terrain.kind === "prop") {
    // Props are drawn as shapes, not textures.
    textureCache.set(key, canvas);
    return canvas;
  }

  if (terrain.id === "water") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1.4;
    for (let row = 0; row < 5; row += 1) {
      const y = 6 + row * 10;
      ctx.beginPath();
      for (let x = 0; x <= TEXTURE_SIZE; x += 2) {
        ctx.lineTo(x, y + Math.sin((x / TEXTURE_SIZE) * Math.PI * 3) * 1.8);
      }
      ctx.stroke();
    }
    textureCache.set(key, canvas);
    return canvas;
  }

  if (terrain.kind === "wall" || terrain.id === "floor-stone") {
    // Offset brick rows, plus a mortar cross for tiled floors.
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.4;
    for (let row = 0; row < 4; row += 1) {
      const y = row * 12;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(TEXTURE_SIZE, y + 0.5);
      ctx.stroke();
      const offset = row % 2 === 0 ? 0 : 12;
      for (let x = offset; x < TEXTURE_SIZE; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y);
        ctx.lineTo(x + 0.5, y + 12);
        ctx.stroke();
      }
      ctx.fillStyle = light;
      ctx.fillRect(0, y + 1, TEXTURE_SIZE, 1);
    }
    textureCache.set(key, canvas);
    return canvas;
  }

  // Soft speckle for grass, sand, forest and rock.
  const speckles = terrain.id === "sand" ? 70 : 40;
  for (let i = 0; i < speckles; i += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const radius = 0.5 + random() * 1.1;
    ctx.fillStyle = random() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (terrain.id === "forest") {
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = shade(terrain.color, -0.12);
      const x = random() * TEXTURE_SIZE;
      const y = random() * TEXTURE_SIZE;
      ctx.beginPath();
      ctx.arc(x, y, 2 + random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (terrain.id === "mountain") {
    ctx.strokeStyle = shade(terrain.color, 0.18);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i += 1) {
      const x = random() * TEXTURE_SIZE;
      const y = random() * TEXTURE_SIZE;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 7, y + 9);
      ctx.lineTo(x - 3, y + 9);
      ctx.stroke();
    }
  }

  textureCache.set(key, canvas);
  return canvas;
}

const patternCache = new Map<string, CanvasPattern | null>();

/**
 * Fill one square with its terrain texture. The pattern is anchored to the
 * map, not the square, so textures run seamlessly across neighbouring
 * squares instead of repeating a stamp in every cell.
 */
export function drawTileTexture(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  x: number,
  y: number,
  size: number,
  offsetX = 0,
  offsetY = 0,
  scale = 1
) {
  if (terrain.kind === "prop") return;
  const texture = textureFor(terrain);
  const key = `${terrain.id}:${terrain.image ? "img" : terrain.color}:${
    texture.dataset.ready ?? "0"
  }`;

  if (!patternCache.has(key)) {
    patternCache.set(key, ctx.createPattern(texture, "repeat"));
  }
  const pattern = patternCache.get(key);

  if (!pattern) {
    ctx.drawImage(texture, x, y, size, size);
    return;
  }

  // Keep the texture glued to the map as it pans and zooms.
  pattern.setTransform(
    new DOMMatrix().translate(offsetX, offsetY).scale(scale, scale)
  );
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, size, size);
}

/**
 * Auto-tiling: a wall square gets a lit top-left edge and a shadowed
 * bottom-right edge wherever it meets open ground, so painted runs read
 * as connected walls instead of loose blocks.
 */
export function drawWallEdges(
  ctx: CanvasRenderingContext2D,
  wallAt: (col: number, row: number) => boolean,
  col: number,
  row: number,
  x: number,
  y: number,
  size: number
) {
  const left = wallAt(col - 1, row);
  const right = wallAt(col + 1, row);
  const up = wallAt(col, row - 1);
  const down = wallAt(col, row + 1);
  const thickness = Math.max(1, size * 0.09);

  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  if (!up) ctx.fillRect(x, y, size, thickness);
  if (!left) ctx.fillRect(x, y, thickness, size);

  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  if (!down) ctx.fillRect(x, y + size - thickness, size, thickness);
  if (!right) ctx.fillRect(x + size - thickness, y, thickness, size);

  if (!up && !left) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
    ctx.fillRect(x, y, size * 0.4, thickness);
  }
}

/** Light waterline where a body of water meets anything else. */
export function drawShoreline(
  ctx: CanvasRenderingContext2D,
  waterAt: (col: number, row: number) => boolean,
  col: number,
  row: number,
  x: number,
  y: number,
  size: number
) {
  const width = Math.max(1.5, size * 0.07);
  ctx.fillStyle = "rgba(190, 226, 255, 0.55)";
  if (!waterAt(col, row - 1)) ctx.fillRect(x, y, size, width);
  if (!waterAt(col, row + 1)) {
    ctx.fillRect(x, y + size - width, size, width);
  }
  if (!waterAt(col - 1, row)) ctx.fillRect(x, y, width, size);
  if (!waterAt(col + 1, row)) {
    ctx.fillRect(x + size - width, y, width, size);
  }
}

/** Built-in props, drawn as vector art so no image assets are needed. */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  x: number,
  y: number,
  size: number,
  tile: Tile
) {
  const rotation = ((tile.rotation ?? 0) % 4) * (Math.PI / 2);
  const scale = tile.scale ?? 1;
  const base = terrain.color;
  const light = terrain.altColor;

  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.translate(-size / 2, -size / 2);

  // Soft contact shadow keeps props sitting on the floor.
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(size / 2, size * 0.82, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (terrain.id) {
    case "tree": {
      ctx.fillStyle = "#5b3a1e";
      ctx.fillRect(size * 0.45, size * 0.5, size * 0.1, size * 0.35);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.42, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(size * 0.42, size * 0.33, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "bush": {
      ctx.fillStyle = base;
      for (const [dx, dy, radius] of [
        [0.4, 0.62, 0.2],
        [0.6, 0.6, 0.22],
        [0.5, 0.48, 0.18],
      ]) {
        ctx.beginPath();
        ctx.arc(size * dx, size * dy, size * radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(size * 0.46, size * 0.52, size * 0.11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rock": {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(size * 0.22, size * 0.72);
      ctx.lineTo(size * 0.32, size * 0.44);
      ctx.lineTo(size * 0.55, size * 0.32);
      ctx.lineTo(size * 0.76, size * 0.5);
      ctx.lineTo(size * 0.72, size * 0.74);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(size * 0.36, size * 0.48);
      ctx.lineTo(size * 0.54, size * 0.36);
      ctx.lineTo(size * 0.6, size * 0.48);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "chest": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.16, size * 0.4, size * 0.68, size * 0.38);
      ctx.fillStyle = light;
      ctx.fillRect(size * 0.16, size * 0.3, size * 0.68, size * 0.16);
      ctx.fillStyle = "#f0c95a";
      ctx.fillRect(size * 0.46, size * 0.45, size * 0.08, size * 0.16);
      break;
    }
    case "table": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.12, size * 0.28, size * 0.76, size * 0.5);
      ctx.fillStyle = light;
      ctx.fillRect(size * 0.12, size * 0.28, size * 0.76, size * 0.1);
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(size * 0.18, size * 0.7, size * 0.08, size * 0.1);
      ctx.fillRect(size * 0.74, size * 0.7, size * 0.08, size * 0.1);
      break;
    }
    case "pillar": {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(size * 0.46, size * 0.44, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "door": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.16, size * 0.14, size * 0.68, size * 0.72);
      ctx.fillStyle = light;
      ctx.fillRect(size * 0.22, size * 0.2, size * 0.56, size * 0.28);
      ctx.fillStyle = "#e0c28a";
      ctx.beginPath();
      ctx.arc(size * 0.72, size * 0.56, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "secret-door": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.16, size * 0.14, size * 0.68, size * 0.72);
      ctx.setLineDash([Math.max(2, size * 0.08), Math.max(2, size * 0.06)]);
      ctx.strokeStyle = light;
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeRect(size * 0.2, size * 0.18, size * 0.6, size * 0.64);
      ctx.setLineDash([]);
      ctx.fillStyle = light;
      ctx.font = `600 ${Math.max(8, size * 0.36)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", size * 0.5, size * 0.52);
      break;
    }
    case "barrel": {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.55, size * 0.24, size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4a3318";
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.42, size * 0.24, size * 0.09, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.7, size * 0.24, size * 0.09, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "campfire": {
      ctx.fillStyle = "#3c2a1a";
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.72, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6b4a2a";
      ctx.lineWidth = Math.max(1.2, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(size * 0.3, size * 0.76);
      ctx.lineTo(size * 0.7, size * 0.62);
      ctx.moveTo(size * 0.7, size * 0.76);
      ctx.lineTo(size * 0.3, size * 0.62);
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.2);
      ctx.lineTo(size * 0.62, size * 0.52);
      ctx.lineTo(size * 0.5, size * 0.64);
      ctx.lineTo(size * 0.38, size * 0.52);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "chair": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.28, size * 0.44, size * 0.44, size * 0.32);
      ctx.fillStyle = light;
      ctx.fillRect(size * 0.28, size * 0.2, size * 0.44, size * 0.18);
      break;
    }
    case "bed": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.14, size * 0.18, size * 0.72, size * 0.66);
      ctx.fillStyle = "#e8e4da";
      ctx.fillRect(size * 0.2, size * 0.24, size * 0.6, size * 0.18);
      ctx.fillStyle = light;
      ctx.fillRect(size * 0.2, size * 0.48, size * 0.6, size * 0.3);
      break;
    }
    case "crate": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.2, size * 0.24, size * 0.6, size * 0.58);
      ctx.strokeStyle = light;
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeRect(size * 0.2, size * 0.24, size * 0.6, size * 0.58);
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.24);
      ctx.lineTo(size * 0.8, size * 0.82);
      ctx.moveTo(size * 0.8, size * 0.24);
      ctx.lineTo(size * 0.2, size * 0.82);
      ctx.stroke();
      break;
    }
    case "bookshelf": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.12, size * 0.16, size * 0.76, size * 0.7);
      ctx.fillStyle = light;
      for (let shelf = 0; shelf < 3; shelf += 1) {
        ctx.fillRect(size * 0.18, size * (0.24 + shelf * 0.22), size * 0.64, size * 0.11);
      }
      break;
    }
    case "fountain": {
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.56, size * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.56, size * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(190, 226, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rug": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.1, size * 0.24, size * 0.8, size * 0.54);
      ctx.fillStyle = light;
      ctx.fillRect(size * 0.17, size * 0.3, size * 0.66, size * 0.42);
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.26, size * 0.38, size * 0.48, size * 0.26);
      break;
    }
    case "statue": {
      ctx.fillStyle = light;
      ctx.fillRect(size * 0.29, size * 0.72, size * 0.42, size * 0.14);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.4, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(size * 0.4, size * 0.48, size * 0.2, size * 0.26);
      break;
    }
    case "torch": {
      ctx.fillStyle = base;
      ctx.fillRect(size * 0.46, size * 0.5, size * 0.08, size * 0.34);
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.16);
      ctx.quadraticCurveTo(size * 0.7, size * 0.38, size * 0.5, size * 0.52);
      ctx.quadraticCurveTo(size * 0.3, size * 0.38, size * 0.5, size * 0.16);
      ctx.fill();
      break;
    }
    case "stairs": {
      ctx.fillStyle = base;
      for (let step = 0; step < 4; step += 1) {
        ctx.fillStyle = step % 2 === 0 ? base : light;
        ctx.fillRect(
          size * 0.14,
          size * (0.2 + step * 0.17),
          size * 0.72,
          size * 0.15
        );
      }
      break;
    }
    default: {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
