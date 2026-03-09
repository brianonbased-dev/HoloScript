/**
 * ParticleTurbulence Production Tests
 *
 * Curl noise sampling, apply to particles, config, tick.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleTurbulence } from '../ParticleTurbulence';

describe('ParticleTurbulence — Production', () => {
  let turb: ParticleTurbulence;

  beforeEach(() => {
    turb = new ParticleTurbulence({ strength: 5, frequency: 2, octaves: 3 });
  });

  describe('sampleCurl', () => {
    it('returns non-zero force', () => {
      const force = turb.sampleCurl(1, 2, 3);
      const mag = Math.sqrt(force.fx ** 2 + force.fy ** 2 + force.fz ** 2);
      expect(mag).toBeGreaterThan(0);
    });

    it('different positions give different forces', () => {
      const f1 = turb.sampleCurl(0, 0, 0);
      const f2 = turb.sampleCurl(10, 10, 10);
      expect(f1.fx).not.toBe(f2.fx);
    });
  });

  describe('apply', () => {
    it('modifies particle velocities', () => {
      const particles = [{ x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0 }];
      turb.apply(particles, 0.016);
      const speed = Math.sqrt(particles[0].vx ** 2 + particles[0].vy ** 2 + particles[0].vz ** 2);
      expect(speed).toBeGreaterThan(0);
    });
  });

  describe('config', () => {
    it('getConfig returns copy', () => {
      const cfg = turb.getConfig();
      expect(cfg.strength).toBe(5);
      expect(cfg.frequency).toBe(2);
      expect(cfg.octaves).toBe(3);
    });

    it('setStrength updates', () => {
      turb.setStrength(10);
      expect(turb.getConfig().strength).toBe(10);
    });

    it('setFrequency updates', () => {
      turb.setFrequency(4);
      expect(turb.getConfig().frequency).toBe(4);
    });
  });

  describe('tick', () => {
    it('advances time', () => {
      turb.tick(1.0);
      expect(turb.getConfig().time).toBe(1.0);
    });
  });

  describe('defaults', () => {
    it('default config', () => {
      const t = new ParticleTurbulence();
      const cfg = t.getConfig();
      expect(cfg.strength).toBe(1);
      expect(cfg.frequency).toBe(1);
      expect(cfg.octaves).toBe(1);
    });
  });
});
