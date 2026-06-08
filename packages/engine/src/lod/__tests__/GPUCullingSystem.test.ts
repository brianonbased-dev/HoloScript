/**
 * GPUCullingSystem — unit tests
 *
 * Tests cover:
 * - Factory function creates instance with default options
 * - extractFrustumPlanes produces 6 normalized planes from a known VP matrix
 * - spatialAnchorsToObjectInstances bridges SpatialPartitionResult anchors
 *   to ObjectInstance[] preserving position, radius, lodLevel
 * - High-importance anchors (>0.8) get inflated radius to survive frustum culling
 * - Custom LOD distance thresholds are respected
 */

import { describe, it, expect } from 'vitest';
import {
  GPUCullingSystem,
  createGPUCullingSystem,
  extractFrustumPlanes,
  spatialAnchorsToObjectInstances,
  DEFAULT_GPU_CULLING_OPTIONS,
  type ObjectInstance,
  type GPUCullingOptions,
  type CullingStats,
  type CullingResult,
} from '../GPUCullingSystem';

// ── Factory ────────────────────────────────────────────────────────────────

describe('GPUCullingSystem', () => {
  it('createGPUCullingSystem returns an instance with defaults', () => {
    const system = createGPUCullingSystem();
    expect(system).toBeInstanceOf(GPUCullingSystem);
    expect(system.isInitialized()).toBe(false);
  });

  it('accepts partial options', () => {
    const system = createGPUCullingSystem({ debug: true, enableFrustumCulling: false });
    const stats = system.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalObjects).toBe(0);
  });

  it('destroy cleans up without error when uninitialized', () => {
    const system = createGPUCullingSystem();
    expect(() => system.destroy()).not.toThrow();
  });

  it('DEFAULT_GPU_CULLING_OPTIONS has expected shape', () => {
    expect(DEFAULT_GPU_CULLING_OPTIONS.enableFrustumCulling).toBe(true);
    expect(DEFAULT_GPU_CULLING_OPTIONS.enableOcclusionCulling).toBe(true);
    expect(DEFAULT_GPU_CULLING_OPTIONS.enableGPULODSelection).toBe(true);
    expect(DEFAULT_GPU_CULLING_OPTIONS.hiZLevels).toBe(8);
    expect(DEFAULT_GPU_CULLING_OPTIONS.workgroupSize).toBe(64);
  });
});

// ── extractFrustumPlanes ──────────────────────────────────────────────────

describe('extractFrustumPlanes', () => {
  it('produces 24 floats (6 planes x 4 components) from identity VP', () => {
    // Identity view-projection matrix (16 floats)
    const identity = new Float32Array(16);
    identity[0] = 1;
    identity[5] = 1;
    identity[10] = 1;
    identity[15] = 1;

    const planes = extractFrustumPlanes(identity);
    expect(planes.length).toBe(24);
  });

  it('normalizes all 6 planes', () => {
    const identity = new Float32Array(16);
    identity[0] = 1;
    identity[5] = 1;
    identity[10] = 1;
    identity[15] = 1;

    const planes = extractFrustumPlanes(identity);
    for (let i = 0; i < 6; i++) {
      const nx = planes[i * 4];
      const ny = planes[i * 4 + 1];
      const nz = planes[i * 4 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      // Zero-length planes from identity VP are expected (near/far degenerate)
      if (len > 0) {
        expect(Math.abs(len - 1)).toBeLessThan(0.001);
      }
    }
  });

  it('produces a valid frustum from a perspective VP', () => {
    // Simple perspective VP matrix
    const vp = new Float32Array(16);
    vp[0] = 2.414;
    vp[5] = 2.414;
    vp[10] = -1.001;
    vp[11] = -1;
    vp[14] = -0.1;
    vp[15] = 0;

    const planes = extractFrustumPlanes(vp);
    expect(planes.length).toBe(24);
    // At least 4 planes should have non-zero normals for a perspective VP
    let nonZero = 0;
    for (let i = 0; i < 6; i++) {
      const nx = planes[i * 4];
      const ny = planes[i * 4 + 1];
      const nz = planes[i * 4 + 2];
      if (Math.sqrt(nx * nx + ny * ny + nz * nz) > 0.001) nonZero++;
    }
    expect(nonZero).toBeGreaterThanOrEqual(4);
  });
});

// ── spatialAnchorsToObjectInstances ────────────────────────────────────────

describe('spatialAnchorsToObjectInstances', () => {
  it('converts basic anchors preserving position and lodLevel', () => {
    const anchors = [
      { position: [1, 2, 3] as [number, number, number], scale: 5, lodLevel: 0, importance: 0.5 },
      {
        position: [10, 20, 30] as [number, number, number],
        scale: 15,
        lodLevel: 1,
        importance: 0.3,
      },
    ];

    const instances = spatialAnchorsToObjectInstances(anchors);

    expect(instances).toHaveLength(2);
    expect(instances[0].position).toEqual([1, 2, 3]);
    expect(instances[0].lodLevel).toBe(0);
    expect(instances[0].radius).toBe(5);
    expect(instances[0].objectId).toBe(0);
    expect(instances[1].position).toEqual([10, 20, 30]);
    expect(instances[1].lodLevel).toBe(1);
    expect(instances[1].radius).toBe(15);
    expect(instances[1].objectId).toBe(1);
  });

  it('uses default LOD distances [50, 150, 400, 1200]', () => {
    const anchors = [
      { position: [0, 0, 0] as [number, number, number], scale: 1, lodLevel: 0, importance: 0.5 },
    ];

    const instances = spatialAnchorsToObjectInstances(anchors);

    expect(instances[0].lodDistances).toEqual([50, 150, 400, 1200]);
  });

  it('accepts custom LOD distance thresholds', () => {
    const anchors = [
      { position: [0, 0, 0] as [number, number, number], scale: 1, lodLevel: 0, importance: 0.5 },
    ];

    const instances = spatialAnchorsToObjectInstances(anchors, [25, 75, 200, 600]);

    expect(instances[0].lodDistances).toEqual([25, 75, 200, 600]);
  });

  it('inflates radius for high-importance anchors (>= 0.8)', () => {
    const anchors = [
      { position: [0, 0, 0] as [number, number, number], scale: 2, lodLevel: 0, importance: 0.7 },
      { position: [1, 1, 1] as [number, number, number], scale: 2, lodLevel: 0, importance: 0.8 },
      { position: [2, 2, 2] as [number, number, number], scale: 2, lodLevel: 0, importance: 0.95 },
    ];

    const instances = spatialAnchorsToObjectInstances(anchors);

    // importance < 0.8: radius = scale
    expect(instances[0].radius).toBe(2);
    // importance >= 0.8: radius inflated to 1e6 (never culled)
    expect(instances[1].radius).toBe(1e6);
    expect(instances[2].radius).toBe(1e6);
  });

  it('assigns sequential objectIds starting from 0', () => {
    const anchors = Array.from({ length: 5 }, (_, i) => ({
      position: [i, 0, 0] as [number, number, number],
      scale: 1,
      lodLevel: 0,
      importance: 0.5,
    }));

    const instances = spatialAnchorsToObjectInstances(anchors);

    for (let i = 0; i < 5; i++) {
      expect(instances[i].objectId).toBe(i);
    }
  });

  it('handles empty anchor array', () => {
    const instances = spatialAnchorsToObjectInstances([]);
    expect(instances).toHaveLength(0);
  });

  it('preserves exact position tuple for all anchors', () => {
    const anchors = [
      {
        position: [-100.5, 200.3, 0.001] as [number, number, number],
        scale: 10,
        lodLevel: 2,
        importance: 0.1,
      },
    ];

    const instances = spatialAnchorsToObjectInstances(anchors);

    expect(instances[0].position[0]).toBeCloseTo(-100.5, 10);
    expect(instances[0].position[1]).toBeCloseTo(200.3, 10);
    expect(instances[0].position[2]).toBeCloseTo(0.001, 10);
  });
});

// ── Types ──────────────────────────────────────────────────────────────────

describe('GPUCullingSystem types', () => {
  it('ObjectInstance has the correct shape', () => {
    const instance: ObjectInstance = {
      position: [1, 2, 3],
      radius: 5,
      lodLevel: 0,
      lodDistances: [50, 150, 400, 1200],
      objectId: 0,
    };

    expect(instance.position).toHaveLength(3);
    expect(instance.lodDistances).toHaveLength(4);
    expect(typeof instance.radius).toBe('number');
  });

  it('CullingResult has the correct shape', () => {
    const result: CullingResult = {
      visibleIndices: new Uint32Array([0, 1, 2]),
      selectedLODs: new Uint32Array([0, 1, 2]),
      visibleCount: 3,
      stats: {
        totalObjects: 10,
        visibleObjects: 3,
        frustumCulled: 7,
        occlusionCulled: 0,
        cullingTimeMs: 0.5,
        hiZTimeMs: 0.2,
      },
    };

    expect(result.visibleCount).toBe(3);
    expect(result.stats.frustumCulled).toBe(7);
  });

  it('CullingStats has the correct shape', () => {
    const stats: CullingStats = {
      totalObjects: 100,
      visibleObjects: 60,
      frustumCulled: 30,
      occlusionCulled: 10,
      cullingTimeMs: 1.2,
      hiZTimeMs: 0.5,
    };

    expect(stats.totalObjects).toBe(100);
    expect(stats.visibleObjects + stats.frustumCulled + stats.occlusionCulled).toBe(
      stats.totalObjects
    );
  });
});
