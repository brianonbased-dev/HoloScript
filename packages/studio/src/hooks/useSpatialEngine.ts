/**
 * useSpatialEngine — React hook wiring spatialEngineBridge into Studio
 *
 * Provides noise generation, collision detection, and A* pathfinding
 * from the WASM spatial engine (with automatic TS fallback) to Studio
 * components: PhysicsPanel, terrain generation, scene collision queries.
 *
 * @version 1.0.0
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initWasmBridge,
  getBridgeStatus,
  perlinNoise2D,
  perlinNoise3D,
  fbmNoise,
  sphereSphereTest,
  aabbOverlap,
  astarFindPath,
  generateHeightmap,
  type BridgeStatus,
  type _Vec3,
  type AABB,
  type Sphere,
  type Waypoint,
} from '@/lib/spatialEngineBridge';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface TerrainConfig {
  width: number;
  height: number;
  scale: number;
  seed: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  amplitude: number;
  offset: { x: number; y: number };
}

export interface TerrainResult {
  heightmap: number[][];
  width: number;
  height: number;
  min: number;
  max: number;
  generateTimeMs: number;
}

export interface CollisionQuery {
  type: 'sphere-sphere' | 'aabb-overlap';
  a: Sphere | AABB;
  b: Sphere | AABB;
}

export interface CollisionResult {
  collides: boolean;
  queryTimeMs: number;
}

export interface PathfindingResult {
  path: Waypoint[];
  found: boolean;
  queryTimeMs: number;
}

export interface SpatialEngineState {
  /** Current bridge status (wasm or fallback) */
  status: BridgeStatus;
  /** Whether the bridge is initialized */
  ready: boolean;
  /** Whether WASM is loaded (vs TS fallback) */
  isWasm: boolean;
  /** Initialization error, if any */
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// Default Terrain Config
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  width: 64,
  height: 64,
  scale: 0.05,
  seed: 42,
  octaves: 6,
  lacunarity: 2.0,
  persistence: 0.5,
  amplitude: 10.0,
  offset: { x: 0, y: 0 },
};

// ═══════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════

export function useSpatialEngine(wasmUrl?: string) {
  const [state, setState] = useState<SpatialEngineState>({
    status: getBridgeStatus(),
    ready: false,
    isWasm: false,
    error: null,
  });
  const initRef = useRef(false);

  // ── Initialize bridge on mount ────────────────────────────────
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    initWasmBridge(wasmUrl)
      .then((status) => {
        setState({
          status,
          ready: true,
          isWasm: status.backend === 'wasm',
          error: null,
        });
      })
      .catch((err) => {
        setState({
          status: getBridgeStatus(),
          ready: true,
          isWasm: false,
          error: err instanceof Error ? err.message : 'Failed to init spatial engine',
        });
      });
  }, [wasmUrl]);

  // ── Terrain Generation ────────────────────────────────────────

  /**
   * Generate a heightmap terrain using FBM noise.
   * Can be used by terrain panels, environment builder, or scene generator.
   */
  const generateTerrain = useCallback((config: Partial<TerrainConfig> = {}): TerrainResult => {
    const cfg = { ...DEFAULT_TERRAIN_CONFIG, ...config };
    const start = performance.now();

    const heightmap: number[][] = [];
    let min = Infinity;
    let max = -Infinity;

    for (let y = 0; y < cfg.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < cfg.width; x++) {
        const nx = (x + cfg.offset.x) * cfg.scale;
        const ny = (y + cfg.offset.y) * cfg.scale;
        const value =
          fbmNoise(nx, ny, cfg.octaves, cfg.lacunarity, cfg.persistence, cfg.seed) * cfg.amplitude;

        row.push(value);
        if (value < min) min = value;
        if (value > max) max = value;
      }
      heightmap.push(row);
    }

    return {
      heightmap,
      width: cfg.width,
      height: cfg.height,
      min,
      max,
      generateTimeMs: performance.now() - start,
    };
  }, []);

  // ── Noise Sampling ────────────────────────────────────────────

  /**
   * Sample 2D Perlin noise at a point. Useful for procedural textures,
   * material variation, or displacement maps.
   */
  const sampleNoise2D = useCallback((x: number, y: number, seed: number = 42): number => {
    return perlinNoise2D(x, y, seed);
  }, []);

  /**
   * Sample 3D Perlin noise at a point. Useful for volumetric effects,
   * animated noise, or 3D displacement.
   */
  const sampleNoise3D = useCallback(
    (x: number, y: number, z: number, seed: number = 42): number => {
      return perlinNoise3D(x, y, z, seed);
    },
    []
  );

  /**
   * Sample Fractal Brownian Motion noise. Best for natural terrain,
   * clouds, and organic variation.
   */
  const sampleFBM = useCallback(
    (
      x: number,
      y: number,
      octaves: number = 6,
      lacunarity: number = 2.0,
      persistence: number = 0.5,
      seed: number = 42
    ): number => {
      return fbmNoise(x, y, octaves, lacunarity, persistence, seed);
    },
    []
  );

  // ── Collision Detection ───────────────────────────────────────

  /**
   * Test collision between two spheres.
   * Used by PhysicsPanel preview and scene collision queries.
   */
  const testSphereCollision = useCallback((a: Sphere, b: Sphere): CollisionResult => {
    const start = performance.now();
    const collides = sphereSphereTest(a, b);
    return { collides, queryTimeMs: performance.now() - start };
  }, []);

  /**
   * Test collision between two AABBs.
   * Used by broad-phase collision detection in the scene.
   */
  const testAABBCollision = useCallback((a: AABB, b: AABB): CollisionResult => {
    const start = performance.now();
    const collides = aabbOverlap(a, b);
    return { collides, queryTimeMs: performance.now() - start };
  }, []);

  /**
   * Batch collision test for scene-level broad-phase queries.
   * Tests one entity against an array of entities.
   */
  const batchCollisionTest = useCallback(
    (subject: AABB, targets: AABB[]): { index: number; collides: boolean }[] => {
      return targets.map((target, index) => ({
        index,
        collides: aabbOverlap(subject, target),
      }));
    },
    []
  );

  // ── Pathfinding ───────────────────────────────────────────────

  /**
   * Find a path through a grid using A* (WASM) or BFS (fallback).
   * Grid: 0 = walkable, 1 = blocked.
   */
  const findPath = useCallback(
    (
      grid: number[][],
      startX: number,
      startY: number,
      endX: number,
      endY: number
    ): PathfindingResult => {
      const start = performance.now();
      const path = astarFindPath(grid, startX, startY, endX, endY);
      return {
        path,
        found: path.length > 0,
        queryTimeMs: performance.now() - start,
      };
    },
    []
  );

  /**
   * Generate a navigation grid from a heightmap.
   * Cells above the threshold are blocked (cliffs, water).
   */
  const heightmapToNavGrid = useCallback(
    (heightmap: number[][], maxWalkableSlope: number = 0.5): number[][] => {
      const height = heightmap.length;
      if (height === 0) return [];
      const width = heightmap[0].length;

      const grid: number[][] = [];
      for (let y = 0; y < height; y++) {
        const row: number[] = [];
        for (let x = 0; x < width; x++) {
          // Check if adjacent height differences are within walkable slope
          let maxDiff = 0;
          const h = heightmap[y][x];
          if (x > 0) maxDiff = Math.max(maxDiff, Math.abs(h - heightmap[y][x - 1]));
          if (x < width - 1) maxDiff = Math.max(maxDiff, Math.abs(h - heightmap[y][x + 1]));
          if (y > 0) maxDiff = Math.max(maxDiff, Math.abs(h - heightmap[y - 1][x]));
          if (y < height - 1) maxDiff = Math.max(maxDiff, Math.abs(h - heightmap[y + 1][x]));

          row.push(maxDiff <= maxWalkableSlope ? 0 : 1);
        }
        grid.push(row);
      }
      return grid;
    },
    []
  );

  // ── HoloScript Terrain Snippet Generation ─────────────────────

  /**
   * Generate a HoloScript terrain object snippet from a terrain config.
   * Inserts a composition snippet with @physics static and terrain data.
   */
  const generateTerrainSnippet = useCallback((config: Partial<TerrainConfig> = {}): string => {
    const cfg = { ...DEFAULT_TERRAIN_CONFIG, ...config };
    return `orb "Terrain" {
  @physics {
    type: "static"
    friction: 0.8
    collisionShape: "heightfield"
  }
  @terrain {
    width: ${cfg.width}
    depth: ${cfg.height}
    heightScale: ${cfg.amplitude}
    seed: ${cfg.seed}
    octaves: ${cfg.octaves}
    lacunarity: ${cfg.lacunarity}
    persistence: ${cfg.persistence}
    resolution: ${cfg.scale}
  }
}`;
  }, []);

  return {
    // State
    ...state,

    // Terrain
    generateTerrain,
    generateTerrainSnippet,

    // Noise
    sampleNoise2D,
    sampleNoise3D,
    sampleFBM,

    // Collision
    testSphereCollision,
    testAABBCollision,
    batchCollisionTest,

    // Pathfinding
    findPath,
    heightmapToNavGrid,

    // Raw bridge access
    generateHeightmap,
  };
}
