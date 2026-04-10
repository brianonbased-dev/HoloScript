'use client';

/**
 * Version Control Panel Component
 *
 * Main panel for workflow version control features
 */

import { useState } from 'react';
import { X, GitCommit, History, GitCompare, RefreshCw, AlertCircle } from 'lucide-react';
import { useVersionControl } from '@/hooks/useVersionControl';
import { CommitDialog } from './CommitDialog';
import { HistoryTimeline } from './HistoryTimeline';
import { DiffViewer } from './DiffViewer';
import type { AgentWorkflow } from '@/lib/orchestrationStore';
import type { WorkflowDiff } from '@/lib/versionControl';

export interface VersionControlPanelProps {
  workflow: AgentWorkflow;
  onClose: () => void;
  onRevert: (workflow: AgentWorkflow) => void;
}

type TabType = 'history' | 'diff';

export function VersionControlPanel({ workflow, onClose, onRevert }: VersionControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('history');
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [selectedCommits, setSelectedCommits] = useState<string[]>([]);
  const [diff, setDiff] = useState<WorkflowDiff[] | null>(null);

  const {
    commits,
    loading,
    error,
    commit: createCommit,
    getHistory,
    getDiff,
    revert: revertToCommit,
  } = useVersionControl({ workflowId: workflow.id });

  const handleCommit = async (message: string) => {
    const newCommit = await createCommit(workflow, message);
    if (newCommit) {
      setShowCommitDialog(false);
    }
  };

  const handleRevert = async (commitId: string) => {
    if (
      !confirm('Are you sure you want to revert to this version? Current changes will be lost.')
    ) {
      return;
    }

    const revertedWorkflow = await revertToCommit(commitId);
    if (revertedWorkflow) {
      onRevert(revertedWorkflow);
    }
  };

  const handleViewCommit = async (commitId: string) => {
    if (selectedCommits.includes(commitId)) {
      setSelectedCommits((prev) => prev.filter((id) => id !== commitId));
    } else {
      setSelectedCommits((prev) => {
        const newSelection = [...prev, commitId].slice(-2);
        // Auto-compute diff if 2 commits selected
        if (newSelection.length === 2) {
          computeDiff(newSelection[0], newSelection[1]);
          setActiveTab('diff');
        }
        return newSelection;
      });
    }
  };

  const computeDiff = async (commitA: string, commitB: string) => {
    const diffResult = await getDiff(commitA, commitB);
    setDiff(diffResult);
  };

  return (
    <>
      <div className="fixed right-0 top-16 bottom-0 w-96 border-l border-studio-border bg-studio-panel flex flex-col z-50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-studio-text">Version Control</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => getHistory()}
              className="rounded p-1 text-studio-muted hover:bg-studio-surface hover:text-studio-text transition"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-studio-muted hover:bg-studio-surface hover:text-studio-text transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Action bar */}
        <div className="border-b border-studio-border px-4 py-2">
          <button
            onClick={() => setShowCommitDialog(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition"
          >
            <GitCommit className="h-4 w-4" />
            Create Commit
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="text-xs">{error}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-studio-border">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition ${
              activeTab === 'history'
                ? 'border-b-2 border-emerald-500 text-emerald-400'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History
            {commits.length > 0 && (
              <span className="rounded-full bg-studio-surface px-1.5 text-[10px]">
                {commits.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('diff')}
            disabled={selectedCommits.length !== 2}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition ${
              activeTab === 'diff'
                ? 'border-b-2 border-sky-500 text-sky-400'
                : 'text-studio-muted hover:text-studio-text disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            Diff
            {selectedCommits.length > 0 && (
              <span className="rounded-full bg-studio-surface px-1.5 text-[10px]">
                {selectedCommits.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'history' && (
            <div className="p-2">
              {selectedCommits.length > 0 && (
                <div className="mb-2 rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-xs text-sky-400">
                  {selectedCommits.length} commit{selectedCommits.length > 1 ? 's' : ''} selected
                  {selectedCommits.length === 2 && ' (showing diff)'}
                </div>
              )}
              <HistoryTimeline
                commits={commits}
                onRevert={handleRevert}
                onView={handleViewCommit}
              />
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="p-4">
              {diff ? (
                <DiffViewer
                  diffs={diff}
                  commitA={selectedCommits[0]}
                  commitB={selectedCommits[1]}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <GitCompare className="h-12 w-12 text-studio-border mb-2" />
                  <p className="text-sm text-studio-muted">Select two commits to compare</p>
                  <p className="text-xs text-studio-muted mt-1">Click commits in the history tab</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Commit dialog */}
      {showCommitDialog && (
        <CommitDialog
          workflow={workflow}
          onCommit={handleCommit}
          onClose={() => setShowCommitDialog(false)}
        />
      )}
    </>
  );
}
