'use client';

/**
 * TraitRegistryPanel — searchable catalog of all built-in @traits.
 * Reads from GET /api/trait-registry.
 */

import { useEffect, useState } from 'react';
import { Library, X, Search, Copy, Plus, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useSceneStore } from '@/lib/store';
import type { TraitEntry, TraitParam } from '@/app/api/trait-registry/route';

const CATEGORY_COLORS: Record<string, string> = {
  core: '#60a5fa', rendering: '#a78bfa', physics: '#fb923c',
  audio: '#34d399', animation: '#facc15', ai: '#f472b6',
  xr: '#22d3ee', performance: '#4ade80',
};

const PARAM_TYPE_LABELS: Record<string, string> = {
  string: 'str', number: 'num', boolean: 'bool',
  color: 'color', vector3: 'vec3', enum: 'enum',
};

interface TraitRegistryPanelProps { onClose: () => void; }

export function TraitRegistryPanel({ onClose }: TraitRegistryPanelProps) {
  const [traits, setTraits] = useState<TraitEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const code = useSceneStore((s) => s.code) ?? '';
  const setCode = useSceneStore((s) => s.setCode);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    if (query) params.set('q', query);
    fetch(`/api/trait-registry?${params}`)
      .then((r) => r.json())
      .then((d: { traits: TraitEntry[]; categories: string[] }) => {
        setTraits(d.traits);
        setCategories(d.categories);
      })
      .catch(() => {});
  }, [activeCategory, query]);

  const copySnippet = async (trait: TraitEntry) => {
    await navigator.clipboard.writeText(trait.snippet);
    setCopied(trait.id);
    setTimeout(() => setCopied(null), 1400);
  };

  const insertSnippet = (trait: TraitEntry) => {
    // Append to end of current file
    setCode(code + `\n${trait.snippet}\n`);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Library className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Trait Registry</span>
        <span className="ml-1 rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">
          {traits.length} traits
        </span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-studio-border p-2">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-studio-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search traits…"
            className="flex-1 bg-transparent text-[11px] text-studio-text placeholder:text-studio-muted outline-none"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="shrink-0 flex gap-1 overflow-x-auto border-b border-studio-border px-2 py-1.5">
        <button onClick={() => setActiveCategory('')}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] transition ${!activeCategory ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}>
          All
        </button>
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            style={activeCategory === cat ? { borderColor: CATEGORY_COLORS[cat], color: CATEGORY_COLORS[cat], backgroundColor: `${CATEGORY_COLORS[cat]}18` } : undefined}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] capitalize transition ${activeCategory !== cat ? 'border-studio-border text-studio-muted hover:text-studio-text' : ''}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Trait list */}
      <div className="flex-1 overflow-y-auto divide-y divide-studio-border/40">
        {traits.map((trait) => {
          const isExpanded = expanded === trait.id;
          const catCol = CATEGORY_COLORS[trait.category] ?? '#888';
          const wasCopied = copied === trait.id;
          return (
            <div key={trait.id}>
              {/* Trait row header */}
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-studio-surface/40 transition">
                <button onClick={() => setExpanded(isExpanded ? null : trait.id)}
                  className="flex flex-1 items-center gap-2 text-left">
                  {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 text-studio-muted" /> : <ChevronRight className="h-3 w-3 shrink-0 text-studio-muted" />}
                  <span className="text-sm">{trait.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono font-semibold truncate" style={{ color: catCol }}>{trait.name}</p>
                    <p className="text-[7px] text-studio-muted">{trait.params.length} params · since {trait.since}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[7px] capitalize"
                    style={{ backgroundColor: `${catCol}20`, color: catCol }}>
                    {trait.category}
                  </span>
                </button>
                <button onClick={() => copySnippet(trait)} title="Copy snippet"
                  className={`shrink-0 rounded p-1 transition ${wasCopied ? 'text-green-400' : 'text-studio-muted hover:text-studio-text'}`}>
                  {wasCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => insertSnippet(trait)} title="Insert into scene"
                  className="shrink-0 rounded p-1 text-studio-muted hover:text-studio-accent transition">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-10 pb-3 space-y-2.5">
                  <p className="text-[9px] text-studio-muted leading-snug">{trait.description}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {trait.tags.map((tag) => (
                      <span key={tag}
                        className="rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Params table */}
                  <div className="rounded-lg border border-studio-border overflow-hidden">
                    <div className="grid grid-cols-[auto_auto_1fr] bg-studio-surface text-[7px] uppercase tracking-widest text-studio-muted/60 px-2 py-1 gap-x-2">
                      <span>Param</span><span>Type</span><span>Description</span>
                    </div>
                    {trait.params.map((p: TraitParam) => (
                      <div key={p.name}
                        className="grid grid-cols-[auto_auto_1fr] px-2 py-1.5 gap-x-2 border-t border-studio-border/40 text-[8px] items-start">
                        <span className="font-mono text-studio-text">
                          {p.name}{p.required ? <span className="text-red-400">*</span> : ''}
                        </span>
                        <span className="rounded px-1 py-0.5 text-[7px]"
                          style={{ backgroundColor: `${catCol}18`, color: catCol }}>
                          {PARAM_TYPE_LABELS[p.type] ?? p.type}
                        </span>
                        <span className="text-studio-muted leading-snug">
                          {p.description}
                          {p.options && <span className="text-studio-muted/60"> ({p.options.join(', ')})</span>}
                          {p.default != null && <span className="text-studio-muted/60"> · default: {String(p.default)}</span>}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Snippet preview */}
                  <pre className="rounded-lg bg-studio-surface/60 p-2 text-[7px] text-studio-muted/70 overflow-x-auto leading-relaxed">
{trait.snippet.trim()}
                  </pre>

                  <button onClick={() => insertSnippet(trait)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-studio-accent py-2 text-[10px] font-semibold text-white hover:brightness-110 transition">
                    <Plus className="h-3 w-3" /> Insert into Scene
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {traits.length === 0 && (
          <div className="py-8 text-center text-[10px] text-studio-muted">
            <Library className="h-8 w-8 mx-auto mb-2 text-studio-muted/20" />
            No traits match your search
          </div>
        )}
      </div>
    </div>
  );
}
