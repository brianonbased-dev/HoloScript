'use client';
/**
 * ECSInspectorPanel — Entity-Component-System world inspector
 */
import React from 'react';
import { useECSInspector } from '../../hooks/useECSInspector';

const COMPONENT_BADGES: Record<string, { bg: string; text: string }> = {
  Transform: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  Velocity: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  Collider: { bg: 'bg-red-500/20', text: 'text-red-400' },
  Renderable: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  Agent: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
};

export function ECSInspectorPanel() {
  const { entities, stats, selectedEntity, select, spawn, destroy, tick, reset, spawnBatch } =
    useECSInspector();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔧 ECS Inspector</h3>
        <span className="text-[10px] text-studio-muted">{stats.entityCount} entities</span>
      </div>

      {/* Controls */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => spawn({ transform: true, velocity: true, collider: true })}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          + Entity
        </button>
        <button
          onClick={() => spawn({ transform: true, velocity: true, renderable: true, agent: true })}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          + Agent
        </button>
        <button
          onClick={() => spawnBatch(50)}
          className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
        >
          +50 Batch
        </button>
        <button
          onClick={() => tick()}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⟳ Tick
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 bg-studio-panel/50 rounded-lg p-2">
        <div>
          <span className="text-studio-muted">Count</span>
          <br />
          <span className="text-studio-text font-mono">{stats.entityCount}</span>
        </div>
        <div>
          <span className="text-studio-muted">Frame</span>
          <br />
          <span className="text-studio-text font-mono">{stats.lastFrameMs.toFixed(2)}ms</span>
        </div>
        <div>
          <span className="text-studio-muted">Peak</span>
          <br />
          <span className="text-studio-text font-mono">{stats.peakFrameMs.toFixed(2)}ms</span>
        </div>
      </div>

      {/* Entity list */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {entities.length === 0 && (
          <p className="text-studio-muted">No entities. Spawn one above.</p>
        )}
        {entities.map((e) => (
          <button
            key={e.id}
            onClick={() => select(e.id)}
            className={`w-full flex items-center justify-between rounded px-2 py-1.5 transition text-left ${
              selectedEntity?.id === e.id
                ? 'bg-studio-accent/10 border border-studio-accent/30'
                : 'bg-studio-panel/30 hover:bg-studio-panel/50'
            }`}
          >
            <span className="text-studio-text font-mono">#{e.id}</span>
            <div className="flex gap-0.5">
              {e.components.map((c) => {
                const s = COMPONENT_BADGES[c] || {
                  bg: 'bg-studio-panel',
                  text: 'text-studio-muted',
                };
                return (
                  <span key={c} className={`px-1 py-0.5 rounded text-[9px] ${s.bg} ${s.text}`}>
                    {c[0]}
                  </span>
                );
              })}
            </div>
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                destroy(e.id);
              }}
              className="text-red-400 hover:opacity-80 text-[10px]"
            >
              ✕
            </button>
          </button>
        ))}
      </div>

      {/* Selected entity detail */}
      {selectedEntity && (
        <div className="bg-studio-panel/50 rounded-lg p-2 space-y-1.5">
          <h4 className="text-studio-text font-medium">Entity #{selectedEntity.id}</h4>
          <div className="flex gap-1 flex-wrap">
            {selectedEntity.components.map((c) => {
              const s = COMPONENT_BADGES[c] || { bg: 'bg-studio-panel', text: 'text-studio-muted' };
              return (
                <span key={c} className={`px-1.5 py-0.5 rounded text-[10px] ${s.bg} ${s.text}`}>
                  {c}
                </span>
              );
            })}
          </div>
          {selectedEntity.transform && (
            <div className="font-mono text-[10px] text-studio-muted">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(() => { const t = selectedEntity.transform as any; return <>
                Pos: ({t.position?.x?.toFixed(2) ?? t.x?.toFixed(2) ?? '0.00'}, {t.position?.y?.toFixed(2) ?? t.y?.toFixed(2) ?? '0.00'}, {t.position?.z?.toFixed(2) ?? t.z?.toFixed(2) ?? '0.00'})
                <br />
                Scale: ({t.scale?.x?.toFixed(1) ?? t.sx?.toFixed(1) ?? '1.0'},{' '}
                {t.scale?.y?.toFixed(1) ?? t.sy?.toFixed(1) ?? '1.0'}, {t.scale?.z?.toFixed(1) ?? t.sz?.toFixed(1) ?? '1.0'})
              </>; })()}
            </div>
          )}
          {selectedEntity.agent && (
            <div className="text-[10px]">
              <span className="text-emerald-400">Agent:</span>{' '}
              <span className="text-studio-muted">
                {selectedEntity.agent.state} · speed {selectedEntity.agent.speed}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
