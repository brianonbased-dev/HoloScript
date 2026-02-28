'use client';

/**
 * Diff Viewer Component
 *
 * Side-by-side visual comparison of workflow versions
 */

import { Plus, Minus, Code } from 'lucide-react';
import type { WorkflowDiff } from '@/lib/versionControl';

export interface DiffViewerProps {
  diffs: WorkflowDiff[];
  commitA: string;
  commitB: string;
}

export function DiffViewer({ diffs, commitA, commitB }: DiffViewerProps) {
  const formatValue = (value: any): string => {
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getDiffColor = (type: WorkflowDiff['type']) => {
    switch (type) {
      case 'added':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'removed':
        return 'bg-red-500/10 border-red-500/20 text-red-400';
      case 'modified':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      default:
        return 'bg-studio-surface border-studio-border text-studio-text';
    }
  };

  const getDiffIcon = (type: WorkflowDiff['type']) => {
    switch (type) {
      case 'added':
        return <Plus className="h-4 w-4" />;
      case 'removed':
        return <Minus className="h-4 w-4" />;
      case 'modified':
        return <Code className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (diffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Code className="h-12 w-12 text-studio-border mb-2" />
        <p className="text-sm text-studio-muted">No differences found</p>
        <p className="text-xs text-studio-muted mt-1">The two versions are identical</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border pb-2">
        <p className="text-xs text-studio-muted">
          Comparing <span className="font-mono text-sky-400">{commitA.slice(0, 7)}</span>
          {' → '}
          <span className="font-mono text-emerald-400">{commitB.slice(0, 7)}</span>
        </p>
        <p className="text-xs text-studio-muted">{diffs.length} changes</p>
      </div>

      {/* Diffs */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {diffs.map((diff, index) => (
          <div
            key={index}
            className={`rounded-lg border p-3 ${getDiffColor(diff.type)}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">{getDiffIcon(diff.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase">{diff.type}</span>
                  <span className="text-xs font-mono">{diff.path}</span>
                </div>

                {/* Show old value (removed or modified) */}
                {(diff.type === 'removed' || diff.type === 'modified') && diff.oldValue && (
                  <div className="mt-2">
                    <p className="text-[10px] font-medium mb-1">Before:</p>
                    <pre className="text-[10px] bg-black/20 rounded p-2 overflow-x-auto">
                      {formatValue(diff.oldValue)}
                    </pre>
                  </div>
                )}

                {/* Show new value (added or modified) */}
                {(diff.type === 'added' || diff.type === 'modified') && diff.newValue && (
                  <div className="mt-2">
                    <p className="text-[10px] font-medium mb-1">After:</p>
                    <pre className="text-[10px] bg-black/20 rounded p-2 overflow-x-auto">
                      {formatValue(diff.newValue)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-t border-studio-border pt-2 text-[10px]">
        <div className="flex items-center gap-1 text-emerald-400">
          <Plus className="h-3 w-3" />
          <span>{diffs.filter((d) => d.type === 'added').length} added</span>
        </div>
        <div className="flex items-center gap-1 text-amber-400">
          <Code className="h-3 w-3" />
          <span>{diffs.filter((d) => d.type === 'modified').length} modified</span>
        </div>
        <div className="flex items-center gap-1 text-red-400">
          <Minus className="h-3 w-3" />
          <span>{diffs.filter((d) => d.type === 'removed').length} removed</span>
        </div>
      </div>
    </div>
  );
}
