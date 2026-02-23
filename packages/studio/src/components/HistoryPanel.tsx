'use client';

/**
 * HistoryPanel — timeline sidebar listing scene history entries.
 *
 * Shows past snapshots in reverse-chronological order.
 * Clicking a past entry jumps to that state (undo to that point).
 * Current state is highlighted; future states (after undos) shown greyed.
 *
 * Collapsed by default — toggle with History button in toolbar.
 */

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useTemporalStore } from '@/lib/historyStore';
import { Clock, RotateCcw, RotateCw, Trash2, List, GitBranch } from 'lucide-react';

const UndoTreePanel = dynamic(
  () => import('@/components/history/UndoTreePanel').then((m) => ({ default: m.UndoTreePanel })),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-xs text-studio-muted animate-pulse">Loading tree…</div> }
);

// Friendly labels for history entries (we derive from nodes diff)
function entryLabel(index: number, total: number): string {
  if (index === total - 1) return 'Initial state';
  return `Step ${total - index - 1}`;
}

interface HistoryPanelProps {
  onClose: () => void;
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');

  const past = useTemporalStore((s) => s.pastStates);
  const future = useTemporalStore((s) => s.futureStates);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const clear = useTemporalStore((s) => s.clear);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const allEntries = [...past].reverse(); // most-recent first

  return (
    <div className="flex h-full flex-col border-l border-studio-border bg-studio-panel">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-studio-border px-3">
        <div className="flex items-center gap-2 text-xs font-medium text-studio-text">
          <Clock className="h-3.5 w-3.5 text-studio-accent" />
          History
        </div>
        {/* View toggle: List / Tree */}
        <div className="flex items-center rounded-lg border border-studio-border p-0.5">
          <button
            onClick={() => setViewMode('list')}
            title="List view"
            className={`rounded p-1 transition ${
              viewMode === 'list' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <List className="h-3 w-3" />
          </button>
          <button
            onClick={() => setViewMode('tree')}
            title="Tree view"
            className={`rounded p-1 transition ${
              viewMode === 'tree' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <GitBranch className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="rounded p-1 text-studio-muted transition hover:text-studio-text disabled:opacity-30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="rounded p-1 text-studio-muted transition hover:text-studio-text disabled:opacity-30"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => clear()}
            title="Clear history"
            className="rounded p-1 text-studio-muted transition hover:text-studio-error disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted transition hover:text-studio-text"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tree view */}
      {viewMode === 'tree' ? (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-studio-muted animate-pulse">Loading…</div>}>
          <UndoTreePanel onClose={onClose} />
        </Suspense>
      ) : (
        <>
          {/* Current state indicator */}
          <div className="border-b border-studio-border/50 bg-studio-accent/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-studio-accent" />
              <span className="text-xs font-medium text-studio-accent">Current state</span>
            </div>
            <p className="mt-0.5 text-[10px] text-studio-muted">
              {past.length} change{past.length !== 1 ? 's' : ''} recorded
            </p>
          </div>

          {/* Future states (after undo) */}
          {future.length > 0 && (
            <div className="border-b border-studio-border/50 bg-studio-surface/40">
              {[...future].reverse().map((_, i) => (
                <button
                  key={`future-${i}`}
                  onClick={() => redo(future.length - i)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition hover:bg-studio-surface"
                >
                  <RotateCw className="h-3 w-3 text-studio-muted/50" />
                  <span className="text-[11px] text-studio-muted/50">
                    {`Future step ${future.length - i}`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Past states — click to jump */}
          <div className="flex-1 overflow-y-auto">
            {allEntries.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-studio-muted">
                No history yet. Make some changes to your scene.
              </div>
            ) : (
              allEntries.map((state, i) => {
                const nodeCount = state.nodes?.length ?? 0;
                const stepsBack = i + 1;
                return (
                  <button
                    key={`past-${i}`}
                    onClick={() => undo(stepsBack)}
                    className="flex w-full items-center gap-2.5 border-b border-studio-border/30 px-3 py-2 text-left transition hover:bg-studio-surface"
                  >
                    <RotateCcw className="h-3 w-3 shrink-0 text-studio-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-studio-text">
                        {entryLabel(allEntries.length - 1 - i, allEntries.length)}
                      </p>
                      <p className="text-[10px] text-studio-muted">
                        {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-studio-muted/60">
                      -{stepsBack}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
