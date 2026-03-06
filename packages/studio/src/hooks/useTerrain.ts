'use client';
/**
 * useTerrain — Hook for heightmap terrain editing
 */
import { useState, useCallback, useRef } from 'react';
import { TerrainSystem, type TerrainConfig, type TerrainLayer } from '@holoscript/core';

export interface UseTerrainReturn {
  system: TerrainSystem;
  terrainId: string | null;
  heights: number[];
  resolution: number;
  layers: TerrainLayer[];
  maxHeight: number;
  generate: (seed?: number) => void;
  raise: (gx: number, gz: number, amount: number) => void;
  flatten: () => void;
  reset: () => void;
}

const DEFAULT_CONFIG: TerrainConfig = {
  id: 'studio-terrain',
  width: 64,
  depth: 64,
  resolution: 16,
  maxHeight: 20,
  position: { x: 0, y: 0, z: 0 },
};

export function useTerrain(): UseTerrainReturn {
  const sysRef = useRef(new TerrainSystem());
  const [terrainId, setTerrainId] = useState<string | null>(null);
  const [heights, setHeights] = useState<number[]>([]);
  const [layers, setLayers] = useState<TerrainLayer[]>([]);
  const [resolution] = useState(DEFAULT_CONFIG.resolution);

  const sync = useCallback((tid: string) => {
    const t = sysRef.current.getTerrain(tid);
    if (t) {
      setHeights(Array.from(t.heightmap));
      setLayers(t.layers);
    }
  }, []);

  const generate = useCallback((seed?: number) => {
    const tid = sysRef.current.createTerrain(DEFAULT_CONFIG, { octaves: 4, lacunarity: 2, gain: 0.5, seed: seed ?? Math.random() * 10000, scale: 0.08 });
    setTerrainId(tid);
    sync(tid);
  }, [sync]);

  const raise = useCallback((gx: number, gz: number, amount: number) => {
    if (!terrainId) return;
    const current = sysRef.current.getHeightAt(terrainId, gx * (DEFAULT_CONFIG.width / DEFAULT_CONFIG.resolution), gz * (DEFAULT_CONFIG.depth / DEFAULT_CONFIG.resolution));
    sysRef.current.setHeightAt(terrainId, gx, gz, current + amount);
    sync(terrainId);
  }, [terrainId, sync]);

  const flatten = useCallback(() => {
    if (!terrainId) return;
    const res = DEFAULT_CONFIG.resolution;
    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        sysRef.current.setHeightAt(terrainId, x, z, 0);
      }
    }
    sync(terrainId);
  }, [terrainId, sync]);

  const reset = useCallback(() => {
    sysRef.current = new TerrainSystem();
    setTerrainId(null);
    setHeights([]);
    setLayers([]);
  }, []);

  return { system: sysRef.current, terrainId, heights, resolution, layers, maxHeight: DEFAULT_CONFIG.maxHeight, generate, raise, flatten, reset };
}
