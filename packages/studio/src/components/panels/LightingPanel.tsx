'use client';
/** LightingPanel — Scene lighting manager (bus-wired) */
import React, { useCallback } from 'react';
import { useLighting } from '../../hooks/useLighting';
import { useStudioBus } from '../../hooks/useStudioBus';
const LIGHT_ICONS: Record<string, string> = { directional: '☀️', point: '💡', spot: '🔦' };

export function LightingPanel() {
  const { lights, ambient, addLight, removeLight, toggleLight, setAmbient, buildDemoScene, reset } =
    useLighting();
  const { emit } = useStudioBus();

  // Wrap mutations to broadcast changes to viewport
  const emitState = useCallback(() => {
    // Slight delay to let React state settle
    setTimeout(() => emit('lighting:changed', { lights, ambient }), 0);
  }, [emit, lights, ambient]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">💡 Lighting</h3>
        <span className="text-[10px] text-studio-muted">{lights.length} lights</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemoScene}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎬 Demo
        </button>
        <button
          onClick={() => addLight('directional')}
          className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
        >
          ☀️ Sun
        </button>
        <button
          onClick={() => addLight('point')}
          className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition"
        >
          💡 Point
        </button>
        <button
          onClick={() => addLight('spot')}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          🔦 Spot
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Ambient control */}
      <div className="bg-studio-panel/30 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-studio-muted font-medium">Ambient</span>
          <button
            onClick={() => setAmbient({ useHemisphere: !ambient.useHemisphere })}
            className={`px-1.5 py-0.5 rounded text-[10px] transition ${ambient.useHemisphere ? 'bg-emerald-500/20 text-emerald-400' : 'bg-studio-panel text-studio-muted'}`}
          >
            {ambient.useHemisphere ? '🌗 Hemisphere' : '🔴 Flat'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <div
            className="w-4 h-4 rounded"
            style={{
              backgroundColor: Array.isArray(ambient.color) ? `rgb(${(ambient.color as number[]).map((c: number) => Math.round(c * 255)).join(',')})` : String(ambient.color),
            }}
          />
          <span className="text-studio-muted">Intensity: {ambient.intensity.toFixed(1)}</span>
        </div>
      </div>

      {/* Light list */}
      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {lights.length === 0 && <p className="text-studio-muted">Add lights or load demo scene.</p>}
        {lights.map((l) => (
          <div
            key={l.id}
            className={`flex items-center justify-between rounded px-2 py-1 ${l.enabled ? 'bg-studio-panel/30' : 'bg-studio-panel/10 opacity-50'}`}
          >
            <div className="flex items-center gap-1.5">
              <span>{LIGHT_ICONS[l.type]}</span>
              <span className="text-studio-text font-medium">{l.id}</span>
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: Array.isArray(l.color) ? `rgb(${(l.color as number[]).map((c: number) => Math.round(c * 255)).join(',')})` : String(l.color),
                }}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-studio-muted text-[10px]">{l.intensity.toFixed(1)}</span>
              {l.castShadow && <span className="text-[10px]">🌑</span>}
              <button
                onClick={() => toggleLight(l.id)}
                className="text-[10px] text-studio-muted hover:text-studio-text"
              >
                {l.enabled ? '👁' : '👁‍🗨'}
              </button>
              <button onClick={() => removeLight(l.id)} className="text-red-400 text-[10px]">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
