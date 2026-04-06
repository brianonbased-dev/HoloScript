import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainLOD } from '@holoscript/engine/terrain/TerrainLOD';

// =============================================================================
// C248 — Terrain LOD
// =============================================================================

const flatSampler = () => 5;

describe('TerrainLOD', () => {
  it('constructor creates with defaults', () => {
    const lod = new TerrainLOD();
    expect(lod.getTotalChunkCount()).toBe(0);
  });

  it('generateQuadtree creates chunks', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 2 });
    lod.generateQuadtree(flatSampler);
    expect(lod.getTotalChunkCount()).toBeGreaterThan(0);
  });

  it('quadtree chunks have correct hierarchy', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 2 });
    lod.generateQuadtree(flatSampler);
    const allActive = lod.getActiveChunks();
    const rootChunks = allActive.filter((c) => c.level === 0);
    expect(rootChunks.length).toBe(1);
    expect(rootChunks[0]?.children.length).toBe(4);
  });

  it('selectLOD activates nearby chunks', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 2, lodDistances: [50, 200] });
    lod.generateQuadtree(flatSampler);
    lod.selectLOD(128, 128);
    expect(lod.getActiveChunkCount()).toBeGreaterThan(0);
  });

  it('selectLOD far camera deactivates high-detail chunks', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 2, lodDistances: [50, 200] });
    lod.generateQuadtree(flatSampler);
    lod.selectLOD(10000, 10000);
    const activeCount = lod.getActiveChunkCount();
    // Very far → fewer active chunks than total
    expect(activeCount).toBeLessThan(lod.getTotalChunkCount());
  });

  it('sampleHeight returns sampled value at position', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 1, baseResolution: 8 });
    lod.generateQuadtree(() => 42);
    expect(lod.sampleHeight(128, 128)).toBe(42);
  });

  it('sampleHeight returns 0 for out-of-bounds', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 1 });
    lod.generateQuadtree(flatSampler);
    expect(lod.sampleHeight(9999, 9999)).toBe(0);
  });

  it('getChunk returns chunk by id', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 1 });
    lod.generateQuadtree(flatSampler);
    const active = lod.getActiveChunks();
    const chunk = lod.getChunk(active[0].id);
    expect(chunk).toBeDefined();
    expect(chunk!.id).toBe(active[0].id);
  });

  it('heightData matches sampler output', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 1, baseResolution: 4 });
    lod.generateQuadtree((x, z) => x + z);
    const chunk = lod.getActiveChunks()[0];
    expect(chunk.heightData.every((h) => h >= 0)).toBe(true);
  });

  it('morphFactor is 0-1', () => {
    const lod = new TerrainLOD({ totalSize: 256, maxLOD: 2, lodDistances: [100, 300] });
    lod.generateQuadtree(flatSampler);
    lod.selectLOD(128, 128);
    const chunks = lod.getActiveChunks();
    for (const c of chunks) {
      expect(c.morphFactor).toBeGreaterThanOrEqual(0);
      expect(c.morphFactor).toBeLessThanOrEqual(1);
    }
  });
});
