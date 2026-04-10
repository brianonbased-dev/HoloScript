'use client';
/** CollaborationPanel — Multi-peer session manager */
import React from 'react';
import { useCollaborationSession } from '../../hooks/useCollaboration';

const PLATFORM_ICONS: Record<string, string> = { vr: '🥽', ide: '💻', web: '🌐', mobile: '📱' };

export function CollaborationPanel() {
  const {
    peers,
    documents,
    stats,
    addPeer,
    removePeer,
    openDocument,
    closeDocument,
    buildDemoSession,
    reset,
  } = useCollaborationSession();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">👥 Collaboration</h3>
        <span className="text-[10px] text-studio-muted">
          {peers.length} peers · {documents.length} docs
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemoSession}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          👥 Demo
        </button>
        <button
          onClick={() => addPeer('Guest')}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          + IDE
        </button>
        <button
          onClick={() => addPeer('VR User', 'vr')}
          className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition"
        >
          + VR
        </button>
        <button
          onClick={() => openDocument(`file-${Date.now()}.holo`)}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          + Doc
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Peers */}
      <div className="space-y-1 max-h-[100px] overflow-y-auto">
        {peers.length === 0 && <p className="text-studio-muted">Load demo or add peers.</p>}
        {peers.map((p) => (
          <div
            key={p.peerId}
            className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1"
          >
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-studio-text font-medium">{p.displayName}</span>
              <span>{PLATFORM_ICONS[p.platform] || '💻'}</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`text-[10px] font-mono ${p.connectionQuality > 0.9 ? 'text-emerald-400' : p.connectionQuality > 0.7 ? 'text-amber-400' : 'text-red-400'}`}
              >
                {Math.round(p.connectionQuality * 100)}%
              </span>
              <button onClick={() => removePeer(p.peerId)} className="text-red-400 text-[10px]">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Documents */}
      {documents.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">Open Documents</h4>
          <div className="space-y-0.5 max-h-[60px] overflow-y-auto">
            {documents.map((d) => (
              <div
                key={d}
                className="flex items-center justify-between bg-studio-panel/20 rounded px-2 py-0.5"
              >
                <span className="text-studio-text text-[10px] font-mono truncate">📄 {d}</span>
                <button onClick={() => closeDocument(d)} className="text-red-400 text-[10px]">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-[10px] bg-studio-panel/30 rounded-lg p-2">
          <div>
            <span className="text-studio-muted">Edits</span>
            <br />
            <span className="text-studio-text font-mono">{stats.totalEdits}</span>
          </div>
          <div>
            <span className="text-studio-muted">Syncs</span>
            <br />
            <span className="text-studio-text font-mono">{stats.totalSyncMessages}</span>
          </div>
          <div>
            <span className="text-studio-muted">State</span>
            <br />
            <span className="text-studio-text font-mono">{stats.state}</span>
          </div>
        </div>
      )}
    </div>
  );
}
