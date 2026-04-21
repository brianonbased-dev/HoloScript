'use client';
/**
 * Draft / Mesh / Sim — main toolbar control for the geometric pixel pipeline.
 * Batches `assetMaturity` on all scene nodes: Sim → `final` (simulation-ready shading).
 * @see FE-1, W.080 — AssetPipelinePanel for per-entity control.
 */
import { useCallback } from 'react';
import { useEditorStore, usePanelVisibilityStore } from '@/lib/stores';
import { useSceneGraphStore } from '@/lib/stores/sceneGraphStore';
import type { GeometricViewMode } from '@/lib/stores/editorStore';
import type { AssetMaturity } from '@holoscript/core';

function modeToMaturity(mode: GeometricViewMode): AssetMaturity {
  if (mode === 'sim') return 'final';
  return mode;
}

const BTNS: { id: GeometricViewMode; label: string; title: string }[] = [
  { id: 'draft', label: 'Draft', title: 'Blockout / wireframe-friendly stage' },
  { id: 'mesh', label: 'Mesh', title: 'Shaded mesh stage' },
  { id: 'sim', label: 'Sim', title: 'Final assets + open Simulation panel' },
];

export function GeometricViewModeSegment() {
  const mode = useEditorStore((s) => s.geometricViewMode);
  const setMode = useEditorStore((s) => s.setGeometricViewMode);
  const updateNode = useSceneGraphStore((s) => s.updateNode);
  const setSimulationOpen = usePanelVisibilityStore((s) => s.setSimulationOpen);

  const applyMode = useCallback(
    (next: GeometricViewMode) => {
      setMode(next);
      const maturity = modeToMaturity(next);
      const list = useSceneGraphStore.getState().nodes;
      for (const n of list) {
        if (n.id) updateNode(n.id, { assetMaturity: maturity });
      }
      if (next === 'sim') setSimulationOpen(true);
    },
    [setMode, updateNode, setSimulationOpen]
  );

  return (
    <div
      className="flex min-w-0 shrink-0 items-center overflow-x-auto rounded-lg border border-studio-border bg-studio-surface/60 p-0.5"
      role="group"
      aria-label="Geometric pipeline stage"
    >
      {BTNS.map(({ id, label, title }) => (
        <button
          key={id}
          type="button"
          title={title}
          onClick={() => applyMode(id)}
          className={
            'rounded-md px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ' +
            (mode === id
              ? 'bg-studio-accent text-white shadow-sm'
              : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
