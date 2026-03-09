'use client';
/**
 * PresetsPanel — Panel layout preset manager
 *
 * Wires usePanelPresets to let users save/load/delete panel layouts.
 */
import React, { useState } from 'react';
import { usePanelPresets } from '../../hooks/usePanelPresets';
import type { PanelTab } from './RightPanelSidebar';

export function PresetsPanel() {
  const { presets, activePreset, savePreset, deletePreset, loadPreset } = usePanelPresets();
  const [newName, setNewName] = useState('');

  const builtInNames = ['Default', 'World Builder', 'Debug', 'Animation', 'Compile'];

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">💾 Presets</h3>
        <span className="text-[10px] text-studio-muted">{presets.length} presets</span>
      </div>

      {/* Preset list */}
      <div className="space-y-1">
        {presets.map((p) => (
          <div
            key={p.name}
            className={`flex items-center justify-between px-2 py-1.5 rounded transition cursor-pointer
              ${activePreset === p.name ? 'bg-studio-accent/20 ring-1 ring-studio-accent/30' : 'bg-studio-panel/30 hover:bg-studio-panel/50'}`}
            onClick={() => loadPreset(p.name)}
          >
            <div className="flex items-center gap-2">
              <span>{builtInNames.includes(p.name) ? '📌' : '📁'}</span>
              <span className="text-studio-text font-medium">{p.name}</span>
              <span className="text-[10px] text-studio-muted">→ {p.activeTab}</span>
            </div>
            <div className="flex items-center gap-1">
              {activePreset === p.name && (
                <span className="text-studio-accent text-[10px]">Active</span>
              )}
              {!builtInNames.includes(p.name) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePreset(p.name);
                  }}
                  className="text-red-400 text-[10px] hover:text-red-300"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save new */}
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="New preset name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 px-2 py-1 bg-studio-panel/40 rounded text-[10px] text-studio-text placeholder-studio-muted border border-studio-border/20 focus:border-studio-accent/40 outline-none"
        />
        <button
          onClick={() => {
            if (newName.trim()) {
              savePreset(newName.trim(), 'safety' as PanelTab, true);
              setNewName('');
            }
          }}
          disabled={!newName.trim()}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition text-[10px] disabled:opacity-50"
        >
          + Save
        </button>
      </div>
    </div>
  );
}
