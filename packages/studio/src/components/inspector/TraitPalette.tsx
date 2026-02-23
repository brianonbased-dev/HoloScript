'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, X, Zap } from 'lucide-react';
import { useEditorStore, useSceneGraphStore } from '@/lib/store';

// ─── Trait catalog ─────────────────────────────────────────────────────────────
// A representative sample of HoloScript traits organized by category.
// In production this should be imported from @holoscript/core trait constants.

const TRAIT_CATALOG: Array<{
  category: string;
  color: string;
  traits: Array<{ name: string; description: string; defaultProps: Record<string, unknown> }>;
}> = [
  {
    category: 'Physics',
    color: 'text-blue-400',
    traits: [
      { name: 'physics', description: 'Rigid body physics simulation', defaultProps: { mass: 1.0, gravity: 9.8, friction: 0.5, restitution: 0.3 } },
      { name: 'collider', description: 'Collision detection shape', defaultProps: { shape: 'box', trigger: false } },
      { name: 'buoyancy', description: 'Float on fluid surfaces', defaultProps: { fluid_density: 1000, damping: 0.5 } },
      { name: 'wind_reactive', description: 'Responds to wind forces', defaultProps: { drag: 0.1, turbulence: 0.05 } },
    ],
  },
  {
    category: 'AI & NPCs',
    color: 'text-green-400',
    traits: [
      { name: 'ai_npc', description: 'Autonomous NPC behavior', defaultProps: { behavior: 'idle', patrol: false, detection_range: 10 } },
      { name: 'llm_agent', description: 'LLM-powered AI agent', defaultProps: { model: 'gpt-4', system_prompt: '', bounded_autonomy: true, max_actions_per_turn: 3 } },
      { name: 'pathfinding', description: 'A* navigation mesh pathfinding', defaultProps: { speed: 3.5, stop_distance: 0.5 } },
      { name: 'flocking', description: 'Boid-style group movement', defaultProps: { cohesion: 1.0, separation: 1.5, alignment: 1.0 } },
      { name: 'dialogue', description: 'Branching conversation trees', defaultProps: { trigger_range: 3, auto_trigger: false } },
    ],
  },
  {
    category: 'Visual',
    color: 'text-purple-400',
    traits: [
      { name: 'gaussian_splat', description: '3D Gaussian Splatting renderer', defaultProps: { source: '', quality: 'medium', sh_degree: 3, sort_mode: 'distance' } },
      { name: 'particle_system', description: 'GPU particle emitter', defaultProps: { emit_rate: 100, lifetime: 2.0, spread: 30 } },
      { name: 'trail', description: 'Motion trail renderer', defaultProps: { length: 50, width: 0.1, color: '#ffffff' } },
      { name: 'outline', description: 'Silhouette outline effect', defaultProps: { thickness: 2, color: '#ff6600' } },
      { name: 'glow', description: 'Bloom / glow emissive effect', defaultProps: { intensity: 1.5, color: '#ffffff', radius: 0.4 } },
      { name: 'holographic', description: 'Holographic scanline shader', defaultProps: { scan_speed: 2.0, opacity: 0.8, color: '#00ffff' } },
    ],
  },
  {
    category: 'Audio',
    color: 'text-pink-400',
    traits: [
      { name: 'audio_source', description: 'Spatial 3D audio emitter', defaultProps: { src: '', volume: 1.0, loop: false, spatial: true, max_distance: 20 } },
      { name: 'audio_reactive', description: 'React to audio amplitude', defaultProps: { sensitivity: 1.0, property: 'scale' } },
      { name: 'footstep_sounds', description: 'Surface-aware footstep audio', defaultProps: { volume: 0.7, surface_detection: true } },
    ],
  },
  {
    category: 'Interaction',
    color: 'text-yellow-400',
    traits: [
      { name: 'grabbable', description: 'Can be grabbed in VR/AR', defaultProps: { two_handed: false, throw_enabled: true } },
      { name: 'interactable', description: 'Generic interaction trigger', defaultProps: { range: 2.0, highlight: true } },
      { name: 'clickable', description: 'Click/tap interaction', defaultProps: { cursor_change: true } },
      { name: 'hoverable', description: 'Hover detection and events', defaultProps: { scale_on_hover: 1.05, highlight_color: '#ffffff' } },
    ],
  },
  {
    category: 'VR / XR',
    color: 'text-cyan-400',
    traits: [
      { name: 'vr_teleport_target', description: 'VR locomotion landing point', defaultProps: { enabled: true, indicator_color: '#00ff88' } },
      { name: 'hand_tracked', description: 'Hand tracking input binding', defaultProps: { hand: 'both', gesture: 'pinch' } },
      { name: 'spatial_anchor', description: 'World-locked anchor point', defaultProps: { persist: false } },
      { name: 'passthrough', description: 'AR passthrough layer', defaultProps: { opacity: 1.0 } },
    ],
  },
  {
    category: 'Navigation',
    color: 'text-orange-400',
    traits: [
      { name: 'navmesh', description: 'Navigation mesh surface', defaultProps: { agent_height: 2.0, agent_radius: 0.4, walkable: true } },
      { name: 'waypoint', description: 'Waypoint on a patrol route', defaultProps: { wait_time: 1.0, order: 0 } },
      { name: 'vehicle', description: 'Drivable ground vehicle', defaultProps: { max_speed: 15, acceleration: 5, steering: 45 } },
      { name: 'hover_vehicle', description: 'Anti-gravity hover drive', defaultProps: { hover_height: 0.8, thrust: 10, drift_factor: 0.2 } },
    ],
  },
  {
    category: 'Combat',
    color: 'text-red-400',
    traits: [
      { name: 'health', description: 'Health points + damage system', defaultProps: { max_hp: 100, current_hp: 100, invincible: false } },
      { name: 'weapon', description: 'Weapon damage dealer', defaultProps: { damage: 25, fire_rate: 1.0, ammo: 30 } },
      { name: 'armor', description: 'Damage absorption layer', defaultProps: { defense: 10, absorb_percent: 0.2 } },
      { name: 'hitbox', description: 'Damage receiver region', defaultProps: { multiplier: 1.0, critical: false } },
    ],
  },
  {
    category: 'Animation',
    color: 'text-teal-400',
    traits: [
      { name: 'animator', description: 'State machine animation controller', defaultProps: { default_clip: 'idle', auto_play: true } },
      { name: 'rotate', description: 'Continuous rotation', defaultProps: { speed_x: 0, speed_y: 45, speed_z: 0 } },
      { name: 'bob', description: 'Sine-wave bobbing motion', defaultProps: { amplitude: 0.2, frequency: 1.0, axis: 'y' } },
      { name: 'billboard', description: 'Always faces camera', defaultProps: { lock_y: true } },
    ],
  },
  {
    category: 'Environment',
    color: 'text-lime-400',
    traits: [
      { name: 'water', description: 'Fluid surface with waves', defaultProps: { wave_height: 0.3, wave_speed: 1.0, color: '#006994' } },
      { name: 'wind_zone', description: 'Wind force field', defaultProps: { strength: 5.0, turbulence: 0.2, direction_x: 1.0 } },
      { name: 'foliage', description: 'Animated foliage shader', defaultProps: { sway_amount: 0.1, sway_speed: 1.0 } },
      { name: 'weather', description: 'Dynamic weather system', defaultProps: { type: 'clear', intensity: 0.5 } },
    ],
  },
];

// ─── TraitPalette ─────────────────────────────────────────────────────────────

interface TraitPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function TraitPalette({ open, onClose }: TraitPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const nodes = useSceneGraphStore((s) => s.nodes);

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const existingTraitNames = new Set(selectedNode?.traits.map((t) => t.name) ?? []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filteredCatalog = useMemo(() => {
    const q = query.toLowerCase().trim();
    return TRAIT_CATALOG.map((cat) => ({
      ...cat,
      traits: cat.traits.filter(
        (t) =>
          (!activeCategory || cat.category === activeCategory) &&
          (q === '' || t.name.includes(q) || t.description.toLowerCase().includes(q))
      ),
    })).filter((cat) => cat.traits.length > 0);
  }, [query, activeCategory]);

  const handleAdd = useCallback(
    (traitName: string, defaultProps: Record<string, unknown>) => {
      if (!selectedId) return;
      addTrait(selectedId, { name: traitName, properties: defaultProps });
      onClose();
    },
    [selectedId, addTrait, onClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative flex h-[70vh] w-[700px] max-w-[95vw] flex-col rounded-2xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-studio-border px-4 py-3">
          <Zap className="h-5 w-5 text-studio-accent" />
          <span className="font-semibold text-studio-text">Add Trait</span>
          {selectedNode && (
            <span className="text-sm text-studio-muted">→ {selectedNode.name}</span>
          )}
          <div className="relative ml-auto flex-1 max-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-studio-muted" />
            <input
              autoFocus
              type="text"
              placeholder="Search traits..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-studio-border bg-studio-surface py-1.5 pl-8 pr-3 text-sm text-studio-text outline-none focus:border-studio-accent"
            />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-studio-muted hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Category sidebar */}
          <div className="w-40 shrink-0 overflow-y-auto border-r border-studio-border py-2">
            <button
              onClick={() => setActiveCategory(null)}
              className={`w-full px-3 py-1.5 text-left text-xs transition ${
                !activeCategory ? 'bg-studio-accent/10 text-studio-accent' : 'text-studio-muted hover:text-studio-text hover:bg-studio-surface'
              }`}
            >
              All Categories
            </button>
            {TRAIT_CATALOG.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setActiveCategory(cat.category === activeCategory ? null : cat.category)}
                className={`w-full px-3 py-1.5 text-left text-xs transition ${
                  activeCategory === cat.category
                    ? 'bg-studio-accent/10 text-studio-accent'
                    : 'text-studio-muted hover:text-studio-text hover:bg-studio-surface'
                }`}
              >
                {cat.category}
              </button>
            ))}
          </div>

          {/* Trait grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredCatalog.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-studio-muted">
                No traits match &quot;{query}&quot;
              </div>
            ) : (
              filteredCatalog.map((cat) => (
                <div key={cat.category} className="mb-4">
                  <div className={`mb-2 text-[10px] font-semibold uppercase tracking-widest ${cat.color}`}>
                    {cat.category}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {cat.traits.map((trait) => {
                      const alreadyAdded = existingTraitNames.has(trait.name);
                      return (
                        <button
                          key={trait.name}
                          disabled={alreadyAdded}
                          onClick={() => handleAdd(trait.name, trait.defaultProps)}
                          className={`group flex flex-col items-start rounded-lg border p-3 text-left transition ${
                            alreadyAdded
                              ? 'border-studio-border bg-studio-surface/30 opacity-50 cursor-not-allowed'
                              : 'border-studio-border bg-studio-surface hover:border-studio-accent hover:shadow-md hover:shadow-studio-accent/10 cursor-pointer'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className={`text-xs font-semibold ${cat.color}`}>@{trait.name}</span>
                            {alreadyAdded && (
                              <span className="text-[10px] text-studio-muted">Added</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] leading-tight text-studio-muted">
                            {trait.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
