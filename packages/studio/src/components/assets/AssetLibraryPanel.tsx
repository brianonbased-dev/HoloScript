'use client';

/**
 * AssetLibraryPanel — right-rail v2 asset browser.
 * Two tabs: "Local Packs" (original curated packs) and "Poly Haven" (15K+ CC0 assets).
 */

import { useState, useEffect } from 'react';
import { Library, X, Search, ChevronLeft, ChevronRight, Download, ExternalLink, Box, Sun, Image, Globe2 } from 'lucide-react';
import { useAssetLibrary, type AssetCategory, type Asset } from '@/hooks/useAssetLibrary';
import { useSceneStore } from '@/lib/store';
import { PolyHavenBrowser } from './PolyHavenBrowser';

type Tab = 'local' | 'polyhaven';

const CATEGORIES: { id: AssetCategory | ''; label: string; icon: React.ReactNode }[] = [
  { id: '', label: 'All', icon: null },
  { id: 'model', label: 'Models', icon: <Box className="h-3 w-3" /> },
  { id: 'hdr', label: 'HDR', icon: <Sun className="h-3 w-3" /> },
  { id: 'texture', label: 'Textures', icon: <Image className="h-3 w-3" /> },
];

function AssetCard({ asset, onImport }: { asset: Asset; onImport: (a: Asset) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-studio-border bg-studio-surface transition hover:border-studio-accent/40">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {asset.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[18px]">
            {asset.category === 'hdr' ? '🌅' : asset.category === 'model' ? '🧊' : '🖼️'}
          </div>
        )}
        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[8px] text-white font-mono uppercase">
          {asset.format}
        </span>
      </div>
      {/* Info */}
      <div className="p-2">
        <p className="truncate text-[11px] font-medium text-studio-text">{asset.name}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[9px] text-studio-muted">
          <span>{(asset.sizeKb / 1024).toFixed(1)}MB</span>
          <span>·</span>
          <span>{asset.license}</span>
        </div>
        <div className="mt-1.5 flex gap-1">
          <button onClick={() => onImport(asset)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-studio-accent py-1 text-[10px] font-semibold text-white hover:brightness-110">
            <Download className="h-3 w-3" /> Import
          </button>
          {asset.url && (
            <a href={asset.url} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-studio-border p-1 text-studio-muted hover:text-studio-accent">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

interface AssetLibraryPanelProps { onClose: () => void; }

export function AssetLibraryPanel({ onClose }: AssetLibraryPanelProps) {
  const [tab, setTab] = useState<Tab>('polyhaven');
  const [q, setQ] = useState('');
  const { results, total, page, pages, loading, search, setPage } = useAssetLibrary();
  const appendCode = useSceneStore((s) => s.setCode);
  const currentCode = useSceneStore((s) => s.code) ?? '';

  const handleImport = (asset: Asset) => {
    const snippet = `\nobject "${asset.name}" {\n  @mesh(src: "${asset.url || asset.name.toLowerCase().replace(/\s+/g, '_') + '.gltf'}")\n  @transform(position: [0, 0, 0], scale: [1, 1, 1])\n}\n`;
    appendCode(currentCode + snippet);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Library className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Asset Library</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="shrink-0 flex border-b border-studio-border">
        <button
          onClick={() => setTab('local')}
          className={`flex-1 py-1.5 text-[10px] font-semibold text-center border-b-2 transition ${
            tab === 'local'
              ? 'border-studio-accent text-studio-accent'
              : 'border-transparent text-studio-muted hover:text-studio-text'
          }`}
        >
          📦 Local Packs
        </button>
        <button
          onClick={() => setTab('polyhaven')}
          className={`flex-1 py-1.5 text-[10px] font-semibold text-center border-b-2 transition ${
            tab === 'polyhaven'
              ? 'border-studio-accent text-studio-accent'
              : 'border-transparent text-studio-muted hover:text-studio-text'
          }`}
        >
          <Globe2 className="inline h-3 w-3 mr-1" />Poly Haven
        </button>
      </div>

      {tab === 'polyhaven' ? (
        <PolyHavenBrowser />
      ) : (
        <>
          {/* Search (local) */}
          <div className="shrink-0 border-b border-studio-border p-2.5 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-studio-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search(q)}
                placeholder="Search assets…" className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40" />
            </div>
            {/* Category pills */}
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map((c) => (
                <button key={c.id}
                  onClick={() => search(q, c.id as AssetCategory | '')}
                  className="flex items-center gap-1 rounded-full border border-studio-border bg-studio-surface px-2 py-0.5 text-[9px] text-studio-muted hover:text-studio-accent hover:border-studio-accent/40 transition">
                  {c.icon}{c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid (local) */}
          <div className="flex-1 overflow-y-auto p-2.5">
            {loading && (
              <div className="flex h-32 items-center justify-center text-[10px] text-studio-muted animate-pulse">Loading assets…</div>
            )}
            {!loading && results.length === 0 && (
              <p className="py-8 text-center text-[10px] text-studio-muted">No assets found.</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {results.map((a) => <AssetCard key={a.id} asset={a} onImport={handleImport} />)}
            </div>
          </div>

          {/* Pagination (local) */}
          {pages > 1 && (
            <div className="shrink-0 flex items-center justify-between border-t border-studio-border px-3 py-2">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1}
                className="rounded p-1 text-studio-muted hover:text-studio-text disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[10px] text-studio-muted">Page {page} / {pages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= pages}
                className="rounded p-1 text-studio-muted hover:text-studio-text disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
