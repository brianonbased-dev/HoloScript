/**
 * LODSystem — production test suite
 *
 * Tests: entity registration, level selection based on distance,
 * unregistration, multi-entity updates, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LODSystem } from '../LODSystem';
import type { LODConfig } from '../LODSystem';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAMERA_ORIGIN = [0, 0, 0];

function makeConfig(entityId: string): LODConfig {
  return {
    entityId,
    levels: [
      { minDistance: 0, label: 'high' },
      { minDistance: 20, label: 'medium' },
      { minDistance: 50, label: 'low' },
      { minDistance: 100, label: 'billboard' },
    ],
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('LODSystem: production', () => {
  let lod: LODSystem;

  beforeEach(() => {
    lod = new LODSystem();
  });

  // ─── Registration ─────────────────────────────────────────────────────────
  describe('register / count', () => {
    it('starts with 0 registered entities', () => {
      expect(lod.count).toBe(0);
    });

    it('increments count on register', () => {
      lod.register(makeConfig('e1'));
      expect(lod.count).toBe(1);
    });

    it('can register multiple entities', () => {
      lod.register(makeConfig('e1'));
      lod.register(makeConfig('e2'));
      lod.register(makeConfig('e3'));
      expect(lod.count).toBe(3);
    });
  });

  // ─── Unregistration ───────────────────────────────────────────────────────
  describe('unregister', () => {
    it('decrements count after unregister', () => {
      lod.register(makeConfig('e1'));
      lod.unregister('e1');
      expect(lod.count).toBe(0);
    });

    it('removes active result after unregister', () => {
      lod.register(makeConfig('e1'));
      const positions = new Map([['e1', [5, 0, 0]]]);
      lod.update(CAMERA_ORIGIN, positions);
      lod.unregister('e1');
      expect(lod.getActiveLevel('e1')).toBeUndefined();
    });

    it('unregistering unknown entity is a no-op', () => {
      expect(() => lod.unregister('nonexistent')).not.toThrow();
    });
  });

  // ─── Level selection ──────────────────────────────────────────────────────
  describe('update / getActiveLevel', () => {
    it('selects high detail at close range', () => {
      lod.register(makeConfig('hero'));
      const positions = new Map([['hero', [5, 0, 0]]]);
      lod.update(CAMERA_ORIGIN, positions);
      expect(lod.getActiveLevel('hero')).toBe('high');
    });

    it('selects medium detail at medium range', () => {
      lod.register(makeConfig('hero'));
      const positions = new Map([['hero', [30, 0, 0]]]);
      lod.update(CAMERA_ORIGIN, positions);
      expect(lod.getActiveLevel('hero')).toBe('medium');
    });

    it('selects low detail at far range', () => {
      lod.register(makeConfig('hero'));
      const positions = new Map([['hero', [70, 0, 0]]]);
      lod.update(CAMERA_ORIGIN, positions);
      expect(lod.getActiveLevel('hero')).toBe('low');
    });

    it('selects billboard at very far range', () => {
      lod.register(makeConfig('hero'));
      const positions = new Map([['hero', [120, 0, 0]]]);
      lod.update(CAMERA_ORIGIN, positions);
      expect(lod.getActiveLevel('hero')).toBe('billboard');
    });

    it('returns undefined for unregistered entity', () => {
      expect(lod.getActiveLevel('ghost')).toBeUndefined();
    });

    it('skips entity if no position provided', () => {
      lod.register(makeConfig('e1'));
      lod.update(CAMERA_ORIGIN, new Map()); // no positions
      expect(lod.getActiveLevel('e1')).toBeUndefined();
    });

    it('handles 3D diagonal distance correctly', () => {
      lod.register(makeConfig('obj'));
      // distance = sqrt(15^2 + 15^2) ≈ 21.21 → medium
      const positions = new Map([['obj', [15, 0, 15]]]);
      lod.update(CAMERA_ORIGIN, positions);
      expect(lod.getActiveLevel('obj')).toBe('medium');
    });
  });

  // ─── getAllResults ─────────────────────────────────────────────────────────
  describe('getAllResults', () => {
    it('returns empty array before any update', () => {
      lod.register(makeConfig('e1'));
      expect(lod.getAllResults()).toHaveLength(0);
    });

    it('returns results for all updated entities', () => {
      lod.register(makeConfig('e1'));
      lod.register(makeConfig('e2'));
      const positions = new Map([
        ['e1', [5, 0, 0]],
        ['e2', [60, 0, 0]],
      ]);
      lod.update(CAMERA_ORIGIN, positions);
      const results = lod.getAllResults();
      expect(results).toHaveLength(2);
    });

    it('result contains entityId, activeLevel, and distance', () => {
      lod.register(makeConfig('e1'));
      const positions = new Map([['e1', [10, 0, 0]]]);
      lod.update(CAMERA_ORIGIN, positions);
      const result = lod.getAllResults()[0];
      expect(result.entityId).toBe('e1');
      expect(result.activeLevel).toBe('high');
      expect(result.distance).toBeCloseTo(10);
    });
  });

  // ─── Level sorting ────────────────────────────────────────────────────────
  it('sorts levels by minDistance even if registered out of order', () => {
    lod.register({
      entityId: 'unsorted',
      levels: [
        { minDistance: 50, label: 'low' },
        { minDistance: 0, label: 'high' },
        { minDistance: 20, label: 'medium' },
      ],
    });
    const positions = new Map([['unsorted', [5, 0, 0]]]);
    lod.update(CAMERA_ORIGIN, positions);
    expect(lod.getActiveLevel('unsorted')).toBe('high');
  });
});
