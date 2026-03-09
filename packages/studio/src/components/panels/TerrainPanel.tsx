'use client';
/** TerrainPanel — Heightmap terrain editor (bus-wired) */
import React, { useCallback } from 'react';
import { useTerrain } from '../../hooks/useTerrain';
import { useStudioBus } from '../../hooks/useStudioBus';

export function TerrainPanel() {
  const { terrainId, heights, resolution, maxHeight, generate, raise, flatten, reset } =
    useTerrain();
  const { emit } = useStudioBus();

  const genAndEmit = useCallback(
    (seed?: number) => {
      generate(seed);
      emit('terrain:changed', { resolution, maxHeight });
    },
    [generate, emit, resolution, maxHeight]
  );
  const raiseAndEmit = useCallback(
    (x: number, z: number, amount: number) => {
      raise(x, z, amount);
      emit('terrain:changed', { x, z, amount });
    },
    [raise, emit]
  );
  const flattenAndEmit = useCallback(() => {
    flatten();
    emit('terrain:changed', { action: 'flatten' });
  }, [flatten, emit]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🏔️ Terrain</h3>
        <span className="text-[10px] text-studio-muted">
          {terrainId ? `${resolution}×${resolution}` : 'No terrain'}
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => genAndEmit()}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🌋 Generate
        </button>
        <button
          onClick={() => genAndEmit(42)}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          🌱 Seed 42
        </button>
        <button
          onClick={flattenAndEmit}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          disabled={!terrainId}
        >
          ⬜ Flatten
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Heightmap visualization */}
      {heights.length > 0 && (
        <div className="bg-studio-panel/30 rounded-lg p-1">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${resolution}, 1fr)` }}
          >
            {heights.slice(0, resolution * resolution).map((h, i) => {
              const pct = Math.max(0, Math.min(1, h / maxHeight));
              const gx = i % resolution;
              const gz = Math.floor(i / resolution);
              return (
                <button
                  key={i}
                  onClick={() => raiseAndEmit(gx, gz, 2)}
                  className="aspect-square rounded-sm transition hover:ring-1 hover:ring-studio-accent"
                  title={`(${gx},${gz}) h=${h.toFixed(1)}`}
                  style={{
                    backgroundColor: `hsl(${120 - pct * 120}, ${40 + pct * 30}%, ${15 + pct * 35}%)`,
                  }}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-studio-muted mt-1 text-center">
            Click cells to raise terrain
          </p>
        </div>
      )}

      {!terrainId && (
        <div className="bg-studio-panel/30 rounded-lg p-4 text-center text-studio-muted">
          Click Generate to create a heightmap
        </div>
      )}
    </div>
  );
}
