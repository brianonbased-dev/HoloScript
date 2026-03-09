/**
 * MorphTargets.prod.test.ts
 * Production tests for MorphTargetSystem — target CRUD, weight clamping,
 * vertex deformation, presets, lerpWeights, and active target queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MorphTargetSystem, MorphDelta } from '../MorphTargets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeltas(...vertexOffsets: [number, number, number, number][]): MorphDelta[] {
  return vertexOffsets.map(([vi, dx, dy, dz]) => ({ vertexIndex: vi, dx, dy, dz }));
}

/** Create base positions as flat Float32Array: [v0x,v0y,v0z, v1x,v1y,v1z, ...] */
function makeBasePositions(count: number, value = 0): Float32Array {
  return new Float32Array(count * 3).fill(value);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MorphTargetSystem', () => {
  let mts: MorphTargetSystem;

  beforeEach(() => {
    mts = new MorphTargetSystem(10); // 10 vertices
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  describe('construction', () => {
    it('starts with zero targets', () => {
      expect(mts.getTargetCount()).toBe(0);
    });

    it('reports the correct vertex count', () => {
      expect(mts.getVertexCount()).toBe(10);
    });

    it('no active targets initially', () => {
      expect(mts.getActiveTargets()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // addTarget / removeTarget
  // -------------------------------------------------------------------------
  describe('addTarget() / removeTarget()', () => {
    it('addTarget increments count', () => {
      mts.addTarget('smile', makeDeltas([0, 1, 0, 0]));
      expect(mts.getTargetCount()).toBe(1);
    });

    it('addTarget sets initial weight to 0', () => {
      mts.addTarget('smile', makeDeltas([0, 1, 0, 0]));
      expect(mts.getWeight('smile')).toBe(0);
    });

    it('removeTarget decrements count', () => {
      mts.addTarget('smile', []);
      mts.addTarget('frown', []);
      mts.removeTarget('smile');
      expect(mts.getTargetCount()).toBe(1);
    });

    it('removeTarget is a no-op for missing target', () => {
      mts.addTarget('smile', []);
      mts.removeTarget('missing');
      expect(mts.getTargetCount()).toBe(1);
    });

    it('overwriting a target replaces it (same key)', () => {
      mts.addTarget('smile', makeDeltas([0, 1, 0, 0]));
      mts.addTarget('smile', makeDeltas([0, 9, 0, 0]));
      expect(mts.getTargetCount()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Weight
  // -------------------------------------------------------------------------
  describe('setWeight() / getWeight()', () => {
    it('getWeight returns 0 for unknown target', () => {
      expect(mts.getWeight('unknown')).toBe(0);
    });

    it('sets weight within [0,1]', () => {
      mts.addTarget('blink', []);
      mts.setWeight('blink', 0.7);
      expect(mts.getWeight('blink')).toBeCloseTo(0.7, 5);
    });

    it('clamps weight below 0 to 0', () => {
      mts.addTarget('blink', []);
      mts.setWeight('blink', -0.5);
      expect(mts.getWeight('blink')).toBe(0);
    });

    it('clamps weight above 1 to 1', () => {
      mts.addTarget('blink', []);
      mts.setWeight('blink', 2);
      expect(mts.getWeight('blink')).toBe(1);
    });

    it('setWeight is a no-op for unknown target', () => {
      expect(() => mts.setWeight('missing', 0.5)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // computeDeformedPositions
  // -------------------------------------------------------------------------
  describe('computeDeformedPositions()', () => {
    it('returns copy of base when no active targets', () => {
      const base = makeBasePositions(10, 5);
      const result = mts.computeDeformedPositions(base);
      expect(result).not.toBe(base); // new array
      for (let i = 0; i < base.length; i++) {
        expect(result[i]).toBe(base[i]);
      }
    });

    it('applies delta at full weight=1', () => {
      mts.addTarget('smile', makeDeltas([0, 5, 0, 0])); // v0 dx += 5
      mts.setWeight('smile', 1);
      const base = makeBasePositions(10, 0);
      const result = mts.computeDeformedPositions(base);
      expect(result[0]).toBeCloseTo(5, 5); // v0.x += 5
      expect(result[1]).toBeCloseTo(0, 5); // v0.y unchanged
    });

    it('scales delta by weight', () => {
      mts.addTarget('smile', makeDeltas([0, 10, 0, 0]));
      mts.setWeight('smile', 0.5);
      const base = makeBasePositions(10, 0);
      const result = mts.computeDeformedPositions(base);
      expect(result[0]).toBeCloseTo(5, 5); // 10 * 0.5
    });

    it('skips targets at weight=0 (no change)', () => {
      mts.addTarget('smile', makeDeltas([0, 100, 0, 0]));
      // weight stays at 0
      const base = makeBasePositions(10, 0);
      const result = mts.computeDeformedPositions(base);
      expect(result[0]).toBe(0);
    });

    it('accumulates multiple targets', () => {
      mts.addTarget('smile', makeDeltas([0, 3, 0, 0]));
      mts.addTarget('brow', makeDeltas([0, 7, 0, 0]));
      mts.setWeight('smile', 1);
      mts.setWeight('brow', 1);
      const base = makeBasePositions(10, 0);
      const result = mts.computeDeformedPositions(base);
      expect(result[0]).toBeCloseTo(10, 5); // 3 + 7
    });

    it('applies dy and dz deltas correctly', () => {
      mts.addTarget('pucker', makeDeltas([2, 0, 4, 6])); // v2 dx=0 dy=4 dz=6
      mts.setWeight('pucker', 1);
      const base = makeBasePositions(10, 0);
      const result = mts.computeDeformedPositions(base);
      const vi = 2 * 3;
      expect(result[vi]).toBeCloseTo(0, 5); // dx
      expect(result[vi + 1]).toBeCloseTo(4, 5); // dy
      expect(result[vi + 2]).toBeCloseTo(6, 5); // dz
    });

    it('ignores deltas for vertex indices beyond array bounds', () => {
      mts.addTarget('overflow', makeDeltas([25, 99, 99, 99])); // vertex 25 * 3 = 75 ≥ 30 (10 verts)
      mts.setWeight('overflow', 1);
      const base = makeBasePositions(10, 0);
      const result = mts.computeDeformedPositions(base);
      // No crash, nothing changed
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBe(0);
      }
    });

    it('does not mutate the original base array', () => {
      mts.addTarget('smile', makeDeltas([0, 5, 0, 0]));
      mts.setWeight('smile', 1);
      const base = makeBasePositions(10, 0);
      mts.computeDeformedPositions(base);
      expect(base[0]).toBe(0); // unchanged
    });
  });

  // -------------------------------------------------------------------------
  // Presets
  // -------------------------------------------------------------------------
  describe('addPreset() / applyPreset()', () => {
    it('applyPreset sets weights for listed targets', () => {
      mts.addTarget('smile', []);
      mts.addTarget('blink', []);
      mts.addPreset(
        'happy',
        new Map([
          ['smile', 0.8],
          ['blink', 0.3],
        ])
      );
      mts.applyPreset('happy');
      expect(mts.getWeight('smile')).toBeCloseTo(0.8, 5);
      expect(mts.getWeight('blink')).toBeCloseTo(0.3, 5);
    });

    it('applyPreset is a no-op for unknown preset', () => {
      mts.addTarget('smile', []);
      mts.setWeight('smile', 0.5);
      mts.applyPreset('nonexistent');
      expect(mts.getWeight('smile')).toBeCloseTo(0.5, 5); // unchanged
    });

    it('multiple presets can be stored and applied independently', () => {
      mts.addTarget('smile', []);
      mts.addPreset('happy', new Map([['smile', 1]]));
      mts.addPreset('neutral', new Map([['smile', 0]]));
      mts.applyPreset('happy');
      expect(mts.getWeight('smile')).toBe(1);
      mts.applyPreset('neutral');
      expect(mts.getWeight('smile')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // lerpWeights
  // -------------------------------------------------------------------------
  describe('lerpWeights()', () => {
    it('lerps existing weight toward target at given t', () => {
      mts.addTarget('blink', []);
      mts.setWeight('blink', 0);
      mts.lerpWeights(new Map([['blink', 1]]), 0.5);
      expect(mts.getWeight('blink')).toBeCloseTo(0.5, 5);
    });

    it('t=1 snaps to target weight', () => {
      mts.addTarget('smile', []);
      mts.setWeight('smile', 0.2);
      mts.lerpWeights(new Map([['smile', 0.8]]), 1);
      expect(mts.getWeight('smile')).toBeCloseTo(0.8, 5);
    });

    it('t=0 leaves weight unchanged', () => {
      mts.addTarget('smile', []);
      mts.setWeight('smile', 0.3);
      mts.lerpWeights(new Map([['smile', 0.9]]), 0);
      expect(mts.getWeight('smile')).toBeCloseTo(0.3, 5);
    });

    it('skips unknown targets gracefully', () => {
      expect(() => mts.lerpWeights(new Map([['ghost', 1]]), 0.5)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getActiveTargets
  // -------------------------------------------------------------------------
  describe('getActiveTargets()', () => {
    it('returns empty array when all weights are 0', () => {
      mts.addTarget('smile', []);
      mts.addTarget('blink', []);
      expect(mts.getActiveTargets()).toHaveLength(0);
    });

    it('includes targets with weight > 0', () => {
      mts.addTarget('smile', []);
      mts.addTarget('blink', []);
      mts.setWeight('smile', 0.5);
      expect(mts.getActiveTargets()).toContain('smile');
      expect(mts.getActiveTargets()).not.toContain('blink');
    });

    it('excludes targets after weight reset to 0', () => {
      mts.addTarget('smile', []);
      mts.setWeight('smile', 0.5);
      mts.setWeight('smile', 0);
      expect(mts.getActiveTargets()).toHaveLength(0);
    });
  });
});
