import { useEffect, useRef } from "react";
import type { Terrain } from "../features/map/model";
import { drawProp } from "../features/map/textures";

interface StampCardProps {
  terrain: Terrain;
  selected: boolean;
  onSelect: () => void;
}

/** A stamp in the object library, previewed by drawing the real prop art. */
export function StampCard({ terrain, selected, onSelect }: StampCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 44;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawProp(ctx, terrain, 0, 0, size, {
      terrain: terrain.id,
      note: "",
      rotation: 0,
      scale: 0.92,
    });
  }, [terrain]);

  return (
    <button
      type="button"
      className={`stamp-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      title={terrain.name}
    >
      <span className="stamp-preview">
        <canvas ref={canvasRef} aria-hidden="true" />
      </span>
      <span className="stamp-label">{terrain.name}</span>
    </button>
  );
}
