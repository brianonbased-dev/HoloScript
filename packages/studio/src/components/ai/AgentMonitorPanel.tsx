/** @jsxRuntime automatic */
'use client';

/**
 * AgentMonitorPanel — Live uAA2++ Agent Cycle Telemetry
 *
 * Displays the current phase, action status, cycle count, and
 * a scrollable log of the 50 most recent agent cycles.
 *
 * Reads from useAgentStore (isolated slice, zero overlap with other stores).
 * Write-side: exposes Stop button that calls agentStore.stopAgent().
 */

import { useAgentStore } from '@/lib/stores/agentStore';
import type { AgentPhase, AgentCycleEntry } from '@/lib/stores/agentStore';
import clsx from 'clsx';
import { X, Activity, Loader2, CheckCircle, XCircle, ZapOff, Trash2 } from 'lucide-react';

// ─── Phase metadata ───────────────────────────────────────────────────────────

const PHASE_META: Record<AgentPhase, { label: string; color: string }> = {
  idle:       { label: 'Idle',       color: 'text-studio-muted' },
  intake:     { label: '0 Intake',   color: 'text-sky-400' },
  reflect:    { label: '1 Reflect',  color: 'text-violet-400' },
  execute:    { label: '2 Execute',  color: 'text-emerald-400' },
  compress:   { label: '3 Compress', color: 'text-amber-400' },
  reintake:   { label: '4 Re-intake',color: 'text-sky-300' },
  grow:       { label: '5 Grow',     color: 'text-lime-400' },
  evolve:     { label: '6 Evolve',   color: 'text-fuchsia-400' },
  autonomize: { label: '7 Autonomize',color:'text-rose-400' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms?: number): string {
  if (ms == null) return '…';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function CycleRow({ entry }: { entry: AgentCycleEntry }) {
  const phase = PHASE_META[entry.phase];
  return (
    <div className="flex items-center gap-2 border-b border-studio-border/50 px-3 py-1.5 text-[11px]">
      {/* Status icon */}
      {entry.status === 'running' && (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-studio-accent" />
      )}
      {entry.status === 'done' && (
        <CheckCircle className="h-3 w-3 shrink-0 text-emerald-400" />
      )}
      {entry.status === 'error' && (
        <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
      )}

      {/* Cycle index */}
      <span className="w-6 shrink-0 font-mono text-studio-muted">#{entry.cycleId}</span>

      {/* Phase */}
      <span className={clsx('shrink-0 font-semibold', phase.color)}>{phase.label}</span>

      {/* Action */}
      <span className="flex-1 truncate text-studio-text/80">{entry.action || '—'}</span>

      {/* Duration */}
      <span className="shrink-0 text-studio-muted">{formatDuration(entry.durationMs)}</span>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export interface AgentMonitorPanelProps {
  onClose: () => void;
}

export function AgentMonitorPanel({ onClose }: AgentMonitorPanelProps) {
  const isRunning      = useAgentStore((s) => s.isRunning);
  const currentPhase   = useAgentStore((s) => s.currentPhase);
  const currentAction  = useAgentStore((s) => s.currentAction);
  const cycleCount     = useAgentStore((s) => s.cycleCount);
  const recentCycles   = useAgentStore((s) => s.recentCycles);
  const lastError      = useAgentStore((s) => s.lastError);
  const stopAgent      = useAgentStore((s) => s.stopAgent);
  const clearHistory   = useAgentStore((s) => s.clearHistory);

  const currentMeta = PHASE_META[currentPhase];

  return (
    <div className="flex h-full flex-col overflow-hidden" role="region" aria-label="Agent Monitor">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-studio-accent" />
          <span className="text-xs font-semibold text-studio-text">Agent Monitor</span>
          {isRunning && (
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" title="Running" />
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close Agent Monitor"
          className="rounded p-0.5 text-studio-muted transition hover:text-studio-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Status strip */}
      <div className="shrink-0 border-b border-studio-border bg-studio-surface/40 px-3 py-2 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className={clsx('text-xs font-bold', currentMeta.color)}>{currentMeta.label}</span>
            {currentAction && (
              <span className="truncate text-[11px] text-studio-muted max-w-[160px]">{currentAction}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-studio-muted">{cycleCount} cycles</span>
            {isRunning && (
              <button
                onClick={stopAgent}
                aria-label="Stop agent"
                className="flex items-center gap-1 rounded-md bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[11px] text-rose-300 transition hover:bg-rose-500/30"
              >
                <ZapOff className="h-3 w-3" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Error display */}
        {lastError && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
            {lastError}
          </div>
        )}
      </div>

      {/* Cycle log */}
      <div className="flex-1 overflow-y-auto">
        {recentCycles.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-studio-muted">
            No cycles yet
          </div>
        ) : (
          recentCycles.map((entry) => (
            <CycleRow key={`${entry.cycleId}-${entry.phase}`} entry={entry} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-studio-border px-3 py-2">
        <button
          onClick={clearHistory}
          className="flex items-center gap-1.5 text-[11px] text-studio-muted transition hover:text-studio-text"
        >
          <Trash2 className="h-3 w-3" />
          Clear history
        </button>
      </div>
    </div>
  );
}
