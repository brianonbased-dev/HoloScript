'use client';
/**
 * AssetPipelinePanel — Draft/Mesh/Final maturity toggle & pipeline overview.
 *
 * Lets artists toggle individual entities between draft, mesh, and final
 * maturity stages. Shows scene-wide stats and batch operations.
 *
 * @see W.080 — Geometric shapes as pixels pipeline
 * @see FE-1 — Draft/Mesh/Sim toggle directive
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { useStudioBus } from '../../hooks/useStudioBus';
import type { AssetMaturity } from '@holoscript/core';

const MATURITY_META: Record<AssetMaturity, { icon: string; color: string; label: string }> = {
  draft: { icon: '🟦', color: '#88aaff', label: 'Draft' },
  mesh: { icon: '🟧', color: '#ffaa44', label: 'Mesh' },
  final: { icon: '🟩', color: '#44dd88', label: 'Final' },
};

const MATURITY_ORDER: AssetMaturity[] = ['draft', 'mesh', 'final'];

export function AssetPipelinePanel() {
  const nodes = useSceneGraphStore((s) => s.nodes);
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const { emit } = useStudioBus();
  const [filter, setFilter] = useState<AssetMaturity | 'all'>('all');

  // Categorize nodes by maturity
  const stats = useMemo(() => {
    const counts: Record<AssetMaturity, number> = { draft: 0, mesh: 0, final: 0 };
    for (const node of nodes) {
      const m = (node.assetMaturity || 'mesh') as AssetMaturity;
      if (counts[m] !== undefined) counts[m]++;
    }
    return counts;
  }, [nodes]);

  const total = stats.draft + stats.mesh + stats.final;

  // Filtered node list
  const filteredNodes = useMemo(() => {
    if (filter === 'all') return nodes;
    return nodes.filter((n) => (n.assetMaturity || 'mesh') === filter);
  }, [nodes, filter]);

  const handleSetMaturity = useCallback(
    (nodeId: string, maturity: AssetMaturity) => {
      emit('pipeline:setMaturity', { nodeId, maturity });
    },
    [emit],
  );

  const handleBatchSet = useCallback(
    (maturity: AssetMaturity) => {
      for (const node of nodes) {
        if (node.id) {
          emit('pipeline:setMaturity', { nodeId: node.id, maturity });
        }
      }
    },
    [nodes, emit],
  );

  const handlePromoteAll = useCallback(() => {
    for (const node of nodes) {
      const current = (node.assetMaturity || 'mesh') as AssetMaturity;
      const idx = MATURITY_ORDER.indexOf(current);
      if (idx < MATURITY_ORDER.length - 1) {
        emit('pipeline:setMaturity', {
          nodeId: node.id,
          maturity: MATURITY_ORDER[idx + 1],
        });
      }
    }
  }, [nodes, emit]);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text text-xs">
      {/* Header */}
      <div className="border-b border-studio-border px-3 py-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>🔄</span> Asset Pipeline
        </h3>
        <p className="text-[10px] text-studio-muted mt-0.5">
          Draft → Mesh → Final maturity stages
        </p>
      </div>

      {/* Stats bar */}
      <div className="px-3 py-2 border-b border-studio-border/40">
        <div className="flex items-center gap-1 h-4 rounded-full overflow-hidden bg-studio-surface">
          {MATURITY_ORDER.map((m) => {
            const pct = total > 0 ? (stats[m] / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={m}
                style={{
                  width: `${pct}%`,
                  backgroundColor: MATURITY_META[m].color,
                  opacity: 0.7,
                }}
                className="h-full transition-all duration-300"
                title={`${MATURITY_META[m].label}: ${stats[m]} (${Math.round(pct)}%)`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          {MATURITY_ORDER.map((m) => (
            <button
              key={m}
              onClick={() => setFilter(filter === m ? 'all' : m)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition text-[10px]
                ${filter === m ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: MATURITY_META[m].color }}
              />
              {MATURITY_META[m].label} ({stats[m]})
            </button>
          ))}
        </div>
      </div>

      {/* Batch actions */}
      <div className="px-3 py-2 flex gap-1.5 flex-wrap border-b border-studio-border/40">
        <button
          onClick={handlePromoteAll}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          ⬆ Promote All
        </button>
        <button
          onClick={() => handleBatchSet('draft')}
          className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition"
        >
          All Draft
        </button>
        <button
          onClick={() => handleBatchSet('final')}
          className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20 transition"
        >
          All Final
        </button>
      </div>

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {filteredNodes.length === 0 && (
          <p className="text-studio-muted text-center py-4">No entities in scene.</p>
        )}
        {filteredNodes.map((node) => {
          const m = (node.assetMaturity || 'mesh') as AssetMaturity;
          const meta = MATURITY_META[m];
          const isSelected = node.id === selectedObjectId;
          return (
            <div
              key={node.id || node.type}
              className={`flex items-center justify-between rounded px-2 py-1.5 transition
                ${isSelected ? 'bg-studio-accent/10 border border-studio-accent/30' : 'bg-studio-panel/30 hover:bg-studio-panel/50'}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="font-mono text-[10px] truncate">
                  {node.id || node.type}
                </span>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {MATURITY_ORDER.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => node.id && handleSetMaturity(node.id, stage)}
                    title={MATURITY_META[stage].label}
                    className={`w-5 h-5 rounded text-[10px] transition
                      ${m === stage
                        ? 'bg-studio-accent/30 text-studio-text'
                        : 'text-studio-muted hover:bg-studio-panel/50 hover:text-studio-text'}`}
                  >
                    {MATURITY_META[stage].icon}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="border-t border-studio-border px-3 py-1.5 text-[10px] text-studio-muted flex justify-between">
        <span>{total} entities</span>
        <span>
          {stats.final}/{total} final
        </span>
      </div>
    </div>
  );
}
