'use client';

/**
 * TransformPanel — Position, rotation, scale with snap, copy, and reset.
 *
 * Reads/writes the selected node's transform directly from the scene graph
 * store, eliminating the 1-frame desync that occurred when using local state.
 */

import { useState, useCallback, useMemo } from 'react';
import { Move, RotateCcw, Maximize, Copy, Magnet, Link, Unlink } from 'lucide-react';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';

export interface TransformData {
  position: [number, number, number];
  rotation: [number, number, number]; // degrees
  scale: [number, number, number];
}

export interface TransformSettings {
  snapEnabled: boolean;
  positionSnap: number;
  rotationSnap: number;
  scaleSnap: number;
  linked: boolean; // uniform scale
  space: 'local' | 'world';
}

const DEFAULT_TRANSFORM: TransformData = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
const DEFAULT_SETTINGS: TransformSettings = {
  snapEnabled: false,
  positionSnap: 0.5,
  rotationSnap: 15,
  scaleSnap: 0.1,
  linked: false,
  space: 'world',
};

export function TransformPanel({
  transform,
  onChange,
}: {
  transform?: TransformData;
  onChange?: (t: TransformData) => void;
}) {
  // Read selected node transform directly from the store (single source of truth)
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const applyTransientTransform = useSceneGraphStore((s) => s.applyTransientTransform);

  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) : null),
    [selectedId, nodes]
  );

  // Use store data if a node is selected, otherwise fall back to prop/default
  const t: TransformData = selectedNode
    ? {
        position: selectedNode.position,
        rotation: selectedNode.rotation,
        scale: selectedNode.scale,
      }
    : transform ?? DEFAULT_TRANSFORM;

  const [settings, setSettings] = useState<TransformSettings>(DEFAULT_SETTINGS);

  const update = useCallback(
    (partial: Partial<TransformData>) => {
      if (selectedId) {
        // Write directly to the active Three.js mesh for 0-frame latency during drag/type
        applyTransientTransform(selectedId, partial);
      }
      onChange?.({ ...t, ...partial });
    },
    [selectedId, applyTransientTransform, onChange, t]
  );

  const snap = useCallback(
    (value: number, grid: number) => {
      return settings.snapEnabled ? Math.round(value / grid) * grid : value;
    },
    [settings.snapEnabled]
  );

  const setAxis = useCallback(
    (prop: keyof TransformData, axis: 0 | 1 | 2, value: number) => {
      const snapped = snap(
        value,
        prop === 'position'
          ? settings.positionSnap
          : prop === 'rotation'
            ? settings.rotationSnap
            : settings.scaleSnap
      );
      const arr = [...t[prop]] as [number, number, number];
      if (prop === 'scale' && settings.linked) {
        const ratio = snapped / (arr[axis] || 1);
        arr[0] *= ratio;
        arr[1] *= ratio;
        arr[2] *= ratio;
      } else {
        arr[axis] = snapped;
      }
      update({ [prop]: arr });
    },
    [t, settings, update, snap]
  );

  const reset = useCallback(
    (prop: keyof TransformData) => {
      update({ [prop]: prop === 'scale' ? [1, 1, 1] : [0, 0, 0] });
    },
    [update]
  );

  const copyTransform = useCallback(() => {
    navigator.clipboard?.writeText(
      `@transform { position: [${t.position}] rotation: [${t.rotation}] scale: [${t.scale}] }`
    );
  }, [t]);

  const AXES = ['X', 'Y', 'Z'] as const;
  const AXIS_COLORS = { X: 'text-red-400', Y: 'text-green-400', Z: 'text-blue-400' };

  const Section = ({
    prop,
    icon: Icon,
    label,
  }: {
    prop: keyof TransformData;
    icon: typeof Move;
    label: string;
  }) => (
    <div className="border-b border-studio-border px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-studio-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
          {label}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => reset(prop)}
          className="text-studio-muted/40 hover:text-studio-text"
          title="Reset"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex gap-1.5">
        {AXES.map((axis, i) => (
          <label key={axis} className="flex flex-col gap-0.5 flex-1">
            <span className={`text-[9px] font-bold ${AXIS_COLORS[axis]}`}>{axis}</span>
            <input
              type="number"
              value={parseFloat(t[prop][i].toFixed(3))}
              step={prop === 'position' ? 0.1 : prop === 'rotation' ? 1 : 0.01}
              onChange={(e) => setAxis(prop, i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
              className="w-full rounded border border-studio-border bg-transparent px-1.5 py-1 text-xs text-studio-text outline-none font-mono focus:border-studio-accent/40"
            />
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Move className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-studio-text">Transform</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() =>
              setSettings((s) => ({ ...s, space: s.space === 'local' ? 'world' : 'local' }))
            }
            className={`rounded px-1.5 py-0.5 text-[9px] ${settings.space === 'local' ? 'bg-indigo-500/20 text-indigo-400' : 'text-studio-muted'}`}
            title="Coordinate space"
          >
            {settings.space}
          </button>
          <button
            onClick={copyTransform}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Copy"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Snap Settings */}
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-1.5">
        <button
          onClick={() => setSettings((s) => ({ ...s, snapEnabled: !s.snapEnabled }))}
          className={`flex items-center gap-1 text-[10px] ${settings.snapEnabled ? 'text-studio-accent' : 'text-studio-muted'}`}
        >
          <Magnet className="h-3 w-3" /> Snap
        </button>
        {settings.snapEnabled && (
          <div className="flex gap-1 text-[9px] text-studio-muted">
            <span>P:{settings.positionSnap}</span>
            <span>R:{settings.rotationSnap}°</span>
            <span>S:{settings.scaleSnap}</span>
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setSettings((s) => ({ ...s, linked: !s.linked }))}
          className={`${settings.linked ? 'text-studio-accent' : 'text-studio-muted/40'}`}
          title="Uniform scale"
        >
          {settings.linked ? <Link className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
        </button>
      </div>

      <Section prop="position" icon={Move} label="Position" />
      <Section prop="rotation" icon={RotateCcw} label="Rotation" />
      <Section prop="scale" icon={Maximize} label="Scale" />
    </div>
  );
}
