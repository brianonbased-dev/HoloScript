'use client';

/**
 * EnvironmentPanel — sky/fog/ambient preset picker + live @environment codegen.
 */

import { useEffect, useState } from 'react';
import { Sun, X, Copy, Plus, CheckCircle2, Trash2 } from 'lucide-react';
import { useEnvironment } from '@/hooks/useEnvironment';
import type { EnvironmentPreset } from '@/app/api/environment-presets/route';

const CATEGORY_COLORS: Record<string, string> = {
  outdoor: '#ffaa44',
  indoor: '#88ccff',
  space: '#aa66ff',
  fantasy: '#44ffaa',
  abstract: '#ff44aa',
};

const SKY_ICON: Record<string, string> = {
  procedural: '🌤',
  hdri: '🌐',
  solid: '🎨',
};

interface EnvironmentPanelProps {
  onClose: () => void;
}

export function EnvironmentPanel({ onClose }: EnvironmentPanelProps) {
  const [presets, setPresets] = useState<EnvironmentPreset[]>([]);
  const [selected, setSelected] = useState<EnvironmentPreset | null>(null);
  const [activeCategory, setActiveCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const { hasEnvironment, rawBlock, applyPreset, removeEnvironment } = useEnvironment();

  useEffect(() => {
    fetch(`/api/environment-presets${activeCategory ? `?category=${activeCategory}` : ''}`)
      .then((r) => r.json())
      .then((d: { presets: EnvironmentPreset[]; categories: string[] }) => {
        setPresets(d.presets);
        setCategories(d.categories);
        if (!selected && d.presets[0]) setSelected(d.presets[0]);
      })
      .catch(() => {});
  }, [activeCategory]);

  const apply = () => {
    if (selected) applyPreset(selected.traitSnippet);
  };

  const copy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(`environment {\n${selected.traitSnippet}\n}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Sun className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Environment Builder</span>
        {hasEnvironment && (
          <span className="rounded-full bg-green-600/20 px-1.5 py-0.5 text-[7px] text-green-400">
            Active
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Active environment banner */}
      {hasEnvironment && (
        <div className="shrink-0 border-b border-studio-border bg-green-950/30 px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          <p className="flex-1 text-[8px] text-green-300">Scene has an environment block</p>
          <button
            onClick={removeEnvironment}
            className="flex items-center gap-1 rounded-lg border border-red-900/40 px-2 py-1 text-[8px] text-red-400 hover:bg-red-900/20 transition"
          >
            <Trash2 className="h-2.5 w-2.5" /> Remove
          </button>
        </div>
      )}

      {/* Category filter */}
      <div className="shrink-0 flex gap-1 overflow-x-auto border-b border-studio-border px-2 py-1.5">
        <button
          onClick={() => setActiveCategory('')}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] transition ${!activeCategory ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] capitalize transition ${activeCategory === cat ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Preset grid */}
      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-1.5 p-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition ${selected?.id === p.id ? 'border-studio-accent bg-studio-accent/10' : 'border-studio-border bg-studio-surface hover:border-studio-accent/40'}`}
          >
            <div className="flex w-full items-center gap-1.5">
              <span className="text-base">{p.emoji}</span>
              <span className="flex-1 text-[9px] font-semibold truncate">{p.name}</span>
            </div>
            <p className="text-[7px] text-studio-muted leading-snug line-clamp-2">
              {p.description}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[8px]">{SKY_ICON[p.sky.type]}</span>
              {p.fog.enabled && <span className="text-[7px] text-studio-muted">fog</span>}
              <div
                className="ml-auto h-2.5 w-2.5 rounded-full border border-white/10"
                style={{ backgroundColor: p.ambient.color }}
              />
            </div>
          </button>
        ))}
      </div>

      {/* Selected detail + actions */}
      {selected && (
        <div className="shrink-0 border-t border-studio-border space-y-2 p-2.5">
          {/* Sky/Fog/Ambient chips */}
          <div className="flex flex-wrap gap-1.5">
            <span
              className="rounded-full border border-studio-border px-2 py-0.5 text-[7px]"
              style={{
                borderColor: CATEGORY_COLORS[selected.category] ?? '#888',
                color: CATEGORY_COLORS[selected.category] ?? '#888',
              }}
            >
              {selected.category}
            </span>
            <span className="rounded-full border border-studio-border px-2 py-0.5 text-[7px] text-studio-muted">
              {SKY_ICON[selected.sky.type]} {selected.sky.type}
            </span>
            <span className="rounded-full border border-studio-border px-2 py-0.5 text-[7px] text-studio-muted">
              {selected.fog.enabled ? `fog ${selected.fog.type}` : 'no fog'}
            </span>
            <span className="flex items-center gap-1 rounded-full border border-studio-border px-2 py-0.5 text-[7px] text-studio-muted">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: selected.ambient.color }}
              />
              {selected.ambient.intensity.toFixed(1)}×
            </span>
          </div>

          {/* Snippet preview */}
          <pre className="text-[7px] text-studio-muted/70 bg-studio-surface/50 rounded-lg p-1.5 max-h-16 overflow-x-auto leading-relaxed">
            {selected.traitSnippet.trim()}
          </pre>

          {/* Buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={apply}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-studio-accent py-2 text-[10px] font-semibold text-white hover:brightness-110 transition"
            >
              <Plus className="h-3 w-3" />
              {hasEnvironment ? 'Replace Environment' : 'Apply to Scene'}
            </button>
            <button
              onClick={copy}
              className={`flex items-center gap-1 rounded-xl border px-2.5 py-2 text-[9px] transition ${copied ? 'border-green-500/40 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
            >
              <Copy className="h-3 w-3" /> {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
