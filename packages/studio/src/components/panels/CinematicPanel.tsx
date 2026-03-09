'use client';
/** CinematicPanel — Scene timeline and cue editor */
import React from 'react';
import { useCinematic } from '../../hooks/useCinematic';

const CUE_ICONS: Record<string, string> = {
  camera_cut: '📷',
  actor_move: '🏃',
  dialogue: '💬',
  sound: '🔊',
  effect: '✨',
  custom: '⚙️',
};

export function CinematicPanel() {
  const {
    activeScene,
    isPlaying,
    elapsed,
    firedCues,
    createDemoScene,
    play,
    pause,
    resume,
    stop,
    step,
    reset,
  } = useCinematic();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🎬 Cinematic</h3>
        <span
          className={`text-[10px] font-medium ${isPlaying ? 'text-emerald-400' : 'text-studio-muted'}`}
        >
          {isPlaying ? '▶ Playing' : '⏸ Stopped'} {elapsed.toFixed(1)}s
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={createDemoScene}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎬 Demo Scene
        </button>
        {activeScene && !isPlaying && (
          <button
            onClick={() => play(activeScene.id)}
            className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
          >
            ▶ Play
          </button>
        )}
        {isPlaying && (
          <button
            onClick={pause}
            className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
          >
            ⏸ Pause
          </button>
        )}
        {!isPlaying && activeScene && (
          <button
            onClick={resume}
            className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ▶ Resume
          </button>
        )}
        <button
          onClick={() => step()}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⏩ +0.5s
        </button>
        <button
          onClick={stop}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ⏹
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Timeline */}
      {activeScene && (
        <div className="bg-studio-panel/30 rounded-lg p-2 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-studio-text font-medium">{activeScene.name}</span>
            <span className="text-studio-muted text-[10px]">
              {activeScene.duration}s · {activeScene.actors.length} actors
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-studio-panel rounded-full h-1.5 relative">
            <div
              className="h-1.5 rounded-full bg-studio-accent transition-all"
              style={{ width: `${Math.min(100, (elapsed / activeScene.duration) * 100)}%` }}
            />
            {activeScene.cues.map((c) => (
              <div
                key={c.id}
                className={`absolute top-0 w-1 h-1.5 rounded ${c.fired ? 'bg-emerald-400' : 'bg-studio-muted'}`}
                style={{ left: `${(c.time / activeScene.duration) * 100}%` }}
                title={`${c.type} @ ${c.time}s`}
              />
            ))}
          </div>
          {/* Cue list */}
          <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
            {activeScene.cues.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] ${c.fired ? 'bg-emerald-500/10 text-emerald-400' : 'bg-studio-panel/20 text-studio-muted'}`}
              >
                <span>{CUE_ICONS[c.type] || '⚙️'}</span>
                <span className="font-mono">{c.time.toFixed(1)}s</span>
                <span className="truncate">
                  {c.type}
                  {c.data.text ? `: "${c.data.text}"` : ''}
                </span>
                {c.fired && <span>✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!activeScene && (
        <div className="bg-studio-panel/30 rounded-lg p-4 text-center text-studio-muted">
          Load a demo scene to begin
        </div>
      )}
    </div>
  );
}
