'use client';

import { useState, _useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus, X, Grip, Code2 } from 'lucide-react';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import type { TraitConfig } from '@/lib/stores';

// ─── Property field renderer ─────────────────────────────────────────────────

function PropertyField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const fieldId = `prop-${name}`;

  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between py-[3px]">
        <label htmlFor={fieldId} className="text-xs text-studio-muted">
          {name}
        </label>
        <button
          id={fieldId}
          onClick={() => onChange(!value)}
          className={`relative h-4 w-8 rounded-full transition-colors ${
            value ? 'bg-studio-accent' : 'bg-studio-border'
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
              value ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div className="flex items-center justify-between gap-2 py-[3px]">
        <label htmlFor={fieldId} className="min-w-0 shrink-0 text-xs text-studio-muted">
          {name}
        </label>
        <input
          id={fieldId}
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          step={0.1}
          className="w-20 rounded bg-studio-surface px-2 py-0.5 text-right text-xs text-studio-text outline-none focus:ring-1 focus:ring-studio-accent/50"
        />
      </div>
    );
  }

  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    return (
      <div className="flex items-center justify-between gap-2 py-[3px]">
        <label htmlFor={fieldId} className="text-xs text-studio-muted">
          {name}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={fieldId}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span className="text-xs text-studio-muted">{value}</span>
        </div>
      </div>
    );
  }

  // Default: text
  return (
    <div className="flex items-center justify-between gap-2 py-[3px]">
      <label htmlFor={fieldId} className="min-w-0 shrink-0 text-xs text-studio-muted">
        {name}
      </label>
      <input
        id={fieldId}
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded bg-studio-surface px-2 py-0.5 text-right text-xs text-studio-text outline-none focus:ring-1 focus:ring-studio-accent/50"
      />
    </div>
  );
}

// ─── Trait Card ───────────────────────────────────────────────────────────────

function TraitCard({
  trait,
  nodeId,
  onOpenShaderEditor,
}: {
  trait: TraitConfig;
  nodeId: string;
  onOpenShaderEditor?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const removeTrait = useSceneGraphStore((s) => s.removeTrait);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);

  const propEntries = Object.entries(trait.properties);
  const isMaterial = trait.name === 'material';

  return (
    <div className="rounded-lg border border-studio-border bg-studio-surface overflow-hidden">
      {/* Card header */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-studio-panel/50"
        onClick={() => setOpen((v) => !v)}
      >
        <Grip className="h-3.5 w-3.5 text-studio-muted/40 cursor-grab" />
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-studio-muted shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-studio-muted shrink-0" />
        )}
        <span
          className="flex-1 text-xs font-semibold text-studio-accent"
          title={
            trait.name === 'wisdom'
              ? `@wisdom — Battle-tested insight. Properties: description, source, applies_to, examples.${trait.properties.description ? `\n\nInsight: ${trait.properties.description}` : ''}`
              : trait.name === 'gotcha'
                ? `@gotcha — Known failure mode.${trait.properties.severity ? ` Severity: ${trait.properties.severity}.` : ''}${trait.properties.warning ? `\n\nWarning: ${trait.properties.warning}` : ''}${trait.properties.mitigation ? `\nMitigation: ${trait.properties.mitigation}` : ''}`
                : `@${trait.name}`
          }
        >
          @{trait.name}
          {trait.name === 'gotcha' && trait.properties.severity === 'critical' && (
            <span
              className="ml-1 text-red-400 text-[10px]"
              title="Critical gotcha — blocks --enforce-gotchas builds"
            >
              CRIT
            </span>
          )}
        </span>
        {isMaterial && onOpenShaderEditor && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenShaderEditor();
            }}
            className="rounded p-0.5 text-studio-muted hover:bg-studio-accent/20 hover:text-studio-accent mr-1"
            title="Open GLSL Shader Editor"
          >
            <Code2 className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeTrait(nodeId, trait.name);
          }}
          className="rounded p-0.5 text-studio-muted hover:bg-red-500/20 hover:text-red-400"
          title="Remove trait"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Properties */}
      {open && propEntries.length > 0 && (
        <div className="border-t border-studio-border/50 px-3 pb-2 pt-1">
          {propEntries.map(([key, val]) => (
            <PropertyField
              key={key}
              name={key}
              value={val}
              onChange={(newVal) => setTraitProperty(nodeId, trait.name, key, newVal)}
            />
          ))}
        </div>
      )}

      {open && propEntries.length === 0 && (
        <div className="border-t border-studio-border/50 px-3 py-2 text-xs text-studio-muted">
          No configurable properties
        </div>
      )}
    </div>
  );
}

// ─── Main Inspector ───────────────────────────────────────────────────────────

interface TraitInspectorProps {
  onOpenPalette: () => void;
  onOpenShaderEditor?: () => void;
}

export function TraitInspector({ onOpenPalette, onOpenShaderEditor }: TraitInspectorProps) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const updateNodeTransform = useSceneGraphStore((s) => s.updateNodeTransform);

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;

  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center border-t border-studio-border bg-studio-panel p-4">
        <p className="text-xs text-studio-muted">Select an object to inspect its traits</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-t border-studio-border bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-studio-muted">
            Inspector
          </span>
          <span className="text-xs text-studio-text font-medium">— {selectedNode.name}</span>
        </div>
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-1 rounded-md bg-studio-accent/10 px-2 py-1 text-xs text-studio-accent transition hover:bg-studio-accent/20"
        >
          <Plus className="h-3 w-3" />
          Add Trait
        </button>
      </div>

      {/* Transform row */}
      <div className="shrink-0 border-b border-studio-border/50 px-4 py-2">
        <div className="grid grid-cols-3 gap-2">
          {(['position', 'rotation', 'scale'] as const).map((prop) => (
            <div key={prop}>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-studio-muted">
                {prop}
              </div>
              <div className="flex gap-1">
                {(['x', 'y', 'z'] as const).map((axis, i) => (
                  <input
                    key={axis}
                    type="number"
                    value={selectedNode[prop][i]}
                    step={prop === 'rotation' ? 15 : prop === 'scale' ? 0.1 : 0.5}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        const updated = [...selectedNode[prop]] as [number, number, number];
                        updated[i] = val;
                        updateNodeTransform(selectedNode.id, { [prop]: updated });
                      }
                    }}
                    className="w-full min-w-0 rounded bg-studio-surface px-1 py-0.5 text-center text-[11px] text-studio-text outline-none focus:ring-1 focus:ring-studio-accent/50"
                    title={`${prop} ${axis.toUpperCase()}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trait cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {selectedNode.traits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-studio-muted">No traits assigned</p>
            <p className="mt-1 text-xs text-studio-muted/60">
              Click &quot;Add Trait&quot; to attach behaviors
            </p>
            <button
              onClick={onOpenPalette}
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-studio-accent/10 px-3 py-2 text-sm text-studio-accent transition hover:bg-studio-accent/20"
            >
              <Plus className="h-4 w-4" />
              Add First Trait
            </button>
          </div>
        ) : (
          selectedNode.traits.map((trait) => (
            <TraitCard
              key={trait.name}
              trait={trait}
              nodeId={selectedNode.id}
              onOpenShaderEditor={onOpenShaderEditor}
            />
          ))
        )}
      </div>
    </div>
  );
}
