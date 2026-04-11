'use client';
/**
 * useAssetRegistry — Hook for asset management and caching
 */
import { useState, useCallback, useRef } from 'react';
import { _AssetRegistry } from '@holoscript/core';

export interface AssetEntry {
  id: string;
  name: string;
  type: string;
  size: number;
  tags: string[];
}

export interface UseAssetRegistryReturn {
  assets: AssetEntry[];
  cacheSize: number;
  search: (query: string) => void;
  buildDemo: () => void;
  reset: () => void;
}

export function useAssetRegistry(): UseAssetRegistryReturn {
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [cacheSize, setCacheSize] = useState(0);
  const demoAssets = useRef<AssetEntry[]>([]);

  const search = useCallback((query: string) => {
    if (!query) {
      setAssets(demoAssets.current);
      return;
    }
    const q = query.toLowerCase();
    setAssets(
      demoAssets.current.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.type.includes(q) ||
          a.tags.some((t) => t.includes(q))
      )
    );
  }, []);

  const buildDemo = useCallback(() => {
    const demo: AssetEntry[] = [
      {
        id: 'tex-001',
        name: 'grass_diffuse.png',
        type: 'texture',
        size: 245760,
        tags: ['terrain', 'nature'],
      },
      {
        id: 'tex-002',
        name: 'stone_normal.png',
        type: 'texture',
        size: 512000,
        tags: ['terrain', 'rock'],
      },
      {
        id: 'mdl-001',
        name: 'character_rig.glb',
        type: 'model',
        size: 2048576,
        tags: ['character', 'humanoid'],
      },
      {
        id: 'mdl-002',
        name: 'tree_birch.glb',
        type: 'model',
        size: 768000,
        tags: ['nature', 'vegetation'],
      },
      {
        id: 'aud-001',
        name: 'ambient_forest.ogg',
        type: 'audio',
        size: 1536000,
        tags: ['ambient', 'nature'],
      },
      {
        id: 'aud-002',
        name: 'sword_clash.wav',
        type: 'audio',
        size: 98304,
        tags: ['sfx', 'combat'],
      },
      {
        id: 'shd-001',
        name: 'pbr_standard.wgsl',
        type: 'shader',
        size: 4096,
        tags: ['rendering', 'pbr'],
      },
      {
        id: 'scn-001',
        name: 'forest_clearing.holo',
        type: 'scene',
        size: 32768,
        tags: ['level', 'nature'],
      },
      {
        id: 'ani-001',
        name: 'walk_cycle.anim',
        type: 'animation',
        size: 65536,
        tags: ['character', 'locomotion'],
      },
      {
        id: 'dat-001',
        name: 'item_database.json',
        type: 'data',
        size: 16384,
        tags: ['gameplay', 'items'],
      },
    ];
    demoAssets.current = demo;
    setAssets(demo);
    setCacheSize(demo.reduce((s, a) => s + a.size, 0));
  }, []);

  const reset = useCallback(() => {
    demoAssets.current = [];
    setAssets([]);
    setCacheSize(0);
  }, []);

  return { assets, cacheSize, search, buildDemo, reset };
}
