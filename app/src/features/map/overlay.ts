/** Small table-facing overlays: light pools, a compass rose and a scale bar.
 * They draw in pixels, so the editor (screen space) and the image export
 * (map space) can share them.
 */

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const num = parseInt(full, 16);
  if (!Number.isFinite(num)) return `rgba(255, 177, 92, ${alpha})`;
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A warm pool of light centred on one square. */
export function drawLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  brightFeet: number,
  dimFeet: number,
  color: string,
  feetPerSquare = 5
) {
  const dim = Math.max(0.5, dimFeet / feetPerSquare) * size;
  const bright = Math.max(0, brightFeet / feetPerSquare) * size;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const brightStop = Math.min(0.9, Math.max(0.05, bright / dim));

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, dim);
  gradient.addColorStop(0, withAlpha(color, 0.55));
  gradient.addColorStop(brightStop * 0.65, withAlpha(color, 0.3));
  gradient.addColorStop(brightStop, withAlpha(color, 0.2));
  gradient.addColorStop(1, withAlpha(color, 0));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, dim, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A north-up compass rose with a lit backdrop, readable on any terrain. */
export function drawCompass(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
) {
  const r = Math.max(10, radius);
  ctx.save();

  ctx.fillStyle = "rgba(6, 10, 16, 0.72)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(226, 236, 250, 0.38)";
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();

  // Needle: red north half, pale south half.
  const tip = r * 0.56;
  ctx.fillStyle = "#e2564f";
  ctx.beginPath();
  ctx.moveTo(cx, cy - tip);
  ctx.lineTo(cx + r * 0.19, cy);
  ctx.lineTo(cx - r * 0.19, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#cdd8e8";
  ctx.beginPath();
  ctx.moveTo(cx, cy + tip);
  ctx.lineTo(cx + r * 0.19, cy);
  ctx.lineTo(cx - r * 0.19, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f6f9ff";
  ctx.font = `700 ${Math.max(7, r * 0.36)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - r * 0.78);
  ctx.fillText("S", cx, cy + r * 0.78);
  ctx.fillStyle = "rgba(226, 236, 250, 0.8)";
  ctx.fillText("E", cx + r * 0.78, cy);
  ctx.fillText("W", cx - r * 0.78, cy);

  ctx.restore();
}

/** A numbered map pin, centred on a square. */
export function drawPin(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  label: string
) {
  const r = Math.max(5, radius);
  ctx.save();

  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.95, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffd166";
  ctx.strokeStyle = "rgba(8, 12, 18, 0.92)";
  ctx.lineWidth = Math.max(1, r * 0.16);

  // Tail, then head, so the outline stays clean where they meet.
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy + r * 0.35);
  ctx.lineTo(cx, cy + r * 1.1);
  ctx.lineTo(cx + r * 0.5, cy + r * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const text = label.trim().slice(0, 3) || "?";
  const fontSize = Math.max(7, r * (text.length > 2 ? 0.78 : 1.12));
  ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1a1408";
  ctx.fillText(text, cx, cy - r * 0.18);

  ctx.restore();
}

/** A five-square bar with alternating blocks and a feet label. */
export function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  feetPerSquare = 5,
  squares = 5
) {
  const cell = Math.max(4, size);
  const width = squares * cell;
  const height = Math.max(5, Math.min(12, cell * 0.18));
  const fontSize = Math.max(9, Math.min(15, cell * 0.32));
  const label = `${squares * feetPerSquare} ft · ${squares} sq`;

  ctx.save();
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const textWidth = ctx.measureText(label).width;
  const pad = 6;
  const boxWidth = Math.max(width, textWidth) + pad * 2;
  ctx.fillStyle = "rgba(6, 10, 16, 0.72)";
  ctx.fillRect(x - pad, y - fontSize - pad * 1.4, boxWidth, fontSize + height + pad * 2.4);

  ctx.fillStyle = "#dbe4f0";
  ctx.fillText(label, x, y - pad);

  for (let i = 0; i < squares; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#e8eef7" : "#0b0f14";
    ctx.fillRect(x + i * cell, y, cell, height);
  }
  ctx.strokeStyle = "rgba(232, 238, 247, 0.9)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.restore();
}
