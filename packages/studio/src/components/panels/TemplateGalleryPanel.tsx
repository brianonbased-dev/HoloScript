'use client';
/**
 * TemplateGalleryPanel — Browse and insert scene/character/environment presets
 *
 * Provides a visual grid of ready-made templates organized by category.
 * Clicking a template emits events to populate the viewport and relevant panels.
 */
import React, { useState, useCallback } from 'react';
import { useStudioBus } from '../../hooks/useStudioBus';

// ─── Template definitions ───────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  icon: string;
  category: 'scene' | 'character' | 'environment' | 'ui' | 'vfx';
  description: string;
  entities: number;
  complexity: 'simple' | 'medium' | 'complex';
  tags: string[];
}

const TEMPLATES: Template[] = [
  // Scenes
  { id: 'tpl-rpg-village', name: 'RPG Village', icon: '🏘️', category: 'scene', description: 'Medieval village with NPCs, shops, and quest givers', entities: 24, complexity: 'complex', tags: ['game', 'rpg'] },
  { id: 'tpl-fps-arena', name: 'FPS Arena', icon: '🎯', category: 'scene', description: 'Competitive arena with spawn points and pickups', entities: 18, complexity: 'medium', tags: ['game', 'fps'] },
  { id: 'tpl-space-station', name: 'Space Station', icon: '🛸', category: 'scene', description: 'Sci-fi station with airlocks and zero-G zones', entities: 30, complexity: 'complex', tags: ['sci-fi', 'vr'] },
  { id: 'tpl-vr-lobby', name: 'VR Lobby', icon: '🥽', category: 'scene', description: 'Social VR hub with portals and avatar mirrors', entities: 12, complexity: 'simple', tags: ['vr', 'social'] },
  // Characters
  { id: 'tpl-party-rpg', name: 'RPG Party', icon: '⚔️', category: 'character', description: 'Warrior, mage, healer, rogue — classic 4-member party', entities: 4, complexity: 'medium', tags: ['game', 'rpg'] },
  { id: 'tpl-crowd', name: 'Crowd Pack', icon: '👥', category: 'character', description: '20 unique crowd NPCs with idle animations', entities: 20, complexity: 'complex', tags: ['game', 'film'] },
  { id: 'tpl-avatar-pack', name: 'Avatar Pack', icon: '🧑', category: 'character', description: '8 customizable VR-ready avatars', entities: 8, complexity: 'medium', tags: ['vr', 'social'] },
  // Environments
  { id: 'tpl-forest', name: 'Enchanted Forest', icon: '🌲', category: 'environment', description: 'Dense forest with fog, wildlife, and ambient sound', entities: 40, complexity: 'complex', tags: ['game', 'nature'] },
  { id: 'tpl-dungeon', name: 'Dungeon Kit', icon: '🏰', category: 'environment', description: 'Modular dungeon pieces with traps and secrets', entities: 35, complexity: 'complex', tags: ['game', 'rpg'] },
  { id: 'tpl-city', name: 'Cyberpunk City', icon: '🌃', category: 'environment', description: 'Neon-lit cityscape with rain and holograms', entities: 50, complexity: 'complex', tags: ['sci-fi', 'film'] },
  { id: 'tpl-island', name: 'Tropical Island', icon: '🏝️', category: 'environment', description: 'Beach, palms, ocean, and underwater coral', entities: 28, complexity: 'medium', tags: ['game', 'nature'] },
  // UI
  { id: 'tpl-hud', name: 'Game HUD', icon: '📟', category: 'ui', description: 'Health bar, minimap, hotbar, and quest tracker', entities: 6, complexity: 'medium', tags: ['game', 'ui'] },
  { id: 'tpl-menu', name: 'Main Menu', icon: '📋', category: 'ui', description: 'Animated main menu with settings and credits', entities: 4, complexity: 'simple', tags: ['game', 'ui'] },
  // VFX
  { id: 'tpl-magic', name: 'Magic Spells', icon: '🪄', category: 'vfx', description: 'Fire, ice, lightning, and heal spell effects', entities: 8, complexity: 'medium', tags: ['game', 'vfx'] },
  { id: 'tpl-weather', name: 'Weather System', icon: '🌦️', category: 'vfx', description: 'Rain, snow, fog, and thunderstorm effects', entities: 5, complexity: 'medium', tags: ['game', 'environment'] },
];

const CATEGORIES = ['all', 'scene', 'character', 'environment', 'ui', 'vfx'] as const;
const CAT_ICONS: Record<string, string> = { all: '📋', scene: '🎭', character: '🧑', environment: '🌍', ui: '📟', vfx: '✨' };
const COMPLEXITY_COLORS: Record<string, string> = { simple: '#22c55e', medium: '#eab308', complex: '#ef4444' };

export function TemplateGalleryPanel() {
  const { emit } = useStudioBus();
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Template | null>(null);

  const filtered = TEMPLATES.filter(t => {
    if (category !== 'all' && t.category !== category) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.tags.some(tag => tag.includes(search.toLowerCase()))) return false;
    return true;
  });

  const applyTemplate = useCallback((tpl: Template) => {
    emit('template:applied', { id: tpl.id, name: tpl.name, category: tpl.category, entities: tpl.entities });
    emit('viewport:invalidate', { template: tpl.id });
  }, [emit]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🎨 Templates</h3>
        <span className="text-[10px] text-studio-muted">{filtered.length} templates</span>
      </div>

      {/* Search */}
      <input type="text" placeholder="Search templates..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full px-2 py-1 bg-studio-panel/40 rounded text-[10px] text-studio-text placeholder-studio-muted border border-studio-border/20 focus:border-studio-accent/40 outline-none" />

      {/* Category tabs */}
      <div className="flex gap-0.5 overflow-x-auto">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={`px-1.5 py-0.5 rounded text-[10px] capitalize whitespace-nowrap transition
              ${category === c ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-panel/30 text-studio-muted hover:text-studio-text'}`}>
            {CAT_ICONS[c]} {c}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {filtered.map(t => (
          <button key={t.id} onClick={() => setSelected(t)}
            className={`w-full flex items-center gap-2 p-2 rounded transition text-left
              ${selected?.id === t.id ? 'bg-studio-accent/15 ring-1 ring-studio-accent/30' : 'bg-studio-panel/30 hover:bg-studio-panel/50'}`}>
            <span className="text-xl flex-shrink-0">{t.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-studio-text font-medium truncate">{t.name}</span>
                <span className="text-[8px] px-1 rounded" style={{ backgroundColor: `${COMPLEXITY_COLORS[t.complexity]}22`, color: COMPLEXITY_COLORS[t.complexity] }}>{t.complexity}</span>
              </div>
              <p className="text-[9px] text-studio-muted truncate">{t.description}</p>
            </div>
            <span className="text-[10px] text-studio-muted flex-shrink-0">{t.entities}ⓔ</span>
          </button>
        ))}
      </div>

      {/* Selected template detail */}
      {selected && (
        <div className="bg-studio-panel/30 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-studio-text font-medium">{selected.icon} {selected.name}</span>
            <span className="text-[10px] capitalize" style={{ color: COMPLEXITY_COLORS[selected.complexity] }}>{selected.complexity}</span>
          </div>
          <p className="text-[10px] text-studio-muted">{selected.description}</p>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-studio-muted">🏷️ {selected.tags.join(', ')}</span>
            <span className="text-studio-muted">| {selected.entities} entities</span>
          </div>
          <button onClick={() => applyTemplate(selected)}
            className="w-full px-2 py-1.5 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition text-[10px] font-medium">
            🚀 Apply Template
          </button>
        </div>
      )}
    </div>
  );
}
