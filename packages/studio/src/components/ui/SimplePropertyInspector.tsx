'use client';

import { useState } from 'react';
import { Palette, Maximize2, Tag, X } from 'lucide-react';

interface SimplePropertyInspectorProps {
  objectName: string;
  onClose?: () => void;
}

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
  '#94a3b8',
  '#78716c',
  '#1e293b',
  '#0f172a',
];

export function SimplePropertyInspector({ objectName, onClose }: SimplePropertyInspectorProps) {
  const [color, setColor] = useState('#3b82f6');
  const [size, setSize] = useState(1.0);
  const [name, setName] = useState(objectName);
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="flex flex-col gap-0 overflow-auto border-l border-studio-border bg-studio-panel w-56 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
          Properties
        </span>
        {onClose && (
          <button onClick={onClose} className="text-studio-muted hover:text-studio-text transition">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 p-3">
        {/* Name */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-studio-muted" />
            <label className="text-[11px] font-medium text-studio-muted">Name</label>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-studio-border bg-black/20 px-2.5 py-1.5 text-sm text-studio-text outline-none focus:border-studio-accent"
          />
        </div>

        {/* Color */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-studio-muted" />
            <label className="text-[11px] font-medium text-studio-muted">Color</label>
          </div>
          <button
            onClick={() => setShowColorPicker((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-studio-border bg-black/20 px-2.5 py-1.5 text-sm text-studio-text transition hover:border-studio-accent/40 w-full"
          >
            <span
              className="h-4 w-4 rounded-full border border-white/20 shrink-0"
              style={{ background: color }}
            />
            <span className="font-mono text-xs text-studio-muted">{color.toUpperCase()}</span>
          </button>
          {showColorPicker && (
            <div className="mt-2 grid grid-cols-6 gap-1.5 rounded-lg border border-studio-border bg-black/30 p-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    setShowColorPicker(false);
                  }}
                  title={c}
                  className={`h-6 w-6 rounded-full border-2 transition hover:scale-110 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="col-span-6 h-7 w-full cursor-pointer rounded bg-transparent"
                title="Custom color"
              />
            </div>
          )}
        </div>

        {/* Size */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Maximize2 className="h-3.5 w-3.5 text-studio-muted" />
              <label className="text-[11px] font-medium text-studio-muted">Size</label>
            </div>
            <span className="text-[11px] text-studio-accent tabular-nums">{size.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.1}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full accent-studio-accent"
          />
          <div className="mt-1 flex justify-between text-[10px] text-studio-muted">
            <span>Tiny</span>
            <span>Normal</span>
            <span>Huge</span>
          </div>
        </div>

        {/* Apply */}
        <button className="w-full rounded-lg bg-studio-accent/20 py-1.5 text-xs font-semibold text-studio-accent transition hover:bg-studio-accent/30">
          Apply Changes
        </button>
      </div>
    </div>
  );
}
