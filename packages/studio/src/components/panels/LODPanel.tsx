'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLOD } from '../../hooks/useLOD';
import { useStudioBus } from '../../hooks/useStudioBus';

export const LOD_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

function readLodQuality(data: unknown): number | null {
  if (!data || typeof data !== 'object' || !('quality' in data)) return null;
  const quality = Number((data as { quality?: unknown }).quality);
  if (!Number.isFinite(quality)) return null;
  return Math.max(0, Math.min(LOD_COLORS.length - 1, Math.round(quality)));
}

export function LODPanel() {
  const { objects, cameraPos, setCameraPos, buildDemo, update, reset } = useLOD();
  const { emit, on } = useStudioBus();
  const [qualityOverride, setQualityOverride] = useState<number | null>(null);

  useEffect(
    () =>
      on('lod:updated', (data) => {
        const quality = readLodQuality(data);
        if (quality !== null) setQualityOverride(quality);
      }),
    [on]
  );

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

  const resetAndClearOverride = useCallback(() => {
    reset();
    setQualityOverride(null);
  }, [reset]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">LOD</h3>
        <div className="flex items-center gap-1.5">
          {qualityOverride !== null && (
            <span className="font-mono text-[10px]" style={{ color: LOD_COLORS[qualityOverride] }}>
              L{qualityOverride}
            </span>
          )}
          <span className="text-[10px] text-studio-muted">{objects.length} objects</span>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          Demo
        </button>
        <button
          onClick={updateAndEmit}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          Update
        </button>
        <button
          onClick={resetAndClearOverride}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          Reset
        </button>
      </div>

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

      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {objects.length === 0 && (
          <p className="text-studio-muted text-center py-2">Load demo to see LOD objects.</p>
        )}
        {objects.map((o) => {
          const displayLevel = qualityOverride ?? o.level;
          const color = LOD_COLORS[Math.min(displayLevel, LOD_COLORS.length - 1)];

          return (
            <div
              key={o.id}
              className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1"
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-studio-text font-mono text-[10px]">{o.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <span data-testid={`lod-level-${o.id}`} className="text-studio-muted text-[10px]">
                  L{displayLevel}
                </span>
                {o.transitioning && (
                  <span className="text-amber-400 text-[10px] animate-pulse">Transitioning</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
