/** @jsxRuntime automatic */
'use client';

/**
 * SimpleMaterialPanel — Quick material editor for selected scene nodes
 *
 * Reads the 'material' trait from the selected SceneNode in sceneGraphStore
 * and writes changes back via applyTransientMaterial (zero-latency Three.js
 * update) + setTraitProperty (persisted to store).
 *
 * Properties exposed:
 *   • Albedo color (hex color picker)
 *   • Roughness (0–1 slider)
 *   • Metalness (0–1 slider)
 *   • Opacity (0–1 slider)
 *   • Emissive color + intensity
 *
 * Shows a "no selection" empty state when no node is selected.
 */

import { useCallback } from 'react';
import { Palette, X } from 'lucide-react';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaterialProps {
  albedo?: string;
  roughness?: number;
  metallic?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-24 shrink-0 text-[11px] text-studio-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-indigo-500 cursor-pointer"
        aria-label={label}
      />
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-studio-muted">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-24 shrink-0 text-[11px] text-studio-muted">{label}</span>
      <div className="flex flex-1 items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-studio-border bg-transparent p-0.5"
          aria-label={label}
        />
        <span className="font-mono text-[11px] text-studio-muted">{value}</span>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export interface SimpleMaterialPanelProps {
  onClose: () => void;
}

export function SimpleMaterialPanel({ onClose }: SimpleMaterialPanelProps) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const applyTransientMaterial = useSceneGraphStore((s) => s.applyTransientMaterial);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const materialTrait = selectedNode?.traits.find((t) => t.name === 'material');

  // Current values with safe defaults
  const props: MaterialProps = {
    albedo: (materialTrait?.properties.color as string) ?? '#ffffff',
    roughness: (materialTrait?.properties.roughness as number) ?? 0.5,
    metallic: (materialTrait?.properties.metalness as number) ?? 0.0,
    opacity: (materialTrait?.properties.opacity as number) ?? 1.0,
    emissive: (materialTrait?.properties.emissive as string) ?? '#000000',
    emissiveIntensity: (materialTrait?.properties.emissiveIntensity as number) ?? 0.0,
  };

  const update = useCallback(
    (patch: Partial<MaterialProps>) => {
      if (!selectedId) return;

      // Convert our prop names to what sceneGraphStore expects
      const storePatch: Record<string, unknown> = {};
      if (patch.albedo !== undefined) storePatch.albedo = patch.albedo;
      if (patch.roughness !== undefined) storePatch.roughness = patch.roughness;
      if (patch.metallic !== undefined) storePatch.metallic = patch.metallic;
      if (patch.opacity !== undefined) storePatch.opacity = patch.opacity;
      if (patch.emissive !== undefined) storePatch.emissive = patch.emissive;
      if (patch.emissiveIntensity !== undefined)
        storePatch.emissiveIntensity = patch.emissiveIntensity;

      // Immediate GPU update (0-frame lag)
      applyTransientMaterial(selectedId, storePatch);

      // Persist to store (for undo, serialization)
      const traitKey = (k: string, v: unknown) => setTraitProperty(selectedId, 'material', k, v);

      if (patch.albedo !== undefined) traitKey('color', patch.albedo);
      if (patch.roughness !== undefined) traitKey('roughness', patch.roughness);
      if (patch.metallic !== undefined) traitKey('metalness', patch.metallic);
      if (patch.opacity !== undefined) traitKey('opacity', patch.opacity);
      if (patch.emissive !== undefined) traitKey('emissive', patch.emissive);
      if (patch.emissiveIntensity !== undefined)
        traitKey('emissiveIntensity', patch.emissiveIntensity);
    },
    [selectedId, applyTransientMaterial, setTraitProperty]
  );

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      role="region"
      aria-label="Material Editor"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-studio-accent" />
          <span className="text-xs font-semibold text-studio-text">Material</span>
          {selectedNode && (
            <span className="truncate max-w-[120px] rounded bg-studio-surface px-1.5 py-0.5 font-mono text-[10px] text-studio-muted">
              {selectedNode.name}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close Material Panel"
          className="rounded p-0.5 text-studio-muted transition hover:text-studio-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!selectedNode ? (
          <div className="flex h-full items-center justify-center text-[11px] text-studio-muted">
            Select a scene object to edit its material
          </div>
        ) : (
          <div className="space-y-1">
            {/* Surface */}
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
              Surface
            </p>
            <ColorRow
              label="Albedo"
              value={props.albedo!}
              onChange={(v) => update({ albedo: v })}
            />
            <SliderRow
              label="Roughness"
              value={props.roughness!}
              onChange={(v) => update({ roughness: v })}
            />
            <SliderRow
              label="Metalness"
              value={props.metallic!}
              onChange={(v) => update({ metallic: v })}
            />
            <SliderRow
              label="Opacity"
              value={props.opacity!}
              onChange={(v) => update({ opacity: v })}
            />

            {/* Emission */}
            <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
              Emission
            </p>
            <ColorRow
              label="Emissive"
              value={props.emissive!}
              onChange={(v) => update({ emissive: v })}
            />
            <SliderRow
              label="Intensity"
              value={props.emissiveIntensity!}
              min={0}
              max={5}
              step={0.05}
              onChange={(v) => update({ emissiveIntensity: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
