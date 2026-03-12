'use client';
/** SaveLoadPanel — Save slot manager */
import React from 'react';
import { useSaveLoad } from '../../hooks/useSaveLoad';

export function SaveLoadPanel() {
  const { slots, playtime, save, load, deleteSlot, buildDemo, reset } = useSaveLoad();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">💾 Save/Load</h3>
        <span className="text-[10px] text-studio-muted">
          {slots.length} slots · {Math.floor(playtime)}s
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          📋 Demo
        </button>
        <button
          onClick={() => save('Quick Save')}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          💾 Save
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      <div className="space-y-1 max-h-[160px] overflow-y-auto">
        {slots.length === 0 && (
          <p className="text-studio-muted text-center py-2">
            No save slots. Create a demo or save.
          </p>
        )}
        {slots.map((s) => (
          <div key={s.id} className="bg-studio-panel/30 rounded px-2 py-1.5 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-studio-text font-medium truncate">{s.name}</span>
              <span className="text-studio-muted text-[10px]">
                {new Date(s.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-studio-muted">
                v{s.version} · {Math.floor(s.playtime)}s · #{s.id}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => load(s.id)}
                  className="text-studio-accent hover:text-studio-text transition"
                >
                  Load
                </button>
                <button
                  onClick={() => deleteSlot(s.id)}
                  className="text-red-400 hover:text-red-300 transition"
                >
                  ✕
                </button>
              </div>
            </div>
            {s.metadata && Object.keys(s.metadata).length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {Object.entries(s.metadata).map(([k, v]) => (
                  <span
                    key={k}
                    className="text-[9px] bg-studio-panel/40 px-1 rounded text-studio-muted"
                  >
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
