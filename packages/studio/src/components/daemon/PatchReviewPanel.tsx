'use client';

/**
 * PatchReviewPanel -- Displays daemon-generated patch proposals and lets
 * users apply, export, or reject individual changes.
 *
 * Shown after a daemon job completes in the upload flow. Provides:
 *   - Per-file unified diff view
 *   - Select/deselect individual patches
 *   - Apply selected changes
 *   - Export as .patch file
 *   - Rerun with a different profile
 *
 * @module daemon/PatchReviewPanel
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { DaemonJob, PatchProposal, DaemonLogEntry } from '@/hooks/useDaemonJobs';
import { useDaemonJobs } from '@/hooks/useDaemonJobs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatchReviewPanelProps {
  job: DaemonJob;
  onClose: () => void;
  onRerun?: (profile: 'quick' | 'balanced' | 'deep') => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  typefix: 'bg-blue-500/20 text-blue-400',
  test: 'bg-emerald-500/20 text-emerald-400',
  docs: 'bg-purple-500/20 text-purple-400',
  lint: 'bg-yellow-500/20 text-yellow-400',
  refactor: 'bg-orange-500/20 text-orange-400',
  coverage: 'bg-teal-500/20 text-teal-400',
};

const ACTION_ICONS: Record<string, string> = {
  create: '+',
  modify: '~',
  delete: '-',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

// ---------------------------------------------------------------------------
// Sub-component: DiffViewer
// ---------------------------------------------------------------------------

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split('\n');

  return (
    <div className="overflow-x-auto rounded border border-studio-border bg-[#0d1117] p-2 font-mono text-[11px] leading-relaxed">
      {lines.map((line, idx) => {
        let lineClass = 'text-gray-400';
        if (line.startsWith('+++') || line.startsWith('---')) {
          lineClass = 'text-gray-500 font-bold';
        } else if (line.startsWith('@@')) {
          lineClass = 'text-purple-400 bg-purple-500/10';
        } else if (line.startsWith('+')) {
          lineClass = 'text-emerald-400 bg-emerald-500/10';
        } else if (line.startsWith('-')) {
          lineClass = 'text-red-400 bg-red-500/10';
        }

        return (
          <div key={idx} className={`px-2 ${lineClass}`}>
            {line || '\u00A0'}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: LogViewer
// ---------------------------------------------------------------------------

function LogViewer({ logs }: { logs: DaemonLogEntry[] }) {
  const levelColors: Record<string, string> = {
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };

  return (
    <div className="max-h-[200px] overflow-y-auto rounded border border-studio-border bg-[#0d1117] p-2 font-mono text-[10px]">
      {logs.map((entry, idx) => (
        <div key={idx} className={`flex gap-2 ${levelColors[entry.level] || 'text-gray-400'}`}>
          <span className="shrink-0 opacity-60">
            {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
          </span>
          <span className="shrink-0 w-[40px] uppercase opacity-70">[{entry.level}]</span>
          <span>{entry.message}</span>
        </div>
      ))}
      {logs.length === 0 && (
        <div className="text-center text-gray-500 py-4">No logs available.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PatchReviewPanel({ job, onClose, onRerun }: PatchReviewPanelProps) {
  const [selectedPatches, setSelectedPatches] = useState<Set<string>>(
    () => new Set(job.patches?.map((p) => p.id) ?? [])
  );
  const [expandedPatch, setExpandedPatch] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'patches' | 'logs' | 'metrics'>('patches');
  const [applying, setApplying] = useState(false);
  const { recordPatchAction } = useDaemonJobs();

  const patches = job.patches ?? [];
  const logs = job.logs ?? [];

  const togglePatch = useCallback((patchId: string) => {
    setSelectedPatches((prev) => {
      const next = new Set(prev);
      if (next.has(patchId)) next.delete(patchId);
      else next.add(patchId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPatches(new Set(patches.map((p) => p.id)));
  }, [patches]);

  const selectNone = useCallback(() => {
    setSelectedPatches(new Set());
  }, []);

  const handleApply = useCallback(async () => {
    if (selectedPatches.size === 0) return;
    setApplying(true);
    try {
      await recordPatchAction(job.id, Array.from(selectedPatches), 'apply');
    } finally {
      setApplying(false);
    }
  }, [job.id, selectedPatches, recordPatchAction]);

  const handleExport = useCallback(() => {
    const selected = patches.filter((p) => selectedPatches.has(p.id));
    const patchContent = selected
      .map((p) => p.diff ?? `# New file: ${p.filePath}\n${p.proposedContent ?? ''}`)
      .join('\n\n');

    const blob = new Blob([patchContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daemon-${job.id}-patches.patch`;
    a.click();
    URL.revokeObjectURL(url);

    void recordPatchAction(job.id, Array.from(selectedPatches), 'export');
  }, [job.id, patches, selectedPatches, recordPatchAction]);

  const handleReject = useCallback(async () => {
    if (selectedPatches.size === 0) return;
    await recordPatchAction(job.id, Array.from(selectedPatches), 'reject');
    selectNone();
  }, [job.id, selectedPatches, recordPatchAction, selectNone]);

  const patchesByCategory = useMemo(() => {
    const grouped: Record<string, PatchProposal[]> = {};
    for (const patch of patches) {
      if (!grouped[patch.category]) grouped[patch.category] = [];
      grouped[patch.category].push(patch);
    }
    return grouped;
  }, [patches]);

  const qualityDelta = job.metrics?.qualityDelta ?? 0;
  const deltaSign = qualityDelta >= 0 ? '+' : '';
  const deltaColor =
    qualityDelta > 0 ? 'text-emerald-400' : qualityDelta < 0 ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative flex w-full max-w-4xl max-h-[90vh] flex-col rounded-xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-studio-text">Patch Review</h2>
            <p className="text-xs text-studio-muted">
              Job {job.id} -- {patches.length} patch{patches.length !== 1 ? 'es' : ''} proposed
              {job.metrics && (
                <span className="ml-2">
                  | Quality:{' '}
                  <span className={deltaColor}>
                    {deltaSign}
                    {qualityDelta}
                  </span>
                  | {formatDuration(job.metrics.durationMs)}| {job.metrics.cycles} cycle
                  {job.metrics.cycles !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            X
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-studio-border px-6">
          {(['patches', 'logs', 'metrics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-studio-accent text-studio-accent'
                  : 'border-transparent text-studio-muted hover:text-studio-text'
              }`}
            >
              {tab === 'patches'
                ? `Patches (${patches.length})`
                : tab === 'logs'
                  ? `Logs (${logs.length})`
                  : 'Metrics'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Patches Tab */}
          {activeTab === 'patches' && (
            <div className="space-y-3">
              {patches.length === 0 ? (
                <div className="text-center text-studio-muted py-12">
                  <p className="text-sm">No patches proposed.</p>
                  <p className="text-xs mt-1">{job.summary}</p>
                </div>
              ) : (
                <>
                  {/* Selection controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="text-[10px] text-studio-accent hover:underline"
                      >
                        Select all
                      </button>
                      <button
                        onClick={selectNone}
                        className="text-[10px] text-studio-muted hover:underline"
                      >
                        Deselect all
                      </button>
                      <span className="text-[10px] text-studio-muted">
                        {selectedPatches.size} of {patches.length} selected
                      </span>
                    </div>
                    <div className="flex gap-1.5 text-[10px]">
                      {Object.entries(patchesByCategory).map(([cat, items]) => (
                        <span
                          key={cat}
                          className={`px-1.5 py-0.5 rounded ${CATEGORY_COLORS[cat] || 'bg-gray-500/20 text-gray-400'}`}
                        >
                          {cat}: {items.length}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Patch list */}
                  {patches.map((patch) => {
                    const isSelected = selectedPatches.has(patch.id);
                    const isExpanded = expandedPatch === patch.id;

                    return (
                      <div
                        key={patch.id}
                        className={`rounded-lg border transition ${
                          isSelected
                            ? 'border-studio-accent/40 bg-studio-accent/5'
                            : 'border-studio-border bg-studio-surface'
                        }`}
                      >
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePatch(patch.id)}
                            className="h-3.5 w-3.5 accent-studio-accent"
                          />

                          <span
                            className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-mono font-bold ${
                              patch.action === 'create'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : patch.action === 'delete'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {ACTION_ICONS[patch.action]}
                          </span>

                          <button
                            onClick={() => setExpandedPatch(isExpanded ? null : patch.id)}
                            className="flex-1 text-left"
                          >
                            <span className="text-xs font-mono text-studio-text">
                              {patch.filePath}
                            </span>
                            <span className="ml-2 text-[10px] text-studio-muted">
                              {patch.description}
                            </span>
                          </button>

                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] ${CATEGORY_COLORS[patch.category] || ''}`}
                          >
                            {patch.category}
                          </span>

                          <span className="shrink-0 text-[9px] text-studio-muted">
                            {Math.round(patch.confidence * 100)}%
                          </span>
                        </div>

                        {isExpanded && patch.diff && (
                          <div className="border-t border-studio-border px-4 py-3">
                            <DiffViewer diff={patch.diff} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && <LogViewer logs={logs} />}

          {/* Metrics Tab */}
          {activeTab === 'metrics' && job.metrics && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                <p className="text-[10px] text-studio-muted uppercase tracking-wider">
                  Quality Before
                </p>
                <p className="text-2xl font-bold text-studio-text">
                  {(job.metrics.qualityBefore * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                <p className="text-[10px] text-studio-muted uppercase tracking-wider">
                  Quality After
                </p>
                <p className={`text-2xl font-bold ${deltaColor}`}>
                  {(job.metrics.qualityAfter * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                <p className="text-[10px] text-studio-muted uppercase tracking-wider">
                  Quality Delta
                </p>
                <p className={`text-2xl font-bold ${deltaColor}`}>
                  {deltaSign}
                  {(qualityDelta * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                <p className="text-[10px] text-studio-muted uppercase tracking-wider">Duration</p>
                <p className="text-2xl font-bold text-studio-text">
                  {formatDuration(job.metrics.durationMs)}
                </p>
              </div>
              <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                <p className="text-[10px] text-studio-muted uppercase tracking-wider">Cycles</p>
                <p className="text-2xl font-bold text-studio-text">{job.metrics.cycles}</p>
              </div>
              <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                <p className="text-[10px] text-studio-muted uppercase tracking-wider">
                  Files Analyzed
                </p>
                <p className="text-2xl font-bold text-studio-text">{job.metrics.filesAnalyzed}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <div className="flex gap-2">
            {onRerun && (
              <div className="flex gap-1">
                {(['quick', 'balanced', 'deep'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => onRerun(p)}
                    disabled={p === job.profile}
                    className={`px-2 py-1 text-[10px] rounded transition ${
                      p === job.profile
                        ? 'bg-studio-accent/20 text-studio-accent'
                        : 'bg-studio-surface text-studio-muted hover:text-studio-text hover:bg-studio-panel'
                    }`}
                  >
                    Rerun: {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={selectedPatches.size === 0}
              className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 rounded hover:bg-red-500/20 transition disabled:opacity-50"
            >
              Reject Selected
            </button>
            <button
              onClick={handleExport}
              disabled={selectedPatches.size === 0}
              className="px-3 py-1.5 text-xs text-studio-muted bg-studio-surface rounded hover:text-studio-text transition disabled:opacity-50"
            >
              Export Patch
            </button>
            <button
              onClick={handleApply}
              disabled={selectedPatches.size === 0 || applying}
              className="px-3 py-1.5 text-xs text-white bg-emerald-500 rounded hover:bg-emerald-600 transition disabled:opacity-50"
            >
              {applying
                ? 'Applying...'
                : `Apply ${selectedPatches.size} Patch${selectedPatches.size !== 1 ? 'es' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PatchReviewPanel;
