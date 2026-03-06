'use client';
/** NetworkPanel — Multiplayer networking simulator */
import React from 'react';
import { useNetworkManager } from '../../hooks/useNetworkManager';

export function NetworkPanel() {
  const { connected, peerId, peers, messageCount, latency, connect, disconnect, addPeer, removePeer, broadcast, setLatency, buildDemo, reset } = useNetworkManager();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📡 Network</h3>
        <span className={`text-[10px] font-medium ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'} · {latency}ms
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={buildDemo} className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">📡 Demo</button>
        {!connected ? <button onClick={connect} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition">Connect</button>
          : <button onClick={disconnect} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">Disconnect</button>}
        <button onClick={() => addPeer('Player')} className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">+ Peer</button>
        <button onClick={() => broadcast('sync')} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition">📢 Broadcast</button>
        <button onClick={reset} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
      </div>

      {/* Latency slider */}
      <div className="flex items-center gap-2">
        <span className="text-studio-muted text-[10px]">Latency</span>
        <input type="range" min={0} max={500} value={latency} onChange={e => setLatency(Number(e.target.value))} className="flex-1 h-1 accent-studio-accent" />
        <span className="text-studio-text font-mono text-[10px] w-10 text-right">{latency}ms</span>
      </div>

      {/* Peers */}
      <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
        {peers.length === 0 && <p className="text-studio-muted text-center py-1">No peers connected.</p>}
        {peers.map(p => (
          <div key={p.id} className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-0.5">
            <span className="text-studio-text text-[10px]">{p.displayName} <span className="text-studio-muted">({p.id})</span></span>
            <div className="flex items-center gap-1">
              <span className="text-studio-muted text-[10px] font-mono">{p.latency}ms</span>
              <button onClick={() => removePeer(p.id)} className="text-red-400 text-[10px]">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-[10px] bg-studio-panel/30 rounded-lg p-2">
        <div><span className="text-studio-muted">You</span><br/><span className="text-studio-text font-mono">{peerId}</span></div>
        <div><span className="text-studio-muted">Peers</span><br/><span className="text-studio-text font-mono">{peers.length}</span></div>
        <div><span className="text-studio-muted">Msgs</span><br/><span className="text-studio-text font-mono">{messageCount}</span></div>
      </div>
    </div>
  );
}
