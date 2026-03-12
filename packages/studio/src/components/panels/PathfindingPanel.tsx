'use client';
/** PathfindingPanel — A* pathfinding visualizer */
import React from 'react';
import { usePathfinding } from '../../hooks/usePathfinding';

export function PathfindingPanel() {
  const { lastResult, obstacles, findPath, addObstacle, removeObstacle, buildDemoMesh, reset } =
    usePathfinding();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🗺️ Pathfinding</h3>
        <span className="text-[10px] text-studio-muted">{obstacles.length} obstacles</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemoMesh}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎯 Demo Path
        </button>
        <button
          onClick={() => findPath({ x: 2, y: 0, z: 2 }, { x: 30, y: 0, z: 30 })}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          ⚡ Find
        </button>
        <button
          onClick={() =>
            addObstacle({ x: Math.random() * 28 + 2, y: 0, z: Math.random() * 28 + 2 })
          }
          className="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition"
        >
          + Obstacle
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Path result */}
      {lastResult && (
        <div className="bg-studio-panel/50 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${lastResult.found ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
            >
              {lastResult.found ? '✓ Path Found' : '✗ No Path'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <span className="text-studio-muted">Cost</span>
              <br />
              <span className="text-studio-text font-mono">{lastResult.cost.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-studio-muted">Visited</span>
              <br />
              <span className="text-studio-text font-mono">{lastResult.polygonsVisited}</span>
            </div>
            <div>
              <span className="text-studio-muted">Time</span>
              <br />
              <span className="text-studio-text font-mono">{lastResult.timeMs.toFixed(2)}ms</span>
            </div>
          </div>
          {lastResult.found && (
            <div>
              <h4 className="text-studio-muted text-[10px] mb-0.5">
                Waypoints ({lastResult.path.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {lastResult.path.map((p: any, i: number) => (
                  <span
                    key={i}
                    className="bg-studio-accent/10 text-studio-accent px-1 py-0.5 rounded text-[10px] font-mono"
                  >
                    ({p.x.toFixed(0)},{p.z.toFixed(0)})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Obstacles */}
      {obstacles.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">Obstacles</h4>
          <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
            {obstacles.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between bg-red-500/10 rounded px-2 py-0.5"
              >
                <span className="text-red-400 font-mono text-[10px]">
                  ⬤ ({o.position.x.toFixed(1)}, {o.position.z.toFixed(1)}) r={o.radius}
                </span>
                <button onClick={() => removeObstacle(o.id)} className="text-red-400 text-[10px]">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
