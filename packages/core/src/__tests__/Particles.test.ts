import { describe, it, expect } from 'vitest';
import { ParticleEmitter, EmitterConfig } from '@holoscript/engine/particles';
import { ParticleForceSystem } from '@holoscript/engine/particles';

describe('Cycle 112: Particle System', () => {
  const baseConfig: EmitterConfig = {
    id: 'test',
    maxParticles: 50,
    emissionRate: 20,
    emissionShape: 'point',
    shapeParams: {},
    lifetime: { min: 1, max: 2 },
    startSpeed: { min: 1, max: 3 },
    startSize: { min: 0.1, max: 0.5 },
    startColor: { r: 1, g: 1, b: 1, a: 1 },
    gravity: 0,
    worldSpace: true,
    prewarm: false,
  };

  // -------------------------------------------------------------------------
  // ParticleEmitter
  // -------------------------------------------------------------------------

  it('should emit particles over time', () => {
    const emitter = new ParticleEmitter(baseConfig);
    emitter.play();
    emitter.update(1.0); // 1s at 20/s = ~20 particles
    expect(emitter.getAliveCount()).toBeGreaterThan(10);
    expect(emitter.getAliveCount()).toBeLessThanOrEqual(50);
  });

  it('should not emit when stopped', () => {
    const emitter = new ParticleEmitter(baseConfig);
    emitter.play();
    emitter.update(0.5);
    const before = emitter.getAliveCount();
    emitter.stop();
    expect(emitter.getAliveCount()).toBe(0);
  });

  it('should kill particles past lifetime', () => {
    const shortConfig: EmitterConfig = {
      ...baseConfig,
      lifetime: { min: 0.1, max: 0.1 },
      emissionRate: 100,
    };
    const emitter = new ParticleEmitter(shortConfig);
    emitter.play();
    emitter.update(0.05);
    expect(emitter.getAliveCount()).toBeGreaterThan(0);
    emitter.update(0.2); // All should die
    expect(emitter.getAliveCount()).toBe(0);
  });

  it('should apply gravity to particles', () => {
    const gravityConfig: EmitterConfig = {
      ...baseConfig,
      gravity: 9.8,
      startSpeed: { min: 0, max: 0 },
    };
    const emitter = new ParticleEmitter(gravityConfig);
    emitter.play();
    emitter.update(0.016);

    const particles = emitter.getAliveParticles();
    if (particles.length > 0) {
      // After one frame with gravity, velocity should be downward
      expect(particles[0].velocity.y).toBeLessThan(0);
    }
  });

  it('should emit from different shapes', () => {
    const shapes: Array<EmitterConfig['emissionShape']> = [
      'point',
      'sphere',
      'box',
      'cone',
      'circle',
      'line',
    ];
    for (const shape of shapes) {
      const cfg: EmitterConfig = {
        ...baseConfig,
        id: `shape_${shape}`,
        emissionShape: shape,
        shapeParams: { radius: 2, angle: 30, extents: { x: 1, y: 1, z: 1 }, length: 3 },
      };
      const emitter = new ParticleEmitter(cfg);
      emitter.play();
      emitter.update(0.1);
      expect(emitter.getAliveCount()).toBeGreaterThan(0);
    }
  });

  it('should apply color over lifetime', () => {
    const colorConfig: EmitterConfig = {
      ...baseConfig,
      startColor: { r: 1, g: 0, b: 0, a: 1 },
      endColor: { r: 0, g: 0, b: 1, a: 1 },
      lifetime: { min: 1, max: 1 },
    };
    const emitter = new ParticleEmitter(colorConfig);
    emitter.play();
    emitter.update(0.01); // emit
    emitter.update(0.5); // advance to 50% life

    const particles = emitter.getAliveParticles();
    if (particles.length > 0) {
      // Should be blending toward blue
      expect(particles[0].color.b).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // ParticleForces
  // -------------------------------------------------------------------------

  it('should apply gravity force', () => {
    const emitter = new ParticleEmitter({
      ...baseConfig,
      gravity: 0,
      startSpeed: { min: 0, max: 0 },
    });
    emitter.play();
    emitter.update(0.016);

    const forces = new ParticleForceSystem();
    forces.addForce({
      id: 'gravity',
      type: 'gravity',
      strength: 9.8,
      direction: { x: 0, y: -1, z: 0 },
    });

    const particles = emitter.getAliveParticles();
    forces.apply(particles, 1.0);

    if (particles.length > 0) {
      expect(particles[0].velocity.y).toBeLessThan(0);
    }
  });

  it('should apply attractor force', () => {
    const emitter = new ParticleEmitter({
      ...baseConfig,
      gravity: 0,
      startSpeed: { min: 0, max: 0 },
    });
    emitter.play();
    emitter.update(0.016);

    const forces = new ParticleForceSystem();
    forces.addForce({
      id: 'attract',
      type: 'attractor',
      strength: 5,
      position: [10, 0, 0],
    });

    const particles = emitter.getAliveParticles();
    const initialVx = particles[0]?.velocity.x ?? 0;
    forces.apply(particles, 0.1);

    if (particles.length > 0) {
      // Should accelerate toward x=10
      expect(particles[0].velocity.x).toBeGreaterThan(initialVx);
    }
  });

  it('should apply drag force', () => {
    const emitter = new ParticleEmitter({ ...baseConfig, gravity: 0 });
    emitter.play();
    emitter.update(0.016);

    const forces = new ParticleForceSystem();
    forces.addForce({ id: 'drag', type: 'drag', strength: 1, dragCoefficient: 2 });

    const particles = emitter.getAliveParticles();
    if (particles.length > 0) {
      const speed0 = Math.sqrt(
        particles[0].velocity.x ** 2 + particles[0].velocity.y ** 2 + particles[0].velocity.z ** 2
      );
      forces.apply(particles, 0.5);
      const speed1 = Math.sqrt(
        particles[0].velocity.x ** 2 + particles[0].velocity.y ** 2 + particles[0].velocity.z ** 2
      );
      // Drag should reduce speed
      expect(speed1).toBeLessThan(speed0);
    }
  });

  it('should manage force fields', () => {
    const forces = new ParticleForceSystem();
    forces.addForce({ id: 'f1', type: 'wind', strength: 5, direction: { x: 1, y: 0, z: 0 } });
    forces.addForce({ id: 'f2', type: 'turbulence', strength: 2, frequency: 1 });
    expect(forces.getForceCount()).toBe(2);

    forces.setEnabled('f1', false);
    expect(forces.getForce('f1')!.enabled).toBe(false);

    forces.removeForce('f2');
    expect(forces.getForceCount()).toBe(1);
  });
});
