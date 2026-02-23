/**
 * Asset Store — Zustand catalog of local and URL assets
 *
 * Assets are kept in-memory during the session.
 * In Sprint C+ they will be persisted to IndexedDB / .holo file.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetCategory = 'splat' | 'model' | 'texture' | 'audio' | 'hdri' | 'script';

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  /** URL, data-URL, or file:// path */
  src: string;
  /** Optional thumbnail for display */
  thumbnail?: string;
  /** File size in bytes (0 for remote) */
  size: number;
  addedAt: number;
  tags: string[];
}

interface AssetState {
  assets: Asset[];
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
}

// ─── Built-in starter assets ──────────────────────────────────────────────────

const STARTER_ASSETS: Asset[] = [
  {
    id: 'builtin-splat-forest',
    name: 'Forest Scene',
    category: 'splat',
    src: 'https://huggingface.co/datasets/holoscript/splats/resolve/main/forest.splat',
    thumbnail: '',
    size: 0,
    addedAt: 0,
    tags: ['nature', 'outdoors', 'demo'],
  },
  {
    id: 'builtin-splat-room',
    name: 'Living Room',
    category: 'splat',
    src: 'https://huggingface.co/datasets/holoscript/splats/resolve/main/room.splat',
    thumbnail: '',
    size: 0,
    addedAt: 0,
    tags: ['interior', 'demo'],
  },
  {
    id: 'builtin-model-drone',
    name: 'Drone GLB',
    category: 'model',
    src: 'https://holoscript.net/assets/drone.glb',
    thumbnail: '',
    size: 0,
    addedAt: 0,
    tags: ['vehicle', 'ai', 'demo'],
  },
  {
    id: 'builtin-hdri-studio',
    name: 'Studio HDRI',
    category: 'hdri',
    src: 'https://holoscript.net/assets/studio.hdr',
    thumbnail: '',
    size: 0,
    addedAt: 0,
    tags: ['lighting', 'studio'],
  },
  {
    id: 'builtin-audio-ambient',
    name: 'Ambient Space',
    category: 'audio',
    src: 'https://holoscript.net/assets/ambient_space.mp3',
    thumbnail: '',
    size: 0,
    addedAt: 0,
    tags: ['audio', 'space', 'ambient'],
  },
];

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useAssetStore = create<AssetState>()(
  devtools(
    (set) => ({
      assets: STARTER_ASSETS,
      addAsset: (asset) => set((s) => ({ assets: [asset, ...s.assets] })),
      removeAsset: (id) => set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),
      updateAsset: (id, patch) =>
        set((s) => ({
          assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
    }),
    { name: 'asset-store' }
  )
);
