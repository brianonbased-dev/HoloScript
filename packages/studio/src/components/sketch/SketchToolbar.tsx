'use client';

/**
 * SketchToolbar — controls for the 3D Sketch art mode.
 *
 * Displayed as a floating overlay panel while artMode === 'sketch'.
 * Controls: color picker, brush size, brush material, undo last, clear all.
 */

import { useSketchStore } from '@/lib/sketchStore';
import type { BrushMaterial } from '@/lib/sketchStore';
import { Trash2, Undo2 } from 'lucide-react';

const BRUSH_MATERIALS: { id: BrushMaterial; label: string; emoji: string }[] = [
  { id: 'neon',  label: 'Neon',  emoji: '⚡' },
  { id: 'chalk', label: 'Chalk', emoji: '🪨' },
  { id: 'ink',   label: 'Ink',   emoji: '🖊' },
  { id: 'glow',  label: 'Glow',  emoji: '✨' },
];

const PALETTE = [
  '#6366f1', '#ec4899', '#22c55e', '#f97316',
  '#06b6d4', '#eab308', '#ef4444', '#ffffff',
  '#a855f7', '#3b82f6', '#84cc16', '#f59e0b',
];

const SIZE_PRESETS = [
  { label: 'XS', value: 0.006 },
  { label: 'S',  value: 0.012 },
  { label: 'M',  value: 0.022 },
  { label: 'L',  value: 0.040 },
];

export function SketchToolbar() {
  const brushColor    = useSketchStore((s) => s.brushColor);
  const brushSize     = useSketchStore((s) => s.brushSize);
  const brushMaterial = useSketchStore((s) => s.brushMaterial);
  const strokes       = useSketchStore((s) => s.strokes);
  const setBrushColor    = useSketchStore((s) => s.setBrushColor);
  const setBrushSize     = useSketchStore((s) => s.setBrushSize);
  const setBrushMaterial = useSketchStore((s) => s.setBrushMaterial);
  const clearStrokes     = useSketchStore((s) => s.clearStrokes);
  const removeStroke     = useSketchStore((s) => s.removeStroke);

  const handleUndo = () => {
    if (strokes.length === 0) return;
    removeStroke(strokes[strokes.length - 1].id);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-studio-border bg-studio-panel/90 p-2.5 backdrop-blur shadow-2xl w-44">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-studio-muted">
          ✏️ Sketch
        </span>
        <span className="text-[10px] text-studio-muted">{strokes.length} strokes</span>
      </div>

      {/* Color palette */}
      <div>
        <div className="mb-1.5 text-[9px] uppercase tracking-widest text-studio-muted">Color</div>
        <div className="grid grid-cols-6 gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setBrushColor(c)}
              className="h-5 w-5 rounded-full border-2 transition hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: brushColor === c ? '#fff' : 'transparent',
              }}
              aria-label={`Brush color ${c}`}
            />
          ))}
        </div>
      </div>

      {/* Brush size */}
      <div>
        <div className="mb-1.5 text-[9px] uppercase tracking-widest text-studio-muted">Size</div>
        <div className="flex gap-1">
          {SIZE_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setBrushSize(value)}
              className={`flex-1 rounded py-1 text-[10px] font-medium transition ${
                brushSize === value
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-surface text-studio-muted hover:bg-studio-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Brush material */}
      <div>
        <div className="mb-1.5 text-[9px] uppercase tracking-widest text-studio-muted">Style</div>
        <div className="flex flex-col gap-1">
          {BRUSH_MATERIALS.map(({ id, label, emoji }) => (
            <button
              key={id}
              onClick={() => setBrushMaterial(id)}
              className={`flex items-center gap-2 rounded px-2 py-1 text-left text-[10px] transition ${
                brushMaterial === id
                  ? 'bg-studio-accent/20 text-studio-accent border border-studio-accent/40'
                  : 'bg-studio-surface text-studio-muted hover:bg-studio-border'
              }`}
            >
              <span>{emoji}</span> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 border-t border-studio-border pt-2">
        <button
          onClick={handleUndo}
          disabled={strokes.length === 0}
          aria-label="Undo last stroke"
          className="flex flex-1 items-center justify-center gap-1 rounded bg-studio-surface py-1.5 text-[10px] text-studio-muted hover:bg-studio-border disabled:opacity-30 transition"
        >
          <Undo2 className="h-3 w-3" /> Undo
        </button>
        <button
          onClick={clearStrokes}
          disabled={strokes.length === 0}
          aria-label="Clear all strokes"
          className="flex flex-1 items-center justify-center gap-1 rounded bg-red-500/10 py-1.5 text-[10px] text-red-400 hover:bg-red-500/20 disabled:opacity-30 transition"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
    </div>
  );
}
