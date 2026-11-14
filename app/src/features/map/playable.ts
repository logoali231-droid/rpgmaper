/** Build a single self-contained HTML file that plays a map offline: a token
 * the players move around, fog of war that clears as it goes, walls that block
 * movement, and warm light from torches. No server, no GM notes, no pins. */
import type { FogGrid, Layers, MapLabel, Terrain } from "./model";

export interface PlayableMapInput {
  name: string;
  columns: number;
  rows: number;
  layers: Layers;
  terrains: Terrain[];
  labels: MapLabel[];
  fog: FogGrid;
  /** Squares of vision around the token. */
  revealRadius?: number;
  /** Begin with the whole map hidden, so exploring reveals it. */
  startHidden?: boolean;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Tiles carry notes for the GM; the playable file must not ship them. */
const publicTiles = (grid: Layers[keyof Layers], secret: Set<string>) =>
  grid.map((row) =>
    row.map((tile) => {
      const terrain = tile.terrain && !secret.has(tile.terrain) ? tile.terrain : "";
      return {
        terrain,
        variant: tile.variant,
        rotation: tile.rotation,
        scale: tile.scale,
      };
    })
  );

/** Script that runs inside the exported page. Kept plain so the file needs no
 * build step, no module loading and no network. */
const RUNTIME = String.raw`
(function () {
  var MAP = JSON.parse(document.getElementById("map-data").textContent);
  var cols = MAP.columns, rows = MAP.rows;
  var floor = MAP.layers.floor, objects = MAP.layers.objects, walls = MAP.layers.walls;
  var terrains = {}, images = {};
  MAP.terrains.forEach(function (t) {
    terrains[t.id] = t;
    if (t.image) { var img = new Image(); img.src = t.image; images[t.id] = img; }
  });

  var canvas = document.getElementById("map");
  var ctx = canvas.getContext("2d");
  var token = { col: MAP.start.col, row: MAP.start.row };
  var fog = MAP.fog;
  var revealRadius = MAP.revealRadius;
  var storageKey = "rpgmap-play:" + MAP.name + ":" + cols + "x" + rows;
  var cell = 24, ox = 0, oy = 0, dragging = false, moved = 0, pinch = null;
  var pointers = {};

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        token: token,
        fog: fog.map(function (row) {
          return row.map(function (v) { return v ? 1 : 0; }).join("");
        })
      }));
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved.token) token = { col: saved.token.col, row: saved.token.row };
      if (saved.fog && saved.fog.length === rows) {
        fog = saved.fog.map(function (row) {
          return row.split("").map(function (c) { return c === "1"; });
        });
      }
    } catch (e) {}
  }

  function terrainAt(grid, col, row) {
    var cellValue = grid[row] && grid[row][col];
    return cellValue && cellValue.terrain ? terrains[cellValue.terrain] : null;
  }

  function blocked(col, row) {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return true;
    var wall = terrainAt(walls, col, row);
    return !!wall && wall.kind === "wall";
  }

  function reveal() {
    var r2 = revealRadius * revealRadius + 0.4;
    for (var row = token.row - revealRadius; row <= token.row + revealRadius; row++) {
      for (var col = token.col - revealRadius; col <= token.col + revealRadius; col++) {
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        var dx = col - token.col, dy = row - token.row;
        if (dx * dx + dy * dy > r2) continue;
        fog[row][col] = false;
      }
    }
  }

  function fit() {
    var wrap = canvas.parentElement.getBoundingClientRect();
    cell = Math.min(wrap.width / cols, wrap.height / rows);
    ox = (wrap.width - cols * cell) / 2;
    oy = (wrap.height - rows * cell) / 2;
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var wrap = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.round(wrap.width * dpr);
    canvas.height = Math.round(wrap.height * dpr);
    canvas.style.width = wrap.width + "px";
    canvas.style.height = wrap.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fit();
    draw();
  }

  function shade(hex, amount) {
    var clean = hex.replace("#", "");
    if (clean.length === 3) clean = clean[0]+clean[0]+clean[1]+clean[1]+clean[2]+clean[2];
    var num = parseInt(clean, 16);
    var r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
    var g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
    var b = Math.max(0, Math.min(255, (num & 255) + amount));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function fillTile(terrain, tile, x, y) {
    var image = images[terrain.id];
    if (image && image.complete && image.naturalWidth) {
      ctx.drawImage(image, x, y, cell, cell);
      return;
    }
    var variant = tile && typeof tile.variant === "number" ? tile.variant : 0.5;
    ctx.fillStyle = variant > 0.62 ? shade(terrain.color, 10)
      : variant < 0.38 ? shade(terrain.color, -10) : terrain.color;
    ctx.fillRect(x, y, cell, cell);
  }

  var LIGHTS = { torch: { dim: 6, color: "#ffaa00" }, campfire: { dim: 8, color: "#ffb15c" } };

  function rgba(hex, alpha) {
    var clean = hex.replace("#", "");
    if (clean.length === 3) clean = clean[0]+clean[0]+clean[1]+clean[1]+clean[2]+clean[2];
    var num = parseInt(clean, 16);
    return "rgba(" + ((num >> 16) & 255) + "," + ((num >> 8) & 255) + "," +
      (num & 255) + "," + alpha + ")";
  }

  function drawLight(cx, cy, dim, color) {
    var radius = dim * cell;
    var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, "rgba(255,230,176,0.55)");
    gradient.addColorStop(0.45, rgba(color, 0.3));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    var wrap = canvas.parentElement.getBoundingClientRect();
    ctx.clearRect(0, 0, wrap.width, wrap.height);
    ctx.fillStyle = "#05080d";
    ctx.fillRect(0, 0, wrap.width, wrap.height);

    var x0 = Math.max(0, Math.floor((-ox) / cell));
    var y0 = Math.max(0, Math.floor((-oy) / cell));
    var x1 = Math.min(cols - 1, Math.ceil((wrap.width - ox) / cell));
    var y1 = Math.min(rows - 1, Math.ceil((wrap.height - oy) / cell));

    // 1. Floor.
    for (var row = y0; row <= y1; row++) {
      for (var col = x0; col <= x1; col++) {
        var tile = floor[row][col];
        var terrain = (tile.terrain && terrains[tile.terrain]) || terrains.grass;
        if (!terrain) continue;
        fillTile(terrain, tile, col * cell + ox, row * cell + oy);
      }
    }

    // 2. Objects, drawn as their palette symbols.
    for (var row2 = y0; row2 <= y1; row2++) {
      for (var col2 = x0; col2 <= x1; col2++) {
        var placed = objects[row2][col2];
        if (!placed.terrain) continue;
        var prop = terrains[placed.terrain];
        if (!prop) continue;
        var px = col2 * cell + ox + cell / 2;
        var py = row2 * cell + oy + cell / 2;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(((placed.rotation || 0) % 4) * Math.PI / 2);
        ctx.scale(placed.scale || 1, placed.scale || 1);
        if (prop.symbol) {
          ctx.font = Math.round(cell * 0.8) + "px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(prop.symbol, 0, cell * 0.04);
        } else {
          ctx.fillStyle = prop.color;
          ctx.beginPath();
          ctx.arc(0, 0, cell * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // 3. Walls, with a lit top edge so corridors read clearly.
    for (var row3 = y0; row3 <= y1; row3++) {
      for (var col3 = x0; col3 <= x1; col3++) {
        var wall = terrainAt(walls, col3, row3);
        if (!wall) continue;
        var wx = col3 * cell + ox, wy = row3 * cell + oy;
        ctx.fillStyle = wall.color;
        ctx.fillRect(wx, wy, cell, cell);
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        if (!terrainAt(walls, col3, row3 - 1)) ctx.fillRect(wx, wy, cell, Math.max(1, cell * 0.08));
        if (!terrainAt(walls, col3 - 1, row3)) ctx.fillRect(wx, wy, Math.max(1, cell * 0.08), cell);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        if (!terrainAt(walls, col3, row3 + 1)) ctx.fillRect(wx, wy + cell * 0.92, cell, Math.max(1, cell * 0.08));
        if (!terrainAt(walls, col3 + 1, row3)) ctx.fillRect(wx + cell * 0.92, wy, Math.max(1, cell * 0.08), cell);
      }
    }

    // 4. Light pools.
    for (var row4 = y0; row4 <= y1; row4++) {
      for (var col4 = x0; col4 <= x1; col4++) {
        var lightTile = objects[row4][col4];
        var light = lightTile.terrain && LIGHTS[lightTile.terrain];
        if (!light) continue;
        drawLight(col4 * cell + ox + cell / 2, row4 * cell + oy + cell / 2, light.dim, light.color);
      }
    }

    // 5. Labels.
    if (MAP.labels && MAP.labels.length) {
      ctx.font = "600 " + Math.max(8, cell * 0.34) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      MAP.labels.forEach(function (label) {
        if (fog[label.row] && fog[label.row][label.col]) return;
        ctx.fillStyle = "rgba(6,10,16,0.72)";
        var w = ctx.measureText(label.text).width + cell * 0.3;
        ctx.fillRect(label.col * cell + ox + cell / 2 - w / 2, label.row * cell + oy + cell * 0.06, w, cell * 0.42);
        ctx.fillStyle = "#e8eef7";
        ctx.fillText(label.text, label.col * cell + ox + cell / 2, label.row * cell + oy + cell * 0.28);
      });
    }

    // 6. Fog of war: unexplored squares are solid black.
    ctx.fillStyle = "#04070c";
    for (var fr = 0; fr < rows; fr++) {
      for (var fc = 0; fc < cols; fc++) {
        if (!fog[fr][fc]) continue;
        var fx = fc * cell + ox, fy = fr * cell + oy;
        if (fx > wrap.width || fy > wrap.height || fx + cell < 0 || fy + cell < 0) continue;
        ctx.fillRect(fx, fy, cell + 0.6, cell + 0.6);
      }
    }

    // 7. Token.
    var tx = token.col * cell + ox + cell / 2;
    var ty = token.row * cell + oy + cell / 2;
    var radius = Math.max(5, cell * 0.32);
    ctx.beginPath();
    ctx.arc(tx, ty + cell * 0.12, radius * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx, ty, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#4f8ef7";
    ctx.fill();
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.strokeStyle = "#ffd166";
    ctx.stroke();
  }

  function moveTo(col, row) {
    if (blocked(col, row)) return;
    token = { col: col, row: row };
    reveal();
    save();
    draw();
  }

  function step(dx, dy) {
    moveTo(token.col + dx, token.row + dy);
  }

  canvas.addEventListener("pointerdown", function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cell: cell };
      dragging = false;
      return;
    }
    dragging = true;
    moved = 0;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!pointers[e.pointerId]) return;
    var previous = pointers[e.pointerId];
    if (pinch) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      if (a && b) {
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        var next = Math.max(6, Math.min(160, pinch.cell * (dist / pinch.dist)));
        var rect = canvas.getBoundingClientRect();
        var midX = (a.x + b.x) / 2 - rect.left, midY = (a.y + b.y) / 2 - rect.top;
        ox = midX - (midX - ox) * (next / cell);
        oy = midY - (midY - oy) * (next / cell);
        cell = next;
        draw();
      }
      return;
    }
    if (!dragging) return;
    var dx = e.clientX - previous.x, dy = e.clientY - previous.y;
    moved += Math.abs(dx) + Math.abs(dy);
    ox += dx;
    oy += dy;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    draw();
  });

  function endPointer(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    var wasDragging = dragging;
    dragging = false;
    if (!wasDragging || moved > 6) return;
    var rect = canvas.getBoundingClientRect();
    var col = Math.floor((e.clientX - rect.left - ox) / cell);
    var row = Math.floor((e.clientY - rect.top - oy) / cell);
    moveTo(col, row);
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var next = Math.max(6, Math.min(160, cell * (e.deltaY < 0 ? 1.12 : 0.89)));
    ox = mx - (mx - ox) * (next / cell);
    oy = my - (my - oy) * (next / cell);
    cell = next;
    draw();
  }, { passive: false });

  window.addEventListener("keydown", function (e) {
    var key = e.key.toLowerCase();
    if (key === "arrowup" || key === "w") { step(0, -1); e.preventDefault(); }
    else if (key === "arrowdown" || key === "s") { step(0, 1); e.preventDefault(); }
    else if (key === "arrowleft" || key === "a") { step(-1, 0); e.preventDefault(); }
    else if (key === "arrowright" || key === "d") { step(1, 0); e.preventDefault(); }
    else if (key === "r") { resetFog(); }
  });

  function resetFog() {
    if (!window.confirm("Hide the whole map again?")) return;
    fog = MAP.fog.map(function (row) { return row.map(function () { return true; }); });
    token = { col: MAP.start.col, row: MAP.start.row };
    reveal();
    save();
    draw();
  }

  document.getElementById("reset").addEventListener("click", resetFog);
  var fullscreenButton = document.getElementById("fullscreen");
  fullscreenButton.addEventListener("click", function () {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
      return;
    }
    var root = document.documentElement;
    if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
  });
  document.addEventListener("fullscreenchange", function () {
    fullscreenButton.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
  });

  window.addEventListener("resize", resize);
  restore();
  reveal();
  resize();
})();
`;

/** The exported page: data in a JSON island, one inline script, no requests. */
export function buildPlayableHtml(input: PlayableMapInput): string {
  const secret = new Set(["secret-door"]);
  const terrains = input.terrains
    .filter((terrain) => terrain.id !== "secret-door")
    .map((terrain) => ({
      id: terrain.id,
      name: terrain.name,
      symbol: terrain.symbol,
      color: terrain.color,
      altColor: terrain.altColor,
      kind: terrain.kind,
      image: terrain.image,
    }));

  // Start as close to the middle of the map as the walls allow, so a
  // generated dungeon begins inside a room rather than in a corner.
  const midCol = Math.floor(input.columns / 2);
  const midRow = Math.floor(input.rows / 2);
  const openFloor = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= input.columns || row >= input.rows) {
      return false;
    }
    return !input.layers.walls[row]?.[col]?.terrain;
  };
  let start = { col: midCol, row: midRow };
  const maxRing = Math.max(input.columns, input.rows);
  search: for (let ring = 0; ring <= maxRing; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const col = midCol + dx;
        const row = midRow + dy;
        if (!openFloor(col, row)) continue;
        start = { col, row };
        break search;
      }
    }
  }

  const data = {
    name: input.name,
    columns: input.columns,
    rows: input.rows,
    terrains,
    layers: {
      floor: publicTiles(input.layers.floor, secret),
      objects: publicTiles(input.layers.objects, secret),
      walls: publicTiles(input.layers.walls, secret),
    },
    labels: input.labels.map((label) => ({
      col: label.col,
      row: label.row,
      text: label.text,
    })),
    fog: input.startHidden
      ? input.fog.map((row) => row.map(() => true))
      : input.fog,
    start,
    revealRadius: input.revealRadius ?? 4,
  };

  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(input.name)} — playable map</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #05080d; color: #e8eef7;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { display: flex; flex-direction: column; overflow: hidden; }
  header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 8px 12px; padding-top: calc(8px + env(safe-area-inset-top, 0px));
    border-bottom: 1px solid #222a35; background: #0e1116; }
  h1 { margin: 0; font-size: 15px; font-weight: 600; }
  .hint { font-size: 12px; color: #8b95a5; }
  .spacer { flex: 1; }
  button { min-height: 36px; padding: 0 12px; border: 1px solid #2c3644;
    border-radius: 999px; background: #161b22; color: #e8eef7; font: inherit;
    font-size: 12px; cursor: pointer; touch-action: manipulation; }
  button:hover { background: #1d2430; }
  main { position: relative; flex: 1; min-height: 0; }
  canvas { display: block; touch-action: none; cursor: grab; }
  canvas:active { cursor: grabbing; }
  @media (max-width: 560px) { .hint { display: none; } h1 { font-size: 14px; } }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(input.name)}</h1>
  <span class="hint">Move: click, tap, arrow keys or WASD · Zoom: wheel / pinch · Drag to pan · R resets fog</span>
  <span class="spacer"></span>
  <button id="reset" type="button">Reset fog</button>
  <button id="fullscreen" type="button">Full screen</button>
</header>
<main><canvas id="map"></canvas></main>
<script id="map-data" type="application/json">${json}</script>
<script>${RUNTIME}</script>
</body>
</html>`;
}
