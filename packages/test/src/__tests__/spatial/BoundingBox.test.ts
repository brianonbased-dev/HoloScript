/**
 * BoundingBox.test.ts — Tests for the AABB spatial math primitive
 *
 * Covers: construction, factories, queries (size/center/volume),
 * point containment, intersection, intersection volume, penetration depth,
 * translate, closestPoint, and toString.
 */

import { describe, it, expect } from 'vitest';
import { BoundingBox } from '../../spatial/BoundingBox';
import type { Vec3 } from '../../spatial/BoundingBox';

// ── Factories ────────────────────────────────────────────────────────────────

describe('BoundingBox — construction', () => {
  it('stores min/max via constructor', () => {
    const bb = new BoundingBox({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 });
    expect(bb.min).toEqual({ x: 1, y: 2, z: 3 });
    expect(bb.max).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('fromMinMax auto-corrects swapped min/max', () => {
    const bb = BoundingBox.fromMinMax({ x: 5, y: 5, z: 5 }, { x: 0, y: 0, z: 0 });
    expect(bb.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(bb.max).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('fromCenterSize creates correct bounds', () => {
    const bb = BoundingBox.fromCenterSize({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 });
    expect(bb.min).toEqual({ x: -1, y: -2, z: -3 });
    expect(bb.max).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('fromBottomCenter places the box properly', () => {
    const bb = BoundingBox.fromBottomCenter({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 2 });
    expect(bb.min).toEqual({ x: -1, y: 0, z: -1 });
    expect(bb.max).toEqual({ x: 1, y: 3, z: 1 });
  });
});

// ── Queries ──────────────────────────────────────────────────────────────────

describe('BoundingBox — queries', () => {
  const bb = new BoundingBox({ x: 1, y: 2, z: 3 }, { x: 4, y: 6, z: 9 });

  it('size() returns correct dimensions', () => {
    expect(bb.size()).toEqual({ x: 3, y: 4, z: 6 });
  });

  it('center() returns midpoint', () => {
    expect(bb.center()).toEqual({ x: 2.5, y: 4, z: 6 });
  });

  it('volume() returns correct volume', () => {
    expect(bb.volume()).toBe(3 * 4 * 6); // 72
  });
});

// ── Point containment ────────────────────────────────────────────────────────

describe('BoundingBox — contains()', () => {
  const bb = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });

  it('contains a point inside', () => {
    expect(bb.contains({ x: 5, y: 5, z: 5 })).toBe(true);
  });

  it('contains a point on the boundary (inclusive)', () => {
    expect(bb.contains({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(bb.contains({ x: 10, y: 10, z: 10 })).toBe(true);
  });

  it('does not contain a point outside', () => {
    expect(bb.contains({ x: -1, y: 5, z: 5 })).toBe(false);
    expect(bb.contains({ x: 5, y: 11, z: 5 })).toBe(false);
  });
});

// ── Intersection ─────────────────────────────────────────────────────────────

describe('BoundingBox — intersects()', () => {
  it('detects overlap on all axes', () => {
    const a = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 });
    const b = new BoundingBox({ x: 3, y: 3, z: 3 }, { x: 8, y: 8, z: 8 });
    expect(a.intersects(b)).toBe(true);
  });

  it('touching edges count as intersection', () => {
    const a = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 });
    const b = new BoundingBox({ x: 5, y: 0, z: 0 }, { x: 10, y: 5, z: 5 });
    expect(a.intersects(b)).toBe(true);
  });

  it('does not intersect when separated on one axis', () => {
    const a = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 });
    const b = new BoundingBox({ x: 6, y: 0, z: 0 }, { x: 10, y: 5, z: 5 });
    expect(a.intersects(b)).toBe(false);
  });
});

// ── intersectionVolume ───────────────────────────────────────────────────────

describe('BoundingBox — intersectionVolume()', () => {
  it('returns correct overlap volume', () => {
    const a = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 });
    const b = new BoundingBox({ x: 2, y: 2, z: 2 }, { x: 6, y: 6, z: 6 });
    // Overlap region: 2×2×2 = 8
    expect(a.intersectionVolume(b)).toBe(8);
  });

  it('returns 0 for non-intersecting boxes', () => {
    const a = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    const b = new BoundingBox({ x: 5, y: 5, z: 5 }, { x: 6, y: 6, z: 6 });
    expect(a.intersectionVolume(b)).toBe(0);
  });

  it('returns full volume when one box contains the other', () => {
    const outer = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });
    const inner = new BoundingBox({ x: 2, y: 2, z: 2 }, { x: 4, y: 4, z: 4 });
    expect(outer.intersectionVolume(inner)).toBe(inner.volume());
  });
});

// ── penetrationDepth ─────────────────────────────────────────────────────────

describe('BoundingBox — penetrationDepth()', () => {
  it('returns zero vector for non-intersecting boxes', () => {
    const a = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    const b = new BoundingBox({ x: 5, y: 5, z: 5 }, { x: 6, y: 6, z: 6 });
    expect(a.penetrationDepth(b)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('returns correct per-axis penetration', () => {
    const a = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 });
    const b = new BoundingBox({ x: 3, y: 4, z: 2 }, { x: 8, y: 8, z: 8 });
    const pen = a.penetrationDepth(b);
    expect(pen.x).toBe(2); // min(5,8) - max(0,3) = 5-3 = 2
    expect(pen.y).toBe(1); // min(5,8) - max(0,4) = 5-4 = 1
    expect(pen.z).toBe(3); // min(5,8) - max(0,2) = 5-2 = 3
  });
});

// ── translate ────────────────────────────────────────────────────────────────

describe('BoundingBox — translate()', () => {
  it('shifts min and max by delta', () => {
    const bb = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    const moved = bb.translate({ x: 10, y: -5, z: 3 });
    expect(moved.min).toEqual({ x: 10, y: -5, z: 3 });
    expect(moved.max).toEqual({ x: 11, y: -4, z: 4 });
  });

  it('does not mutate the original', () => {
    const bb = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    bb.translate({ x: 100, y: 100, z: 100 });
    expect(bb.min).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// ── closestPoint ─────────────────────────────────────────────────────────────

describe('BoundingBox — closestPoint()', () => {
  const bb = new BoundingBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });

  it('returns the point itself when inside', () => {
    expect(bb.closestPoint({ x: 5, y: 5, z: 5 })).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('clamps to nearest edge when outside', () => {
    expect(bb.closestPoint({ x: -5, y: 15, z: 5 })).toEqual({ x: 0, y: 10, z: 5 });
  });
});

// ── toString ─────────────────────────────────────────────────────────────────

describe('BoundingBox — toString()', () => {
  it('formats as expected', () => {
    const bb = new BoundingBox({ x: 0, y: 1, z: 2 }, { x: 3, y: 4, z: 5 });
    expect(bb.toString()).toBe('BoundingBox(0,1,2 → 3,4,5)');
  });
});
