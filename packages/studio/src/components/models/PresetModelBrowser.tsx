'use client';

/**
 * PresetModelBrowser — Visual model palette with live 3D previews
 *
 * Each model is rendered as an actual spinning 3D mesh in a mini R3F canvas.
 * Click to insert the model into the scene.
 */

import { useState, useMemo } from 'react';
import { X, Search, Plus, Grid3x3 } from 'lucide-react';
import { useSceneStore } from '@/lib/store';
import { ModelPreviewCanvas } from '@/components/scene/ModelPreviewCanvas';
import {
  MODEL_PRESETS,
  searchPresets,
  modelCategories,
  type ModelPreset,
  type ModelCategory,
} from '@/lib/presetModels';

interface PresetModelBrowserProps {
  onClose?: () => void;
  onInsert?: (preset: ModelPreset) => void;
}

/**
 * Convert a model preset into HoloScript code the parser can compile to 3D.
 */
function presetToHoloScript(preset: ModelPreset): string {
  const p = preset.defaultParams;
  switch (preset.id) {
    case 'cube':
      return `cube @grabbable size: ${p.width ?? 1} color: #6366f1`;
    case 'sphere':
      return `sphere @grabbable radius: ${p.radius ?? 0.5} color: #3b82f6`;
    case 'cylinder':
      return `cylinder @grabbable radius: ${p.radius ?? 0.5} height: ${p.height ?? 1} color: #10b981`;
    case 'plane':
      return `plane size: ${p.width ?? 1} ${p.height ?? 1} material: "grid"`;
    case 'torus':
      return `torus @grabbable radius: ${p.radius ?? 0.5} color: #8b5cf6`;
    case 'cone':
      return `cone @grabbable radius: ${p.radius ?? 0.5} height: ${p.height ?? 1} color: #f59e0b`;
    case 'stairs':
      return `group "Stairs" {\n    cube @repeat(${p.steps ?? 10}) size: ${p.width ?? 1} ${p.stepHeight ?? 0.2} ${p.stepDepth ?? 0.3}\n  }`;
    case 'tree':
      return `cylinder "trunk" radius: ${p.trunkRadius ?? 0.15} height: ${p.trunkHeight ?? 2} color: #8B5E3C\n  sphere "canopy" @procedural radius: ${p.canopyRadius ?? 1.5} position: 0 ${p.trunkHeight ?? 2} 0 color: #22c55e`;
    case 'rock':
      return `sphere "rock" @procedural(roughness: ${p.roughness ?? 0.4}) size: ${p.size ?? 1} color: #6b7280`;
    case 'point-light':
      return `light type: point intensity: ${p.intensity ?? 1} color: ${p.color ?? '#ffffff'} position: 0 3 0`;
    case 'spot-light':
      return `light type: spot intensity: ${p.intensity ?? 1} color: ${p.color ?? '#ffffff'} angle: ${p.angle ?? 45}`;
    case 'area-light':
      return `light type: area intensity: ${p.intensity ?? 1} color: ${p.color ?? '#ffffff'} size: ${p.width ?? 2} ${p.height ?? 2}`;
    default:
      return `cube @grabbable size: 1 color: #6366f1`;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  primitive: '#6366f1',
  architecture: '#f59e0b',
  nature: '#22c55e',
  furniture: '#a855f7',
  lighting: '#fbbf24',
  vehicle: '#ef4444',
  vfx: '#ec4899',
};

function ModelCard({
  preset,
  onInsert,
}: {
  preset: ModelPreset;
  onInsert: (p: ModelPreset) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = CATEGORY_COLORS[preset.category] ?? '#6366f1';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-panel transition hover:border-studio-accent hover:shadow-lg hover:shadow-studio-accent/10"
    >
      {/* Live 3D preview */}
      <ModelPreviewCanvas
        modelType={preset.id}
        height={hovered ? 130 : 110}
        color={color}
        interactive={hovered}
        className="transition-all duration-300"
      />

      {/* Info */}
      <div className="p-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-studio-text">{preset.name}</p>
          <span className="rounded bg-studio-border/60 px-1 py-0.5 text-[8px] text-studio-muted">
            ~{preset.vertexEstimate} verts
          </span>
        </div>

        {/* Tags */}
        <div className="mt-1 flex gap-1">
          {preset.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-studio-accent/10 px-1.5 py-0.5 text-[8px] text-studio-accent"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Insert button */}
        <button
          onClick={() => onInsert(preset)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-studio-accent py-1.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100 hover:brightness-110"
        >
          <Plus className="h-3 w-3" />
          Add to Scene
        </button>
      </div>
    </div>
  );
}

export function PresetModelBrowser({ onClose, onInsert }: PresetModelBrowserProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ModelCategory | null>(null);
  const categories = modelCategories();

  const results = useMemo(() => {
    let list = query.trim() ? searchPresets(query) : MODEL_PRESETS;
    if (activeCategory) list = list.filter((p) => p.category === activeCategory);
    return list;
  }, [query, activeCategory]);

  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code);

  const handleInsert = (preset: ModelPreset) => {
    // Generate HoloScript code for this model and append to current scene
    const holoLine = presetToHoloScript(preset);

    if (code.trim()) {
      // Append to existing scene — insert before the closing brace
      const lastBrace = code.lastIndexOf('}');
      if (lastBrace > 0) {
        const updated = code.slice(0, lastBrace) + '  ' + holoLine + '\n' + code.slice(lastBrace);
        setCode(updated);
      } else {
        setCode(code + '\n' + holoLine);
      }
    } else {
      // Create a new scene with this model
      setCode(`scene "My Scene" {\n  ${holoLine}\n}`);
    }

    onInsert?.(preset);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Grid3x3 className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">3D Models</span>
        {onClose && (
          <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search + categories */}
      <div className="shrink-0 border-b border-studio-border p-2.5 space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-2 py-0.5 text-[9px] border transition ${
              !activeCategory
                ? 'border-studio-accent bg-studio-accent/20 text-studio-accent'
                : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`rounded-full px-2 py-0.5 text-[9px] border transition ${
                activeCategory === cat
                  ? 'border-studio-accent bg-studio-accent/20 text-studio-accent'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'
              }`}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full mr-1"
                style={{ background: CATEGORY_COLORS[cat] ?? '#888' }}
              />
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {results.length === 0 ? (
          <p className="py-8 text-center text-[10px] text-studio-muted">No models found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {results.map((preset) => (
              <ModelCard key={preset.id} preset={preset} onInsert={handleInsert} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
