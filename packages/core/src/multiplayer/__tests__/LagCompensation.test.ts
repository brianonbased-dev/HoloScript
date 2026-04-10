import { describe, it, expect, beforeEach } from 'vitest';
import { LagCompensation } from '../LagCompensation';
import type { HistoryState, HitQuery } from '../LagCompensation';

describe('LagCompensation', () => {
  let lag: LagCompensation;

  beforeEach(() => {
    lag = new LagCompensation(60, 500);
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with defaults', () => {
      const lc = new LagCompensation();
      expect(lc.getHistoryLength()).toBe(0);
      expect(lc.getMaxRewindMs()).toBe(500);
    });

    it('creates with custom params', () => {
      const lc = new LagCompensation(30, 1000);
      expect(lc.getMaxRewindMs()).toBe(1000);
    });
  });

  // ===========================================================================
  // History Management
  // ===========================================================================
  describe('history', () => {
    it('pushState adds entries', () => {
      lag.pushState(makeState(100, { player1: [0, 0, 0, 1] }));
      expect(lag.getHistoryLength()).toBe(1);
    });

    it('caps history at max', () => {
      const lc = new LagCompensation(3, 500);
      for (let i = 0; i < 5; i++) {
        lc.pushState(makeState(i * 100, {}));
      }
      expect(lc.getHistoryLength()).toBe(3);
    });
  });

  // ===========================================================================
  // State Rewind
  // ===========================================================================
  describe('getStateAt', () => {
    it('returns null for empty history', () => {
      expect(lag.getStateAt(100)).toBeNull();
    });

    it('returns closest state to timestamp', () => {
      lag.pushState(makeState(100, { p: [1, 0, 0, 1] }));
      lag.pushState(makeState(200, { p: [2, 0, 0, 1] }));
      lag.pushState(makeState(300, { p: [3, 0, 0, 1] }));

      const state = lag.getStateAt(190);
      expect(state).not.toBeNull();
      expect(state!.timestamp).toBe(200);
    });

    it('returns exact match when available', () => {
      lag.pushState(makeState(100, {}));
      lag.pushState(makeState(200, {}));
      const state = lag.getStateAt(200);
      expect(state!.timestamp).toBe(200);
    });
  });

  // ===========================================================================
  // Hit Verification
  // ===========================================================================
  describe('verifyHit', () => {
    beforeEach(() => {
      lag.pushState(makeState(100, { target: [5, 0, 0, 2] }));
      lag.pushState(makeState(200, { target: [10, 0, 0, 2] }));
    });

    it('verifies a valid hit within radius', () => {
      const query: HitQuery = {
        originX: 10,
        originY: 0,
        originZ: 0,
        targetId: 'target',
        clientTimestamp: 250,
        clientLatency: 50, // rewind to 200
      };
      const result = lag.verifyHit(query);
      expect(result.hit).toBe(true);
      expect(result.distance).toBe(0);
      expect(result.targetPosition).toEqual({ x: 10, y: 0, z: 0 });
    });

    it('rejects hit outside radius', () => {
      const query: HitQuery = {
        originX: 100,
        originY: 100,
        originZ: 100,
        targetId: 'target',
        clientTimestamp: 250,
        clientLatency: 50,
      };
      const result = lag.verifyHit(query);
      expect(result.hit).toBe(false);
      expect(result.distance).toBeGreaterThan(2);
    });

    it('returns miss for unknown target', () => {
      const query: HitQuery = {
        originX: 0,
        originY: 0,
        originZ: 0,
        targetId: 'nonexistent',
        clientTimestamp: 250,
        clientLatency: 50,
      };
      const result = lag.verifyHit(query);
      expect(result.hit).toBe(false);
      expect(result.targetPosition).toBeNull();
    });

    it('returns miss for empty history', () => {
      const lc = new LagCompensation();
      const result = lc.verifyHit({
        originX: 0,
        originY: 0,
        originZ: 0,
        targetId: 'x',
        clientTimestamp: 100,
        clientLatency: 0,
      });
      expect(result.hit).toBe(false);
    });
  });

  // ===========================================================================
  // Latency Estimation
  // ===========================================================================
  describe('latency', () => {
    it('returns 0 for unknown player', () => {
      expect(lag.getLatency('unknown')).toBe(0);
    });

    it('updates latency with EMA', () => {
      lag.updateLatency('p1', 100);
      expect(lag.getLatency('p1')).toBe(100);

      lag.updateLatency('p1', 200);
      // EMA: 100 * 0.8 + 200 * 0.2 = 120
      expect(lag.getLatency('p1')).toBe(120);
    });

    it('tracks multiple players independently', () => {
      lag.updateLatency('p1', 50);
      lag.updateLatency('p2', 100);
      expect(lag.getLatency('p1')).toBe(50);
      expect(lag.getLatency('p2')).toBe(100);
    });
  });
});

// =============================================================================
// Helpers
// =============================================================================

function makeState(
  timestamp: number,
  entities: Record<string, [number, number, number, number]>
): HistoryState {
  const map = new Map<string, { x: number; y: number; z: number; radius: number }>();
  for (const [id, [x, y, z, r]] of Object.entries(entities)) {
    map.set(id, { x, y, z, radius: r });
  }
  return { timestamp, entities: map };
}
