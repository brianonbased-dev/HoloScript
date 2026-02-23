'use client';

/**
 * REPLPanel — HoloScript Read-Eval-Print-Loop panel.
 *
 * Split view: code input area (top) + live execution trace (bottom).
 * Auto-runs on code change (300ms debounce).
 * Also shows a manual Run button for immediate execution.
 */

import { Terminal, Play, Loader2, Globe, Package, Zap, Info } from 'lucide-react';
import { useREPL, type TraceEntry } from '@/hooks/useREPL';

const TYPE_COLORS: Record<TraceEntry['type'], string> = {
  scene:  'text-studio-accent',
  object: 'text-blue-400',
  trait:  'text-green-400',
  error:  'text-red-400',
  info:   'text-studio-muted',
};

const TYPE_ICONS: Record<TraceEntry['type'], React.ComponentType<{ className?: string }>> = {
  scene:  Globe,
  object: Package,
  trait:  Zap,
  error:  Zap,
  info:   Info,
};

function TraceRow({ entry }: { entry: TraceEntry }) {
  const Icon = TYPE_ICONS[entry.type];
  const color = TYPE_COLORS[entry.type];

  return (
    <div className="flex items-start gap-2 border-b border-studio-border/30 px-3 py-1.5">
      <span className="mt-0.5 text-[9px] text-studio-muted/50 w-4 shrink-0 text-right">
        {entry.step}
      </span>
      <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] font-mono ${color}`}>{entry.message}</span>
        {entry.props && Object.keys(entry.props).length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {Object.entries(entry.props).map(([k, v]) => (
              <span
                key={k}
                className="rounded bg-studio-surface px-1 py-0.5 text-[9px] text-studio-muted font-mono"
              >
                {k}={v}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[9px] text-studio-muted/40">{entry.timeMs}ms</span>
    </div>
  );
}

interface REPLPanelProps {
  onClose?: () => void;
}

export function REPLPanel({ onClose }: REPLPanelProps) {
  const { code, setCode, trace, status, error, run } = useREPL({ autoRunMs: 300 });

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Terminal className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">HoloScript REPL</span>
        <span className="ml-1 rounded-full bg-studio-accent/15 px-1.5 py-0.5 text-[9px] text-studio-accent">
          LIVE
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => run(code)}
            disabled={status === 'running'}
            title="Run (manual)"
            className="flex items-center gap-1 rounded-lg bg-studio-surface px-2 py-1 text-[11px] text-studio-muted hover:text-studio-text transition"
          >
            {status === 'running' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Run
          </button>
          {onClose && (
            <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Code input */}
      <div className="shrink-0 border-b border-studio-border" style={{ height: '40%' }}>
        <div className="flex h-6 items-center border-b border-studio-border/50 px-3 text-[9px] text-studio-muted uppercase tracking-widest">
          Input
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={'// Type HoloScript here…\nscene "Test" {\n  object "Cube" {\n    @mesh(geometry: "box")\n  }\n}'}
          spellCheck={false}
          className="h-[calc(100%-24px)] w-full resize-none bg-[#070710] px-3 py-2 font-mono text-[11px] text-studio-muted outline-none focus:text-studio-text placeholder-studio-muted/30"
        />
      </div>

      {/* Trace output */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-6 shrink-0 items-center border-b border-studio-border/50 px-3 text-[9px] text-studio-muted uppercase tracking-widest">
          <span>Execution Trace</span>
          {trace.length > 0 && (
            <span className="ml-auto tabular-nums">{trace.length} steps</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-2 rounded-lg bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-400">
              {error}
            </div>
          )}
          {trace.length === 0 && !error && (
            <div className="py-6 text-center text-[11px] text-studio-muted">
              {status === 'running' ? 'Running…' : 'Trace will appear here as you type.'}
            </div>
          )}
          {trace.map((entry) => (
            <TraceRow key={entry.step} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
