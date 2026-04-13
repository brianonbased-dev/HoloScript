/**
 * ParticleAttractorSystem Production Tests
 *
 * Point attractor, kill radius, orbit, out-of-range, dead particle.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleAttractorSystem, type Attractor, type Particle } from '../ParticleAttractor';

function makeAttractor(overrides: Partial<Attractor> = {}): Attractor {
  return {
    id: 'a1',
    shape: 'point',
    position: [10, 0, 0],
    direction: { x: 0, y: 1, z: 0 },
    strength: 5,
    radius: 20,
    killRadius: 0.1,
    orbit: false,
    ...overrides,
  };
}

function makeParticle(x = 0, y = 0, z = 0): Particle {
  return { x, y, z, vx: 0, vy: 0, vz: 0, alive: true };
}

describe('ParticleAttractorSystem — Production', () => {
  let sys: ParticleAttractorSystem;

  beforeEach(() => {
    sys = new ParticleAttractorSystem();
  });

  describe('management', () => {
    it('add/remove/count', () => {
      sys.addAttractor(makeAttractor());
      expect(sys.getAttractorCount()).toBe(1);
      sys.removeAttractor('a1');
      expect(sys.getAttractorCount()).toBe(0);
    });
  });

  describe('point attractor', () => {
    it('pulls toward position', () => {
      sys.addAttractor(makeAttractor());
      const p = makeParticle(0, 0, 0);
      sys.apply([p], 1.0);
      expect(p.vx).toBeGreaterThan(0); // Pulled toward x=10
    });
  });

  describe('kill radius', () => {
    it('kills particle within kill radius', () => {
      sys.addAttractor(makeAttractor({ killRadius: 2 }));
      const p = makeParticle(10, 0, 0); // At attractor position
      sys.apply([p], 1.0);
      expect(p.alive).toBe(false);
    });
  });

  describe('orbit', () => {
    it('applies tangential force', () => {
      sys.addAttractor(makeAttractor({ orbit: true }));
      const p = makeParticle(5, 0, 0);
      sys.apply([p], 1.0);
      // Tangential means velocity not purely in x direction
      expect(p.vy !== 0 || p.vz !== 0).toBe(true);
    });
  });

  describe('out of range', () => {
    it('no force beyond radius', () => {
      sys.addAttractor(makeAttractor({ radius: 5 }));
      const p = makeParticle(100, 0, 0); // Far away
      sys.apply([p], 1.0);
      expect(p.vx).toBe(0);
    });
  });

  describe('dead particle', () => {
    it('skips dead particles', () => {
      sys.addAttractor(makeAttractor());
      const p = makeParticle(5, 0, 0);
      p.alive = false;
      sys.apply([p], 1.0);
      expect(p.vx).toBe(0);
    });
  });
});
