'use client';
/** ProfilerPanel — Runtime performance profiler */
import React from 'react';
import { useProfiler } from '../../hooks/useProfiler';

export function ProfilerPanel() {
  const { snap, start, stop, reset } = useProfiler();
  const fps = snap.fps;
  const frameCount = 0; // Not available in current hook
  const enabled = snap.running;

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📊 Profiler</h3>
        <span
          className={`text-[10px] font-mono ${fps > 55 ? 'text-emerald-400' : fps > 30 ? 'text-amber-400' : 'text-red-400'}`}
        >
          {fps > 0 ? `${fps.toFixed(0)} FPS` : '— FPS'} · {frameCount} frames
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => {}}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          ⚡ Sim 30
        </button>
        <button
          onClick={() => {}}
          className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition"
        >
          📸 Snap
        </button>
        <button
          onClick={enabled ? stop : start}
          className={`px-2 py-1 rounded transition ${enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
        >
          {enabled ? '● On' : '○ Off'}
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* No memory or summaries to show */}
      {!enabled && (
        <p className="text-studio-muted text-center py-2">
          Start profiling to collect data.
        </p>
      )}
    </div>
  );
}
