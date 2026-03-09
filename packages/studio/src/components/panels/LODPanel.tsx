'use client';
/** LODPanel — Level of Detail manager (bus-wired) */
import React, { useCallback } from 'react';
import { useLOD } from '../../hooks/useLOD';
import { useStudioBus } from '../../hooks/useStudioBus';

const LOD_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

export function LODPanel() {
  const { objects, cameraPos, setCameraPos, buildDemo, update, reset } = useLOD();
  const { emit } = useStudioBus();

  const setCameraPosAndEmit = useCallback(
    (pos: [number, number, number]) => {
      setCameraPos(pos);
      emit('lod:updated', { cameraPos: pos, objectCount: objects.length });
    },
    [setCameraPos, emit, objects.length]
  );

  const updateAndEmit = useCallback(() => {
    update();
    emit('lod:updated', { action: 'recalculated', objectCount: objects.length });
  }, [update, emit, objects.length]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔍 LOD</h3>
        <span className="text-[10px] text-studio-muted">{objects.length} objects</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🌲 Demo
        </button>
        <button
          onClick={updateAndEmit}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          ↻ Update
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Camera position */}
      <div className="bg-studio-panel/30 rounded p-2">
        <span className="text-studio-muted text-[10px]">Camera Position</span>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <div key={axis} className="flex items-center gap-1">
              <span className="text-studio-muted text-[10px] w-3">{axis}</span>
              <input
                type="range"
                min={-100}
                max={100}
                value={cameraPos[i]}
                onChange={(e) => {
                  const p = [...cameraPos] as [number, number, number];
                  p[i] = Number(e.target.value);
                  setCameraPosAndEmit(p);
                }}
                className="flex-1 h-1 accent-studio-accent"
              />
              <span className="text-studio-text font-mono text-[10px] w-6 text-right">
                {cameraPos[i]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Objects */}
      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {objects.length === 0 && (
          <p className="text-studio-muted text-center py-2">Load demo to see LOD objects.</p>
        )}
        {objects.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1"
          >
            <div className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: LOD_COLORS[Math.min(o.level, LOD_COLORS.length - 1)] }}
              />
              <span className="text-studio-text font-mono text-[10px]">{o.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-studio-muted text-[10px]">L{o.level}</span>
              {o.transitioning && (
                <span className="text-amber-400 text-[10px] animate-pulse">⟳</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-2 text-[10px] text-studio-muted">
        {LOD_COLORS.map((c, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c }} /> L
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}
