import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainLOD } from '../TerrainLOD';

const sampler = (x: number, z: number) => Math.sin(x * 0.1) * Math.cos(z * 0.1);

describe('TerrainLOD', () => {
  let lod: TerrainLOD;

  beforeEach(() => {
    lod = new TerrainLOD({ totalSize: 128, maxLOD: 3, baseResolution: 16, lodDistances: [50, 100, 200] });
  });

  it('generateQuadtree creates chunks', () => {
    lod.generateQuadtree(sampler);
    expect(lod.getTotalChunkCount()).toBeGreaterThan(0);
  });

  it('chunks have correct properties', () => {
    lod.generateQuadtree(sampler);
    const chunks = lod.getActiveChunks();
    for (const c of chunks) {
      expect(c.id).toBeDefined();
      expect(c.size).toBeGreaterThan(0);
      expect(c.resolution).toBeGreaterThanOrEqual(4);
      expect(c.heightData.length).toBe(c.resolution * c.resolution);
    }
  });

  it('selectLOD activates nearby chunks', () => {
    lod.generateQuadtree(sampler);
    lod.selectLOD(64, 64); // center
    expect(lod.getActiveChunkCount()).toBeGreaterThan(0);
  });

  it('selectLOD far away deactivates chunks', () => {
    lod.generateQuadtree(sampler);
    lod.selectLOD(99999, 99999); // far away
    // Most chunks should be inactive
    expect(lod.getActiveChunkCount()).toBeLessThan(lod.getTotalChunkCount());
  });

  it('getChunk retrieves by id', () => {
    lod.generateQuadtree(sampler);
    const all = lod.getActiveChunks();
    if (all.length > 0) {
      const chunk = lod.getChunk(all[0].id);
      expect(chunk).toBeDefined();
      expect(chunk!.id).toBe(all[0].id);
    }
  });

  it('getChunk returns undefined for missing', () => {
    expect(lod.getChunk('nonexistent')).toBeUndefined();
  });

  it('sampleHeight returns value for active chunk', () => {
    lod.generateQuadtree(sampler);
    lod.selectLOD(64, 64);
    const h = lod.sampleHeight(64, 64);
    expect(typeof h).toBe('number');
  });

  it('sampleHeight returns 0 outside active chunks', () => {
    lod.generateQuadtree(sampler);
    lod.selectLOD(0, 0);
    // A point far outside should return 0
    const h = lod.sampleHeight(99999, 99999);
    expect(h).toBe(0);
  });

  it('getStitchEdges returns edge flags', () => {
    lod.generateQuadtree(sampler);
    lod.selectLOD(64, 64);
    const chunks = lod.getActiveChunks();
    if (chunks.length > 0) {
      const edges = lod.getStitchEdges(chunks[0].id);
      expect(edges).toHaveProperty('north');
      expect(edges).toHaveProperty('south');
      expect(edges).toHaveProperty('east');
      expect(edges).toHaveProperty('west');
    }
  });

  it('getStitchEdges returns all false for missing chunk', () => {
    const edges = lod.getStitchEdges('nonexistent');
    expect(edges).toEqual({ north: false, south: false, east: false, west: false });
  });
});
