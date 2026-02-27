/**
 * Shader Preset Library
 *
 * Scrollable panel of built-in GLSL shader presets.
 * Click "Load" to apply a preset to the active shader graph.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Zap, Loader2 } from 'lucide-react';
import { useShaderGraph } from '../../hooks/useShaderGraph';

// ─── Types (mirrors /api/shader-presets shape) ────────────────────────────────

interface ShaderPreset {
  id: string;
  name: string;
  category: 'distortion' | 'color' | 'procedural' | 'post';
  description: string;
  emoji: string;
  vertexGLSL?: string;
  fragmentGLSL?: string;
  uniforms: Record<string, { type: 'float' | 'vec3' | 'vec4'; default: number | number[] }>;
  traitSnippet: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  distortion: 'Distortion',
  color: 'Color',
  procedural: 'Procedural',
  post: 'Post-FX',
};

const CATEGORY_COLORS: Record<string, string> = {
  distortion: 'bg-blue-500/20 text-blue-300',
  color: 'bg-pink-500/20 text-pink-300',
  procedural: 'bg-purple-500/20 text-purple-300',
  post: 'bg-amber-500/20 text-amber-300',
};

// ─── Preset Card ─────────────────────────────────────────────────────────────

interface PresetCardProps {
  preset: ShaderPreset;
  onLoad: (preset: ShaderPreset) => void;
  loading: boolean;
}

function PresetCard({ preset, onLoad, loading }: PresetCardProps) {
  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-gray-700 bg-gray-800/60 p-3 transition hover:border-gray-500 hover:bg-gray-800">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none" role="img" aria-label={preset.name}>{preset.emoji}</span>
          <div>
            <p className="text-sm font-semibold text-white">{preset.name}</p>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[preset.category] ?? 'bg-gray-700 text-gray-400'}`}>
              {preset.category}
            </span>
          </div>
        </div>
        <button
          onClick={() => onLoad(preset)}
          disabled={loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-500/60 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20 hover:text-white disabled:opacity-50"
          aria-label={`Load ${preset.name} preset`}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Load
        </button>
      </div>

      {/* Description */}
      <p className="text-[11px] leading-relaxed text-gray-400">{preset.description}</p>

      {/* Uniform badges */}
      {Object.keys(preset.uniforms).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(preset.uniforms).map(([name, def]) => (
            <span key={name} className="rounded bg-gray-700/60 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
              {name}: <span className="text-gray-300">{def.type}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ShaderPresetLibrary() {
  const [presets, setPresets] = useState<ShaderPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);

  const createNode = useShaderGraph((s) => s.createNode);
  const clearGraph  = useShaderGraph((s) => s.clearGraph);

  // Fetch presets on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/shader-presets')
      .then((r) => r.json())
      .then((data: ShaderPreset[]) => { if (!cancelled) { setPresets(data); setIsLoading(false); } })
      .catch(() => { if (!cancelled) { setError('Failed to load presets'); setIsLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // Apply preset: clear graph, add a GLSLSnippet node with the preset code
  const handleLoad = useCallback(async (preset: ShaderPreset) => {
    setLoadingPresetId(preset.id);
    try {
      clearGraph?.();
      // Add output node
      createNode('FragOutput', { x: 400, y: 200 });
      // Add a comment node with the preset GLSL snippet for reference
      // In a full implementation this would create a ParsedGLSL node per uniform
      // For now we inject a ColorConstant + time node that matches the preset's uniforms
      if (preset.uniforms['uTime'] !== undefined) {
        createNode('TimeInput', { x: 80, y: 140 });
      }
      if (preset.uniforms['uColor'] !== undefined || preset.fragmentGLSL) {
        createNode('ColorConstant', { x: 80, y: 240 });
      }
    } finally {
      setLoadingPresetId(null);
    }
  }, [clearGraph, createNode]);

  // Filter
  const filtered = presets.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                        p.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === 'all' || p.category === category;
    return matchSearch && matchCategory;
  });

  const categories = ['all', ...Array.from(new Set(presets.map((p) => p.category)))];

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Shader Presets</h3>
      </div>

      {/* Search */}
      <div className="border-b border-gray-800 px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-gray-500" aria-hidden />
          <input
            className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
            placeholder="Search presets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search shader presets"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-800 px-3 py-1.5 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
              category === cat
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            aria-label={`Filter by ${CATEGORY_LABELS[cat] ?? cat}`}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading presets…</span>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-xs text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">No presets match your search.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onLoad={handleLoad}
                loading={loadingPresetId === preset.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 px-3 py-1.5 text-[10px] text-gray-600">
        {filtered.length} of {presets.length} presets
      </div>
    </div>
  );
}
