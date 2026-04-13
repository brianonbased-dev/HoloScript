import { describe, it, expect } from 'vitest';
import { ParticleAttractorSystem, type Particle } from '@holoscript/engine/particles';
import { ParticleTurbulence } from '@holoscript/engine/particles';
import { ParticleCollisionSystem, type CollidableParticle } from '@holoscript/engine/particles';

describe('Cycle 158: Particle Forces', () => {
  // -------------------------------------------------------------------------
  // ParticleAttractor
  // -------------------------------------------------------------------------

  it('should attract particles toward a point', () => {
    const sys = new ParticleAttractorSystem();
    sys.addAttractor({
      id: 'a1',
      shape: 'point',
      position: [10, 0, 0],
      direction: { x: 0, y: 0, z: 0 },
      strength: 100,
      radius: 50,
      killRadius: 0,
      orbit: false,
    });

    const p: Particle = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, alive: true };
    sys.apply([p], 1);

    expect(p.vx).toBeGreaterThan(0); // Pulled toward x=10
  });

  it('should kill particles within kill radius', () => {
    const sys = new ParticleAttractorSystem();
    sys.addAttractor({
      id: 'a1',
      shape: 'point',
      position: [0, 0, 0],
      direction: { x: 0, y: 0, z: 0 },
      strength: 1,
      radius: 50,
      killRadius: 2,
      orbit: false,
    });

    const p: Particle = { x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, alive: true };
    sys.apply([p], 1);

    expect(p.alive).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ParticleTurbulence
  // -------------------------------------------------------------------------

  it('should apply curl noise forces to particles', () => {
    const turb = new ParticleTurbulence({ strength: 5, frequency: 1, octaves: 2 });

    const p = { x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0 };
    turb.apply([p], 1);

    // Should have non-zero velocity after turbulence
    expect(p.vx !== 0 || p.vy !== 0 || p.vz !== 0).toBe(true);
  });

  it('should evolve over time', () => {
    const turb = new ParticleTurbulence({ strength: 1, frequency: 1, octaves: 1 });

    const curl0 = turb.sampleCurl(1, 0, 0);
    turb.tick(10);
    const curl1 = turb.sampleCurl(1, 0, 0);

    expect(curl0.fx).not.toBe(curl1.fx); // Different time → different force
  });

  // -------------------------------------------------------------------------
  // ParticleCollision
  // -------------------------------------------------------------------------

  it('should bounce particles off a ground plane', () => {
    const col = new ParticleCollisionSystem();
    col.addPlane({
      id: 'ground',
      nx: 0,
      ny: 1,
      nz: 0,
      d: 0,
      bounce: 0.8,
      friction: 0,
      lifetimeLoss: 0,
    });

    const p: CollidableParticle = {
      x: 0,
      y: -1,
      z: 0,
      vx: 0,
      vy: -10,
      vz: 0,
      lifetime: 1,
      alive: true,
    };
    col.resolve([p]);

    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.vy).toBeGreaterThan(0); // Bounced upward
    expect(col.getCollisionCount()).toBe(1);
  });

  it('should reduce lifetime on collision', () => {
    const col = new ParticleCollisionSystem();
    col.addPlane({
      id: 'wall',
      nx: 1,
      ny: 0,
      nz: 0,
      d: 0,
      bounce: 1,
      friction: 0,
      lifetimeLoss: 0.6,
    });

    const p: CollidableParticle = {
      x: -1,
      y: 0,
      z: 0,
      vx: -5,
      vy: 0,
      vz: 0,
      lifetime: 0.5,
      alive: true,
    };
    col.resolve([p]);

    expect(p.alive).toBe(false); // 0.5 - 0.6 < 0 → dead
  });
});
