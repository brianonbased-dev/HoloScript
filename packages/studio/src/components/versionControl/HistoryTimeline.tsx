'use client';

/**
 * History Timeline Component
 *
 * Visual timeline of workflow commits
 */

import { GitCommit, Clock, User, GitBranch, RotateCcw, Eye } from 'lucide-react';
import type { WorkflowCommit } from '@/lib/versionControl';

export interface HistoryTimelineProps {
  commits: WorkflowCommit[];
  onRevert: (commitId: string) => void;
  onView: (commitId: string) => void;
}

export function HistoryTimeline({ commits, onRevert, onView }: HistoryTimelineProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    // Less than 1 minute ago
    if (diff < 60000) {
      return 'Just now';
    }

    // Less than 1 hour ago
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }

    // Less than 24 hours ago
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // Less than 7 days ago
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    // Otherwise, show full date
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitCommit className="h-12 w-12 text-studio-border mb-2" />
        <p className="text-sm text-studio-muted">No commits yet</p>
        <p className="text-xs text-studio-muted mt-1">Create your first commit to start version history</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {commits.map((commit, index) => {
        const isFirst = index === 0;
        const isLast = index === commits.length - 1;

        return (
          <div key={commit.id} className="relative group">
            {/* Timeline line */}
            {!isLast && (
              <div className="absolute left-[11px] top-6 bottom-0 w-px bg-studio-border" />
            )}

            {/* Commit node */}
            <div className="flex items-start gap-3 p-3 hover:bg-studio-surface rounded transition">
              {/* Timeline dot */}
              <div
                className={`relative flex-shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                  isFirst
                    ? 'border-emerald-500 bg-emerald-500/20'
                    : 'border-studio-border bg-studio-panel'
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full ${
                    isFirst ? 'bg-emerald-500' : 'bg-studio-border'
                  }`}
                />
              </div>

              {/* Commit info */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-studio-text truncate">
                      {commit.message.split('\n')[0]}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-studio-muted">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{commit.author.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(commit.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        <span className="font-mono">{commit.hash.slice(0, 7)}</span>
                      </div>
                    </div>

                    {/* Extended message */}
                    {commit.message.includes('\n') && (
                      <p className="text-xs text-studio-muted mt-2 whitespace-pre-wrap">
                        {commit.message.split('\n').slice(1).join('\n').trim()}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-studio-muted">
                      <span>{commit.snapshot.nodes.length} nodes</span>
                      <span>{commit.snapshot.edges.length} edges</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => onView(commit.id)}
                      className="rounded p-1.5 text-studio-muted hover:bg-sky-500/20 hover:text-sky-400 transition"
                      title="View commit"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {!isFirst && (
                      <button
                        onClick={() => onRevert(commit.id)}
                        className="rounded p-1.5 text-studio-muted hover:bg-amber-500/20 hover:text-amber-400 transition"
                        title="Revert to this commit"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
