'use client';

/**
 * UndoHistorySidebar — visual undo/redo timeline list.
 * Click any entry to restore the scene to that checkpoint.
 *
 * @deprecated Use HistoryPanel from '@/components/HistoryPanel' instead.
 * HistoryPanel is the canonical history component with list/tree view toggle,
 * labeled entries, and clear history support. This V1 sidebar is kept for
 * backward compatibility during migration.
 */

import { Clock, X, RotateCcw, RotateCw, ChevronRight } from 'lucide-react';
import { useUndoHistory, type HistoryEntry } from '@/hooks/useUndoHistory';
import { useTemporalStore } from '@/lib/historyStore';

interface UndoHistorySidebarProps {
  onClose: () => void;
}

export function UndoHistorySidebar({ onClose }: UndoHistorySidebarProps) {
  const { entries, currentIndex, jumpTo } = useUndoHistory();
  const { undo, redo } = useTemporalStore((s) => s) as unknown as {
    undo: () => void;
    redo: () => void;
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Clock className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Undo History</span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={undo}
            title="Undo (Ctrl+Z)"
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={redo}
            title="Redo (Ctrl+Y)"
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="shrink-0 border-b border-studio-border/50 px-3 py-1.5">
        <span className="text-[9px] text-studio-muted">
          {currentIndex} past · {entries.length - currentIndex - 1} future states
        </span>
      </div>

      {/* Entry list — newest first */}
      <div className="flex-1 overflow-y-auto">
        {entries.length <= 1 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">
            No history yet. Make some edits to the scene.
          </p>
        )}
        {[...entries].reverse().map((entry: HistoryEntry) => {
          const isFuture = entry.index > currentIndex;
          return (
            <button
              key={entry.index}
              onClick={() => jumpTo(entry.index)}
              className={`flex w-full items-start gap-2.5 border-b border-studio-border/30 px-3 py-2.5 text-left transition hover:bg-studio-surface/60 ${entry.isCurrent ? 'bg-studio-accent/10' : ''}`}
            >
              {/* Timeline pip */}
              <div className="mt-1 flex flex-col items-center shrink-0">
                <div
                  className={`h-2.5 w-2.5 rounded-full border-2 ${entry.isCurrent ? 'border-studio-accent bg-studio-accent' : isFuture ? 'border-studio-muted/40 bg-transparent' : 'border-studio-muted/60 bg-studio-surface'}`}
                />
                {entry.index !== 0 && <div className="mt-0.5 h-4 w-px bg-studio-border/40" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span
                    className={`text-[10px] font-semibold ${entry.isCurrent ? 'text-studio-accent' : isFuture ? 'text-studio-muted/60' : 'text-studio-text'}`}
                  >
                    {entry.label}
                  </span>
                  {entry.isCurrent && (
                    <span className="rounded-full bg-studio-accent/20 px-1.5 py-0.5 text-[7px] font-bold text-studio-accent">
                      NOW
                    </span>
                  )}
                  {isFuture && <RotateCw className="h-2.5 w-2.5 text-studio-muted/40" />}
                </div>
                {entry.preview && (
                  <p className="mt-0.5 truncate font-mono text-[8px] text-studio-muted/70">
                    {entry.preview}…
                  </p>
                )}
              </div>

              {!entry.isCurrent && (
                <ChevronRight className="h-3 w-3 shrink-0 self-center text-studio-muted/40" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
