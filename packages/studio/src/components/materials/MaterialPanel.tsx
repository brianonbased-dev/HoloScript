'use client';

/**
 * MaterialPanel — PBR material preset picker with live @material trait codegen.
 * Sliders for albedo, roughness, metallic, emissive, opacity.
 */

import { useState, useEffect } from 'react';
import { Palette, X, Search, Copy, Plus, ChevronDown } from 'lucide-react';
import { useSceneStore, useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { logger } from '@/lib/logger';

interface MaterialPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  color: string;
  albedo: string;
  roughness: number;
  metallic: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  traitSnippet: string;
}

function buildSnippet(p: {
  albedo: string;
  roughness: number;
  metallic: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}): string {
  const lines = [
    `    albedo: "${p.albedo}"`,
    `    roughness: ${p.roughness.toFixed(2)}`,
    `    metallic: ${p.metallic.toFixed(2)}`,
  ];
  if (p.emissive && p.emissiveIntensity) {
    lines.push(`    emissive: "${p.emissive}"`);
    lines.push(`    emissiveIntensity: ${p.emissiveIntensity.toFixed(1)}`);
  }
  if (p.opacity !== undefined && p.opacity < 1) lines.push(`    opacity: ${p.opacity.toFixed(2)}`);
  return `  @material {\n${lines.join('\n')}\n  }`;
}

interface MaterialPanelProps {
  onClose: () => void;
}

export function MaterialPanel({ onClose }: MaterialPanelProps) {
  const [presets, setPresets] = useState<MaterialPreset[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  // Custom tweaking state
  const [selected, setSelected] = useState<MaterialPreset | null>(null);
  const [albedo, setAlbedo] = useState('#ffffff');
  const [glossiness, setGlossiness] = useState(0.5); // 1.0 - roughness
  const [metallic, setMetallic] = useState(0.0);
  const [emissive, setEmissive] = useState('');
  const [emissiveInt, setEmissiveInt] = useState(2.0);
  const [opacity, setOpacity] = useState(1.0);
  const [copied, setCopied] = useState(false);

  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  // Scene connection for instant slider updates
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const applyTransientMaterial = useSceneGraphStore((s) => s.applyTransientMaterial);

  // Sync panel state seamlessly from the selected node's material trait
  useEffect(() => {
    if (selectedObjectId) {
      const node = nodes.find((n) => n.id === selectedObjectId);
      if (node) {
        const matTrait = node.traits.find((t) => t.name === 'material');
        if (matTrait?.properties) {
          const props = matTrait.properties as any;
          if (props.albedo) setAlbedo(props.albedo);
          if (props.color) setAlbedo(props.color);
          if (props.roughness !== undefined) setGlossiness(1.0 - props.roughness);
          if (props.metallic !== undefined) setMetallic(props.metallic);
          if (props.emissive) setEmissive(props.emissive);
          if (props.emissiveIntensity !== undefined) setEmissiveInt(props.emissiveIntensity);
          if (props.opacity !== undefined) setOpacity(props.opacity);
        }
      }
    }
  }, [selectedObjectId, nodes]);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/materials?category=${encodeURIComponent(activeCategory)}&q=${encodeURIComponent(q)}`
    )
      .then((r) => r.json())
      .then((d: { presets: MaterialPreset[]; categories: string[] }) => {
        setPresets(d.presets);
        if (d.categories?.length) setCategories(d.categories);
      })
      .catch((err) => logger.warn('Swallowed error caught:', err))
      .finally(() => setLoading(false));
  }, [activeCategory, q]);

  const loadPreset = (p: MaterialPreset) => {
    setSelected(p);
    setAlbedo(p.albedo);
    setGlossiness(1.0 - p.roughness);
    setMetallic(p.metallic);
    setEmissive(p.emissive ?? '');
    setEmissiveInt(p.emissiveIntensity ?? 2.0);
    setOpacity(p.opacity ?? 1.0);
  };

  const currentSnippet = buildSnippet({
    albedo,
    roughness: 1.0 - glossiness,
    metallic,
    emissive: emissive || undefined,
    emissiveIntensity: emissive ? emissiveInt : undefined,
    opacity,
  });

  const handleUpdate = (
    updates: Partial<{
      albedo: string;
      roughness: number;
      metallic: number;
      emissive: string;
      emissiveIntensity: number;
      opacity: number;
    }>
  ) => {
    if (selectedObjectId) {
      applyTransientMaterial(selectedObjectId, updates);
    }
  };

  const insert = () => {
    const name = selected?.name ?? 'Custom';
    setCode(code + `\nobject "${name}_Object" {\n${currentSnippet}\n}\n`);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(currentSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Palette className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Material Editor</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 space-y-1.5 border-b border-studio-border p-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search materials…"
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {['', ...categories].map((cat) => (
            <button
              key={cat || 'all'}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full border px-2 py-0.5 text-[9px] transition ${activeCategory === cat ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'}`}
            >
              {cat || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Preset swatches */}
      <div className="shrink-0 grid grid-cols-5 gap-1 border-b border-studio-border p-2.5">
        {loading && (
          <div className="col-span-5 py-4 text-center text-[9px] text-studio-muted animate-pulse">
            Loading…
          </div>
        )}
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => loadPreset(p)}
            title={p.name}
            className={`aspect-square rounded-lg border-2 transition ${selected?.id === p.id ? 'border-studio-accent scale-105' : 'border-studio-border hover:border-studio-accent/50'}`}
            style={{ backgroundColor: p.color }}
          />
        ))}
      </div>

      {/* Selected preset name */}
      {selected && (
        <div className="shrink-0 border-b border-studio-border px-3 py-1.5">
          <p className="text-[10px] font-semibold text-studio-text">{selected.name}</p>
          <p className="text-[8px] text-studio-muted">{selected.description}</p>
        </div>
      )}

      {/* Sliders */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3">
        {/* Color Tint / Albedo */}
        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] text-studio-muted">Color Tint</span>
            <div className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-full border border-studio-border"
                style={{ backgroundColor: albedo }}
              />
              <span className="font-mono text-[9px] text-studio-text">{albedo}</span>
            </div>
          </div>
          <input
            type="color"
            value={albedo}
            onChange={(e) => {
              setAlbedo(e.target.value);
              handleUpdate({ albedo: e.target.value });
            }}
            className="h-7 w-full cursor-pointer rounded-lg border border-studio-border"
          />
        </label>

        {/* Glossiness (Inverses Roughness) */}
        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] text-studio-muted">Glossiness</span>
            <span className="font-mono text-[9px] text-studio-text">
              {(glossiness * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={glossiness}
            onChange={(e) => {
              const val = Number(e.target.value);
              setGlossiness(val);
              handleUpdate({ roughness: 1.0 - val });
            }}
            className="w-full accent-studio-accent"
          />
        </label>

        {/* Metallic */}
        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] text-studio-muted">Metallic</span>
            <span className="font-mono text-[9px] text-studio-text">
              {(metallic * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={metallic}
            onChange={(e) => {
              const val = Number(e.target.value);
              setMetallic(val);
              handleUpdate({ metallic: val });
            }}
            className="w-full accent-studio-accent"
          />
        </label>

        {/* Emissive (toggle) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-studio-muted">Emissive</span>
            <button
              onClick={() => setEmissive(emissive ? '' : '#ffffff')}
              className={`ml-auto rounded-full border px-2 py-0.5 text-[8px] transition ${emissive ? 'border-studio-accent text-studio-accent' : 'border-studio-border text-studio-muted'}`}
            >
              {emissive ? 'ON' : 'OFF'}
            </button>
          </div>
          {emissive && (
            <>
              <input
                type="color"
                value={emissive}
                onChange={(e) => {
                  setEmissive(e.target.value);
                  handleUpdate({ emissive: e.target.value, emissiveIntensity: emissiveInt });
                }}
                className="h-7 w-full cursor-pointer rounded-lg border border-studio-border"
              />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-studio-muted">Intensity</span>
                <span className="font-mono text-[9px]">{emissiveInt.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={emissiveInt}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setEmissiveInt(val);
                  handleUpdate({ emissiveIntensity: val });
                }}
                className="w-full accent-studio-accent"
              />
            </>
          )}
        </div>

        {/* Opacity */}
        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] text-studio-muted">Opacity</span>
            <span className="font-mono text-[9px] text-studio-text">
              {(opacity * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => {
              const val = Number(e.target.value);
              setOpacity(val);
              handleUpdate({ opacity: val });
            }}
            className="w-full accent-studio-accent"
          />
        </label>

        {/* Live snippet preview */}
        <div className="rounded-xl border border-studio-border bg-studio-surface/50 p-2.5">
          <p className="mb-1 text-[8px] text-studio-muted">Generated trait</p>
          <pre className="overflow-x-auto text-[8px] text-studio-accent leading-relaxed">
            {currentSnippet}
          </pre>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-studio-border flex gap-1.5 p-2.5">
        <button
          onClick={insert}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-2 text-[10px] font-semibold text-white hover:brightness-110 transition"
        >
          <Plus className="h-3 w-3" /> Insert Object
        </button>
        <button
          onClick={copy}
          className={`flex items-center gap-1 rounded-xl border px-3 py-2 text-[9px] transition ${copied ? 'border-green-500/40 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
        >
          <Copy className="h-3 w-3" /> {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
