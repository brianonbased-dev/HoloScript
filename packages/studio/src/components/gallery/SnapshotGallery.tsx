'use client';

/**
 * SnapshotGallery — right-rail panel for capturing and restoring scene snapshots.
 */

import { useEffect, useState } from 'react';
import { Camera, X, RefreshCw, Trash2, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { useSnapshots, type Snapshot } from '@/hooks/useSnapshots';

interface SnapshotGalleryProps {
  onClose: () => void;
  sceneId?: string;
}

function SnapshotCard({
  snap,
  onRestore,
  onDelete,
}: {
  snap: Snapshot;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-studio-border bg-studio-surface">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {snap.dataUrl && snap.dataUrl.length > 100 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snap.dataUrl} alt={snap.label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-studio-muted">
            No preview
          </div>
        )}
      </div>
      {/* Info + actions */}
      <div className="p-2">
        <p className="truncate text-[11px] font-medium text-studio-text">{snap.label}</p>
        <p className="text-[9px] text-studio-muted">{new Date(snap.createdAt).toLocaleString()}</p>
        <div className="mt-1.5 flex gap-1.5">
          <button
            onClick={onRestore}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-studio-accent py-1 text-[10px] font-semibold text-white hover:brightness-110"
          >
            <RotateCcw className="h-3 w-3" /> Restore
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-studio-border px-2 py-1 text-studio-muted hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function SnapshotGallery({ onClose, sceneId = 'default' }: SnapshotGalleryProps) {
  const [label, setLabel] = useState('');
  const { snapshots, loading, capturing, error, load, capture, restore, remove } =
    useSnapshots(sceneId);

  useEffect(() => {
    load();
  }, [load]);

  const handleCapture = () => {
    capture(label || undefined);
    setLabel('');
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Camera className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Snapshot Gallery</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Capture bar */}
        <div className="flex gap-1.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Snapshot label (optional)"
            className="flex-1 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] outline-none focus:border-studio-accent placeholder-studio-muted/40"
          />
          <button
            onClick={handleCapture}
            disabled={capturing}
            className="flex items-center gap-1.5 rounded-xl bg-studio-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {capturing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            Snap
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-[10px] text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}

        {/* Gallery grid */}
        {snapshots.length === 0 && !loading && (
          <p className="py-8 text-center text-[10px] text-studio-muted">
            No snapshots yet.
            <br />
            Click <strong>Snap</strong> to capture the current viewport.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2">
          {[...snapshots].reverse().map((snap) => (
            <SnapshotCard
              key={snap.id}
              snap={snap}
              onRestore={() => restore(snap)}
              onDelete={() => remove(snap.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
