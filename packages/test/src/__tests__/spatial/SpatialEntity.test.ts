/**
 * SpatialEntity.test.ts — Tests for the SpatialEntity scene object
 *
 * Covers: static factories (at, fromBounds, fromMinMax),
 * position accessor, moveTo, translate, intersection helpers,
 * and toString.
 */

import { describe, it, expect } from 'vitest';
import { SpatialEntity } from '../../spatial/SpatialEntity';
import { BoundingBox } from '../../spatial/BoundingBox';

// ── Factories ────────────────────────────────────────────────────────────────

describe('SpatialEntity — factories', () => {
  it('SpatialEntity.at() places entity at bottom-center', () => {
    const crate = SpatialEntity.at('crate', { position: [0, 0, 0], size: [2, 3, 2] });
    expect(crate.id).toBe('crate');
    expect(crate.bounds.min).toEqual({ x: -1, y: 0, z: -1 });
    expect(crate.bounds.max).toEqual({ x: 1, y: 3, z: 1 });
  });

  it('SpatialEntity.at() accepts tags', () => {
    const e = SpatialEntity.at('npc', { position: [0, 0, 0], size: [1, 2, 1], tags: ['enemy', 'ai'] });
    expect(e.tags).toEqual(['enemy', 'ai']);
  });

  it('SpatialEntity.fromBounds() wraps an existing BoundingBox', () => {
    const bb = new BoundingBox({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 });
    const e = SpatialEntity.fromBounds('wall', bb);
    expect(e.id).toBe('wall');
    expect(e.bounds).toBe(bb);
  });

  it('SpatialEntity.fromMinMax() creates from corner tuples', () => {
    const e = SpatialEntity.fromMinMax('floor', [0, 0, 0], [10, 0.1, 10]);
    expect(e.bounds.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(e.bounds.max).toEqual({ x: 10, y: 0.1, z: 10 });
  });
});

// ── Accessors ────────────────────────────────────────────────────────────────

describe('SpatialEntity — accessors', () => {
  it('position returns bottom-center of bounds', () => {
    const e = SpatialEntity.at('box', { position: [3, 5, 7], size: [2, 4, 2] });
    const pos = e.position;
    expect(pos.x).toBeCloseTo(3, 5);
    expect(pos.y).toBeCloseTo(5, 5);
    expect(pos.z).toBeCloseTo(7, 5);
  });
});

// ── Movement ─────────────────────────────────────────────────────────────────

describe('SpatialEntity — movement', () => {
  it('moveTo() repositions at new bottom-center', () => {
    const e = SpatialEntity.at('box', { position: [0, 0, 0], size: [2, 2, 2] });
    e.moveTo({ x: 10, y: 5, z: 10 });
    expect(e.position.x).toBeCloseTo(10, 5);
    expect(e.position.y).toBeCloseTo(5, 5);
    expect(e.bounds.size().x).toBeCloseTo(2, 5); // size preserved
  });

  it('moveTo() returns `this` for chaining', () => {
    const e = SpatialEntity.at('a', { position: [0, 0, 0], size: [1, 1, 1] });
    expect(e.moveTo({ x: 1, y: 1, z: 1 })).toBe(e);
  });

  it('translate() shifts bounds by delta', () => {
    const e = SpatialEntity.at('box', { position: [0, 0, 0], size: [2, 2, 2] });
    e.translate({ x: 5, y: 0, z: 0 });
    expect(e.bounds.min.x).toBeCloseTo(4, 5);
    expect(e.bounds.max.x).toBeCloseTo(6, 5);
  });

  it('translate() returns `this` for chaining', () => {
    const e = SpatialEntity.at('a', { position: [0, 0, 0], size: [1, 1, 1] });
    expect(e.translate({ x: 0, y: 0, z: 0 })).toBe(e);
  });
});

// ── Spatial helpers ──────────────────────────────────────────────────────────

describe('SpatialEntity — spatial helpers', () => {
  it('intersects() detects overlap between entities', () => {
    const a = SpatialEntity.at('a', { position: [0, 0, 0], size: [2, 2, 2] });
    const b = SpatialEntity.at('b', { position: [1, 0, 0], size: [2, 2, 2] });
    expect(a.intersects(b)).toBe(true);
  });

  it('intersects() accepts a BoundingBox directly', () => {
    const a = SpatialEntity.at('a', { position: [0, 0, 0], size: [2, 2, 2] });
    const bb = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 });
    expect(a.intersects(bb)).toBe(true);
  });

  it('intersects() returns false when separated', () => {
    const a = SpatialEntity.at('a', { position: [0, 0, 0], size: [1, 1, 1] });
    const b = SpatialEntity.at('b', { position: [10, 0, 0], size: [1, 1, 1] });
    expect(a.intersects(b)).toBe(false);
  });

  it('getIntersectionVolume() returns correct volume', () => {
    const a = SpatialEntity.fromMinMax('a', [0, 0, 0], [4, 4, 4]);
    const b = SpatialEntity.fromMinMax('b', [2, 2, 2], [6, 6, 6]);
    expect(a.getIntersectionVolume(b)).toBe(8);
  });

  it('isWithinVolume() returns true when fully contained', () => {
    const small = SpatialEntity.fromMinMax('s', [2, 2, 2], [3, 3, 3]);
    const room = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });
    expect(small.isWithinVolume(room)).toBe(true);
  });

  it('isWithinVolume() returns false when protruding', () => {
    const big = SpatialEntity.fromMinMax('big', [-1, 0, 0], [5, 5, 5]);
    const room = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });
    expect(big.isWithinVolume(room)).toBe(false);
  });
});

// ── toString ─────────────────────────────────────────────────────────────────

describe('SpatialEntity — toString()', () => {
  it('formats as expected', () => {
    const e = SpatialEntity.fromMinMax('test', [1, 2, 3], [4, 5, 6]);
    expect(e.toString()).toContain('SpatialEntity');
    expect(e.toString()).toContain('test');
  });
});
