/**
 * TraitVisualRegistry Production Tests
 * Sprint CLXVII — singleton, register, batch, get, has, size, reset
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TraitVisualRegistry } from '../TraitVisualRegistry';
import type { TraitVisualConfig } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<TraitVisualConfig> = {}): TraitVisualConfig {
  return {
    material: { metalness: 1.0, roughness: 0.2 },
    tags: ['metallic'],
    layer: 'base_material',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TraitVisualRegistry', () => {
  let registry: TraitVisualRegistry;

  beforeEach(() => {
    // Use a fresh singleton state for each test
    registry = TraitVisualRegistry.getInstance();
    registry.reset();
  });

  describe('singleton', () => {
    it('getInstance always returns the same instance', () => {
      const a = TraitVisualRegistry.getInstance();
      const b = TraitVisualRegistry.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('register', () => {
    it('registers a trait config', () => {
      registry.register('metallic', makeConfig());
      expect(registry.has('metallic')).toBe(true);
    });

    it('size increments on register', () => {
      registry.register('metallic', makeConfig());
      expect(registry.size).toBe(1);
    });

    it('overwrites existing trait on re-register', () => {
      registry.register('metallic', makeConfig({ tags: ['metallic'] }));
      registry.register('metallic', makeConfig({ tags: ['metal', 'reflective'] }));
      expect(registry.get('metallic')?.tags).toContain('reflective');
    });
  });

  describe('registerBatch', () => {
    it('registers multiple traits at once', () => {
      registry.registerBatch({
        metallic: makeConfig({ tags: ['metallic'] }),
        wooden: { material: { roughness: 0.9 }, tags: ['organic'], layer: 'base_material' },
        glowing: { emissive: { color: '#00FF00', intensity: 1 }, layer: 'lighting' },
      });
      expect(registry.size).toBe(3);
      expect(registry.has('metallic')).toBe(true);
      expect(registry.has('wooden')).toBe(true);
      expect(registry.has('glowing')).toBe(true);
    });

    it('registerBatch with empty object is a no-op', () => {
      registry.registerBatch({});
      expect(registry.size).toBe(0);
    });
  });

  describe('get', () => {
    it('returns config for registered trait', () => {
      const cfg = makeConfig();
      registry.register('metallic', cfg);
      expect(registry.get('metallic')).toEqual(cfg);
    });

    it('returns undefined for unregistered trait', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('stored config preserves all fields', () => {
      const cfg: TraitVisualConfig = {
        material: { metalness: 1.0, roughness: 0.1, color: '#silver' },
        emissive: { color: '#FFFFFF', intensity: 0.5 },
        opacity: 0.8,
        scale: [1, 2, 1],
        particleEffect: 'spark',
        shader: 'pbr',
        tags: ['metallic', 'reflective'],
        layer: 'surface',
      };
      registry.register('fancy', cfg);
      expect(registry.get('fancy')).toEqual(cfg);
    });
  });

  describe('has', () => {
    it('returns false for unregistered trait', () => {
      expect(registry.has('unknown')).toBe(false);
    });

    it('returns true after registration', () => {
      registry.register('stone', makeConfig());
      expect(registry.has('stone')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('returns all registered configs', () => {
      registry.register('a', makeConfig());
      registry.register('b', makeConfig());
      const all = registry.getAll();
      expect(all.size).toBe(2);
      expect(all.has('a')).toBe(true);
      expect(all.has('b')).toBe(true);
    });

    it('returned map is read-only (reference equality check)', () => {
      registry.register('a', makeConfig());
      const all = registry.getAll();
      expect(all).toBe(registry.getAll()); // same underlying map
    });
  });

  describe('size', () => {
    it('starts at 0 after reset', () => {
      expect(registry.size).toBe(0);
    });

    it('increases with each registration', () => {
      registry.register('a', makeConfig());
      registry.register('b', makeConfig());
      registry.register('c', makeConfig());
      expect(registry.size).toBe(3);
    });
  });

  describe('reset', () => {
    it('clears all registered configs', () => {
      registry.register('metallic', makeConfig());
      registry.register('wooden', makeConfig());
      registry.reset();
      expect(registry.size).toBe(0);
      expect(registry.has('metallic')).toBe(false);
    });
  });
});
