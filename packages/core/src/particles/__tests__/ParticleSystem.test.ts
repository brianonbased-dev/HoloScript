import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleSystem } from '../ParticleSystem';
import type { EmitterConfig } from '../ParticleSystem';

function makeConfig(overrides?: Partial<EmitterConfig>): EmitterConfig {
  return {
    shape: 'point',
    rate: 50,
    maxParticles: 100,
    lifetime: [0.5, 1],
    speed: [1, 3],
    size: [1, 2],
    sizeEnd: [0.5, 1],
    colorStart: { r: 1, g: 1, b: 1, a: 1 },
    colorEnd: { r: 1, g: 0, b: 0, a: 0 },
    position: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

describe('ParticleSystem', () => {
  let ps: ParticleSystem;

  beforeEach(() => {
    ps = new ParticleSystem(makeConfig());
  });

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('creates with initial pool', () => {
    expect(ps.getActiveCount()).toBe(0);
  });

  it('starts emitting by default', () => {
    expect(ps.isEmitting()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Emission Control
  // ---------------------------------------------------------------------------

  it('setEmitting toggles emission', () => {
    ps.setEmitting(false);
    expect(ps.isEmitting()).toBe(false);
    ps.setEmitting(true);
    expect(ps.isEmitting()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it('update emits particles', () => {
    ps.update(0.1); // rate=50 * 0.1s = ~5
    expect(ps.getActiveCount()).toBeGreaterThan(0);
  });

  it('update does not emit when paused', () => {
    ps.setEmitting(false);
    ps.update(0.1);
    expect(ps.getActiveCount()).toBe(0);
  });

  it('particles die after lifetime', () => {
    const short = new ParticleSystem(
      makeConfig({
        lifetime: [0.1, 0.1],
        rate: 1000,
      })
    );
    short.update(0.01); // Emit ~10 particles, age=0.01 < 0.1 lifetime → alive
    const countAfterEmit = short.getActiveCount();
    expect(countAfterEmit).toBeGreaterThan(0);
    short.setEmitting(false);
    short.update(1); // age += 1 → 1.01 > 0.1 → all dead
    expect(short.getActiveCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Burst
  // ---------------------------------------------------------------------------

  it('burst emits N particles immediately', () => {
    ps.setEmitting(false);
    ps.burst(10);
    ps.update(0); // Recount active particles
    expect(ps.getActiveCount()).toBe(10);
  });

  it('burst respects maxParticles', () => {
    const small = new ParticleSystem(makeConfig({ maxParticles: 5 }));
    small.setEmitting(false);
    small.burst(20);
    small.update(0); // Recount active particles
    expect(small.getActiveCount()).toBeLessThanOrEqual(5);
  });

  // ---------------------------------------------------------------------------
  // Alive Particles
  // ---------------------------------------------------------------------------

  it('getAliveParticles returns alive particles', () => {
    ps.update(0.1);
    const alive = ps.getAliveParticles();
    expect(alive.length).toBe(ps.getActiveCount());
    expect(alive.every((p) => p.alive)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Affectors
  // ---------------------------------------------------------------------------

  it('addAffector modifies particles during update', () => {
    ps.setEmitting(false);
    ps.burst(5);
    let affectorCalled = false;
    ps.addAffector(() => {
      affectorCalled = true;
    });
    ps.update(0.016);
    expect(affectorCalled).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Position
  // ---------------------------------------------------------------------------

  it('setPosition updates emitter position', () => {
    ps.setPosition(10, 20, 30);
    const config = ps.getConfig();
    expect(config.position.x).toBe(10);
    expect(config.position.y).toBe(20);
    expect(config.position.z).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  it('getConfig returns config', () => {
    const config = ps.getConfig();
    expect(config.maxParticles).toBe(100);
    expect(config.rate).toBe(50);
  });
});
