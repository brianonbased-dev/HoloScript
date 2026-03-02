import { describe, it, expect } from 'vitest';
import {
  Vec3, Quaternion, Transform, Ray, AABB,
  distance, lerp, clamp, degToRad, radToDeg,
} from '../spatial.js';

// =============================================================================
// Vec3
// =============================================================================

describe('Vec3', () => {
  describe('constructors', () => {
    it('should default to zero', () => {
      const v = new Vec3();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('should create from values', () => {
      const v = new Vec3(1, 2, 3);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });

    it('static zero()', () => {
      expect(Vec3.zero().equals(new Vec3(0, 0, 0))).toBe(true);
    });

    it('static one()', () => {
      expect(Vec3.one().equals(new Vec3(1, 1, 1))).toBe(true);
    });

    it('static up()', () => {
      expect(Vec3.up().y).toBe(1);
    });

    it('static forward()', () => {
      expect(Vec3.forward().z).toBe(-1);
    });

    it('static right()', () => {
      expect(Vec3.right().x).toBe(1);
    });
  });

  describe('arithmetic', () => {
    it('add', () => {
      const r = new Vec3(1, 2, 3).add(new Vec3(4, 5, 6));
      expect(r.equals(new Vec3(5, 7, 9))).toBe(true);
    });

    it('sub', () => {
      const r = new Vec3(5, 7, 9).sub(new Vec3(4, 5, 6));
      expect(r.equals(new Vec3(1, 2, 3))).toBe(true);
    });

    it('mul', () => {
      const r = new Vec3(1, 2, 3).mul(2);
      expect(r.equals(new Vec3(2, 4, 6))).toBe(true);
    });

    it('div', () => {
      const r = new Vec3(4, 6, 8).div(2);
      expect(r.equals(new Vec3(2, 3, 4))).toBe(true);
    });
  });

  describe('vector operations', () => {
    it('dot product', () => {
      expect(new Vec3(1, 0, 0).dot(new Vec3(0, 1, 0))).toBe(0);
      expect(new Vec3(1, 0, 0).dot(new Vec3(1, 0, 0))).toBe(1);
    });

    it('cross product', () => {
      const r = new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0));
      expect(r.equals(new Vec3(0, 0, 1))).toBe(true);
    });

    it('length', () => {
      expect(new Vec3(3, 4, 0).length()).toBe(5);
    });

    it('lengthSquared', () => {
      expect(new Vec3(3, 4, 0).lengthSquared()).toBe(25);
    });

    it('normalize', () => {
      const n = new Vec3(3, 0, 0).normalize();
      expect(n.length()).toBeCloseTo(1);
      expect(n.x).toBeCloseTo(1);
    });

    it('normalize zero returns zero', () => {
      const n = Vec3.zero().normalize();
      expect(n.length()).toBe(0);
    });

    it('distanceTo', () => {
      expect(new Vec3(0, 0, 0).distanceTo(new Vec3(3, 4, 0))).toBe(5);
    });

    it('lerp', () => {
      const r = new Vec3(0, 0, 0).lerp(new Vec3(10, 10, 10), 0.5);
      expect(r.equals(new Vec3(5, 5, 5))).toBe(true);
    });

    it('lerp at 0 returns start', () => {
      const a = new Vec3(1, 2, 3);
      expect(a.lerp(new Vec3(10, 20, 30), 0).equals(a)).toBe(true);
    });

    it('lerp at 1 returns end', () => {
      const b = new Vec3(10, 20, 30);
      expect(new Vec3(1, 2, 3).lerp(b, 1).equals(b)).toBe(true);
    });
  });

  describe('conversion', () => {
    it('toArray', () => {
      expect(new Vec3(1, 2, 3).toArray()).toEqual([1, 2, 3]);
    });

    it('fromArray', () => {
      expect(Vec3.fromArray([4, 5, 6]).equals(new Vec3(4, 5, 6))).toBe(true);
    });

    it('fromArray handles short arrays', () => {
      expect(Vec3.fromArray([1]).equals(new Vec3(1, 0, 0))).toBe(true);
    });

    it('toString', () => {
      expect(new Vec3(1, 2, 3).toString()).toBe('Vec3(1, 2, 3)');
    });
  });

  describe('equals', () => {
    it('equal vectors', () => {
      expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 3))).toBe(true);
    });

    it('unequal vectors', () => {
      expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 4))).toBe(false);
    });

    it('epsilon comparison', () => {
      expect(new Vec3(1, 2, 3.0000001).equals(new Vec3(1, 2, 3))).toBe(true);
    });
  });
});

// =============================================================================
// Quaternion
// =============================================================================

describe('Quaternion', () => {
  it('identity', () => {
    const q = Quaternion.identity();
    expect(q.w).toBe(1);
    expect(q.x).toBe(0);
  });

  it('fromEuler and toEuler roundtrip', () => {
    const q = Quaternion.fromEuler(0.5, 0.3, 0.1);
    const euler = q.toEuler();
    expect(euler.x).toBeCloseTo(0.5, 3);
    expect(euler.y).toBeCloseTo(0.3, 3);
    expect(euler.z).toBeCloseTo(0.1, 3);
  });

  it('fromAxisAngle', () => {
    const q = Quaternion.fromAxisAngle(Vec3.up(), Math.PI / 2);
    const n = q.normalize();
    expect(n.w).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it('multiply identity is no-op', () => {
    const q = Quaternion.fromEuler(0.5, 0.3, 0.1);
    const r = q.multiply(Quaternion.identity());
    expect(r.x).toBeCloseTo(q.x);
    expect(r.y).toBeCloseTo(q.y);
    expect(r.z).toBeCloseTo(q.z);
    expect(r.w).toBeCloseTo(q.w);
  });

  it('rotateVec3', () => {
    const q = Quaternion.fromAxisAngle(Vec3.up(), Math.PI / 2);
    const v = q.rotateVec3(new Vec3(1, 0, 0));
    expect(v.x).toBeCloseTo(0, 3);
    expect(v.z).toBeCloseTo(-1, 3);
  });

  it('slerp at 0 returns start', () => {
    const a = Quaternion.identity();
    const b = Quaternion.fromEuler(1, 0, 0);
    const r = a.slerp(b, 0);
    expect(r.w).toBeCloseTo(a.w);
  });

  it('slerp at 1 returns end', () => {
    const a = Quaternion.identity();
    const b = Quaternion.fromEuler(1, 0, 0);
    const r = a.slerp(b, 1);
    expect(r.x).toBeCloseTo(b.x, 3);
    expect(r.w).toBeCloseTo(b.w, 3);
  });

  it('normalize preserves direction', () => {
    const q = new Quaternion(0, 0, 0, 2);
    const n = q.normalize();
    expect(n.w).toBeCloseTo(1);
  });
});

// =============================================================================
// Transform
// =============================================================================

describe('Transform', () => {
  it('identity does nothing', () => {
    const t = Transform.identity();
    const p = t.transformPoint(new Vec3(1, 2, 3));
    expect(p.equals(new Vec3(1, 2, 3))).toBe(true);
  });

  it('translation', () => {
    const t = new Transform(new Vec3(10, 0, 0));
    const p = t.transformPoint(Vec3.zero());
    expect(p.equals(new Vec3(10, 0, 0))).toBe(true);
  });

  it('scale', () => {
    const t = new Transform(Vec3.zero(), Quaternion.identity(), new Vec3(2, 2, 2));
    const p = t.transformPoint(new Vec3(1, 1, 1));
    expect(p.equals(new Vec3(2, 2, 2))).toBe(true);
  });

  it('transformDirection ignores position', () => {
    const t = new Transform(new Vec3(100, 100, 100));
    const d = t.transformDirection(new Vec3(1, 0, 0));
    expect(d.equals(new Vec3(1, 0, 0))).toBe(true);
  });
});

// =============================================================================
// Ray & AABB
// =============================================================================

describe('Ray', () => {
  it('pointAt', () => {
    const r = new Ray(Vec3.zero(), new Vec3(1, 0, 0));
    expect(r.pointAt(5).equals(new Vec3(5, 0, 0))).toBe(true);
  });
});

describe('AABB', () => {
  const box = new AABB(new Vec3(-1, -1, -1), new Vec3(1, 1, 1));

  it('contains point inside', () => {
    expect(box.contains(Vec3.zero())).toBe(true);
  });

  it('does not contain point outside', () => {
    expect(box.contains(new Vec3(2, 0, 0))).toBe(false);
  });

  it('intersects overlapping AABB', () => {
    const other = new AABB(new Vec3(0, 0, 0), new Vec3(2, 2, 2));
    expect(box.intersects(other)).toBe(true);
  });

  it('does not intersect non-overlapping AABB', () => {
    const other = new AABB(new Vec3(5, 5, 5), new Vec3(6, 6, 6));
    expect(box.intersects(other)).toBe(false);
  });

  it('center', () => {
    expect(box.center().equals(Vec3.zero())).toBe(true);
  });

  it('size', () => {
    expect(box.size().equals(new Vec3(2, 2, 2))).toBe(true);
  });

  it('ray intersection hit', () => {
    const ray = new Ray(new Vec3(-5, 0, 0), new Vec3(1, 0, 0));
    const t = box.intersectsRay(ray);
    expect(t).not.toBeNull();
    expect(t).toBeCloseTo(4);
  });

  it('ray intersection miss', () => {
    const ray = new Ray(new Vec3(-5, 5, 0), new Vec3(1, 0, 0));
    expect(box.intersectsRay(ray)).toBeNull();
  });
});

// =============================================================================
// Utility functions
// =============================================================================

describe('utility functions', () => {
  it('distance', () => {
    expect(distance(Vec3.zero(), new Vec3(3, 4, 0))).toBe(5);
  });

  it('lerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('clamp', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('degToRad', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
  });

  it('radToDeg', () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });
});
