'use client';

/**
 * PolyHavenBrowser — browsable grid of Poly Haven's 15K+ free CC0 assets.
 * Models, HDRIs, and Textures with thumbnails, search, and pagination.
 */

import { useState } from 'react';
import {
  Search,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Box,
  Sun,
  Image,
} from 'lucide-react';
import { usePolyHaven, type PolyHavenAsset, type PolyHavenType } from '@/hooks/usePolyHaven';
import { useSceneStore } from '@/lib/stores';

const TYPE_TABS: { id: PolyHavenType; label: string; icon: React.ReactNode }[] = [
  { id: 'models', label: 'Models', icon: <Box className="h-3 w-3" /> },
  { id: 'hdris', label: 'HDRIs', icon: <Sun className="h-3 w-3" /> },
  { id: 'textures', label: 'Textures', icon: <Image className="h-3 w-3" /> },
];

function generateSnippet(asset: PolyHavenAsset): string {
  const safeName = asset.name.replace(/[^a-zA-Z0-9_ ]/g, '').replace(/\s+/g, '_');
  if (asset.type === 'hdri') {
    return `\nenvironment "${safeName}" {\n  @environment { src: "${asset.downloadUrl}" intensity: 1.0 }\n}\n`;
  }
  if (asset.type === 'texture') {
    return `\nobject "${safeName}" {\n  @transform { position: [0, 0, 0] scale: [2, 2, 2] }\n  @material { albedoMap: "${asset.downloadUrl}" roughness: 0.8 }\n}\n`;
  }
  // model
  return `\nobject "${safeName}" {\n  @mesh { src: "${asset.downloadUrl}" }\n  @transform { position: [0, 0, 0] scale: [1, 1, 1] }\n  @physics { type: static }\n}\n`;
}

function AssetCard({
  asset,
  onImport,
}: {
  asset: PolyHavenAsset;
  onImport: (a: PolyHavenAsset) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-studio-border bg-studio-surface transition hover:border-studio-accent/40">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnail}
            alt={asset.name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[18px]">
            {asset.type === 'hdri' ? '🌅' : asset.type === 'model' ? '🧊' : '🖼️'}
          </div>
        )}
        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[8px] text-white font-mono uppercase">
          {asset.type}
        </span>
        <span className="absolute left-1 top-1 rounded bg-green-900/80 px-1 py-0.5 text-[8px] text-green-300 font-mono">
          CC0
        </span>
      </div>
      {/* Info */}
      <div className="p-2">
        <p className="truncate text-[11px] font-medium text-studio-text">{asset.name}</p>
        <div className="mt-0.5 flex items-center gap-1 text-[9px] text-studio-muted flex-wrap">
          {asset.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-studio-border/60 px-1 py-0.5">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          <button
            onClick={() => onImport(asset)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-studio-accent py-1 text-[10px] font-semibold text-white hover:brightness-110"
          >
            <Download className="h-3 w-3" /> Import
          </button>
          <a
            href={`https://polyhaven.com/a/${asset.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-studio-border p-1 text-studio-muted hover:text-studio-accent"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function PolyHavenBrowser() {
  const [q, setQ] = useState('');
  const { results, total, page, pages, assetType, loading, error, search, setPage, setType } =
    usePolyHaven();
  const appendCode = useSceneStore((s) => s.setCode);
  const currentCode = useSceneStore((s) => s.code) ?? '';

  const handleImport = (asset: PolyHavenAsset) => {
    const snippet = generateSnippet(asset);
    appendCode(currentCode + snippet);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Type tabs */}
      <div className="shrink-0 flex gap-1 border-b border-studio-border px-2.5 py-1.5">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setType(tab.id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium transition ${
              assetType === tab.id
                ? 'bg-studio-accent/20 text-studio-accent border border-studio-accent/30'
                : 'text-studio-muted hover:text-studio-text border border-transparent'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
        <span className="ml-auto flex items-center text-[9px] text-studio-muted">
          <Globe2 className="mr-1 h-3 w-3" />
          {total.toLocaleString()} assets
        </span>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-studio-border p-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search(q)}
            placeholder={`Search ${assetType}…`}
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {loading && (
          <div className="flex h-32 items-center justify-center text-[10px] text-studio-muted animate-pulse">
            Loading Poly Haven {assetType}…
          </div>
        )}
        {error && (
          <div className="py-8 text-center text-[10px] text-red-400">
            {error}
            <button onClick={() => search(q)} className="ml-2 text-studio-accent hover:underline">
              Retry
            </button>
          </div>
        )}
        {!loading && !error && results.length === 0 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">No {assetType} found.</p>
        )}
        <div className="grid grid-cols-1 gap-2">
          {results.map((a) => (
            <AssetCard key={a.id} asset={a} onImport={handleImport} />
          ))}
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="shrink-0 flex items-center justify-between border-t border-studio-border px-3 py-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="rounded p-1 text-studio-muted hover:text-studio-text disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[10px] text-studio-muted">
            Page {page} / {pages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= pages}
            className="rounded p-1 text-studio-muted hover:text-studio-text disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
