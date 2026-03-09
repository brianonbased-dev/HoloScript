import { describe, it, expect } from 'vitest';
import { ParticleSystem, EmitterConfig } from '../particles/ParticleSystem';
import { gravity, wind, drag, turbulence, floorBounce } from '../particles/ParticleAffectors';
import { ParticlePresets } from '../particles/ParticlePresets';

function makeEmitter(overrides: Partial<EmitterConfig> = {}): EmitterConfig {
  return {
    shape: 'point',
    rate: 100,
    maxParticles: 50,
    lifetime: [1, 2],
    speed: [1, 2],
    size: [0.01, 0.05],
    sizeEnd: [0, 0],
    colorStart: { r: 1, g: 1, b: 1, a: 1 },
    colorEnd: { r: 1, g: 1, b: 1, a: 0 },
    position: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

describe('Particle System', () => {
  it('Emits particles at the configured rate', () => {
    const sys = new ParticleSystem(makeEmitter({ rate: 60 }));

    // After 1 second at 60 particles/sec
    sys.update(1.0);
    const alive = sys.getAliveParticles();
    expect(alive.length).toBeGreaterThan(0);
    expect(alive.length).toBeLessThanOrEqual(50); // capped by maxParticles
  });

  it('Particles die after their lifetime', () => {
    const sys = new ParticleSystem(makeEmitter({ rate: 50, lifetime: [0.1, 0.1] }));

    sys.update(0.05); // Emit some
    expect(sys.getAliveParticles().length).toBeGreaterThan(0);

    sys.setEmitting(false);
    sys.update(0.2); // All should be dead
    expect(sys.getAliveParticles().length).toBe(0);
  });

  it('Respects maxParticles pool limit', () => {
    const sys = new ParticleSystem(makeEmitter({ rate: 1000, maxParticles: 20 }));
    sys.update(1.0);
    expect(sys.getAliveParticles().length).toBeLessThanOrEqual(20);
  });

  it('Burst emits particles instantly', () => {
    const sys = new ParticleSystem(makeEmitter({ rate: 0, maxParticles: 100 }));
    sys.burst(30);
    sys.update(0.001);
    expect(sys.getAliveParticles().length).toBe(30);
  });

  it('Supports different emitter shapes', () => {
    for (const shape of ['point', 'sphere', 'cone', 'box'] as const) {
      const sys = new ParticleSystem(makeEmitter({ shape, rate: 10, radius: 0.5 }));
      sys.update(0.5);
      expect(sys.getAliveParticles().length).toBeGreaterThan(0);
    }
  });

  it('Applies gravity affector', () => {
    const sys = new ParticleSystem(makeEmitter({ rate: 0, lifetime: [10, 10], speed: [0, 0] }));
    sys.addAffector(gravity(-9.81));
    sys.burst(1);
    sys.update(0.5);

    const p = sys.getAliveParticles()[0];
    expect(p.y).toBeLessThan(0); // Should have fallen
  });

  it('Applies drag affector', () => {
    const sys = new ParticleSystem(makeEmitter({ rate: 0, speed: [5, 5], lifetime: [10, 10] }));
    sys.addAffector(drag(0.95));
    sys.burst(1);

    sys.update(0.016);
    const speed1 = Math.sqrt(
      sys.getAliveParticles()[0].vx ** 2 +
        sys.getAliveParticles()[0].vy ** 2 +
        sys.getAliveParticles()[0].vz ** 2
    );

    sys.update(1.0);
    const speed2 = Math.sqrt(
      sys.getAliveParticles()[0].vx ** 2 +
        sys.getAliveParticles()[0].vy ** 2 +
        sys.getAliveParticles()[0].vz ** 2
    );

    expect(speed2).toBeLessThan(speed1);
  });

  it('Interpolates color over lifetime', () => {
    const sys = new ParticleSystem(
      makeEmitter({
        rate: 0,
        lifetime: [1, 1],
        speed: [0, 0],
        colorStart: { r: 1, g: 0, b: 0, a: 1 },
        colorEnd: { r: 0, g: 0, b: 1, a: 0 },
      })
    );
    sys.burst(1);

    sys.update(0.5); // Halfway through life
    const p = sys.getAliveParticles()[0];
    expect(p.color.r).toBeCloseTo(0.5, 1);
    expect(p.color.b).toBeCloseTo(0.5, 1);
  });

  it('All presets create valid emitters', () => {
    for (const [name, preset] of Object.entries(ParticlePresets)) {
      const sys = new ParticleSystem(preset);
      sys.update(0.1);
      // Should not throw
      expect(sys.getConfig().shape).toBeDefined();
    }
  });
});
