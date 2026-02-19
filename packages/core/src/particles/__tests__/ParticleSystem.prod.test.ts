/**
 * ParticleSystem — Production Test Suite
 *
 * Covers: spawning, update lifecycle, burst, affectors,
 * emitter control, pool recycling, queries.
 */
import { describe, it, expect, vi } from 'vitest';
import { ParticleSystem, type EmitterConfig } from '../ParticleSystem';

const BASIC_CONFIG: EmitterConfig = {
  shape: 'point',
  rate: 10,
  maxParticles: 100,
  lifetime: [1, 2],
  speed: [5, 10],
  size: [1, 1],
  sizeEnd: [0, 0],
  colorStart: { r: 1, g: 1, b: 1, a: 1 },
  colorEnd: { r: 1, g: 1, b: 1, a: 0 },
  position: { x: 0, y: 0, z: 0 },
};

describe('ParticleSystem — Production', () => {
  // ─── Emission ─────────────────────────────────────────────────────
  it('emits particles over time', () => {
    const ps = new ParticleSystem(BASIC_CONFIG);
    ps.update(1); // rate=10 → should emit ~10 particles
    expect(ps.getActiveCount()).toBeGreaterThan(0);
  });

  // ─── Burst ────────────────────────────────────────────────────────
  it('burst emits N particles immediately', () => {
    const ps = new ParticleSystem(BASIC_CONFIG);
    ps.setEmitting(false);
    ps.burst(5);
    expect(ps.getAliveParticles().length).toBe(5);
  });

  // ─── Lifecycle (death) ────────────────────────────────────────────
  it('particles die after lifetime', () => {
    const ps = new ParticleSystem({ ...BASIC_CONFIG, lifetime: [0.1, 0.1] });
    ps.burst(3);
    ps.update(0.5); // past lifetime — update kills them and recalculates activeCount
    expect(ps.getActiveCount()).toBe(0);
  });

  // ─── Stop Emitting ────────────────────────────────────────────────
  it('setEmitting(false) stops new particles', () => {
    const ps = new ParticleSystem(BASIC_CONFIG);
    ps.setEmitting(false);
    ps.update(1);
    expect(ps.getActiveCount()).toBe(0);
    expect(ps.isEmitting()).toBe(false);
  });

  // ─── Affectors ────────────────────────────────────────────────────
  it('affector runs on alive particles', () => {
    const ps = new ParticleSystem(BASIC_CONFIG);
    const affector = vi.fn();
    ps.addAffector(affector);
    ps.burst(2);
    ps.update(0.1);
    expect(affector).toHaveBeenCalled();
  });

  // ─── Max Particles ────────────────────────────────────────────────
  it('respects maxParticles cap', () => {
    const ps = new ParticleSystem({ ...BASIC_CONFIG, maxParticles: 5, rate: 1000 });
    ps.update(1);
    expect(ps.getActiveCount()).toBeLessThanOrEqual(5);
  });

  // ─── Position ─────────────────────────────────────────────────────
  it('setPosition updates emitter origin', () => {
    const ps = new ParticleSystem(BASIC_CONFIG);
    ps.setPosition(10, 20, 30);
    expect(ps.getConfig().position).toEqual({ x: 10, y: 20, z: 30 });
  });

  // ─── getAliveParticles ─────────────────────────────────────────────
  it('getAliveParticles returns only alive', () => {
    const ps = new ParticleSystem(BASIC_CONFIG);
    ps.burst(3);
    ps.update(0.01); // small tick to process — doesn't kill them (lifetime > 0.01)
    const alive = ps.getAliveParticles();
    expect(alive.length).toBe(3);
    expect(alive.every(p => p.alive)).toBe(true);
  });

  // ─── Config ───────────────────────────────────────────────────────
  it('getConfig returns emitter config', () => {
    const ps = new ParticleSystem(BASIC_CONFIG);
    expect(ps.getConfig().rate).toBe(10);
    expect(ps.getConfig().maxParticles).toBe(100);
  });
});
