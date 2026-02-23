'use client';

/**
 * RegistryPanel — right-rail sidebar for browsing & importing community asset packs.
 *
 * Search packs by name/description. Click "Import" to pull a pack's
 * previewCode into the current scene or download it via useAssetDropProcessor.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Package, Search, Download, Loader2, X, Star, RefreshCw, Tag,
} from 'lucide-react';
import { useSceneStore } from '@/lib/store';

interface RegistryPack {
  packId: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  files: { name: string; size: number; type: string }[];
  downloads: number;
  publishedAt: string;
  previewCode?: string;
}

function humanBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function relDate(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

interface RegistryPanelProps {
  onClose: () => void;
}

export function RegistryPanel({ onClose }: RegistryPanelProps) {
  const code = useSceneStore((s) => s.code) ?? '';
  const setCode = useSceneStore((s) => s.setCode);

  const [packs, setPacks] = useState<RegistryPack[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const fetchPacks = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const url = q ? `/api/registry?q=${encodeURIComponent(q)}` : '/api/registry';
      const res = await fetch(url);
      const data = (await res.json()) as { packs?: RegistryPack[] };
      setPacks(data.packs ?? []);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPacks(); }, [fetchPacks]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    fetchPacks(query);
  }, [fetchPacks, query]);

  const handleImport = useCallback(async (pack: RegistryPack) => {
    setImporting(pack.packId);
    // Increment download count
    await fetch(`/api/registry/${pack.packId}`, { method: 'POST' }).catch(() => {});

    if (pack.previewCode) {
      // Append preview HoloScript to current code
      setCode(`${code}\n\n// Imported from: ${pack.name} v${pack.version}\n${pack.previewCode}`);
    }
    setTimeout(() => setImporting(null), 800);
  }, [code, setCode]);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Package className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Pack Registry</span>
        <a
          href="/registry"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 text-[10px] text-studio-muted hover:text-studio-accent transition"
          title="Open full registry browser"
        >
          Browse all ↗
        </a>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => fetchPacks(query)}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="shrink-0 border-b border-studio-border p-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-studio-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packs…"
            className="flex-1 bg-transparent text-[11px] text-studio-text outline-none placeholder-studio-muted/40"
          />
        </div>
      </form>

      {/* Pack list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-studio-muted" />
          </div>
        )}
        {!loading && packs.length === 0 && (
          <p className="py-6 text-center text-[11px] text-studio-muted">No packs found.</p>
        )}
        {packs.map((pack) => {
          const totalSize = pack.files.reduce((s, f) => s + f.size, 0);
          return (
            <div
              key={pack.packId}
              className="rounded-xl border border-studio-border bg-studio-surface p-2.5 hover:border-studio-accent/30 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[11px] font-semibold text-studio-text">{pack.name}</p>
                  <p className="mt-0.5 text-[10px] text-studio-muted line-clamp-2">{pack.description}</p>
                </div>
                <button
                  onClick={() => handleImport(pack)}
                  disabled={importing === pack.packId}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-studio-accent/15 px-2 py-1 text-[10px] text-studio-accent hover:bg-studio-accent/25 transition disabled:opacity-50"
                >
                  {importing === pack.packId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Import
                </button>
              </div>

              {/* Meta row */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-studio-muted">
                <span>by {pack.author}</span>
                <span>v{pack.version}</span>
                <span>{pack.files.length} files · {humanBytes(totalSize)}</span>
                <span className="flex items-center gap-0.5">
                  <Star className="h-2.5 w-2.5" /> {pack.downloads.toLocaleString()}
                </span>
                <span>{relDate(pack.publishedAt)}</span>
              </div>

              {/* Tags */}
              {pack.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {pack.tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setQuery(t); fetchPacks(t); }}
                      className="flex items-center gap-0.5 rounded-full bg-studio-border/50 px-1.5 py-0.5 text-[9px] text-studio-muted hover:text-studio-accent transition"
                    >
                      <Tag className="h-2 w-2" />{t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
