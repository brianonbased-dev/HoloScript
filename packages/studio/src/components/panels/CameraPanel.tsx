'use client';
/** CameraPanel — Camera controller modes and preview (bus-wired) */
import React, { useCallback } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useStudioBus } from '../../hooks/useStudioBus';

const MODE_ICONS: Record<string, string> = { follow: '👤', orbit: '🔄', free: '🕊️', topDown: '⬇️', fixed: '📌' };

export function CameraPanel() {
  const { state, mode, modes, setMode, setTarget, move, rotateOrbit, zoom, setFOV, step, reset } = useCamera();
  const { emit } = useStudioBus();

  const emitCamera = useCallback(() => {
    setTimeout(() => emit('camera:moved', { position: state.position, mode, fov: state.fov, zoom: state.zoom }), 0);
  }, [emit, state, mode]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📷 Camera</h3>
        <span className="text-[10px] text-studio-muted">FOV {state.fov.toFixed(0)}° · Zoom {state.zoom.toFixed(1)}x</span>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-5 gap-1">
        {modes.map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded transition text-[10px]
              ${mode === m ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'}`}>
            <span>{MODE_ICONS[m] || '📷'}</span>
            <span className="capitalize">{m}</span>
          </button>
        ))}
      </div>

      {/* Position */}
      <div className="bg-studio-panel/30 rounded-lg p-2">
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div><span className="text-studio-muted">X</span><br/><span className="text-studio-text font-mono">{state.position.x.toFixed(1)}</span></div>
          <div><span className="text-studio-muted">Y</span><br/><span className="text-studio-text font-mono">{state.position.y.toFixed(1)}</span></div>
          <div><span className="text-studio-muted">Z</span><br/><span className="text-studio-text font-mono">{state.position.z.toFixed(1)}</span></div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-1.5">
        {mode === 'orbit' && (
          <div className="flex gap-1">
            <button onClick={() => { rotateOrbit(0.3, 0); step(); }} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">↻ Rotate</button>
            <button onClick={() => { rotateOrbit(0, 0.2); step(); }} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">↕ Tilt</button>
          </div>
        )}
        {mode === 'free' && (
          <div className="grid grid-cols-3 gap-1">
            <button onClick={() => move(-0.1, 0, 0)} className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">← X</button>
            <button onClick={() => move(0, 0.1, 0)} className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">↑ Y</button>
            <button onClick={() => move(0.1, 0, 0)} className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">X →</button>
          </div>
        )}
        <div className="flex gap-1">
          <button onClick={() => zoom(-0.1)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">- Zoom</button>
          <button onClick={() => zoom(0.1)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">+ Zoom</button>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setTarget(0, 0, 0)} className="flex-1 px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">🎯 Origin</button>
          <button onClick={() => step()} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">⟳ Step</button>
          <button onClick={reset} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
        </div>
      </div>
    </div>
  );
}
