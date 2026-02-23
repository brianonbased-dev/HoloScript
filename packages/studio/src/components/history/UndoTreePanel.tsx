'use client';

/**
 * UndoTreePanel — visual branching undo/redo history graph.
 *
 * Reads from useTemporalStore (zundo) which exposes:
 *   pastStates   — array of HistorySceneState snapshots (oldest first)
 *   futureStates — array of HistorySceneState snapshots (nearest first)
 *   undo()       — step back
 *   redo()       — step forward
 *
 * Rendered as a vertical timeline: past entries at top, current in middle,
 * future "ghost" entries below.
 */

import { useCallback } from 'react';
import { RotateCcw, RotateCw, Dot, CircleDot, X } from 'lucide-react';
import { useTemporalStore } from '@/lib/historyStore';

interface UndoTreePanelProps {
  onClose: () => void;
}

interface HistoryEntry {
  index: number;
  label: string;
  nodeCount: number;
  isCurrent: boolean;
  isPast: boolean;
}

export function UndoTreePanel({ onClose }: UndoTreePanelProps) {
  const past = useTemporalStore((s) => s.pastStates);
  const future = useTemporalStore((s) => s.futureStates);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  // Build a flat ordered list: past (oldest→newest) + current + future (nearest→furthest)
  const entries: HistoryEntry[] = [
    // Past states (oldest first)
    ...past.map((state, i) => ({
      index: i,
      label: `State ${i + 1}`,
      nodeCount: state.nodes?.length ?? 0,
      isCurrent: false,
      isPast: true,
    })),
    // Current state
    {
      index: past.length,
      label: 'Current',
      nodeCount: 0, // current nodeCount comes from the live store, not snapshots
      isCurrent: true,
      isPast: false,
    },
    // Future states (nearest first = index 0 is the next redo target)
    ...future.map((state, i) => ({
      index: past.length + 1 + i,
      label: `Redo ${i + 1}`,
      nodeCount: state.nodes?.length ?? 0,
      isCurrent: false,
      isPast: false,
    })),
  ];

  const jumpTo = useCallback(
    (entry: HistoryEntry) => {
      if (entry.isCurrent) return;
      if (entry.isPast) {
        // Need to undo (past.length - entry.index) times
        const stepsBack = past.length - entry.index;
        for (let i = 0; i < stepsBack; i++) undo();
      } else {
        // It's a future state — redo (entry.index - past.length) times
        const stepsFwd = entry.index - past.length;
        for (let i = 0; i < stepsFwd; i++) redo();
      }
    },
    [past.length, undo, redo]
  );

  const totalStates = entries.length;
  const currentIndex = past.length;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-studio-accent" />
          <span className="text-[12px] font-semibold">History</span>
          <span className="rounded-full bg-studio-surface px-1.5 py-0.5 text-[9px] text-studio-muted">
            {currentIndex + 1} / {totalStates}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            title="Undo"
            className="rounded p-1.5 text-studio-muted hover:bg-studio-surface hover:text-studio-text disabled:opacity-30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo"
            className="rounded p-1.5 text-studio-muted hover:bg-studio-surface hover:text-studio-text disabled:opacity-30"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="ml-1 rounded p-1 text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-studio-border">
        <div
          className="h-full bg-studio-accent transition-all"
          style={{ width: totalStates > 1 ? `${(currentIndex / (totalStates - 1)) * 100}%` : '100%' }}
        />
      </div>

      {/* Timeline list */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto p-2">
        {[...entries].reverse().map((entry) => {
          const isGhost = !entry.isPast && !entry.isCurrent; // future state

          return (
            <button
              key={entry.index}
              onClick={() => jumpTo(entry)}
              disabled={entry.isCurrent}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                entry.isCurrent
                  ? 'bg-studio-accent/15 cursor-default'
                  : isGhost
                  ? 'text-studio-muted/50 hover:bg-studio-surface hover:text-studio-muted'
                  : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
              }`}
            >
              {/* Timeline dot */}
              <div className="relative flex w-4 shrink-0 flex-col items-center">
                {entry.isCurrent ? (
                  <CircleDot className="h-4 w-4 text-studio-accent" />
                ) : (
                  <Dot
                    className={`h-4 w-4 ${
                      isGhost ? 'text-studio-muted/30' : 'text-studio-muted group-hover:text-studio-accent'
                    }`}
                  />
                )}
              </div>

              {/* Label */}
              <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                <span
                  className={`truncate text-[11px] ${
                    entry.isCurrent ? 'font-semibold text-studio-accent' : ''
                  }`}
                >
                  {entry.label}
                </span>
                {entry.nodeCount > 0 && (
                  <span className="shrink-0 text-[9px] text-studio-muted/60">
                    {entry.nodeCount} node{entry.nodeCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="flex shrink-0 items-center justify-between border-t border-studio-border px-3 py-2 text-[10px] text-studio-muted">
        <span>{past.length} undo{past.length !== 1 ? 's' : ''} available</span>
        <span>{future.length} redo{future.length !== 1 ? 's' : ''} available</span>
      </div>
    </div>
  );
}
