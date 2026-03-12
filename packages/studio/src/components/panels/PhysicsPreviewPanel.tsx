'use client';
/**
 * PhysicsPreviewPanel — Live physics simulation viewer
 */
import React from 'react';
import { usePhysicsPreview } from '../../hooks/usePhysicsPreview';

export function PhysicsPreviewPanel() {
  const { entities, stats, isRunning, spawn, start, stop, step, reset } = usePhysicsPreview();

  const spawnCube = () =>
    spawn(
      {
        x: Math.random() * 6 - 3,
        y: 5,
        z: Math.random() * 6 - 3,
        rx: 0,
        ry: 0,
        rz: 0,
        sx: 1,
        sy: 1,
        sz: 1,
      },
      { vx: 0, vy: -2, vz: 0, angularX: 0, angularY: 0, angularZ: 0 },
      {
        type: 'box',
        radius: 0,
        halfExtentX: 0.5,
        halfExtentY: 0.5,
        halfExtentZ: 0.5,
        isTrigger: false,
      }
    );

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">⚡ Physics Preview</h3>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-studio-panel text-studio-muted'}`}
        >
          {isRunning ? 'Running' : 'Paused'}
        </span>
      </div>

      {/* Controls */}
      <div className="flex gap-1.5">
        {!isRunning ? (
          <button
            onClick={start}
            className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
          >
            ▶ Play
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
          >
            ⏸ Pause
          </button>
        )}
        <button
          onClick={() => step()}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⏭ Step
        </button>
        <button
          onClick={spawnCube}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          + Spawn
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺ Reset
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 bg-studio-panel/50 rounded-lg p-2">
        <div>
          <span className="text-studio-muted">Entities</span>
          <br />
          <span className="text-studio-text font-mono">{stats.entityCount}</span>
        </div>
        <div>
          <span className="text-studio-muted">Frame</span>
          <br />
          <span className="text-studio-text font-mono">{stats.lastFrameMs.toFixed(2)}ms</span>
        </div>
        <div>
          <span className="text-studio-muted">Avg</span>
          <br />
          <span className="text-studio-text font-mono">{stats.avgFrameMs.toFixed(2)}ms</span>
        </div>
      </div>

      {/* Entity list */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {entities.length === 0 && (
          <p className="text-studio-muted">No entities. Click + Spawn to add one.</p>
        )}
        {entities.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1"
          >
            <span className="text-studio-text font-mono">#{e.id}</span>
            <span className="text-studio-muted">
              {(() => { const t = e.transform as any; return `(${t.x?.toFixed(1) ?? '0.0'}, ${t.y?.toFixed(1) ?? '0.0'}, ${t.z?.toFixed(1) ?? '0.0'})`; })()}
            </span>
            {e.collider && <span className="text-amber-400">{e.collider.type}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
