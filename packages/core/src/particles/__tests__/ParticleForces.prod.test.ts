/**
 * ParticleForceSystem Production Tests
 *
 * Force fields: gravity, wind, attractor, drag, management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleForceSystem } from '../ParticleForces';

function makeParticle(x = 0, y = 0, z = 0) {
  return {
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    alive: true,
    color: { r: 1, g: 1, b: 1, a: 1 },
    size: 1,
    age: 0,
    lifetime: 5,
    rotation: 0,
  };
}

describe('ParticleForceSystem — Production', () => {
  let pfs: ParticleForceSystem;

  beforeEach(() => {
    pfs = new ParticleForceSystem();
  });

  describe('management', () => {
    it('addForce / getForce', () => {
      pfs.addForce({ id: 'g', type: 'gravity', strength: 9.81 });
      expect(pfs.getForce('g')).toBeDefined();
      expect(pfs.getForceCount()).toBe(1);
    });

    it('removeForce', () => {
      pfs.addForce({ id: 'g', type: 'gravity', strength: 9.81 });
      pfs.removeForce('g');
      expect(pfs.getForceCount()).toBe(0);
    });

    it('setEnabled', () => {
      pfs.addForce({ id: 'g', type: 'gravity', strength: 9.81 });
      pfs.setEnabled('g', false);
      expect(pfs.getForce('g')!.enabled).toBe(false);
    });
  });

  describe('gravity', () => {
    it('accelerates downward', () => {
      pfs.addForce({ id: 'g', type: 'gravity', strength: 10, direction: { x: 0, y: -1, z: 0 } });
      const p = makeParticle();
      pfs.apply([p], 1.0);
      expect(p.velocity.y).toBeLessThan(0);
    });
  });

  describe('wind', () => {
    it('pushes in direction', () => {
      pfs.addForce({ id: 'w', type: 'wind', strength: 5, direction: { x: 1, y: 0, z: 0 } });
      const p = makeParticle();
      pfs.apply([p], 1.0);
      expect(p.velocity.x).toBeGreaterThan(0);
    });
  });

  describe('attractor', () => {
    it('pulls toward position', () => {
      pfs.addForce({ id: 'a', type: 'attractor', strength: 10, position: [10, 0, 0] });
      const p = makeParticle();
      pfs.apply([p], 1.0);
      expect(p.velocity.x).toBeGreaterThan(0);
    });
  });

  describe('drag', () => {
    it('slows particle', () => {
      pfs.addForce({ id: 'd', type: 'drag', strength: 1, dragCoefficient: 0.5 });
      const p = makeParticle();
      p.velocity = { x: 10, y: 0, z: 0 };
      pfs.apply([p], 1.0);
      expect(p.velocity.x).toBeLessThan(10);
    });
  });

  describe('disabled force', () => {
    it('does not apply', () => {
      pfs.addForce({ id: 'g', type: 'gravity', strength: 10, direction: { x: 0, y: -1, z: 0 } });
      pfs.setEnabled('g', false);
      const p = makeParticle();
      pfs.apply([p], 1.0);
      expect(p.velocity.y).toBe(0);
    });
  });

  describe('dead particle', () => {
    it('skips dead particles', () => {
      pfs.addForce({ id: 'g', type: 'gravity', strength: 10, direction: { x: 0, y: -1, z: 0 } });
      const p = makeParticle();
      p.alive = false;
      pfs.apply([p], 1.0);
      expect(p.velocity.y).toBe(0);
    });
  });
});
