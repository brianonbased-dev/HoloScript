/**
 * wasm-bridge.scenario.ts — LIVING-SPEC: WASM Bridge
 *
 * Persona: Dev — engine developer verifying WASM hot-path functions
 * with automatic fallback to pure TypeScript implementations.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  getBridgeStatus, perlinNoise2D, perlinNoise3D, fbmNoise,
  sphereSphereTest, aabbOverlap, astarFindPath, generateHeightmap,
} from '@/lib/spatialEngineBridge';

// ═══════════════════════════════════════════════════════════════════
// 1. Bridge Status
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: WASM Bridge — Status & Fallback', () => {
  it('getBridgeStatus() reports available functions', () => {
    const status = getBridgeStatus();
    expect(status.functions).toContain('perlinNoise2D');
    expect(status.functions).toContain('sphereSphereTest');
    expect(status.functions).toContain('astarFindPath');
    expect(status.functions.length).toBeGreaterThanOrEqual(6);
  });

  it('bridge falls back to TS when WASM is not loaded', () => {
    const status = getBridgeStatus();
    // In test environment (Node), WASM is not loaded
    expect(status.backend).toBe('fallback');
    expect(status.wasmLoaded).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Noise Generation (Fallback)
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: WASM Bridge — Noise (Fallback)', () => {
  it('perlinNoise2D() returns values in [-1, 1]', () => {
    const v = perlinNoise2D(3.5, 7.2, 42);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('perlinNoise2D() is deterministic with same seed', () => {
    const a = perlinNoise2D(10, 20, 99);
    const b = perlinNoise2D(10, 20, 99);
    expect(a).toBe(b);
  });

  it('perlinNoise2D() varies with different coordinates', () => {
    const a = perlinNoise2D(0, 0, 42);
    const b = perlinNoise2D(5.5, 3.3, 42);
    expect(a).not.toBe(b);
  });

  it('perlinNoise3D() returns values in [-1, 1]', () => {
    const v = perlinNoise3D(1, 2, 3, 42);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('fbmNoise() returns normalized values', () => {
    const v = fbmNoise(5, 5, 6, 2.0, 0.5, 42);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('fbmNoise() with more octaves produces different results', () => {
    const low = fbmNoise(3, 3, 2, 2.0, 0.5, 42);
    const high = fbmNoise(3, 3, 8, 2.0, 0.5, 42);
    // More octaves adds detail — values should differ
    expect(low).not.toBeCloseTo(high, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Collision Detection (Fallback)
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: WASM Bridge — Collision Detection', () => {
  it('sphereSphereTest() detects overlapping spheres', () => {
    const a = { center: { x: 0, y: 0, z: 0 }, radius: 5 };
    const b = { center: { x: 3, y: 0, z: 0 }, radius: 5 };
    expect(sphereSphereTest(a, b)).toBe(true);
  });

  it('sphereSphereTest() rejects non-overlapping spheres', () => {
    const a = { center: { x: 0, y: 0, z: 0 }, radius: 1 };
    const b = { center: { x: 10, y: 0, z: 0 }, radius: 1 };
    expect(sphereSphereTest(a, b)).toBe(false);
  });

  it('sphereSphereTest() detects touching spheres (edge case)', () => {
    const a = { center: { x: 0, y: 0, z: 0 }, radius: 5 };
    const b = { center: { x: 10, y: 0, z: 0 }, radius: 5 };
    expect(sphereSphereTest(a, b)).toBe(true);
  });

  it('aabbOverlap() detects overlapping boxes', () => {
    const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 5 } };
    const b = { min: { x: 3, y: 3, z: 3 }, max: { x: 8, y: 8, z: 8 } };
    expect(aabbOverlap(a, b)).toBe(true);
  });

  it('aabbOverlap() rejects separated boxes', () => {
    const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
    const b = { min: { x: 5, y: 5, z: 5 }, max: { x: 8, y: 8, z: 8 } };
    expect(aabbOverlap(a, b)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Pathfinding (Fallback)
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: WASM Bridge — A* Pathfinding', () => {
  it('astarFindPath() finds path through open grid', () => {
    const grid = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const path = astarFindPath(grid, 0, 0, 4, 2);
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 4, y: 2 });
  });

  it('astarFindPath() navigates around obstacles', () => {
    const grid = [
      [0, 1, 0, 0, 0],
      [0, 1, 0, 1, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    const path = astarFindPath(grid, 0, 0, 4, 0);
    expect(path.length).toBeGreaterThan(0);
    // Path should NOT go through blocked cells
    for (const wp of path) {
      expect(grid[wp.y][wp.x]).toBe(0);
    }
  });

  it('astarFindPath() returns empty for fully blocked destination', () => {
    const grid = [
      [0, 1, 0],
      [1, 1, 0],
      [0, 0, 0],
    ];
    // Target (0,0) is surrounded by walls — no path from (2,2)
    const path = astarFindPath(grid, 2, 2, 0, 0);
    expect(path).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Heightmap Generation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: WASM Bridge — Heightmap Generation', () => {
  it('generateHeightmap() creates correct dimensions', () => {
    const map = generateHeightmap(10, 8, 0.1, 42);
    expect(map).toHaveLength(8);
    expect(map[0]).toHaveLength(10);
  });

  it('generateHeightmap() values are bounded', () => {
    const map = generateHeightmap(16, 16, 0.05, 42);
    for (const row of map) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('generateHeightmap() is deterministic', () => {
    const a = generateHeightmap(8, 8, 0.1, 42);
    const b = generateHeightmap(8, 8, 0.1, 42);
    expect(a).toEqual(b);
  });
});
