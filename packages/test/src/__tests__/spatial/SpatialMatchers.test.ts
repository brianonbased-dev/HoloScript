/**
 * SpatialMatchers.test.ts — Tests for the vitest custom matchers
 *
 * Covers: toBeWithinVolume, toIntersect, toHaveIntersectionVolumeWith
 * with both SpatialEntity and BoundingBox as receivers.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupSpatialMatchers } from '../../spatial/SpatialMatchers';
import { BoundingBox } from '../../spatial/BoundingBox';
import { SpatialEntity } from '../../spatial/SpatialEntity';

beforeAll(() => {
  setupSpatialMatchers();
});

// ── toBeWithinVolume ─────────────────────────────────────────────────────────

describe('SpatialMatchers — toBeWithinVolume', () => {
  const room = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });

  it('passes when entity is fully inside', () => {
    const e = SpatialEntity.fromMinMax('inner', [2, 2, 2], [4, 4, 4]);
    expect(e).toBeWithinVolume(room);
  });

  it('fails when entity protrudes', () => {
    const e = SpatialEntity.fromMinMax('big', [-1, 0, 0], [5, 5, 5]);
    expect(() => expect(e).toBeWithinVolume(room)).toThrow();
  });

  it('works with .not for entities outside', () => {
    const e = SpatialEntity.fromMinMax('outside', [-5, -5, -5], [-1, -1, -1]);
    expect(e).not.toBeWithinVolume(room);
  });

  it('accepts a raw BoundingBox as receiver', () => {
    const bb = new BoundingBox({ x: 3, y: 3, z: 3 }, { x: 7, y: 7, z: 7 });
    expect(bb).toBeWithinVolume(room);
  });
});

// ── toIntersect ──────────────────────────────────────────────────────────────

describe('SpatialMatchers — toIntersect', () => {
  it('passes when two entities overlap', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [5, 5, 5]);
    const b = SpatialEntity.fromMinMax('b', [3, 3, 3], [8, 8, 8]);
    expect(a).toIntersect(b);
  });

  it('fails when two entities are separated', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [1, 1, 1]);
    const b = SpatialEntity.fromMinMax('b', [5, 5, 5], [6, 6, 6]);
    expect(() => expect(a).toIntersect(b)).toThrow();
  });

  it('.not.toIntersect passes for separated entities', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [1, 1, 1]);
    const b = SpatialEntity.fromMinMax('b', [5, 5, 5], [6, 6, 6]);
    expect(a).not.toIntersect(b);
  });

  it('.not.toIntersect fails for overlapping entities', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [5, 5, 5]);
    const b = SpatialEntity.fromMinMax('b', [3, 3, 3], [8, 8, 8]);
    expect(() => expect(a).not.toIntersect(b)).toThrow();
  });

  it('works with entity + BoundingBox', () => {
    const e = SpatialEntity.fromMinMax('e', [0, 0, 0], [5, 5, 5]);
    const bb = new BoundingBox({ x: 3, y: 3, z: 3 }, { x: 8, y: 8, z: 8 });
    expect(e).toIntersect(bb);
  });
});

// ── toHaveIntersectionVolumeWith ──────────────────────────────────────────────

describe('SpatialMatchers — toHaveIntersectionVolumeWith', () => {
  it('passes when intersection volume matches', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [4, 4, 4]);
    const b = SpatialEntity.fromMinMax('b', [2, 2, 2], [6, 6, 6]);
    // overlap: 2×2×2 = 8
    expect(a).toHaveIntersectionVolumeWith(b, 8);
  });

  it('fails when intersection volume does not match', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [4, 4, 4]);
    const b = SpatialEntity.fromMinMax('b', [2, 2, 2], [6, 6, 6]);
    expect(() => expect(a).toHaveIntersectionVolumeWith(b, 100)).toThrow();
  });

  it('respects tolerance parameter', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [4, 4, 4]);
    const b = SpatialEntity.fromMinMax('b', [2, 2, 2], [6, 6, 6]);
    // actual = 8, expected = 8.0005, tolerance = 0.001
    expect(a).toHaveIntersectionVolumeWith(b, 8.0005, 0.001);
  });

  it('returns 0 for non-overlapping boxes', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [1, 1, 1]);
    const b = SpatialEntity.fromMinMax('b', [5, 5, 5], [6, 6, 6]);
    expect(a).toHaveIntersectionVolumeWith(b, 0);
  });
});
