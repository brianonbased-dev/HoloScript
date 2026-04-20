/** @jsxRuntime automatic */
'use client';

/**
 * SpatialBlameOverlay
 *
 * Renders a tooltip/popover showing git blame info for a HoloScript trait
 * at a given line of the active .holo file.
 *
 * Uses automatic JSX runtime (no React import needed in scope).
 * Falls back to mock data when git is unavailable.
 */

import { useEffect, useState } from 'react';
import { GitCommit, User, Calendar, Hash, X, Loader2, AlertCircle } from 'lucide-react';
import { fetchBlame } from '@/features/versionControl/gitBlameService';
import type { BlameEntry } from '@/features/versionControl/gitBlameService';

export interface SpatialBlameOverlayProps {
  filePath: string;
  /** Absolute host path to the open workspace (`Workspace.localPath`). */
  workspacePath?: string;
  /** 1-indexed line number of the trait in the .holo file */
  line: number;
  /** Optional trait label to show in the header */
  traitLabel?: string;
  onClose: () => void;
}

export function SpatialBlameOverlay({
  filePath,
  workspacePath,
  line,
  traitLabel,
  onClose,
}: SpatialBlameOverlayProps) {
  const [entry, setEntry] = useState<BlameEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchBlame({ workspacePath, filePath, startLine: line, endLine: line })
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Unknown error');
        } else {
          setEntry(result.entries[0] ?? null);
          setIsMock(result.isMock ?? false);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filePath, line, workspacePath]);

  return (
    <div
      className="absolute z-50 w-72 rounded-xl border border-studio-border bg-studio-panel shadow-2xl shadow-black/40 animate-fade-in"
      role="dialog"
      aria-label="Spatial Blame"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-studio-text">
          <GitCommit className="h-3.5 w-3.5 text-indigo-400" />
          <span>Spatial Blame</span>
          {traitLabel && (
            <span className="rounded bg-studio-surface px-1.5 py-0.5 text-[10px] text-studio-muted font-mono">
              {traitLabel}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-studio-muted transition hover:text-studio-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-studio-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Fetching blame…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-lg border border-studio-error/20 bg-studio-error/10 p-2 text-xs text-studio-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && entry && (
          <div className="space-y-2">
            {/* Commit hash */}
            <div className="flex items-center gap-2">
              <Hash className="h-3 w-3 text-studio-muted shrink-0" />
              <span className="font-mono text-[11px] text-indigo-300">{entry.shortHash}</span>
            </div>

            {/* Summary */}
            <p className="text-xs text-studio-text leading-snug">{entry.summary}</p>

            {/* Author + Date */}
            <div className="flex items-center gap-3 text-[11px] text-studio-muted">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {entry.author}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {entry.date}
              </span>
            </div>

            {/* File + line */}
            <div className="truncate rounded bg-studio-surface px-2 py-1 font-mono text-[10px] text-studio-muted">
              {entry.filePath}:{entry.line}
            </div>

            {/* Mock badge */}
            {isMock && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400/70">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
                Mock data (git not available)
              </div>
            )}
          </div>
        )}

        {!loading && !error && !entry && (
          <p className="text-xs text-studio-muted">No blame data for line {line}.</p>
        )}
      </div>
    </div>
  );
}
