'use client';

/**
 * SceneVersionPanel — sidebar for managing scene version history.
 *
 * Lists snapshots newest-first, supports:
 * - Save new snapshot (with optional label prompt)
 * - Restore any snapshot (applies code to editor)
 * - Diff against current (shows SceneDiffPanel inline)
 * - Delete snapshot
 */

import { useEffect, useState } from 'react';
import {
  History,
  Save,
  RotateCcw,
  Trash2,
  X,
  GitCompare,
  Loader2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useSceneVersions, type SceneVersion } from '@/hooks/useSceneVersions';
import { useSceneStore } from '@/lib/stores';
import dynamic from 'next/dynamic';

const SceneDiffPanel = dynamic(
  () => import('@/components/diff/SceneDiffPanel').then((m) => ({ default: m.SceneDiffPanel })),
  { ssr: false }
);

interface SceneVersionPanelProps {
  sceneId: string;
  onClose: () => void;
}

function relativeTime(iso: string) {
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function SceneVersionPanel({ sceneId, onClose }: SceneVersionPanelProps) {
  const currentCode = useSceneStore((s) => s.code);
  const { versions, status, error, loadVersions, saveVersion, restoreVersion, deleteVersion } =
    useSceneVersions(sceneId);

  const [labelInput, setLabelInput] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);
  const [diffTarget, setDiffTarget] = useState<SceneVersion | null>(null);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleSave = async () => {
    const label = labelInput.trim() || undefined;
    setLabelInput('');
    setSavingLabel(false);
    await saveVersion(currentCode ?? '', label);
  };

  if (diffTarget) {
    return (
      <div className="flex h-full flex-col">
        <SceneDiffPanel
          afterCode={diffTarget.code}
          afterLabel={diffTarget.label}
          onAccept={async () => {
            await restoreVersion(diffTarget.versionId);
            setDiffTarget(null);
          }}
          onClose={() => setDiffTarget(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <History className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Versions</span>
        <span className="ml-1 text-[10px] text-studio-muted">({versions.length}/50)</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={loadVersions}
            title="Refresh"
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Save snapshot */}
      <div className="shrink-0 border-b border-studio-border p-3">
        {savingLabel ? (
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setSavingLabel(false);
              }}
              placeholder="Snapshot label (optional)"
              className="flex-1 rounded-lg border border-studio-border bg-studio-surface px-2 py-1.5 text-[11px] text-studio-text outline-none focus:border-studio-accent"
            />
            <button
              onClick={handleSave}
              disabled={status === 'saving'}
              className="rounded-lg bg-studio-accent px-2.5 py-1.5 text-[11px] text-white hover:brightness-110 disabled:opacity-50"
            >
              {status === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSavingLabel(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-studio-accent/15 py-2 text-[11px] text-studio-accent hover:bg-studio-accent/25 transition"
          >
            <Save className="h-3.5 w-3.5" /> Save snapshot
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 rounded-lg bg-red-500/10 p-2 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {/* Version list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {status === 'loading' && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-studio-muted" />
          </div>
        )}
        {versions.length === 0 && status !== 'loading' && (
          <p className="py-6 text-center text-[11px] text-studio-muted">
            No snapshots yet. Save one to start tracking history.
          </p>
        )}
        {versions.map((v) => (
          <div
            key={v.versionId}
            className="group rounded-xl border border-studio-border bg-studio-surface p-2.5 transition hover:border-studio-accent/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="truncate text-[11px] font-medium text-studio-text">{v.label}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-studio-muted">
                  <Clock className="h-3 w-3" />
                  <span>{relativeTime(v.savedAt)}</span>
                  <span>·</span>
                  <span>{v.lineCount} lines</span>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => setDiffTarget(v)}
                  title="View diff"
                  className="rounded p-1 text-studio-muted hover:text-studio-accent"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => restoreVersion(v.versionId)}
                  title="Restore this version"
                  className="rounded p-1 text-studio-muted hover:text-green-400"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteVersion(v.versionId)}
                  title="Delete"
                  className="rounded p-1 text-studio-muted hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
