'use client';

/**
 * ToolCallGraphVisualizer - Brittney's tool execution tracer
 *
 * Visualizes tool call sequences as directed acyclic graph.
 * Supports real-time execution highlighting and replay.
 */

import { useMemo } from 'react';
import { Zap, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useOrchestrationStore } from '@/lib/orchestrationStore';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

interface ToolCallGraphVisualizerProps {
  onClose: () => void;
}

export function ToolCallGraphVisualizer({ onClose }: ToolCallGraphVisualizerProps) {
  const toolCallHistory = useOrchestrationStore((s) => s.toolCallHistory);

  const stats = useMemo(() => {
    const total = toolCallHistory.length;
    const success = toolCallHistory.filter((r) => r.status === 'success').length;
    const error = toolCallHistory.filter((r) => r.status === 'error').length;
    const avgDuration =
      total > 0
        ? toolCallHistory.reduce((sum, r) => sum + r.duration, 0) / total
        : 0;

    return { total, success, error, avgDuration };
  }, [toolCallHistory]);

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Zap className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Tool Call Graph</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="shrink-0 grid grid-cols-4 gap-2 px-3 py-2 border-b border-studio-border">
        <div className="rounded bg-studio-surface px-2 py-1.5">
          <div className="text-[8px] text-studio-muted uppercase">Total</div>
          <div className="text-[14px] font-bold text-studio-text">{stats.total}</div>
        </div>
        <div className="rounded bg-studio-surface px-2 py-1.5">
          <div className="text-[8px] text-studio-muted uppercase">Success</div>
          <div className="text-[14px] font-bold text-green-400">{stats.success}</div>
        </div>
        <div className="rounded bg-studio-surface px-2 py-1.5">
          <div className="text-[8px] text-studio-muted uppercase">Error</div>
          <div className="text-[14px] font-bold text-red-400">{stats.error}</div>
        </div>
        <div className="rounded bg-studio-surface px-2 py-1.5">
          <div className="text-[8px] text-studio-muted uppercase">Avg Time</div>
          <div className="text-[14px] font-bold text-studio-accent">
            {formatDuration(stats.avgDuration)}
          </div>
        </div>
      </div>

      {/* Call List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {toolCallHistory.length === 0 && (
          <div className="text-center text-studio-muted text-[10px] py-6">
            No tool calls yet
          </div>
        )}

        {toolCallHistory.slice(-50).reverse().map((call) => (
          <div
            key={call.id}
            className="rounded-lg border border-studio-border bg-studio-surface px-3 py-2"
          >
            <div className="flex items-center gap-2">
              {call.status === 'success' && <CheckCircle className="h-4 w-4 text-green-400" />}
              {call.status === 'error' && <AlertCircle className="h-4 w-4 text-red-400" />}
              {call.status === 'running' && <Clock className="h-4 w-4 text-yellow-400 animate-spin" />}
              {call.status === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}

              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-studio-text font-mono">
                  {call.toolName}
                </div>
                <div className="text-[9px] text-studio-muted">
                  {call.server} • {formatDuration(call.duration)} • by {call.triggeredBy}
                </div>
              </div>
            </div>

            {call.error && (
              <div className="mt-2 text-[9px] text-red-400 font-mono">{call.error}</div>
            )}

            <details className="mt-2">
              <summary className="text-[9px] text-studio-muted cursor-pointer">
                View args & result
              </summary>
              <pre className="mt-1 text-[8px] text-studio-text overflow-x-auto">
                {JSON.stringify({ args: call.args, result: call.result }, null, 2)}
              </pre>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
