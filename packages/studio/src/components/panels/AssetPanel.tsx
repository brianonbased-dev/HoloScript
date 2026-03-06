'use client';
/** AssetPanel — Asset registry browser */
import React, { useState } from 'react';
import { useAssetRegistry } from '../../hooks/useAssetRegistry';

const TYPE_ICONS: Record<string, string> = { texture: '🖼️', model: '🧊', audio: '🔊', shader: '✨', scene: '🎭', animation: '🏃', data: '📋' };

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

export function AssetPanel() {
  const { assets, cacheSize, search, buildDemo, reset } = useAssetRegistry();
  const [query, setQuery] = useState('');

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📦 Assets</h3>
        <span className="text-[10px] text-studio-muted">{assets.length} items · {formatSize(cacheSize)}</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={buildDemo} className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">📦 Demo</button>
        <button onClick={reset} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
      </div>

      {/* Search */}
      <input type="text" value={query} onChange={e => { setQuery(e.target.value); search(e.target.value); }}
        placeholder="Search assets..." className="w-full bg-studio-panel/30 text-studio-text rounded px-2 py-1 text-[10px] outline-none focus:ring-1 ring-studio-accent/40" />

      {/* Asset list */}
      <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
        {assets.length === 0 && <p className="text-studio-muted text-center py-2">Load demo to browse assets.</p>}
        {assets.map(a => (
          <div key={a.id} className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-0.5">
            <div className="flex items-center gap-1.5 truncate">
              <span>{TYPE_ICONS[a.type] || '📄'}</span>
              <span className="text-studio-text text-[10px] truncate">{a.name}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-studio-muted">{formatSize(a.size)}</span>
              {a.tags.slice(0, 2).map(t => <span key={t} className="text-studio-accent/60 bg-studio-accent/10 px-1 rounded">{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
