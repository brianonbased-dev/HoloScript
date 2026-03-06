'use client';
/** ScenePanel — Scene save/load manager */
import React from 'react';
import { useSceneManager } from '../../hooks/useSceneManager';

export function ScenePanel() {
  const { scenes, count, save, deleteScene, buildDemo, reset } = useSceneManager();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🎭 Scenes</h3>
        <span className="text-[10px] text-studio-muted">{count} saved</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={buildDemo} className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">🎭 Demo</button>
        <button onClick={() => save(`Scene ${Date.now() % 1000}`)} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition">💾 Save</button>
        <button onClick={reset} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
      </div>

      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {scenes.length === 0 && <p className="text-studio-muted text-center py-2">No scenes. Create demo or save.</p>}
        {scenes.map(s => (
          <div key={s.name} className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1">
            <div>
              <span className="text-studio-text font-medium">{s.name}</span>
              <div className="text-[10px] text-studio-muted">{s.nodeCount} nodes · {s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '—'}</div>
            </div>
            <button onClick={() => deleteScene(s.name)} className="text-red-400 text-[10px]">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
