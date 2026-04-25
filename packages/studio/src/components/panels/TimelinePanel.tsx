'use client';
/** TimelinePanel — Animation timeline editor */
import React from 'react';
import { useTimeline } from '../../hooks/useTimeline';

export function TimelinePanel() {
  const {
    progress,
    elapsed,
    duration,
    isPlaying,
    entries,
    play,
    pause,
    resume,
    stop,
    tick,
    buildDemo,
    reset,
  } = useTimeline();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">⏱️ Timeline</h3>
        <span className="text-[10px] text-studio-muted">
          {entries} clips · {duration.toFixed(0)}ms
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎬 Demo
        </button>
        {!isPlaying ? (
          <button
            onClick={play}
            className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
          >
            ▶ Play
          </button>
        ) : (
          <button
            onClick={pause}
            className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
          >
            ⏸ Pause
          </button>
        )}
        <button
          onClick={() => tick(0.1)}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⏭ +100ms
        </button>
        <button
          onClick={stop}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ■ Stop
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="w-full bg-studio-panel rounded-full h-2 relative">
          <div
            className="h-2 rounded-full bg-studio-accent transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-studio-muted font-mono">
          <span>{elapsed.toFixed(0)}ms</span>
          <span>{(progress * 100).toFixed(1)}%</span>
          <span>{duration.toFixed(0)}ms</span>
        </div>
      </div>
    </div>
  );
}
