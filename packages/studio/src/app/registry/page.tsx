'use client';

/**
 * Registry — /registry
 *
 * Native HoloScript-driven registry page. The header and stats bar are
 * defined in compositions/studio/registry.hsplus and rendered by
 * HoloSurfaceRenderer. Search, filtering, and pack grid stay in React.
 *
 * @module registry/page
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Download, Globe, Star, Tag, Loader2, ArrowLeft } from 'lucide-react';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { logger } from '@/lib/logger';

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

const ALL_TAGS = [
  'fantasy',
  'sci-fi',
  'nature',
  'interior',
  'architecture',
  'modular',
  'vegetation',
  'outdoor',
  'medieval',
];

export default function RegistryPage() {
  const [packs, setPacks] = useState<RegistryPack[]>([]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const composition = useHoloComposition('/api/surface/registry');

  const fetchPacks = useCallback(async (q = '', tag = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (tag) params.set('tag', tag);
      const res = await fetch(`/api/registry?${params}`);
      const data = (await res.json()) as { packs?: RegistryPack[] };
      setPacks(data.packs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  // Bridge pack count into composition state
  useEffect(() => {
    if (!composition.loading) {
      composition.setState({ packCount: packs.length, loading });
    }
  }, [packs.length, loading, composition.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPacks(query, activeTag);
  };

  const handleTag = (tag: string) => {
    const next = activeTag === tag ? '' : tag;
    setActiveTag(next);
    fetchPacks(query, next);
  };

  const handleDownload = async (pack: RegistryPack) => {
    setDownloading(pack.packId);
    await fetch(`/api/registry/${pack.packId}`, { method: 'POST' }).catch((err) => logger.warn('Swallowed error caught:', err));
    if (pack.previewCode) {
      await navigator.clipboard.writeText(pack.previewCode).catch((err) => logger.warn('Swallowed error caught:', err));
    }
    setTimeout(() => setDownloading(null), 800);
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      {/* Native composition header + stats */}
      {!composition.loading && !composition.error ? (
        <HoloSurfaceRenderer
          nodes={composition.nodes}
          state={composition.state}
          computed={composition.computed}
          templates={composition.templates}
          onEmit={composition.emit}
          className="holo-surface-registry"
        />
      ) : (
        <header className="border-b border-white/10 bg-[#0d0d1a]/80 px-6 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition"
            >
              <ArrowLeft className="h-4 w-4" /> Studio
            </Link>
            <h1 className="text-lg font-bold">HoloScript Registry</h1>
            <p className="text-sm text-white/40 ml-1">Community asset packs</p>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Search + tag filters */}
        <div className="mb-6 space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
              <Search className="h-4 w-4 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search packs by name, description, or author..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/30"
              />
            </div>
            <button
              type="submit"
              className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold hover:bg-violet-500 transition"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {ALL_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTag(tag)}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs transition ${
                  activeTag === tag
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/8 text-white/50 hover:bg-white/12 hover:text-white'
                }`}
              >
                <Tag className="h-3 w-3" />
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((pack) => {
              const totalSize = pack.files.reduce((s, f) => s + f.size, 0);
              return (
                <div
                  key={pack.packId}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5 hover:border-violet-500/40 hover:bg-white/8 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white">{pack.name}</h3>
                      <p className="mt-1 text-sm text-white/50 line-clamp-2">{pack.description}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-violet-500/15 px-2 py-0.5 text-[10px] font-mono text-violet-400">
                      v{pack.version}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {pack.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/40"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-[11px] text-white/35">
                    <span>{pack.author}</span>
                    <span>
                      {pack.files.length} files &middot; {humanBytes(totalSize)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {pack.downloads.toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleDownload(pack)}
                      disabled={downloading === pack.packId}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-2 text-sm font-semibold hover:bg-violet-500 transition disabled:opacity-60"
                    >
                      {downloading === pack.packId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Import
                    </button>
                    <Link
                      href={`/create?pack=${pack.packId}`}
                      className="flex items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60 hover:text-white hover:border-white/20 transition"
                    >
                      Open in Studio
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {packs.length === 0 && !loading && (
          <div className="py-20 text-center">
            <Globe className="mx-auto h-12 w-12 text-white/15 mb-4" />
            <p className="text-white/40">No packs found. Try a different search.</p>
          </div>
        )}
      </main>
    </div>
  );
}
