'use client';

/**
 * VersionHistoryPanel — visual temporal history for the scene graph.
 * Uses zundo temporal store from historyStore.ts.
 */

import { History, X, RotateCcw, GitCompare, Clock } from 'lucide-react';
import { useTemporalStore } from '@/lib/historyStore';
import { useSceneStore } from '@/lib/stores';

interface VersionHistoryPanelProps {
  onClose: () => void;
}

const _TIME_FMT = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function VersionHistoryPanel({ onClose }: VersionHistoryPanelProps) {
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const past = useTemporalStore((s) => s.pastStates);
  const future = useTemporalStore((s) => s.futureStates);
  const clear = useTemporalStore((s) => s.clear);

  const code = useSceneStore((s) => s.code) ?? '';

  const pastList = [...past].reverse(); // most-recent first
  const futureList = [...future];

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <History className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Version History</span>
        <span className="ml-1 rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">
          {past.length + future.length + 1} states
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`rounded p-1 transition ${canUndo ? 'text-studio-muted hover:text-studio-text' : 'text-studio-border cursor-not-allowed'}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={`rounded p-1 transition ${canRedo ? 'text-studio-muted hover:text-studio-text' : 'text-studio-border cursor-not-allowed'}`}
          >
            <GitCompare className="h-3.5 w-3.5 scale-x-[-1]" />
          </button>
          <button
            onClick={onClose}
            className="ml-1 rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="shrink-0 border-b border-studio-border bg-studio-surface/40 px-3 py-1.5 flex items-center gap-3 text-[8px] text-studio-muted">
        <span>{past.length} undo steps</span>
        <span>·</span>
        <span>{future.length} redo steps</span>
        <button
          onClick={() => clear()}
          className="ml-auto text-[7px] text-studio-muted/60 hover:text-red-400 transition"
        >
          Clear history
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto divide-y divide-studio-border/30">
        {/* FUTURE (redoable states) */}
        {futureList.map((state, i) => (
          <div
            key={`future-${i}`}
            className="flex items-start gap-2.5 px-3 py-2 opacity-50 bg-studio-surface/20"
          >
            <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-studio-border bg-studio-border" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-studio-muted truncate">
                {state.nodes?.length ?? 0} node{(state.nodes?.length ?? 0) !== 1 ? 's' : ''}
              </p>
              <p className="text-[7px] text-studio-muted/50">Future state (redo available)</p>
            </div>
          </div>
        ))}

        {/* CURRENT */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-studio-accent/8 border-l-2 border-studio-accent">
          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-studio-accent ring-2 ring-studio-accent/30" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold">Current State</p>
            <p className="text-[7px] text-studio-muted">{code.split('\n').length} lines · live</p>
          </div>
          <span className="shrink-0 rounded-full bg-studio-accent/20 px-1.5 py-0.5 text-[7px] text-studio-accent">
            NOW
          </span>
        </div>

        {/* PAST */}
        {pastList.map((state, i) => {
          const stepIndex = past.length - 1 - i;
          return (
            <div
              key={`past-${i}`}
              onClick={() => {
                for (let j = 0; j <= i; j++) undo();
              }}
              className="group flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-studio-surface/40 transition"
            >
              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-studio-border bg-studio-surface" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-studio-muted truncate group-hover:text-studio-text transition">
                  Step {stepIndex} · {state.nodes?.length ?? 0} node
                  {(state.nodes?.length ?? 0) !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="h-2 w-2 text-studio-muted/40" />
                  <p className="text-[7px] text-studio-muted/40">recorded state</p>
                </div>
              </div>
              <span className="shrink-0 text-[7px] text-studio-muted opacity-0 group-hover:opacity-100 transition">
                Restore
              </span>
            </div>
          );
        })}

        {past.length === 0 && future.length === 0 && (
          <div className="px-3 py-6 text-center text-[10px] text-studio-muted">
            <History className="h-8 w-8 mx-auto mb-2 text-studio-muted/30" />
            No history yet — start editing the scene
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-studio-border px-3 py-2 text-[8px] text-studio-muted">
        Click a past state to restore · Ctrl+Z / Ctrl+Y
      </div>
    </div>
  );
}
