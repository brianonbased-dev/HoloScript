'use client';

/**
 * MultiTransformPanel — batch position/rotation/scale operations on multiple scene graph nodes.
 */

import { useState } from 'react';
import { Move3d, X, CheckSquare, Square, Trash2 } from 'lucide-react';
import { useMultiSelect } from '@/hooks/useMultiSelect';
import { useSceneGraphStore } from '@/lib/stores';

type TransformMode = 'delta' | 'absolute';

function Vec3Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  const axes = ['X', 'Y', 'Z'] as const;
  return (
    <div className="space-y-1">
      <span className="text-[9px] text-studio-muted">{label}</span>
      <div className="flex gap-1">
        {axes.map((axis, i) => (
          <label key={axis} className="flex-1">
            <span className="block text-center text-[7px] text-studio-muted/60">{axis}</span>
            <input
              type="number"
              step={0.1}
              value={value[i]}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = parseFloat(e.target.value) || 0;
                onChange(next);
              }}
              className="w-full rounded-lg border border-studio-border bg-studio-surface px-1.5 py-1 text-center font-mono text-[9px] text-studio-text outline-none focus:border-studio-accent"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

interface MultiTransformPanelProps {
  onClose: () => void;
}

export function MultiTransformPanel({ onClose }: MultiTransformPanelProps) {
  const nodes = useSceneGraphStore((s) => s.nodes);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const {
    selectedIds,
    selectedNodes,
    centroid,
    select,
    selectAll,
    clearSelection,
    toggleSelect,
    applyDelta,
    applyAbsolute,
    count,
  } = useMultiSelect();

  const [mode, setMode] = useState<TransformMode>('delta');
  const [position, setPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [scale, setScale] = useState<[number, number, number]>([1, 1, 1]);

  const apply = () => {
    if (mode === 'delta') {
      applyDelta({
        position,
        rotation,
        scale: scale.map((v) => v - 1) as [number, number, number],
      });
    } else {
      applyAbsolute({ position, rotation, scale });
    }
  };

  const deleteSelected = () => {
    for (const id of selectedIds) removeNode(id);
    clearSelection();
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Move3d className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Multi-Transform</span>
        <span className="rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">
          {count} selected
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Node list */}
      <div className="shrink-0 max-h-40 overflow-y-auto divide-y divide-studio-border/40 border-b border-studio-border">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <button
            onClick={count === nodes.length ? clearSelection : selectAll}
            className="text-[8px] text-studio-muted hover:text-studio-text transition"
          >
            {count === nodes.length ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-[8px] text-studio-muted/40">·</span>
          <span className="text-[8px] text-studio-muted">{nodes.length} objects</span>
        </div>
        {nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => toggleSelect(node.id)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-studio-surface/50 ${selectedIds.has(node.id) ? 'bg-studio-accent/8' : ''}`}
          >
            {selectedIds.has(node.id) ? (
              <CheckSquare className="h-3.5 w-3.5 shrink-0 text-studio-accent" />
            ) : (
              <Square className="h-3.5 w-3.5 shrink-0 text-studio-muted/50" />
            )}
            <span className="flex-1 truncate text-[10px]">{node.name}</span>
            <span className="shrink-0 font-mono text-[7px] text-studio-muted/40">
              [{node.position.map((v) => v.toFixed(1)).join(', ')}]
            </span>
          </button>
        ))}
        {nodes.length === 0 && (
          <p className="py-4 text-center text-[9px] text-studio-muted">No objects in scene graph</p>
        )}
      </div>

      {/* Centroid info */}
      {count > 0 && (
        <div className="shrink-0 border-b border-studio-border bg-studio-surface/30 px-3 py-1.5">
          <p className="text-[8px] text-studio-muted">
            Centroid: [{centroid.map((v) => v.toFixed(2)).join(', ')}]
          </p>
        </div>
      )}

      {/* Transform mode */}
      <div className="shrink-0 border-b border-studio-border flex">
        {(['delta', 'absolute'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-[9px] font-medium transition ${mode === m ? 'border-b-2 border-studio-accent text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            {m === 'delta' ? 'Offset (Δ)' : 'Absolute'}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <Vec3Input label="Position" value={position} onChange={setPosition} />
        <Vec3Input label="Rotation °" value={rotation} onChange={setRotation} />
        <Vec3Input
          label={mode === 'delta' ? 'Scale (×)' : 'Scale'}
          value={scale}
          onChange={setScale}
        />
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-studio-border flex gap-1.5 p-2.5">
        <button
          onClick={deleteSelected}
          disabled={count === 0}
          className="flex items-center gap-1 rounded-xl border border-red-900/40 px-3 py-2 text-[9px] text-red-400 hover:bg-red-900/20 transition disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <button
          onClick={apply}
          disabled={count === 0}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-2 text-[10px] font-semibold text-white hover:brightness-110 transition disabled:opacity-40"
        >
          Apply to {count > 0 ? count : '—'} objects
        </button>
      </div>
    </div>
  );
}
