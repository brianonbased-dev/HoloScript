import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleEmitter } from '../ParticleEmitter';
import type { EmitterConfig } from '../ParticleEmitter';

function makeConfig(overrides?: Partial<EmitterConfig>): EmitterConfig {
  return {
    id: 'test-emitter',
    maxParticles: 100,
    emissionRate: 50,
    emissionShape: 'point',
    shapeParams: {},
    startSpeed: { min: 1, max: 3 },
    startSize: { min: 0.5, max: 1 },
    lifetime: { min: 1, max: 2 },
    startColor: { r: 1, g: 1, b: 1, a: 1 },
    gravity: 0,
    worldSpace: false,
    prewarm: false,
    ...overrides,
  };
}

describe('ParticleEmitter', () => {
  let emitter: ParticleEmitter;

  beforeEach(() => { emitter = new ParticleEmitter(makeConfig()); });

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('creates with config', () => {
    expect(emitter.config.id).toBe('test-emitter');
    expect(emitter.config.maxParticles).toBe(100);
  });

  it('starts not playing', () => {
    expect(emitter.isPlaying()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Play/Pause/Stop
  // ---------------------------------------------------------------------------

  it('play starts emission', () => {
    emitter.play();
    expect(emitter.isPlaying()).toBe(true);
  });

  it('pause stops emission', () => {
    emitter.play();
    emitter.pause();
    expect(emitter.isPlaying()).toBe(false);
  });

  it('stop resets emitter', () => {
    emitter.play();
    emitter.update(0.1);
    emitter.stop();
    expect(emitter.isPlaying()).toBe(false);
    expect(emitter.getAliveCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Update & Emission
  // ---------------------------------------------------------------------------

  it('update emits particles when playing', () => {
    emitter.play();
    emitter.update(0.1); // 50 rate * 0.1s = ~5 particles
    expect(emitter.getAliveCount()).toBeGreaterThan(0);
  });

  it('update does not emit when not playing', () => {
    emitter.update(0.1);
    expect(emitter.getAliveCount()).toBe(0);
  });

  it('particles die after lifetime', () => {
    const shortLived = new ParticleEmitter(makeConfig({
      lifetime: { min: 0.1, max: 0.1 },
      emissionRate: 100,
    }));
    shortLived.play();
    shortLived.update(0.01); // Emit some, age=0.01 < 0.1 lifetime → alive
    expect(shortLived.getAliveCount()).toBeGreaterThan(0);
    shortLived.update(1);   // age += 1 → 1.01 > 0.1 → all dead
    expect(shortLived.getAliveCount()).toBe(0);
  });

  it('respects maxParticles limit', () => {
    const limited = new ParticleEmitter(makeConfig({
      maxParticles: 5,
      emissionRate: 1000,
    }));
    limited.play();
    limited.update(1); // Try to emit 1000 but max is 5
    expect(limited.getAliveCount()).toBeLessThanOrEqual(5);
  });

  // ---------------------------------------------------------------------------
  // Alive Particles
  // ---------------------------------------------------------------------------

  it('getAliveParticles returns only alive particles', () => {
    emitter.play();
    emitter.update(0.1);
    const alive = emitter.getAliveParticles();
    expect(alive.every(p => p.alive)).toBe(true);
  });

  it('getCapacity returns maxParticles', () => {
    expect(emitter.getCapacity()).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  it('getState returns emitter state', () => {
    const state = emitter.getState();
    expect(state.id).toBe('test-emitter');
    expect(state.playing).toBe(false);
    expect(state.aliveCount).toBe(0);
  });
});
