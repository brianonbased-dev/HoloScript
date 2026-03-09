import { describe, it, expect, beforeEach } from 'vitest';
import { DecalBatcher, type DecalInstance } from '../DecalBatcher';

function decal(id: string, tex: string, x = 0, y = 0, z = 0, opacity = 1): DecalInstance {
  return {
    id,
    textureId: tex,
    position: { x, y, z },
    scale: { x: 1, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    opacity,
    lodLevel: 0,
  };
}

describe('DecalBatcher', () => {
  let db: DecalBatcher;

  beforeEach(() => {
    db = new DecalBatcher();
  });

  // Instance management
  it('addInstance increases count', () => {
    db.addInstance(decal('d1', 'blood'));
    expect(db.getInstanceCount()).toBe(1);
  });

  it('removeInstance deletes instance', () => {
    db.addInstance(decal('d1', 'blood'));
    expect(db.removeInstance('d1')).toBe(true);
    expect(db.getInstanceCount()).toBe(0);
  });

  it('removeInstance returns false for unknown', () => {
    expect(db.removeInstance('nope')).toBe(false);
  });

  it('clear empties all', () => {
    db.addInstance(decal('d1', 'a'));
    db.addInstance(decal('d2', 'b'));
    db.clear();
    expect(db.getInstanceCount()).toBe(0);
  });

  // LOD
  it('computeLOD returns 0 for close distance', () => {
    expect(db.computeLOD(10)).toBe(0);
  });

  it('computeLOD returns higher for far distance', () => {
    expect(db.computeLOD(150)).toBe(2);
  });

  it('computeLOD returns maxLOD beyond all distances', () => {
    expect(db.computeLOD(10000)).toBe(3);
  });

  it('setLODDistances updates thresholds', () => {
    db.setLODDistances([20, 40]);
    expect(db.getLODDistances()).toEqual([20, 40]);
    expect(db.computeLOD(30)).toBe(1);
  });

  // Batching
  it('buildBatches groups by texture and LOD', () => {
    db.addInstance(decal('d1', 'tex_a', 0, 0, 0));
    db.addInstance(decal('d2', 'tex_a', 1, 0, 0));
    db.addInstance(decal('d3', 'tex_b', 2, 0, 0));
    const batches = db.buildBatches({ x: 0, y: 0, z: 0 });
    expect(batches.length).toBeGreaterThanOrEqual(2);
  });

  it('buildBatches culls zero-opacity', () => {
    db.addInstance(decal('d1', 'a', 0, 0, 0, 0));
    const batches = db.buildBatches({ x: 0, y: 0, z: 0 });
    const stats = db.getStats();
    expect(stats.culledCount).toBe(1);
    expect(stats.drawnCount).toBe(0);
  });

  it('buildBatches applies frustum test', () => {
    db.addInstance(decal('d1', 'a', 0, 0, 0));
    db.addInstance(decal('d2', 'a', 100, 0, 0));
    const batches = db.buildBatches(
      { x: 0, y: 0, z: 0 },
      (pos) => pos.x < 50 // only nearby
    );
    expect(db.getStats().culledCount).toBe(1);
  });

  // Stats
  it('getStats reflects batch results', () => {
    db.addInstance(decal('d1', 'a'));
    db.buildBatches({ x: 0, y: 0, z: 0 });
    const s = db.getStats();
    expect(s.totalInstances).toBe(1);
    expect(s.drawnCount).toBe(1);
  });

  it('getStats returns copy', () => {
    const a = db.getStats();
    const b = db.getStats();
    expect(a).not.toBe(b);
  });
});
