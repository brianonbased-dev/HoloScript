/**
 * Unit tests for particle-effects — AUDIT-mode coverage
 *
 * Slice 4 + 14. State-container pattern with Math.random. Tests seed
 * the RNG to get deterministic output, then verify particle counts,
 * positions, lifetimes, and security-limit clamping.
 *
 * **See**: packages/core/src/runtime/particle-effects.ts (slice 4, slice 14)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createParticleEffect,
  createConnectionStream,
  createFlowingStream,
  createExecutionEffect,
  createDataVisualization,
  getDataTypeColor,
  updateParticles,
} from './particle-effects';
import type { ParticleSystem } from '../types';

// Freeze Math.random at 0.5 — centers the jitter window at 0 offset
// (since jitter is (Math.random() - 0.5) * 2 → 0).
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────
// getDataTypeColor
// ──────────────────────────────────────────────────────────────────

describe('getDataTypeColor', () => {
  it('known data types map to fixed colors', () => {
    expect(getDataTypeColor('string')).toBe('#ff6b35');
    expect(getDataTypeColor('number')).toBe('#4ecdc4');
    expect(getDataTypeColor('boolean')).toBe('#45b7d1');
    expect(getDataTypeColor('object')).toBe('#96ceb4');
    expect(getDataTypeColor('array')).toBe('#ffeaa7');
    expect(getDataTypeColor('any')).toBe('#dda0dd');
    expect(getDataTypeColor('move')).toBe('#ff69b4');
  });

  it('unknown types fall back to white', () => {
    expect(getDataTypeColor('unknown')).toBe('#ffffff');
    expect(getDataTypeColor('')).toBe('#ffffff');
  });
});

// ──────────────────────────────────────────────────────────────────
// createParticleEffect
// ──────────────────────────────────────────────────────────────────

describe('createParticleEffect', () => {
  it('inserts a new system into the map with correct defaults', () => {
    const systems = new Map<string, ParticleSystem>();
    createParticleEffect(systems, 'test', [0, 0, 0], '#ff0000', 5, 1000);
    const system = systems.get('test');
    expect(system).toBeDefined();
    expect(system!.color).toBe('#ff0000');
    expect(system!.lifetime).toBe(3000); // PARTICLE_DEFAULT_LIFETIME_MS
    expect(system!.speed).toBe(0.01); // PARTICLE_DEFAULT_SPEED
    expect(system!.particles).toHaveLength(5);
  });

  it('clamps count to maxParticlesPerSystem (security limit)', () => {
    const systems = new Map<string, ParticleSystem>();
    createParticleEffect(systems, 'big', [0, 0, 0], '#fff', 10000, 100);
    expect(systems.get('big')!.particles).toHaveLength(100);
  });

  it('Math.random fixed at 0.5 → zero jitter → particles at origin', () => {
    const systems = new Map<string, ParticleSystem>();
    createParticleEffect(systems, 'test', [5, 10, 15], '#fff', 3, 100);
    const p = systems.get('test')!.particles[0];
    // jitter = (0.5 - 0.5) * 2 = 0; position = center + 0 = center
    expect(p).toEqual([5, 10, 15]);
  });

  it('replaces existing system with the same name', () => {
    const systems = new Map<string, ParticleSystem>();
    createParticleEffect(systems, 'same', [0, 0, 0], '#111', 2, 100);
    createParticleEffect(systems, 'same', [0, 0, 0], '#222', 4, 100);
    expect(systems.get('same')!.color).toBe('#222');
    expect(systems.get('same')!.particles).toHaveLength(4);
  });

  it('count=0 produces zero particles', () => {
    const systems = new Map<string, ParticleSystem>();
    createParticleEffect(systems, 'empty', [0, 0, 0], '#fff', 0, 100);
    expect(systems.get('empty')!.particles).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────
// createConnectionStream
// ──────────────────────────────────────────────────────────────────

describe('createConnectionStream', () => {
  it('inserts under key "connection_<from>_<to>"', () => {
    const systems = new Map<string, ParticleSystem>();
    createConnectionStream(systems, 'a', 'b', [0, 0, 0], [10, 0, 0], 'number');
    expect(systems.has('connection_a_b')).toBe(true);
  });

  it('creates 21 particles (20 steps + 1)', () => {
    const systems = new Map<string, ParticleSystem>();
    createConnectionStream(systems, 'a', 'b', [0, 0, 0], [10, 0, 0], 'number');
    expect(systems.get('connection_a_b')!.particles).toHaveLength(21);
  });

  it('particles interpolate evenly from source to target', () => {
    const systems = new Map<string, ParticleSystem>();
    createConnectionStream(systems, 'a', 'b', [0, 0, 0], [10, 0, 0], 'number');
    const particles = systems.get('connection_a_b')!.particles;
    expect(particles[0]).toEqual([0, 0, 0]); // t=0
    expect(particles[10]).toEqual([5, 0, 0]); // t=0.5
    expect(particles[20]).toEqual([10, 0, 0]); // t=1
  });

  it('connection-stream lifetime is 5000ms, speed is 0.02', () => {
    const systems = new Map<string, ParticleSystem>();
    createConnectionStream(systems, 'a', 'b', [0, 0, 0], [1, 0, 0], 'string');
    const sys = systems.get('connection_a_b')!;
    expect(sys.lifetime).toBe(5000);
    expect(sys.speed).toBe(0.02);
  });

  it('color resolved via getDataTypeColor', () => {
    const systems = new Map<string, ParticleSystem>();
    createConnectionStream(systems, 'a', 'b', [0, 0, 0], [1, 0, 0], 'number');
    expect(systems.get('connection_a_b')!.color).toBe('#4ecdc4'); // number color
  });
});

// ──────────────────────────────────────────────────────────────────
// createFlowingStream
// ──────────────────────────────────────────────────────────────────

describe('createFlowingStream', () => {
  it('inserts under "<name>_flow"', () => {
    const systems = new Map<string, ParticleSystem>();
    createFlowingStream(systems, 'data', [0, 0, 0], [1, 2, 3], 100);
    expect(systems.has('data_flow')).toBe(true);
  });

  it('array length drives particle count (capped at 50)', () => {
    const systems = new Map<string, ParticleSystem>();
    createFlowingStream(systems, 'a', [0, 0, 0], Array(25).fill(0), 1000);
    expect(systems.get('a_flow')!.particles).toHaveLength(25);
  });

  it('array >50 is capped', () => {
    const systems = new Map<string, ParticleSystem>();
    createFlowingStream(systems, 'big', [0, 0, 0], Array(100).fill(0), 1000);
    expect(systems.get('big_flow')!.particles).toHaveLength(50);
  });

  it('non-array data uses default count 10', () => {
    const systems = new Map<string, ParticleSystem>();
    createFlowingStream(systems, 'x', [0, 0, 0], 'not-an-array', 1000);
    expect(systems.get('x_flow')!.particles).toHaveLength(10);
  });
});

// ──────────────────────────────────────────────────────────────────
// createExecutionEffect
// ──────────────────────────────────────────────────────────────────

describe('createExecutionEffect', () => {
  it('creates 30 particles at "<name>_execution" with fixed orange', () => {
    const systems = new Map<string, ParticleSystem>();
    createExecutionEffect(systems, 'step', [1, 1, 1], 1000);
    const sys = systems.get('step_execution')!;
    expect(sys).toBeDefined();
    expect(sys.particles).toHaveLength(30);
    expect(sys.color).toBe('#ff4500');
  });
});

// ──────────────────────────────────────────────────────────────────
// createDataVisualization
// ──────────────────────────────────────────────────────────────────

describe('createDataVisualization', () => {
  it('array length drives count (capped at 100)', () => {
    const systems = new Map<string, ParticleSystem>();
    createDataVisualization(systems, 'd', Array(42).fill(null), [0, 0, 0], 1000);
    expect(systems.get('d_visualization')!.particles).toHaveLength(42);
  });

  it('object keys × 5 (capped at 50)', () => {
    const systems = new Map<string, ParticleSystem>();
    createDataVisualization(systems, 'obj', { a: 1, b: 2, c: 3 }, [0, 0, 0], 1000);
    // 3 keys * 5 = 15
    expect(systems.get('obj_visualization')!.particles).toHaveLength(15);
  });

  it('primitive data uses default 10', () => {
    const systems = new Map<string, ParticleSystem>();
    createDataVisualization(systems, 'p', 42, [0, 0, 0], 1000);
    expect(systems.get('p_visualization')!.particles).toHaveLength(10);
  });

  it('null data is primitive (default 10)', () => {
    const systems = new Map<string, ParticleSystem>();
    createDataVisualization(systems, 'n', null, [0, 0, 0], 1000);
    expect(systems.get('n_visualization')!.particles).toHaveLength(10);
  });
});

// ──────────────────────────────────────────────────────────────────
// updateParticles (slice 14)
// ──────────────────────────────────────────────────────────────────

describe('updateParticles', () => {
  it('decrements lifetime by deltaTime', () => {
    const systems = new Map<string, ParticleSystem>();
    systems.set('a', { particles: [[0, 0, 0]], color: '#fff', lifetime: 1000, speed: 0 });
    updateParticles(systems, 100);
    expect(systems.get('a')!.lifetime).toBe(900);
  });

  it('removes system when lifetime drops to 0', () => {
    const systems = new Map<string, ParticleSystem>();
    systems.set('dying', { particles: [[0, 0, 0]], color: '#fff', lifetime: 100, speed: 0 });
    updateParticles(systems, 100);
    expect(systems.has('dying')).toBe(false);
  });

  it('removes system when lifetime goes negative', () => {
    const systems = new Map<string, ParticleSystem>();
    systems.set('dying', { particles: [[0, 0, 0]], color: '#fff', lifetime: 100, speed: 0 });
    updateParticles(systems, 500);
    expect(systems.has('dying')).toBe(false);
  });

  it('jitters particle positions by ±0.5 × speed per axis', () => {
    // Math.random = 0.5 → jitter = 0 → positions unchanged
    const systems = new Map<string, ParticleSystem>();
    systems.set('a', {
      particles: [[10, 20, 30]],
      color: '#fff',
      lifetime: 1000,
      speed: 0.5,
    });
    updateParticles(systems, 16);
    expect(systems.get('a')!.particles[0]).toEqual([10, 20, 30]);
  });

  it('empty map is a no-op', () => {
    const systems = new Map<string, ParticleSystem>();
    expect(() => updateParticles(systems, 100)).not.toThrow();
  });
});
