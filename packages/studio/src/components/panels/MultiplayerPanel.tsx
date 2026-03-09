'use client';
/** MultiplayerPanel — Network state simulation and visualization */
import React from 'react';
import { useMultiplayer } from '../../hooks/useMultiplayer';

export function MultiplayerPanel() {
  const {
    clients,
    entities,
    tickRate,
    bandwidth,
    addClient,
    removeClient,
    spawnNetworked,
    simulateTick,
    reset,
  } = useMultiplayer();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🌐 Multiplayer</h3>
        <span className="text-[10px] text-studio-muted">
          {clients.length} clients · {entities.length} synced
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => addClient()}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          + Client
        </button>
        <button
          onClick={simulateTick}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
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

      {/* Network stats */}
      <div className="grid grid-cols-3 gap-2 bg-studio-panel/50 rounded-lg p-2">
        <div>
          <span className="text-studio-muted">Tick Rate</span>
          <br />
          <span className="text-studio-text font-mono">{tickRate} Hz</span>
        </div>
        <div>
          <span className="text-studio-muted">Bandwidth</span>
          <br />
          <span className="text-studio-text font-mono">{bandwidth}</span>
        </div>
        <div>
          <span className="text-studio-muted">Entities</span>
          <br />
          <span className="text-studio-text font-mono">{entities.length}</span>
        </div>
      </div>

      {/* Clients */}
      <div className="space-y-1.5">
        {clients.length === 0 && (
          <p className="text-studio-muted">No clients. Click + Client to add one.</p>
        )}
        {clients.map((c) => (
          <div key={c.id} className="bg-studio-panel/30 rounded p-2 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="text-studio-text font-medium">{c.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-studio-muted text-[10px]">{c.ping}ms</span>
                <button onClick={() => removeClient(c.id)} className="text-red-400 text-[10px]">
                  ✕
                </button>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => spawnNetworked(c.id)}
                className="px-1.5 py-0.5 bg-studio-panel text-studio-muted rounded hover:text-studio-text text-[10px] transition"
              >
                + Entity
              </button>
              <span className="text-studio-muted text-[10px]">{c.entities} owned</span>
            </div>
          </div>
        ))}
      </div>

      {/* Synced entities */}
      {entities.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">Synced Entities</h4>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {entities.map((e) => {
              const client = clients.find((c) => c.id === e.owner);
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between bg-studio-panel/20 rounded px-2 py-0.5 font-mono text-[10px]"
                >
                  <span className="text-studio-text">#{e.id}</span>
                  <span className="text-studio-muted">
                    ({e.transform.x.toFixed(1)}, {e.transform.z.toFixed(1)})
                  </span>
                  <span style={{ color: client?.color || '#888' }}>{client?.name || 'server'}</span>
                  {e.synced && <span className="text-emerald-400">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
