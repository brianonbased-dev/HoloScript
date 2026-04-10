import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleForceSystem } from '../ParticleForces';
import type { Particle } from '../ParticleEmitter';

function makeParticle(overrides: Partial<Particle> = {}): Particle {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    color: { r: 1, g: 1, b: 1, a: 1 },
    size: 1,
    lifetime: 5,
    age: 0,
    alive: true,
    ...overrides,
  } as Particle;
}

describe('ParticleForceSystem', () => {
  let system: ParticleForceSystem;

  beforeEach(() => {
    system = new ParticleForceSystem();
  });

  // Management
  it('addForce / getForceCount', () => {
    system.addForce({ id: 'g1', type: 'gravity', strength: 9.8 });
    expect(system.getForceCount()).toBe(1);
  });

  it('removeForce', () => {
    system.addForce({ id: 'g1', type: 'gravity', strength: 9.8 });
    system.removeForce('g1');
    expect(system.getForceCount()).toBe(0);
  });

  it('getForce returns field', () => {
    system.addForce({ id: 'w1', type: 'wind', strength: 2 });
    const f = system.getForce('w1');
    expect(f).toBeDefined();
    expect(f!.config.type).toBe('wind');
  });

  it('setEnabled toggles field', () => {
    system.addForce({ id: 'g1', type: 'gravity', strength: 9.8 });
    system.setEnabled('g1', false);
    expect(system.getForce('g1')!.enabled).toBe(false);
  });

  // Gravity
  it('gravity accelerates particle downward', () => {
    system.addForce({ id: 'g', type: 'gravity', strength: 10, direction: { x: 0, y: -1, z: 0 } });
    const p = makeParticle();
    system.apply([p], 0.1);
    expect(p.velocity.y).toBeLessThan(0);
  });

  // Wind
  it('wind pushes particle in direction', () => {
    system.addForce({ id: 'w', type: 'wind', strength: 5, direction: { x: 1, y: 0, z: 0 } });
    const p = makeParticle();
    system.apply([p], 0.1);
    expect(p.velocity.x).toBeGreaterThan(0);
  });

  // Drag
  it('drag reduces velocity', () => {
    system.addForce({ id: 'd', type: 'drag', strength: 1, dragCoefficient: 0.5 });
    const p = makeParticle({ velocity: { x: 10, y: 0, z: 0 } } as any);
    system.apply([p], 0.1);
    expect(p.velocity.x).toBeLessThan(10);
  });

  // Attractor
  it('attractor pulls particle toward position', () => {
    system.addForce({ id: 'a', type: 'attractor', strength: 10, position: { x: 5, y: 0, z: 0 } });
    const p = makeParticle();
    system.apply([p], 0.1);
    expect(p.velocity.x).toBeGreaterThan(0);
  });

  // Dead particles ignored
  it('dead particles are not affected', () => {
    system.addForce({ id: 'g', type: 'gravity', strength: 10, direction: { x: 0, y: -1, z: 0 } });
    const p = makeParticle({ alive: false } as any);
    system.apply([p], 0.1);
    expect(p.velocity.y).toBe(0);
  });

  // Disabled forces skipped
  it('disabled forces are not applied', () => {
    system.addForce({ id: 'g', type: 'gravity', strength: 10, direction: { x: 0, y: -1, z: 0 } });
    system.setEnabled('g', false);
    const p = makeParticle();
    system.apply([p], 0.1);
    expect(p.velocity.y).toBe(0);
  });

  // Turbulence (just assert it modifies velocity somehow)
  it('turbulence changes particle velocity', () => {
    system.addForce({ id: 't', type: 'turbulence', strength: 5, frequency: 1 });
    const p = makeParticle({ position: { x: 1, y: 2, z: 3 } } as any);
    system.apply([p], 0.1);
    const moved = p.velocity.x !== 0 || p.velocity.y !== 0 || p.velocity.z !== 0;
    expect(moved).toBe(true);
  });

  // Vortex
  it('vortex applies tangential force', () => {
    system.addForce({ id: 'v', type: 'vortex', strength: 5, position: { x: 0, y: 0, z: 0 } });
    const p = makeParticle({ position: { x: 1, y: 0, z: 0 } } as any);
    system.apply([p], 0.1);
    // Vortex creates tangential (perpendicular) velocity in XZ
    expect(p.velocity.z).not.toBe(0);
  });
});
