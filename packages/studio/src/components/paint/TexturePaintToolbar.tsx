'use client';

/**
 * TexturePaintToolbar — controls for texture paint art mode.
 *
 * Displayed as a floating side panel while artMode === 'paint'.
 * Controls: color, brush size, opacity, blend mode, clear canvas.
 */

import type { PaintSettings } from '@/hooks/useTexturePaint';
import { Trash2 } from 'lucide-react';

const PAINT_PALETTE = [
  '#ec4899',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#6366f1',
  '#ffffff',
  '#000000',
  '#a855f7',
  '#3b82f6',
  '#ef4444',
  '#84cc16',
];

const BLEND_MODES: { id: PaintSettings['blendMode']; label: string }[] = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
];

interface Props {
  settings: PaintSettings;
  onChange: (patch: Partial<PaintSettings>) => void;
  onClear: () => void;
}

export function TexturePaintToolbar({ settings, onChange, onClear }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-studio-border bg-studio-panel/90 p-2.5 backdrop-blur shadow-2xl w-44">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-studio-muted">
          🖌 Texture Paint
        </span>
      </div>

      {/* Color palette */}
      <div>
        <div className="mb-1.5 text-[9px] uppercase tracking-widest text-studio-muted">Color</div>
        <div className="grid grid-cols-6 gap-1">
          {PAINT_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ color: c })}
              className="h-5 w-5 rounded-full border-2 transition hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: settings.color === c ? '#fff' : 'transparent',
              }}
              aria-label={`Paint color ${c}`}
            />
          ))}
        </div>
      </div>

      {/* Brush size */}
      <div>
        <div className="mb-1 flex justify-between">
          <span className="text-[9px] uppercase tracking-widest text-studio-muted">Size</span>
          <span className="font-mono text-[10px] text-studio-text">{settings.size}px</span>
        </div>
        <input
          type="range"
          min={4}
          max={128}
          step={2}
          value={settings.size}
          onChange={(e) => onChange({ size: parseInt(e.target.value) })}
          className="w-full accent-studio-accent"
        />
      </div>

      {/* Opacity */}
      <div>
        <div className="mb-1 flex justify-between">
          <span className="text-[9px] uppercase tracking-widest text-studio-muted">Opacity</span>
          <span className="font-mono text-[10px] text-studio-text">
            {Math.round(settings.opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={settings.opacity}
          onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
          className="w-full accent-studio-accent"
        />
      </div>

      {/* Blend mode */}
      <div>
        <div className="mb-1.5 text-[9px] uppercase tracking-widest text-studio-muted">Blend</div>
        <div className="flex flex-col gap-1">
          {BLEND_MODES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onChange({ blendMode: id })}
              className={`rounded px-2 py-1 text-left text-[10px] transition ${
                settings.blendMode === id
                  ? 'bg-studio-accent/20 text-studio-accent border border-studio-accent/40'
                  : 'bg-studio-surface text-studio-muted hover:bg-studio-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear */}
      <button
        onClick={onClear}
        className="flex items-center justify-center gap-1.5 rounded bg-red-500/10 py-1.5 text-[10px] text-red-400 hover:bg-red-500/20 transition"
        aria-label="Clear canvas"
      >
        <Trash2 className="h-3 w-3" /> Clear Canvas
      </button>

      {/* Info */}
      <p className="text-[9px] leading-relaxed text-studio-muted">
        Select a mesh in the scene, then paint directly on its surface.
      </p>
    </div>
  );
}
