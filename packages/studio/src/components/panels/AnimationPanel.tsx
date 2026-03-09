'use client';
/** AnimationPanel — Keyframe animation editor with easing preview */
import React from 'react';
import { useAnimation } from '../../hooks/useAnimation';

const EASING_ICONS: Record<string, string> = {
  linear: '━',
  easeInQuad: '╱',
  easeOutQuad: '╲',
  easeInOutQuad: '∿',
  easeInCubic: '↗',
  easeOutCubic: '↘',
  easeInOutCubic: '↕',
  easeOutBack: '⤴',
  easeOutElastic: '〰',
  easeOutBounce: '⥥',
};

export function AnimationPanel() {
  const {
    animations,
    easingFunctions,
    isRunning,
    playDemo,
    startLoop,
    stopLoop,
    step,
    stop,
    pause,
    resume,
    clear,
  } = useAnimation();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🎬 Animation</h3>
        <span
          className={`text-[10px] font-medium ${isRunning ? 'text-emerald-400' : 'text-studio-muted'}`}
        >
          {isRunning ? '▶ Playing' : '⏸ Paused'}
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {!isRunning ? (
          <button
            onClick={startLoop}
            className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
          >
            ▶ Play
          </button>
        ) : (
          <button
            onClick={stopLoop}
            className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
          >
            ⏸ Stop
          </button>
        )}
        <button
          onClick={() => step()}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⏭ Step
        </button>
        <button
          onClick={clear}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Easing functions */}
      <div>
        <h4 className="text-studio-muted font-medium mb-1.5">Easing Functions</h4>
        <div className="grid grid-cols-3 gap-1">
          {easingFunctions.map((name) => (
            <button
              key={name}
              onClick={() => playDemo(name)}
              className="flex items-center gap-1 px-1.5 py-1 bg-studio-panel/40 rounded hover:bg-studio-accent/20 hover:text-studio-accent transition text-[10px]"
            >
              <span>{EASING_ICONS[name] || '~'}</span>
              <span className="truncate">{name.replace('ease', '')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active animations */}
      <div>
        <h4 className="text-studio-muted font-medium mb-1">Active ({animations.length})</h4>
        {animations.length === 0 && (
          <p className="text-studio-muted">Click an easing function to preview</p>
        )}
        <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
          {animations.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1"
            >
              <span className="text-studio-text font-mono truncate flex-1">{a.id}</span>
              <div className="flex gap-1">
                <button onClick={() => pause(a.id)} className="text-amber-400 text-[10px]">
                  ⏸
                </button>
                <button onClick={() => resume(a.id)} className="text-emerald-400 text-[10px]">
                  ▶
                </button>
                <button onClick={() => stop(a.id)} className="text-red-400 text-[10px]">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
