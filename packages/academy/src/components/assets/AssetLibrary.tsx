'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Upload,
  Link,
  Layers,
  Box,
  Image,
  Music,
  Globe,
  Code,
  Trash2,
  Plus,
  Crosshair,
} from 'lucide-react';
import { useAssetStore } from './useAssetStore';
import type { Asset, AssetCategory } from './useAssetStore';
import { useSceneGraphStore } from '@/lib/stores';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{
  id: AssetCategory | 'all';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'all', label: 'All', icon: Layers },
  { id: 'splat', label: 'Splats', icon: Crosshair },
  { id: 'model', label: 'Models', icon: Box },
  { id: 'texture', label: 'Textures', icon: Image },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'hdri', label: 'HDRI', icon: Globe },
  { id: 'script', label: 'Scripts', icon: Code },
];

const CATEGORY_COLORS: Record<AssetCategory, string> = {
  splat: 'text-purple-400',
  model: 'text-blue-400',
  texture: 'text-pink-400',
  audio: 'text-yellow-400',
  hdri: 'text-orange-400',
  script: 'text-green-400',
};

const CATEGORY_BG: Record<AssetCategory, string> = {
  splat: 'bg-purple-500/10',
  model: 'bg-blue-500/10',
  texture: 'bg-pink-500/10',
  audio: 'bg-yellow-500/10',
  hdri: 'bg-orange-500/10',
  script: 'bg-green-500/10',
};

// ─── Drag data key ────────────────────────────────────────────────────────────
export const ASSET_DRAG_TYPE = 'application/holoscript-asset';

// ─── Asset Card ───────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onDragStart,
  onDelete,
}: {
  asset: Asset;
  onDragStart: (e: React.DragEvent, asset: Asset) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = CATEGORIES.find((c) => c.id === asset.category)?.icon ?? Box;
  const color = CATEGORY_COLORS[asset.category];
  const bg = CATEGORY_BG[asset.category];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, asset)}
      className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface p-2 text-center transition cursor-grab hover:border-studio-accent/60 hover:bg-studio-surface/80 active:cursor-grabbing"
      title={`${asset.name}\nDrag to drop into viewport`}
    >
      {/* Thumbnail or icon */}
      <div className={`flex h-14 w-full items-center justify-center rounded-md ${bg}`}>
        {asset.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnail}
            alt={asset.name}
            className="h-14 w-full rounded-md object-cover"
          />
        ) : (
          <Icon className={`h-7 w-7 ${color}`} />
        )}
      </div>

      {/* Name */}
      <span className="w-full truncate text-[10px] font-medium text-studio-text leading-tight">
        {asset.name}
      </span>

      {/* Category badge */}
      <span className={`text-[9px] uppercase tracking-wide ${color}`}>{asset.category}</span>

      {/* Delete button */}
      {!asset.id.startsWith('builtin-') && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(asset.id);
          }}
          className="absolute right-1 top-1 hidden rounded p-0.5 text-studio-muted hover:bg-red-500/20 hover:text-red-400 group-hover:block"
          title="Remove from library"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── URL Import Dialog ────────────────────────────────────────────────────────

function URLImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (name: string, url: string, category: AssetCategory) => void;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('splat');

  const guessCategory = (u: string): AssetCategory => {
    if (u.endsWith('.splat') || u.endsWith('.ksplat')) return 'splat';
    if (u.endsWith('.glb') || u.endsWith('.gltf') || u.endsWith('.obj')) return 'model';
    if (u.endsWith('.png') || u.endsWith('.jpg') || u.endsWith('.webp')) return 'texture';
    if (u.endsWith('.mp3') || u.endsWith('.ogg') || u.endsWith('.wav')) return 'audio';
    if (u.endsWith('.hdr') || u.endsWith('.exr')) return 'hdri';
    if (u.endsWith('.ts') || u.endsWith('.js') || u.endsWith('.holo')) return 'script';
    return 'model';
  };

  const handleUrlChange = (v: string) => {
    setUrl(v);
    if (!name) {
      const parts = v.split('/');
      const basename = parts[parts.length - 1]?.split('.')?.[0] ?? '';
      if (basename) setName(basename.replace(/-|_/g, ' '));
    }
    setCategory(guessCategory(v));
  };

  return (
    <div className="border-t border-studio-border p-3 space-y-2 bg-studio-surface/50 animate-fade-in">
      <p className="text-[10px] uppercase tracking-widest text-studio-muted">Import from URL</p>
      <input
        autoFocus
        type="url"
        placeholder="https://example.com/asset.splat"
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-xs text-studio-text outline-none focus:border-studio-accent"
      />
      <input
        type="text"
        placeholder="Asset name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-xs text-studio-text outline-none focus:border-studio-accent"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as AssetCategory)}
        className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-xs text-studio-text outline-none focus:border-studio-accent"
      >
        {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (url && name) {
              onImport(name, url, category);
              onClose();
            }
          }}
          disabled={!url || !name}
          className="flex-1 rounded-lg bg-studio-accent py-1.5 text-xs text-white transition hover:bg-studio-accent/80 disabled:opacity-40"
        >
          Import
        </button>
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-studio-border py-1.5 text-xs text-studio-muted transition hover:text-studio-text"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Asset Library Panel ─────────────────────────────────────────────────

interface AssetLibraryProps {
  onOpenSplatWizard: () => void;
}

export function AssetLibrary({ onOpenSplatWizard }: AssetLibraryProps) {
  const { assets, addAsset, removeAsset } = useAssetStore();
  const addNode = useSceneGraphStore((s) => s.addNode);
  const addTrait = useSceneGraphStore((s) => s.addTrait);

  const [activeCategory, setActiveCategory] = useState<AssetCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showURLImport, setShowURLImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return assets.filter(
      (a) =>
        (activeCategory === 'all' || a.category === activeCategory) &&
        (q === '' || a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)))
    );
  }, [assets, activeCategory, query]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(asset));
  }, []);

  // ── File drop onto library ────────────────────────────────────────────────
  const handleFileSelect = useCallback(
    (files: FileList) => {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const cat: AssetCategory = ['splat', 'ksplat'].includes(ext)
          ? 'splat'
          : ['glb', 'gltf', 'obj'].includes(ext)
            ? 'model'
            : ['mp3', 'ogg', 'wav'].includes(ext)
              ? 'audio'
              : ['png', 'jpg', 'webp'].includes(ext)
                ? 'texture'
                : ['hdr', 'exr'].includes(ext)
                  ? 'hdri'
                  : 'script';

        reader.onload = () => {
          const src = reader.result as string;
          addAsset({
            id: `file-${Date.now()}-${file.name}`,
            name: file.name.replace(/\.[^.]+$/, ''),
            category: cat,
            src,
            thumbnail: cat === 'texture' ? src : undefined,
            size: file.size,
            addedAt: Date.now(),
            tags: [],
          });
        };
        reader.readAsDataURL(file);
      });
    },
    [addAsset]
  );

  // ── URL import ─────────────────────────────────────────────────────────────
  const handleURLImport = useCallback(
    (name: string, url: string, category: AssetCategory) => {
      addAsset({
        id: `url-${Date.now()}`,
        name,
        category,
        src: url,
        size: 0,
        addedAt: Date.now(),
        tags: [],
      });
    },
    [addAsset]
  );

  // ── Drop into scene (called from SceneRenderer drop zone externally via window event)
  // This panel just exposes the drag data — SceneRenderer handles the drop.

  return (
    <div className="flex h-full flex-col bg-studio-panel select-none">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-studio-muted">
          Assets
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSplatWizard}
            title="Capture Gaussian Splat"
            className="rounded-md p-1.5 text-studio-muted transition hover:bg-studio-surface hover:text-purple-400"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload file"
            className="rounded-md p-1.5 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowURLImport((v) => !v)}
            title="Import from URL"
            className="rounded-md p-1.5 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <Link className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".splat,.ksplat,.glb,.gltf,.obj,.png,.jpg,.webp,.mp3,.ogg,.wav,.hdr,.exr,.ts,.js,.holo"
        className="hidden"
        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
      />

      {/* URL Import dialog */}
      {showURLImport && (
        <URLImportDialog onClose={() => setShowURLImport(false)} onImport={handleURLImport} />
      )}

      {/* Search */}
      <div className="shrink-0 px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-studio-muted" />
          <input
            type="text"
            placeholder="Search assets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-studio-border bg-studio-surface py-1.5 pl-7 pr-3 text-xs text-studio-text outline-none focus:border-studio-accent"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-studio-border px-2 pb-2">
        {CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveCategory(id as AssetCategory | 'all')}
            className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] transition ${
              activeCategory === id
                ? 'bg-studio-accent/20 text-studio-accent'
                : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-studio-muted">
              {query ? `No assets match "${query}"` : 'No assets in this category'}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-studio-accent/10 px-3 py-2 text-xs text-studio-accent transition hover:bg-studio-accent/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Upload Asset
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onDragStart={handleDragStart}
                onDelete={removeAsset}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-studio-border px-3 py-1.5 text-[10px] text-studio-muted">
        {assets.length} asset{assets.length !== 1 ? 's' : ''} · drag to viewport to place
      </div>
    </div>
  );
}
