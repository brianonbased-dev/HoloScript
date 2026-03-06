'use client';
/** ProcGenPanel — Procedural generation with interactive tilemap */
import React from 'react';
import { useProcGen } from '../../hooks/useProcGen';

const TILE_COLORS: Record<number, string> = {
  0: '#1a1a2e',  // empty / open
  1: '#4a5568',  // solid wall
  2: '#2d6a4f',  // grass
  3: '#1e40af',  // water
};

export function ProcGenPanel() {
  const { grid, width, height, layerCount, setTile, eraseTile, generateRandom, generateMaze, clear } = useProcGen(16, 16, 16);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🌍 ProcGen</h3>
        <span className="text-[10px] text-studio-muted">{width}×{height} · {layerCount} layers</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => generateRandom(0.35)} className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">🎲 Random</button>
        <button onClick={generateMaze} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition">🏗️ Maze</button>
        <button onClick={() => generateRandom(0.6)} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition">🏔️ Dense</button>
        <button onClick={clear} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
      </div>

      {/* Tile grid */}
      <div className="bg-studio-panel/30 rounded-lg p-1.5 overflow-auto" style={{ maxHeight: 280 }}>
        <div className="inline-grid gap-px" style={{ gridTemplateColumns: `repeat(${width}, 14px)` }}>
          {grid.map((row, y) =>
            row.map((tile, x) => (
              <button
                key={`${x}-${y}`}
                onClick={() => tile ? eraseTile(x, y) : setTile(x, y, 1, 1)}
                className="w-3.5 h-3.5 rounded-sm transition hover:opacity-80 border border-white/5"
                style={{ backgroundColor: tile ? (TILE_COLORS[tile.id] || TILE_COLORS[1]) : TILE_COLORS[0] }}
                title={`(${x},${y}) ${tile ? `id:${tile.id}` : 'empty'}`}
              />
            ))
          )}
        </div>
      </div>

      <div className="text-[10px] text-studio-muted">
        Click tiles to toggle. Use buttons above for procedural patterns.
      </div>
    </div>
  );
}
