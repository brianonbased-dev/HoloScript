'use client';
/** AudioPanel — Spatial audio source manager */
import React from 'react';
import { useAudioSpatial } from '../../hooks/useAudioSpatial';

export function AudioPanel() {
  const {
    sources,
    listener,
    masterVolume,
    isMuted,
    activeCount,
    play,
    stop,
    moveListener,
    setMasterVolume,
    toggleMute,
    stopAll,
    step,
    playDemo,
  } = useAudioSpatial();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔊 Spatial Audio</h3>
        <span className="text-[10px] text-studio-muted">{activeCount} sources</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={playDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎵 Demo
        </button>
        <button
          onClick={() =>
            play('sfx-click', { x: Math.random() * 10 - 5, y: 0, z: Math.random() * 10 - 5 })
          }
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          + Sound
        </button>
        <button
          onClick={() => step()}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⟳ Tick
        </button>
        <button
          onClick={stopAll}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ⏹ All
        </button>
      </div>

      {/* Master controls */}
      <div className="bg-studio-panel/50 rounded-lg p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-studio-muted">Master Volume</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="w-20 h-1 accent-studio-accent"
            />
            <span className="text-studio-text font-mono w-8">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-studio-muted">Mute</span>
          <button
            onClick={toggleMute}
            className={`px-2 py-0.5 rounded text-[10px] ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-studio-panel text-studio-muted'}`}
          >
            {isMuted ? '🔇 Muted' : '🔊 Active'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-studio-muted">Listener</span>
          <span className="text-studio-text font-mono text-[10px]">
            ({listener.position.x.toFixed(1)}, {listener.position.y.toFixed(1)},{' '}
            {listener.position.z.toFixed(1)})
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() =>
              moveListener({ x: listener.position.x - 1, y: 0, z: listener.position.z })
            }
            className="px-1.5 py-0.5 bg-studio-panel rounded text-studio-muted hover:text-studio-text text-[10px]"
          >
            ← L
          </button>
          <button
            onClick={() =>
              moveListener({ x: listener.position.x + 1, y: 0, z: listener.position.z })
            }
            className="px-1.5 py-0.5 bg-studio-panel rounded text-studio-muted hover:text-studio-text text-[10px]"
          >
            R →
          </button>
          <button
            onClick={() =>
              moveListener({ x: listener.position.x, y: 0, z: listener.position.z - 1 })
            }
            className="px-1.5 py-0.5 bg-studio-panel rounded text-studio-muted hover:text-studio-text text-[10px]"
          >
            ↑ F
          </button>
          <button
            onClick={() =>
              moveListener({ x: listener.position.x, y: 0, z: listener.position.z + 1 })
            }
            className="px-1.5 py-0.5 bg-studio-panel rounded text-studio-muted hover:text-studio-text text-[10px]"
          >
            ↓ B
          </button>
        </div>
      </div>

      {/* Sources */}
      <div className="space-y-1 max-h-[150px] overflow-y-auto">
        {sources.length === 0 && (
          <p className="text-studio-muted">No active sources. Click Demo or +Sound.</p>
        )}
        {sources.map((s) => (
          <div
            key={s.config.id}
            className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1"
          >
            <div>
              <span className="text-studio-text">{s.soundId}</span>
              <span className="text-studio-muted ml-1 text-[10px]">
                ({s.config.position.x.toFixed(1)}, {s.config.position.z.toFixed(1)})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-studio-muted text-[10px]">
                vol {(s.computedVolume * 100).toFixed(0)}%
              </span>
              <button onClick={() => stop(s.config.id)} className="text-red-400 text-[10px]">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
