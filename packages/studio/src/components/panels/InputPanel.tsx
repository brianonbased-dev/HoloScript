'use client';
/** InputPanel — Input manager and action mapping */
import React from 'react';
import { useInputManager } from '../../hooks/useInputManager';

const KEY_PRESETS = ['w', 'a', 's', 'd', 'Space', 'Shift', 'e', 'f'];

export function InputPanel() {
  const { keys, mousePos, gamepads, actions, pressKey, releaseKey, buildDemo, reset } =
    useInputManager();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🎮 Input</h3>
        <span className="text-[10px] text-studio-muted">
          {keys.length} keys · {gamepads} pads
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎮 Demo
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Virtual keyboard */}
      <div className="grid grid-cols-4 gap-1">
        {KEY_PRESETS.map((k) => (
          <button
            key={k}
            onMouseDown={() => pressKey(k)}
            onMouseUp={() => releaseKey(k)}
            className={`px-2 py-1.5 rounded text-[10px] font-mono transition ${keys.includes(k) ? 'bg-studio-accent text-black font-bold' : 'bg-studio-panel/30 text-studio-muted hover:bg-studio-panel/50'}`}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Mouse position */}
      <div className="flex items-center gap-2 text-[10px] bg-studio-panel/30 rounded px-2 py-1">
        <span className="text-studio-muted">🖱️</span>
        <span className="text-studio-text font-mono">
          X:{mousePos.x} Y:{mousePos.y}
        </span>
        {gamepads > 0 && <span className="text-emerald-400">🎮 ×{gamepads}</span>}
      </div>

      {/* Active actions */}
      {actions.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {actions.map((a) => (
            <span
              key={a}
              className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-mono"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
