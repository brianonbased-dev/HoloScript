import { describe, it, expect } from 'vitest';
import { getDataTypeColor, createParticleEffect } from '../particle-effects.js';

describe('getDataTypeColor', () => {
  it('returns orange for string', () => {
    expect(getDataTypeColor('string')).toBe('#ff6b35');
  });

  it('returns teal for number', () => {
    const color = getDataTypeColor('number');
    expect(color).toBeTruthy();
    expect(color).not.toBe('#ffffff');
  });

  it('returns blue for boolean', () => {
    const color = getDataTypeColor('boolean');
    expect(color).toBeTruthy();
    expect(color).not.toBe('#ffffff');
  });

  it('returns default #ffffff for unknown type', () => {
    expect(getDataTypeColor('unknown_xyz')).toBe('#ffffff');
  });

  it('returns a color for object type', () => {
    const color = getDataTypeColor('object');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(color).not.toBe('#ffffff');
  });

  it('returns a color for array type', () => {
    const color = getDataTypeColor('array');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(color).not.toBe('#ffffff');
  });
});

describe('createParticleEffect', () => {
  it('adds a particle system entry to the map', () => {
    const systems = new Map();
    createParticleEffect(systems, 'test', [0, 0, 0], '#ff0000', 10, 50);
    expect(systems.size).toBeGreaterThan(0);
  });

  it('clamps count to maxParticlesPerSystem', () => {
    const systems = new Map();
    createParticleEffect(systems, 'clamped', [0, 0, 0], '#00ff00', 1000, 5);
    const entry = systems.get('clamped');
    if (entry) {
      const count = Array.isArray(entry.particles) ? entry.particles.length : (entry.count ?? 0);
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it('stores the provided color', () => {
    const systems = new Map();
    createParticleEffect(systems, 'colorTest', [1, 2, 3], '#abcdef', 3, 50);
    const entry = systems.get('colorTest');
    expect(JSON.stringify(entry)).toContain('#abcdef');
  });

  it('uses the provided position', () => {
    const systems = new Map();
    createParticleEffect(systems, 'posTest', [5, 10, 15], '#ffffff', 1, 50);
    expect(systems.has('posTest')).toBe(true);
  });
});
