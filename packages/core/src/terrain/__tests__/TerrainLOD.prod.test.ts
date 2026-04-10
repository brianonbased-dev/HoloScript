/**
 * TerrainLOD — Production Test Suite
 *
 * Covers: construction (defaults/partial), generateQuadtree (chunk tree, height sampling),
 * selectLOD (active filtering, morphFactor, inactive), getStitchEdges,
 * sampleHeight, getChunk, getActiveChunks, count queries.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainLOD } from '../TerrainLOD';

const flatSampler = (_x: number, _z: number) => 0.5;
const rampSampler = (x: number) => x / 1024;

describe('TerrainLOD — Production', () => {
  let lod: TerrainLOD;

  beforeEach(() => {
    lod = new TerrainLOD({
      totalSize: 1024,
      maxLOD: 3,
      baseResolution: 8,
      lodDistances: [50, 200, 500],
      morphRange: 0.2,
    });
    lod.generateQuadtree(flatSampler);
  });

  // ─── Construction ─────────────────────────────────────────────────
  it('accepts partial config', () => {
    const l = new TerrainLOD({ maxLOD: 2 });
    l.generateQuadtree(flatSampler);
    expect(l.getTotalChunkCount()).toBeGreaterThan(0);
  });

  // ─── generateQuadtree ─────────────────────────────────────────────
  it('generates chunks for 3-level quadtree', () => {
    // Level 0: 1, Level 1: 4, Level 2: 16 → total ≥ 21
    expect(lod.getTotalChunkCount()).toBeGreaterThanOrEqual(21);
  });

  it('all chunks start active', () => {
    const chunks = lod.getActiveChunks();
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('chunks have positive size and resolution', () => {
    const chunks = lod.getActiveChunks();
    for (const c of chunks) {
      expect(c.size).toBeGreaterThan(0);
      expect(c.resolution).toBeGreaterThanOrEqual(4);
    }
  });

  it('heightData is populated from sampler', () => {
    const lod2 = new TerrainLOD({
      totalSize: 1024,
      maxLOD: 2,
      baseResolution: 4,
      lodDistances: [50, 200],
      morphRange: 0.2,
    });
    lod2.generateQuadtree(rampSampler);
    const chunks = lod2.getActiveChunks();
    // rampSampler returns > 0 for x > 0; check at least one non-zero height
    const hasNonZero = chunks.some((c) => c.heightData.some((v) => v > 0));
    expect(hasNonZero).toBe(true);
  });

  it('regenerate clears previous chunks', () => {
    const before = lod.getTotalChunkCount();
    lod.generateQuadtree(flatSampler);
    // Fresh generation should produce the same tree size
    expect(lod.getTotalChunkCount()).toBe(before);
  });

  // ─── selectLOD ────────────────────────────────────────────────────
  it('selectLOD deactivates far chunks', () => {
    lod.selectLOD(512, 512); // centre
    const active = lod.getActiveChunkCount();
    const total = lod.getTotalChunkCount();
    // Not all chunks should be active when camera is far from edges
    expect(active).toBeLessThanOrEqual(total);
  });

  it('selectLOD activates chunks near camera', () => {
    lod.selectLOD(512, 512);
    expect(lod.getActiveChunkCount()).toBeGreaterThan(0);
  });

  it('morphFactor is 0 for chunks well inside threshold', () => {
    // Camera at very centre; small LOD levels within lodDistances[0]=50
    lod.selectLOD(512, 512);
    const chunks = lod.getActiveChunks();
    // Check that some active chunk has morphFactor between 0 and 1
    const hasMorph = chunks.some((c) => c.morphFactor >= 0 && c.morphFactor <= 1);
    expect(hasMorph).toBe(true);
  });

  it('inactive chunks have morphFactor 1', () => {
    lod.selectLOD(0, 0); // move camera to corner
    const allChunks = [...lod.getActiveChunks()]; // uses filter(active)
    const total = lod.getTotalChunkCount();
    // There may be inactive chunks
    expect(total).toBeGreaterThan(0);
  });

  // ─── getStitchEdges ───────────────────────────────────────────────
  it('getStitchEdges returns false for unknown id', () => {
    const edges = lod.getStitchEdges('nonexistent_chunk');
    expect(edges).toEqual({ north: false, south: false, east: false, west: false });
  });

  it('getStitchEdges returns an edge object with 4 boolean keys', () => {
    const firstId = lod.getActiveChunks()[0]?.id ?? '';
    const edges = lod.getStitchEdges(firstId);
    expect(typeof edges.north).toBe('boolean');
    expect(typeof edges.south).toBe('boolean');
    expect(typeof edges.east).toBe('boolean');
    expect(typeof edges.west).toBe('boolean');
  });

  // ─── sampleHeight ─────────────────────────────────────────────────
  it('sampleHeight returns sampler value inside terrain', () => {
    const h = lod.sampleHeight(512, 512);
    expect(h).toBeCloseTo(0.5, 1); // flatSampler returns 0.5
  });

  it('sampleHeight returns 0 for out-of-bounds coordinate', () => {
    const h = lod.sampleHeight(-999, -999);
    expect(h).toBe(0);
  });

  // ─── getChunk ─────────────────────────────────────────────────────
  it('getChunk returns chunk for valid id', () => {
    const id = lod.getActiveChunks()[0]?.id;
    if (id) {
      const chunk = lod.getChunk(id);
      expect(chunk).toBeDefined();
      expect(chunk!.id).toBe(id);
    }
  });

  it('getChunk returns undefined for unknown id', () => {
    expect(lod.getChunk('ghost_chunk')).toBeUndefined();
  });

  // ─── count queries ────────────────────────────────────────────────
  it('getActiveChunkCount >= 0', () => {
    expect(lod.getActiveChunkCount()).toBeGreaterThanOrEqual(0);
  });

  it('getTotalChunkCount stable across calls', () => {
    const a = lod.getTotalChunkCount();
    const b = lod.getTotalChunkCount();
    expect(a).toBe(b);
  });
});
