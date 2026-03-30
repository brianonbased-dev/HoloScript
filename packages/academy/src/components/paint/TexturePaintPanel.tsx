'use client';

/**
 * TexturePaintPanel — Brush library, color picker, layers, stamp tools.
 */

import { useState, useCallback } from 'react';
import {
  Paintbrush,
  Eraser,
  Pipette,
  Undo2,
  Redo2,
  Layers,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  X,
} from 'lucide-react';

export type BrushType = 'round' | 'square' | 'scatter' | 'airbrush' | 'stamp' | 'eraser';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';

export interface BrushConfig {
  type: BrushType;
  size: number;
  opacity: number;
  hardness: number;
  spacing: number;
  blend: BlendMode;
}
export interface PaintLayer {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blend: BlendMode;
}

const DEFAULT_BRUSH: BrushConfig = {
  type: 'round',
  size: 20,
  opacity: 1,
  hardness: 0.8,
  spacing: 0.1,
  blend: 'normal',
};

const BRUSH_PRESETS: Array<{ name: string; config: Partial<BrushConfig> }> = [
  { name: '🖌️ Soft', config: { type: 'round', hardness: 0.2, opacity: 0.6 } },
  { name: '✏️ Hard', config: { type: 'round', hardness: 1, opacity: 1 } },
  { name: '🎨 Air', config: { type: 'airbrush', hardness: 0.1, opacity: 0.3, spacing: 0.05 } },
  { name: '🗑️ Erase', config: { type: 'eraser', opacity: 1, hardness: 0.8 } },
  { name: '✦ Scatter', config: { type: 'scatter', spacing: 0.3, hardness: 0.5 } },
  { name: '📌 Stamp', config: { type: 'stamp', spacing: 0.5, hardness: 1 } },
];

let layerId = 2;

export function TexturePaintPanel({
  onBrushChange,
  onClose,
}: {
  onBrushChange?: (b: BrushConfig) => void;
  onClose?: () => void;
}) {
  const [brush, setBrush] = useState<BrushConfig>(DEFAULT_BRUSH);
  const [color, setColor] = useState('#ffffff');
  const [layers, setLayers] = useState<PaintLayer[]>([
    { id: 1, name: 'Base', visible: true, opacity: 1, locked: false, blend: 'normal' },
    { id: 0, name: 'Background', visible: true, opacity: 1, locked: true, blend: 'normal' },
  ]);
  const [activeLayer, setActiveLayer] = useState(1);
  const [section, setSection] = useState('brush');

  const updateBrush = useCallback(
    (p: Partial<BrushConfig>) => {
      setBrush((prev) => {
        const n = { ...prev, ...p };
        onBrushChange?.(n);
        return n;
      });
    },
    [onBrushChange]
  );

  const addLayer = useCallback(() => {
    const id = layerId++;
    setLayers((prev) => [
      { id, name: `Layer ${id}`, visible: true, opacity: 1, locked: false, blend: 'normal' },
      ...prev,
    ]);
    setActiveLayer(id);
  }, []);

  const Sl = ({
    l,
    v,
    mn,
    mx,
    s,
    fn,
  }: {
    l: string;
    v: number;
    mn: number;
    mx: number;
    s: number;
    fn: (v: number) => void;
  }) => (
    <div>
      <div className="flex justify-between text-[10px] text-studio-muted">
        <span>{l}</span>
        <span className="font-mono">{typeof v === 'number' && v % 1 ? v.toFixed(2) : v}</span>
      </div>
      <input
        type="range"
        min={mn}
        max={mx}
        step={s}
        value={v}
        onChange={(e) => fn(parseFloat(e.target.value))}
        className="w-full accent-studio-accent"
      />
    </div>
  );

  const Sec = ({
    id,
    label,
    children,
  }: {
    id: string;
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="border-b border-studio-border">
      <button
        onClick={() => setSection(section === id ? '' : id)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-studio-muted hover:text-studio-text"
      >
        {label}
        <ChevronDown className={`h-3 w-3 transition ${section === id ? 'rotate-180' : ''}`} />
      </button>
      {section === id && <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-studio-text">Texture Paint</span>
        </div>
        <div className="flex gap-1">
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-studio-muted hover:text-red-400"
              title="Close"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button className="rounded p-1 text-studio-muted hover:text-studio-text">
            <Undo2 className="h-3 w-3" />
          </button>
          <button className="rounded p-1 text-studio-muted hover:text-studio-text">
            <Redo2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => updateBrush({ type: 'eraser' })}
            className={`rounded p-1 ${brush.type === 'eraser' ? 'text-red-400' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Eraser className="h-3 w-3" />
          </button>
          <button className="rounded p-1 text-studio-muted hover:text-studio-text">
            <Pipette className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Color */}
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-studio-border"
        />
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="flex-1 rounded border border-studio-border bg-transparent px-2 py-1 text-xs font-mono text-studio-text outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {[
            '#ff0000',
            '#00ff00',
            '#0000ff',
            '#ffff00',
            '#ff00ff',
            '#00ffff',
            '#ffffff',
            '#000000',
          ].map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="h-4 w-4 rounded border border-studio-border"
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Brush Presets */}
      <div className="grid grid-cols-3 gap-1 border-b border-studio-border p-2">
        {BRUSH_PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => updateBrush({ ...DEFAULT_BRUSH, ...p.config })}
            className="rounded-lg border border-studio-border p-1 text-[9px] text-studio-muted hover:text-studio-text"
          >
            {p.name}
          </button>
        ))}
      </div>

      <Sec id="brush" label="Brush Settings">
        <Sl l="Size" v={brush.size} mn={1} mx={200} s={1} fn={(v) => updateBrush({ size: v })} />
        <Sl
          l="Opacity"
          v={brush.opacity}
          mn={0}
          mx={1}
          s={0.05}
          fn={(v) => updateBrush({ opacity: v })}
        />
        <Sl
          l="Hardness"
          v={brush.hardness}
          mn={0}
          mx={1}
          s={0.05}
          fn={(v) => updateBrush({ hardness: v })}
        />
        <Sl
          l="Spacing"
          v={brush.spacing}
          mn={0.01}
          mx={1}
          s={0.01}
          fn={(v) => updateBrush({ spacing: v })}
        />
        <div className="grid grid-cols-5 gap-1">
          {(['normal', 'multiply', 'screen', 'overlay', 'add'] as BlendMode[]).map((m) => (
            <button
              key={m}
              onClick={() => updateBrush({ blend: m })}
              className={`rounded px-1 py-0.5 text-[8px] ${brush.blend === m ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </Sec>

      <Sec id="layers" label={`Layers (${layers.length})`}>
        <button
          onClick={addLayer}
          className="flex items-center gap-1 text-[10px] text-studio-muted hover:text-studio-text"
        >
          <Plus className="h-3 w-3" />
          New Layer
        </button>
        {layers.map((layer) => (
          <div
            key={layer.id}
            onClick={() => !layer.locked && setActiveLayer(layer.id)}
            className={`flex items-center gap-2 rounded p-1.5 cursor-pointer ${activeLayer === layer.id ? 'bg-studio-accent/10 text-studio-accent' : 'text-studio-muted'}`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLayers((prev) =>
                  prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l))
                );
              }}
              className={layer.visible ? '' : 'opacity-30'}
            >
              {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
            <span className="flex-1 text-[11px]">{layer.name}</span>
            <span className="text-[9px] text-studio-muted/40">
              {(layer.opacity * 100).toFixed(0)}%
            </span>
            {!layer.locked && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLayers((prev) => prev.filter((l) => l.id !== layer.id));
                }}
                className="text-studio-muted/30 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </Sec>
    </div>
  );
}
