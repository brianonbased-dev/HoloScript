'use client';

/**
 * CodebaseInspectorPanel — Studio's "Workspace Indexer" panel.
 *
 * The VS Code equivalent of:
 *   - "Indexing workspace…" status bar item (IntelliSense startup)
 *   - "Go to References" / "Find All References" backing data
 *   - Problems panel source (hub files = high-risk symbols)
 *
 * Wraps useAbsorb + CodebaseVisualizationPanel.
 * Displays: force-graph module map, hub file warnings, leaf-first order stats.
 */

import React, { useState } from 'react';
import { RefreshCw, AlertTriangle, Network, Loader2, CheckCircle, Clock } from 'lucide-react';
import { useAbsorb } from '@/hooks/useAbsorb';
import { CodebaseVisualizationPanel } from './CodebaseVisualizationPanel';

// ─── Props ────────────────────────────────────────────────────────────────────

interface CodebaseInspectorPanelProps {
  /** Root path to absorb. Defaults to '.' (monorepo root via server CWD). */
  projectPath?: string;
  /** Scan depth. 'medium' gives best signal/speed tradeoff. */
  depth?: 'shallow' | 'medium' | 'deep';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAge(isoString: string): string {
  const ageMs = Date.now() - new Date(isoString).getTime();
  if (ageMs < 60_000) return 'just now';
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h ago`;
  return `${Math.round(ageMs / 86_400_000)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodebaseInspectorPanel({
  projectPath = '.',
  depth = 'medium',
}: CodebaseInspectorPanelProps) {
  const { data, absorb, isLoading, error, refresh } = useAbsorb({ projectPath, depth });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-studio-text">
          <Network className="h-3.5 w-3.5 text-studio-accent" />
          Codebase Graph
        </div>
        <div className="flex items-center gap-2">
          {absorb?.absorbedAt && (
            <span className="flex items-center gap-1 text-[10px] text-studio-muted">
              <Clock className="h-3 w-3" />
              {formatAge(absorb.absorbedAt)}
            </span>
          )}
          <button
            onClick={() => refresh(true)}
            disabled={isLoading}
            title="Re-index workspace (force refresh)"
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Indexing…' : 'Re-index'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !data && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-studio-muted">
          <Loader2 className="h-5 w-5 animate-spin text-studio-accent" />
          <span className="text-[11px]">Indexing workspace…</span>
          <span className="text-[10px] opacity-60">Building dependency graph</span>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <AlertTriangle className="h-5 w-5 text-studio-error" />
          <div className="text-[11px] text-studio-error">{error}</div>
          <button
            onClick={() => refresh(false)}
            className="rounded bg-studio-surface px-3 py-1.5 text-[11px] text-studio-text transition hover:bg-studio-border"
          >
            Retry
          </button>
        </div>
      )}

      {/* Graph visualization */}
      {data && !error && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Stats strip */}
          <div className="flex shrink-0 items-center gap-3 border-b border-studio-border px-3 py-1.5 text-[10px] text-studio-muted">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {data.stats.totalFiles} files
            </span>
            <span>{data.stats.totalSymbols} symbols</span>
            <span>{data.stats.totalImports} imports</span>
            {absorb?.hubFiles?.length ? (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {absorb.hubFiles.length} hub{absorb.hubFiles.length !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>

          {/* Force-graph SVG */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodebaseVisualizationPanel
              data={data}
              onNodeClick={(nodeId) => setSelectedNode(nodeId)}
            />
          </div>

          {/* Hub file warnings — high-risk files (many dependents) */}
          {absorb?.hubFiles && absorb.hubFiles.length > 0 && (
            <div className="shrink-0 border-t border-studio-border">
              <div className="px-3 py-1.5 text-[10px] font-medium text-amber-400">
                Hub Files (highest change risk)
              </div>
              <ul className="max-h-28 overflow-y-auto">
                {absorb.hubFiles.slice(0, 8).map((hub) => (
                  <li
                    key={hub.path}
                    className="flex items-center justify-between px-3 py-1 text-[10px] hover:bg-studio-surface"
                  >
                    <span
                      className="truncate text-studio-muted"
                      title={hub.path}
                    >
                      {hub.path.split('/').slice(-2).join('/')}
                    </span>
                    <span className="ml-2 shrink-0 text-amber-400/70">
                      ←{hub.inDegree}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Selected node detail */}
          {selectedNode && (
            <div className="shrink-0 border-t border-studio-border px-3 py-2">
              <div className="text-[10px] font-medium text-studio-text">Selected</div>
              <div className="mt-0.5 truncate text-[10px] text-studio-muted" title={selectedNode}>
                {selectedNode.split('/').slice(-2).join('/')}
              </div>
              {absorb?.inDegree?.[selectedNode] !== undefined && (
                <div className="mt-0.5 text-[10px] text-studio-muted">
                  {absorb.inDegree[selectedNode]} file{absorb.inDegree[selectedNode] !== 1 ? 's' : ''} depend on this
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state — not yet indexed */}
      {!data && !isLoading && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Network className="h-6 w-6 text-studio-muted/40" />
          <div className="text-[11px] text-studio-muted">Workspace not indexed</div>
          <button
            onClick={() => refresh(false)}
            className="rounded bg-studio-accent/20 px-3 py-1.5 text-[11px] text-studio-accent transition hover:bg-studio-accent/30"
          >
            Index Workspace
          </button>
        </div>
      )}
    </div>
  );
}
