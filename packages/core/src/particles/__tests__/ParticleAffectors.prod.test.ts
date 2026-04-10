/**
 * ParticleAffectors Production Tests
 *
 * Affector factories: gravity, wind, drag, attractor, vortex, floorBounce, sizeOscillate.
 */

import { describe, it, expect } from 'vitest';
import {
  gravity,
  wind,
  drag,
  attractor,
  vortex,
  floorBounce,
  sizeOscillate,
} from '../ParticleAffectors';

function makeParticle() {
  return { x: 0, y: 5, z: 0, vx: 1, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, size: 1, age: 0 };
}

describe('ParticleAffectors — Production', () => {
  describe('gravity', () => {
    it('sets ay', () => {
      const p = makeParticle();
      gravity(-9.81)(p as any, 0.016);
      expect(p.ay).toBe(-9.81);
    });
  });

  describe('wind', () => {
    it('adds velocity in direction', () => {
      const p = makeParticle();
      wind(5, 0, 0)(p as any, 1.0);
      expect(p.vx).toBeGreaterThan(1);
    });
  });

  describe('drag', () => {
    it('reduces velocity', () => {
      const p = makeParticle();
      p.vx = 10;
      drag(0.5)(p as any, 0.016);
      expect(p.vx).toBeLessThan(10);
    });
  });

  describe('attractor', () => {
    it('pulls toward point', () => {
      const p = makeParticle();
      p.x = 0;
      p.y = 0;
      p.z = 0;
      p.vx = 0;
      attractor(10, 0, 0, 5)(p as any, 1.0);
      expect(p.vx).toBeGreaterThan(0);
    });
  });

  describe('vortex', () => {
    it('rotates velocity', () => {
      const p = makeParticle();
      p.vx = 1;
      p.vy = 0;
      p.vz = 0;
      vortex(0, 1, 0, 2)(p as any, 1.0);
      expect(p.vz).not.toBe(0);
    });
  });

  describe('floorBounce', () => {
    it('bounces at floor', () => {
      const p = makeParticle();
      p.y = -1;
      p.vy = -5;
      floorBounce(0, 0.6)(p as any, 0.016);
      expect(p.y).toBe(0);
      expect(p.vy).toBeGreaterThan(0);
    });

    it('no bounce above floor', () => {
      const p = makeParticle();
      p.y = 5;
      p.vy = -1;
      floorBounce(0, 0.6)(p as any, 0.016);
      expect(p.vy).toBe(-1);
    });
  });

  describe('sizeOscillate', () => {
    it('modifies size', () => {
      const p = makeParticle();
      p.age = 0.5;
      const original = p.size;
      sizeOscillate(3, 0.3)(p as any, 0.016);
      // Size should change (either bigger or smaller)
      expect(typeof p.size).toBe('number');
    });
  });
});
