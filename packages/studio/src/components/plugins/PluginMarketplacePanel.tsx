'use client';

/**
 * PluginMarketplacePanel — browse and install HoloScript community plugins.
 */

import { useEffect, useState } from 'react';
import { Puzzle, X, Search, Star, Download, CheckCircle2, RefreshCw } from 'lucide-react';
import type { HoloPlugin } from '@/app/api/plugins/route';

interface PluginMarketplacePanelProps { onClose: () => void; }

const CATEGORY_EMOJI: Record<string, string> = {
  rendering: '🌟', physics: '⚡', audio: '🎵', ai: '🤖', tools: '🔧', export: '📤',
};

const CATEGORY_LABELS: Record<string, string> = {
  rendering: 'Rendering', physics: 'Physics', audio: 'Audio',
  ai: 'AI', tools: 'Tools', export: 'Export',
};

export function PluginMarketplacePanel({ onClose }: PluginMarketplacePanelProps) {
  const [plugins, setPlugins] = useState<HoloPlugin[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchPlugins = async (q: string, cat: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      const r = await fetch(`/api/plugins?${params}`);
      const d = await r.json() as { plugins: HoloPlugin[]; categories: string[] };
      setPlugins(d.plugins ?? []);
      setCategories(d.categories ?? []);
    } catch {
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlugins('', ''); }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchPlugins(query, category), 250);
    return () => clearTimeout(t);
  }, [query, category]);

  const installPlugin = async (id: string) => {
    setInstalling(id);
    await new Promise((r) => setTimeout(r, 800)); // simulate install
    setInstalled((prev) => new Set([...prev, id]));
    setInstalling(null);
  };

  const uninstall = (id: string) => {
    setInstalled((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const featured = plugins.filter((p) => p.featured);
  const regular = plugins.filter((p) => !p.featured);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Puzzle className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Plugin Marketplace</span>
        <span className="ml-1 rounded-full bg-studio-accent/15 px-1.5 py-0.5 text-[9px] text-studio-accent">
          {plugins.length} plugins
        </span>
        <button onClick={() => fetchPlugins(query, category)}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text" title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-studio-border p-3 space-y-2">
        <div className="flex items-center gap-2 rounded-xl border border-studio-border bg-studio-surface px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins…"
            className="flex-1 bg-transparent text-[10px] text-studio-text placeholder:text-studio-muted/60 outline-none" />
        </div>
        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setCategory('')}
            className={`rounded-full px-2 py-0.5 text-[8px] font-semibold transition ${!category ? 'bg-studio-accent text-white' : 'bg-studio-surface text-studio-muted hover:text-studio-text'}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c === category ? '' : c)}
              className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[8px] font-semibold transition ${category === c ? 'bg-studio-accent text-white' : 'bg-studio-surface text-studio-muted hover:text-studio-text'}`}>
              {CATEGORY_EMOJI[c]} {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>
      </div>

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && plugins.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-studio-muted" />
          </div>
        )}

        {/* Featured */}
        {featured.length > 0 && !query && !category && (
          <>
            <p className="text-[9px] uppercase tracking-widest text-studio-muted mb-1">⭐ Featured</p>
            {featured.map((p) => <PluginCard key={p.id} plugin={p} installed={installed.has(p.id)}
              installing={installing === p.id} onInstall={() => installPlugin(p.id)} onUninstall={() => uninstall(p.id)} />)}
            {regular.length > 0 && <p className="text-[9px] uppercase tracking-widest text-studio-muted mb-1 pt-1">All Plugins</p>}
          </>
        )}

        {/* Regular / all */}
        {plugins.map((p) => {
          if (featured.includes(p) && !query && !category) return null;
          return <PluginCard key={p.id} plugin={p} installed={installed.has(p.id)}
            installing={installing === p.id} onInstall={() => installPlugin(p.id)} onUninstall={() => uninstall(p.id)} />;
        })}

        {!loading && plugins.length === 0 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">No plugins match "{query}"</p>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-studio-border px-3 py-2 text-[7px] text-studio-muted">
        {installed.size > 0 ? `${installed.size} plugin${installed.size !== 1 ? 's' : ''} installed` : 'No plugins installed'}
        {installed.size > 0 && <span className="ml-1 text-studio-accent">· restart to activate</span>}
      </div>
    </div>
  );
}

function PluginCard({ plugin: p, installed, installing, onInstall, onUninstall }: {
  plugin: HoloPlugin;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="rounded-xl border border-studio-border bg-studio-surface p-3 space-y-2">
      {/* Top row */}
      <div className="flex items-start gap-2">
        <span className="text-xl leading-none">{p.previewEmoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[10px] font-semibold truncate">{p.name}</span>
            <span className="text-[7px] text-studio-muted/70 shrink-0">v{p.version}</span>
          </div>
          <p className="text-[7px] text-studio-muted">by {p.author} · {p.size}</p>
        </div>
        <div className="flex items-center gap-1">
          {CATEGORY_EMOJI[p.category] && (
            <span className="rounded-full border border-studio-border bg-studio-panel px-1.5 py-0.5 text-[7px]">
              {CATEGORY_EMOJI[p.category]} {CATEGORY_LABELS[p.category]}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-[8px] text-studio-muted leading-snug">{p.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {p.tags.map((t) => (
          <span key={t} className="rounded bg-studio-panel px-1.5 py-0.5 text-[7px] text-studio-muted/70">#{t}</span>
        ))}
      </div>

      {/* Stats + install */}
      <div className="flex items-center gap-3 text-[8px] text-studio-muted">
        <span className="flex items-center gap-0.5"><Star className="h-2.5 w-2.5 text-yellow-400" />{p.stars.toLocaleString()}</span>
        <span className="flex items-center gap-0.5"><Download className="h-2.5 w-2.5" />{p.downloads.toLocaleString()}</span>
        <div className="ml-auto">
          {installed ? (
            <button onClick={onUninstall}
              className="flex items-center gap-1 rounded-lg border border-green-700/40 bg-green-900/20 px-2.5 py-1 text-[8px] font-semibold text-green-400 hover:bg-red-900/20 hover:text-red-400 hover:border-red-700/40 transition">
              <CheckCircle2 className="h-3 w-3" /> Installed
            </button>
          ) : (
            <button onClick={onInstall} disabled={installing}
              className="flex items-center gap-1 rounded-lg bg-studio-accent px-2.5 py-1 text-[8px] font-semibold text-white hover:brightness-110 disabled:opacity-60 transition">
              {installing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {installing ? 'Installing…' : 'Install'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
