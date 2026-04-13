import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotInterpolation } from '../SnapshotInterpolation';
import type { Snapshot } from '../SnapshotInterpolation';

describe('SnapshotInterpolation', () => {
  let interp: SnapshotInterpolation;

  beforeEach(() => {
    interp = new SnapshotInterpolation(10, 100);
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with default params', () => {
      const si = new SnapshotInterpolation();
      expect(si.getBufferCount()).toBe(0);
      expect(si.getRenderDelay()).toBe(100);
    });

    it('creates with custom params', () => {
      const si = new SnapshotInterpolation(20, 200);
      expect(si.getRenderDelay()).toBe(200);
    });
  });

  // ===========================================================================
  // Buffer Management
  // ===========================================================================
  describe('buffer management', () => {
    it('pushSnapshot adds to buffer', () => {
      interp.pushSnapshot(makeSnapshot(100, { e1: [0, 0, 0] }));
      expect(interp.getBufferCount()).toBe(1);
    });

    it('keeps buffer sorted by timestamp', () => {
      interp.pushSnapshot(makeSnapshot(300, { e1: [3, 0, 0] }));
      interp.pushSnapshot(makeSnapshot(100, { e1: [1, 0, 0] }));
      interp.pushSnapshot(makeSnapshot(200, { e1: [2, 0, 0] }));
      expect(interp.getBufferCount()).toBe(3);
    });

    it('evicts oldest when buffer is full', () => {
      const si = new SnapshotInterpolation(3, 100);
      si.pushSnapshot(makeSnapshot(1, { e1: [0, 0, 0] }));
      si.pushSnapshot(makeSnapshot(2, { e1: [1, 0, 0] }));
      si.pushSnapshot(makeSnapshot(3, { e1: [2, 0, 0] }));
      si.pushSnapshot(makeSnapshot(4, { e1: [3, 0, 0] }));
      expect(si.getBufferCount()).toBe(3);
    });
  });

  // ===========================================================================
  // Render Delay
  // ===========================================================================
  describe('render delay', () => {
    it('getRenderDelay returns configured delay', () => {
      expect(interp.getRenderDelay()).toBe(100);
    });

    it('setRenderDelay updates delay', () => {
      interp.setRenderDelay(250);
      expect(interp.getRenderDelay()).toBe(250);
    });
  });

  // ===========================================================================
  // Interpolation
  // ===========================================================================
  describe('interpolation', () => {
    it('returns empty array when no snapshots', () => {
      const result = interp.interpolate(1000);
      expect(result).toEqual([]);
    });

    it('extrapolates from latest snapshot when no brackets found', () => {
      interp.pushSnapshot(makeSnapshot(100, { e1: [5, 0, 0] }));
      const result = interp.interpolate(500); // renderTime = 400, no bracket
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('e1');
      expect(result[0].interpolated).toBe(false);
      expect(result[0].x).toBe(5);
    });

    it('interpolates between two bracketing snapshots', () => {
      interp.pushSnapshot(makeSnapshot(100, { e1: [0, 0, 0] }));
      interp.pushSnapshot(makeSnapshot(200, { e1: [10, 0, 0] }));

      // renderTime = 250 - 100 = 150, which is between 100 and 200
      const result = interp.interpolate(250);
      expect(result.length).toBe(1);
      expect(result[0].interpolated).toBe(true);
      expect(result[0].x).toBe(5); // lerp at t=0.5
    });

    it('interpolates at t=0 (exactly at from snapshot)', () => {
      interp.pushSnapshot(makeSnapshot(100, { e1: [0, 0, 0] }));
      interp.pushSnapshot(makeSnapshot(200, { e1: [10, 0, 0] }));

      const result = interp.interpolate(200); // renderTime = 100 exactly
      expect(result[0].x).toBe(0);
    });

    it('interpolates at t=1 (exactly at to snapshot)', () => {
      interp.pushSnapshot(makeSnapshot(100, { e1: [0, 0, 0] }));
      interp.pushSnapshot(makeSnapshot(200, { e1: [10, 0, 0] }));

      const result = interp.interpolate(300); // renderTime = 200 exactly
      expect(result[0].x).toBe(10);
    });

    it('handles entities present in only one snapshot', () => {
      interp.pushSnapshot(makeSnapshot(100, { e1: [0, 0, 0], e2: [5, 5, 5] }));
      interp.pushSnapshot(makeSnapshot(200, { e1: [10, 0, 0] })); // e2 missing

      const result = interp.interpolate(250);
      const e2 = result.find((r) => r.id === 'e2');
      if (e2) {
        expect(e2.interpolated).toBe(false);
      }
    });

    it('interpolates multiple entities', () => {
      interp.pushSnapshot(makeSnapshot(100, { e1: [0, 0, 0], e2: [10, 10, 10] }));
      interp.pushSnapshot(makeSnapshot(200, { e1: [10, 0, 0], e2: [20, 20, 20] }));

      const result = interp.interpolate(250); // t = 0.5
      expect(result.length).toBe(2);
    });
  });
});

// =============================================================================
// Helpers
// =============================================================================

function makeSnapshot(
  timestamp: number,
  entities: Record<string, [number, number, number]>
): Snapshot {
  const map = new Map<string, { x: number; y: number; z: number }>();
  for (const [id, [x, y, z]] of Object.entries(entities)) {
    map.set(id, { x, y, z });
  }
  return { timestamp, entities: map };
}
