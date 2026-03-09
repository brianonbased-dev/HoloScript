/**
 * AudioDiffractionSystem — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioDiffractionSystem } from '../AudioDiffraction';
import type { DiffractionEdge } from '../AudioDiffraction';

function makeSystem() {
  return new AudioDiffractionSystem();
}

// Simple providers for testing:
// LOS provider: always clear (returns true)
const clearLos = () => true;
// LOS provider: always blocked
const blockedLos = () => false;

function addEdge(id: string, x: number): DiffractionEdge {
  return {
    id,
    point1: { x, y: -1, z: 0 },
    point2: { x, y: 1, z: 0 },
  };
}

const src = { x: -5, y: 0, z: 0 };
const lst = { x: 5, y: 0, z: 0 };

describe('AudioDiffractionSystem — defaults', () => {
  it('constructs without throwing', () => {
    expect(() => makeSystem()).not.toThrow();
  });
  it('default config: enabled=true, maxPaths=2', () => {
    const cfg = makeSystem().getConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxPaths).toBe(2);
  });
  it('default frequency=1000Hz, speedOfSound=343', () => {
    const cfg = makeSystem().getConfig();
    expect(cfg.frequency).toBe(1000);
    expect(cfg.speedOfSound).toBe(343);
  });
});

describe('AudioDiffractionSystem — setConfig', () => {
  it('merges partial config', () => {
    const s = makeSystem();
    s.setConfig({ enabled: false });
    expect(s.getConfig().enabled).toBe(false);
    expect(s.getConfig().maxPaths).toBe(2); // unchanged
  });
  it('getConfig returns a copy (mutation safe)', () => {
    const s = makeSystem();
    const cfg = s.getConfig();
    cfg.frequency = 9999;
    expect(s.getConfig().frequency).toBe(1000);
  });
});

describe('AudioDiffractionSystem — disabled or no providers', () => {
  it('returns volumeMultiplier=1 when disabled', () => {
    const s = makeSystem();
    s.setConfig({ enabled: false });
    const r = s.computeDiffraction(src, lst, 's1');
    expect(r.volumeMultiplier).toBe(1);
    expect(r.hasDiffraction).toBe(false);
  });
  it('returns volumeMultiplier=1 when no providers set', () => {
    const r = makeSystem().computeDiffraction(src, lst, 's2');
    expect(r.volumeMultiplier).toBe(1);
    expect(r.paths).toHaveLength(0);
  });
  it('no diffraction when direct LOS is clear', () => {
    const s = makeSystem();
    s.setLineOfSightProvider(clearLos);
    s.setEdgeDetectionProvider(() => [addEdge('e1', 0)]);
    const r = s.computeDiffraction(src, lst, 's3');
    expect(r.hasDiffraction).toBe(false);
    expect(r.volumeMultiplier).toBe(1);
  });
});

describe('AudioDiffractionSystem — diffraction with blocked direct path', () => {
  function makeBlockedSystem(edges: DiffractionEdge[]) {
    const s = makeSystem();
    // LOS: direct path blocked, but edge sub-paths are clear
    let callCount = 0;
    s.setLineOfSightProvider((p1, p2) => {
      // First call is the direct LOS check → return false (blocked)
      // Subsequent calls (edge path checks) → return true (clear)
      callCount++;
      return callCount > 1;
    });
    s.setEdgeDetectionProvider(() => edges);
    return s;
  }

  it('hasDiffraction=true when path blocked and edge available', () => {
    const s = makeBlockedSystem([addEdge('e', 0)]);
    const r = s.computeDiffraction(src, lst, 'x');
    expect(r.hasDiffraction).toBe(true);
    expect(r.paths.length).toBeGreaterThan(0);
  });
  it('sourceId is preserved in result', () => {
    const s = makeBlockedSystem([addEdge('e', 0)]);
    expect(s.computeDiffraction(src, lst, 'mySource').sourceId).toBe('mySource');
  });
  it('combinedCoefficient in [0,1]', () => {
    const s = makeBlockedSystem([addEdge('e', 0)]);
    const r = s.computeDiffraction(src, lst, 'x');
    expect(r.combinedCoefficient).toBeGreaterThanOrEqual(0);
    expect(r.combinedCoefficient).toBeLessThanOrEqual(1);
  });
  it('limits paths to maxPaths=2 even with many edges', () => {
    const s = makeBlockedSystem([addEdge('e1', 0), addEdge('e2', 1), addEdge('e3', 2)]);
    const r = s.computeDiffraction(src, lst, 'x');
    expect(r.paths.length).toBeLessThanOrEqual(2);
  });
  it('paths sorted strongest coefficient first', () => {
    const s = makeBlockedSystem([addEdge('e1', 1), addEdge('e2', 2)]);
    const r = s.computeDiffraction(src, lst, 'x');
    if (r.paths.length >= 2) {
      expect(r.paths[0].diffractionCoefficient).toBeGreaterThanOrEqual(
        r.paths[1].diffractionCoefficient
      );
    }
  });
});

describe('AudioDiffractionSystem — cache', () => {
  it('getCachedResult returns undefined for uncached', () => {
    expect(makeSystem().getCachedResult('unknown')).toBeUndefined();
  });
  it('getCachedResult returns result after computeDiffraction', () => {
    const s = makeSystem();
    s.setLineOfSightProvider(clearLos);
    s.setEdgeDetectionProvider(() => []);
    s.computeDiffraction(src, lst, 'c1');
    expect(s.getCachedResult('c1')).toBeDefined();
  });
  it('clearCache empties all results', () => {
    const s = makeSystem();
    s.setLineOfSightProvider(clearLos);
    s.setEdgeDetectionProvider(() => []);
    s.computeDiffraction(src, lst, 'c1');
    s.clearCache();
    expect(s.getCachedResult('c1')).toBeUndefined();
  });
});

describe('AudioDiffractionSystem — integration helpers', () => {
  it('getVolumeMultiplier returns 1 when uncached', () => {
    expect(makeSystem().getVolumeMultiplier('unknown')).toBe(1.0);
  });
  it('hasDiffraction returns false when uncached', () => {
    expect(makeSystem().hasDiffraction('unknown')).toBe(false);
  });
  it('getDiffractionPaths returns [] when uncached', () => {
    expect(makeSystem().getDiffractionPaths('unknown')).toHaveLength(0);
  });
  it('hasDiffraction returns false when direct path is clear', () => {
    const s = makeSystem();
    s.setLineOfSightProvider(clearLos);
    s.setEdgeDetectionProvider(() => []);
    s.computeDiffraction(src, lst, 'q1');
    expect(s.hasDiffraction('q1')).toBe(false);
  });
});
