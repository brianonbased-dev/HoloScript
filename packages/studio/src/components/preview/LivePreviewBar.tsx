'use client';

/**
 * LivePreviewBar — compact status bar shown at the top of the editor.
 *
 * Shows connection state (SSE dot), last-sync time, auto-sync toggle,
 * and a manual Broadcast button to push current code to all connected viewers.
 */

import { useState, useCallback } from 'react';
import { Radio, RefreshCw, Pause, Play, Loader2, Square } from 'lucide-react';
import { useLivePreview } from '@/hooks/useLivePreview';
import { useSceneStore } from '@/lib/stores';
import { ANIM_WIZARD_STEP } from '@/lib/ui-timings';

const STATUS_COLOR: Record<string, string> = {
  connected: 'bg-green-400',
  connecting: 'bg-yellow-400 animate-pulse',
  error: 'bg-red-400',
  disconnected: 'bg-studio-muted/40',
};

const STATUS_LABEL: Record<string, string> = {
  connected: 'Live',
  connecting: 'Connecting…',
  error: 'Error',
  disconnected: 'Offline',
};

interface LivePreviewBarProps {
  sceneId?: string;
  executionState?: 'running' | 'paused' | 'stopped';
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
}

export function LivePreviewBar({
  sceneId = 'default',
  executionState = 'running',
  onPlay,
  onPause,
  onStop,
}: LivePreviewBarProps) {
  const code = useSceneStore((s) => s.code) ?? '';
  const [autoSync, setAutoSync] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const { status, lastSync, broadcast, connect, disconnect } = useLivePreview({
    sceneId,
    autoSync,
  });

  const handleBroadcast = useCallback(async () => {
    setBroadcasting(true);
    await broadcast(code);
      setTimeout(() => setBroadcasting(false), ANIM_WIZARD_STEP);
  }, [broadcast, code]);

  const relSync = lastSync ? `${Math.round((Date.now() - lastSync) / 1000)}s ago` : 'never';

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 text-[11px]">
      {/* Connection dot */}
      <div className={`h-2 w-2 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-400'}`} />
      <span className="text-studio-muted">{STATUS_LABEL[status] ?? status}</span>

      {/* Toggle connect */}
      {status === 'disconnected' || status === 'error' ? (
        <button
          onClick={connect}
          className="flex items-center gap-1 text-studio-muted hover:text-studio-accent transition"
          title="Connect to live preview"
        >
          <Play className="h-3 w-3" /> Connect
        </button>
      ) : (
        <button
          onClick={disconnect}
          className="flex items-center gap-1 text-studio-muted hover:text-red-400 transition"
          title="Disconnect"
        >
          <Pause className="h-3 w-3" /> Disconnect
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Runtime controls */}
        <div className="flex items-center gap-1 rounded-md border border-studio-border bg-studio-surface px-1 py-0.5">
          <button
            onClick={onPlay}
            title="Run scene"
            className={`rounded px-1 py-0.5 transition ${
              executionState === 'running'
                ? 'text-green-400'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Play className="h-3 w-3" />
          </button>
          <button
            onClick={onPause}
            title="Pause scene"
            className={`rounded px-1 py-0.5 transition ${
              executionState === 'paused'
                ? 'text-yellow-400'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Pause className="h-3 w-3" />
          </button>
          <button
            onClick={onStop}
            title="Stop scene"
            className={`rounded px-1 py-0.5 transition ${
              executionState === 'stopped'
                ? 'text-red-400'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Square className="h-3 w-3" />
          </button>
        </div>

        {/* Last sync */}
        {lastSync && <span className="text-studio-muted/60">synced {relSync}</span>}

        {/* Auto sync toggle */}
        <button
          onClick={() => setAutoSync((v) => !v)}
          title={autoSync ? 'Auto-sync ON' : 'Auto-sync OFF'}
          className={`flex items-center gap-1 transition ${
            autoSync ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
          }`}
        >
          <RefreshCw className={`h-3 w-3 ${autoSync ? 'animate-spin' : ''}`} />
          Auto
        </button>

        {/* Broadcast button */}
        <button
          onClick={handleBroadcast}
          disabled={status !== 'connected' || broadcasting}
          title="Broadcast current code to all viewers"
          className="flex items-center gap-1 rounded-lg bg-studio-accent/15 px-2 py-0.5 text-studio-accent transition hover:bg-studio-accent/25 disabled:opacity-40"
        >
          {broadcasting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Radio className="h-3 w-3" />
          )}
          Broadcast
        </button>
      </div>
    </div>
  );
}
