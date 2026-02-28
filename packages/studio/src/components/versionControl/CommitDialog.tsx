'use client';

/**
 * Commit Dialog Component
 *
 * Modal for creating a new workflow commit
 */

import { useState } from 'react';
import { X, GitCommit, AlertCircle } from 'lucide-react';
import type { AgentWorkflow } from '@/lib/orchestrationStore';

export interface CommitDialogProps {
  workflow: AgentWorkflow;
  onCommit: (message: string) => Promise<void>;
  onClose: () => void;
}

export function CommitDialog({ workflow, onCommit, onClose }: CommitDialogProps) {
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCommit = async () => {
    if (!message.trim()) {
      setError('Commit message is required');
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      const fullMessage = description.trim()
        ? `${message.trim()}\n\n${description.trim()}`
        : message.trim();

      await onCommit(fullMessage);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create commit');
    } finally {
      setCommitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/20 p-2">
              <GitCommit className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-studio-text">Commit Changes</h2>
              <p className="text-[10px] text-studio-muted">Save workflow version to history</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Workflow info */}
          <div className="rounded-lg border border-studio-border bg-studio-surface p-3">
            <p className="text-xs font-medium text-studio-muted">Workflow</p>
            <p className="text-sm text-studio-text mt-1">{workflow.name}</p>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-studio-muted">
              <span>{workflow.nodes.length} nodes</span>
              <span>{workflow.edges.length} edges</span>
            </div>
          </div>

          {/* Commit message */}
          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text">
              Commit Message <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add workflow execution logic"
              className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text placeholder-studio-muted focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block text-sm font-medium text-studio-text">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Additional details about this commit..."
              rows={3}
              className="w-full resize-none rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text placeholder-studio-muted focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-studio-muted mt-1">Ctrl+Enter to commit</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-studio-border px-6 py-4">
          <button
            onClick={onClose}
            disabled={committing}
            className="rounded-lg px-4 py-2 text-sm font-medium text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCommit}
            disabled={committing || !message.trim()}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {committing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Committing...
              </>
            ) : (
              <>
                <GitCommit className="h-4 w-4" />
                Commit
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
