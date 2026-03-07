'use client';
/**
 * ModelViewerPanel — 3D model browser and preview
 *
 * Browse GLTF/GLB models, preview thumbnails, and insert into viewport.
 * Connects to useAssetLibrary for catalog and useStudioBus for viewport insertion.
 */
import React, { useState, useCallback } from 'react';
import { useStudioBus } from '../../hooks/useStudioBus';

// ─── Built-in model catalog (demo, no API needed) ──────────────────

interface ModelEntry {
  id: string;
  name: string;
  icon: string;
  category: 'character' | 'environment' | 'prop' | 'vehicle' | 'nature';
  format: string;
  polyCount: string;
  description: string;
}

const MODEL_CATALOG: ModelEntry[] = [
  // Characters
  { id: 'mdl-hero', name: 'Hero Knight', icon: '🦸', category: 'character', format: 'GLB', polyCount: '12K', description: 'Armored knight with sword and shield' },
  { id: 'mdl-npc', name: 'Town NPC', icon: '🧑', category: 'character', format: 'GLB', polyCount: '5K', description: 'Generic NPC with dialogue animations' },
  { id: 'mdl-robot', name: 'Service Bot', icon: '🤖', category: 'character', format: 'GLB', polyCount: '8K', description: 'Utility robot with walk cycle' },
  // Environment
  { id: 'mdl-house', name: 'Medieval House', icon: '🏠', category: 'environment', format: 'GLB', polyCount: '15K', description: 'Half-timber house with interior' },
  { id: 'mdl-castle', name: 'Castle Tower', icon: '🏰', category: 'environment', format: 'GLB', polyCount: '22K', description: 'Fortified tower with battlements' },
  { id: 'mdl-bridge', name: 'Stone Bridge', icon: '🌉', category: 'environment', format: 'GLB', polyCount: '6K', description: 'Arched stone bridge' },
  // Props
  { id: 'mdl-chest', name: 'Treasure Chest', icon: '📦', category: 'prop', format: 'GLB', polyCount: '2K', description: 'Openable chest with loot' },
  { id: 'mdl-barrel', name: 'Barrel', icon: '🛢️', category: 'prop', format: 'GLB', polyCount: '800', description: 'Wooden barrel, destructible' },
  { id: 'mdl-torch', name: 'Wall Torch', icon: '🔥', category: 'prop', format: 'GLB', polyCount: '1K', description: 'Animated flame torch' },
  { id: 'mdl-sign', name: 'Wooden Sign', icon: '🪧', category: 'prop', format: 'GLB', polyCount: '500', description: 'Customizable text sign' },
  // Vehicles
  { id: 'mdl-cart', name: 'Horse Cart', icon: '🐴', category: 'vehicle', format: 'GLB', polyCount: '6K', description: 'Medieval transport cart' },
  { id: 'mdl-ship', name: 'Sailing Ship', icon: '⛵', category: 'vehicle', format: 'GLB', polyCount: '18K', description: 'Three-masted galleon' },
  // Nature
  { id: 'mdl-tree', name: 'Oak Tree', icon: '🌳', category: 'nature', format: 'GLB', polyCount: '3K', description: 'LOD-ready deciduous tree' },
  { id: 'mdl-rock', name: 'Rock Formation', icon: '🪨', category: 'nature', format: 'GLB', polyCount: '4K', description: 'Modular rock cluster' },
  { id: 'mdl-flower', name: 'Flower Patch', icon: '🌸', category: 'nature', format: 'GLB', polyCount: '1.5K', description: 'Animated wildflowers' },
];

const CATEGORIES = ['all', 'character', 'environment', 'prop', 'vehicle', 'nature'] as const;
const CAT_ICONS: Record<string, string> = { all: '📋', character: '🧑', environment: '🏠', prop: '📦', vehicle: '🚗', nature: '🌳' };

export function ModelViewerPanel() {
  const { emit } = useStudioBus();
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ModelEntry | null>(null);

  const filtered = MODEL_CATALOG.filter(m => {
    if (category !== 'all' && m.category !== category) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const insertToViewport = useCallback((model: ModelEntry) => {
    emit('viewport:entity-added', {
      id: `model-${model.id}-${Date.now()}`,
      name: model.name,
      type: 'box', // Placeholder geometry until real GLB loading
      position: [Math.random() * 6 - 3, 0, Math.random() * 6 - 3],
      modelId: model.id,
      format: model.format,
    });
  }, [emit]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📐 Models</h3>
        <span className="text-[10px] text-studio-muted">{filtered.length} models</span>
      </div>

      {/* Search */}
      <input type="text" placeholder="Search models..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full px-2 py-1 bg-studio-panel/40 rounded text-[10px] text-studio-text placeholder-studio-muted border border-studio-border/20 focus:border-studio-accent/40 outline-none" />

      {/* Category filter */}
      <div className="flex gap-0.5 overflow-x-auto">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={`px-1.5 py-0.5 rounded text-[10px] capitalize whitespace-nowrap transition
              ${category === c ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-panel/30 text-studio-muted hover:text-studio-text'}`}>
            {CAT_ICONS[c]} {c}
          </button>
        ))}
      </div>

      {/* Model grid */}
      <div className="grid grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto">
        {filtered.map(m => (
          <button key={m.id} onClick={() => setSelected(m)}
            className={`flex flex-col items-center p-2 rounded transition text-[10px]
              ${selected?.id === m.id ? 'bg-studio-accent/15 ring-1 ring-studio-accent/30' : 'bg-studio-panel/30 hover:bg-studio-panel/50'}`}>
            <span className="text-xl mb-0.5">{m.icon}</span>
            <span className="text-studio-text font-medium truncate w-full text-center">{m.name}</span>
            <span className="text-studio-muted text-[9px]">{m.polyCount} · {m.format}</span>
          </button>
        ))}
      </div>

      {/* Selected model detail */}
      {selected && (
        <div className="bg-studio-panel/30 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-studio-text font-medium">{selected.icon} {selected.name}</span>
            <span className="text-[10px] text-studio-muted capitalize">{selected.category}</span>
          </div>
          <p className="text-[10px] text-studio-muted">{selected.description}</p>
          <div className="flex items-center gap-2 text-[10px] text-studio-muted">
            <span>🔺 {selected.polyCount} polys</span>
            <span>📁 {selected.format}</span>
          </div>
          <button onClick={() => insertToViewport(selected)}
            className="w-full px-2 py-1.5 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition text-[10px] font-medium">
            ➕ Insert into Viewport
          </button>
        </div>
      )}
    </div>
  );
}
