import { describe, it, expect, beforeEach } from 'vitest';
import { PresetRegistry } from '../registry.js';
import { allPresets, walkPreset, idlePreset } from '../presets/index.js';
import type { AnimationPreset, PresetCategory } from '../types.js';

describe('PresetRegistry', () => {
  let registry: PresetRegistry;

  beforeEach(() => {
    registry = new PresetRegistry();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  describe('construction', () => {
    it('should load all 15 default presets', () => {
      expect(registry.size).toBe(15);
    });

    it('should create empty registry when loadDefaults is false', () => {
      const empty = new PresetRegistry(false);
      expect(empty.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  describe('get()', () => {
    it('should retrieve a preset by name', () => {
      const walk = registry.get('walk');
      expect(walk).toBeDefined();
      expect(walk!.name).toBe('walk');
    });

    it('should return undefined for unknown name', () => {
      const unknown = registry.get('nonexistent');
      expect(unknown).toBeUndefined();
    });

    it('should retrieve all 15 canonical presets by name', () => {
      const names = [
        'walk', 'idle', 'attack', 'speak', 'dance',
        'run', 'jump', 'wave', 'sit', 'sleep',
        'crouch', 'swim', 'fly', 'climb', 'emote',
      ];
      for (const name of names) {
        expect(registry.get(name)).toBeDefined();
      }
    });
  });

  describe('has()', () => {
    it('should return true for existing presets', () => {
      expect(registry.has('walk')).toBe(true);
      expect(registry.has('idle')).toBe(true);
    });

    it('should return false for non-existing presets', () => {
      expect(registry.has('teleport')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Category Operations
  // -----------------------------------------------------------------------

  describe('getByCategory()', () => {
    it('should return 7 locomotion presets', () => {
      const locomotion = registry.getByCategory('locomotion');
      expect(locomotion).toHaveLength(7);
      for (const p of locomotion) {
        expect(p.category).toBe('locomotion');
      }
    });

    it('should return 1 combat preset', () => {
      const combat = registry.getByCategory('combat');
      expect(combat).toHaveLength(1);
    });

    it('should return 2 social presets', () => {
      const social = registry.getByCategory('social');
      expect(social).toHaveLength(2);
    });

    it('should return 2 emote presets', () => {
      const emote = registry.getByCategory('emote');
      expect(emote).toHaveLength(2);
    });

    it('should return 3 environmental presets', () => {
      const env = registry.getByCategory('environmental');
      expect(env).toHaveLength(3);
    });

    it('category counts should sum to 15', () => {
      const categories: PresetCategory[] = [
        'locomotion', 'combat', 'social', 'emote', 'environmental',
      ];
      let total = 0;
      for (const cat of categories) {
        total += registry.getByCategory(cat).length;
      }
      expect(total).toBe(15);
    });
  });

  describe('getCategories()', () => {
    it('should return 5 category info objects', () => {
      const categories = registry.getCategories();
      expect(categories).toHaveLength(5);
    });

    it('each category should have label, description, and preset names', () => {
      const categories = registry.getCategories();
      for (const cat of categories) {
        expect(cat.label).toBeTruthy();
        expect(cat.description).toBeTruthy();
        expect(cat.presetNames.length).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  describe('searchByTag()', () => {
    it('should find presets by exact tag match', () => {
      const results = registry.searchByTag('aerial');
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const r of results) {
        expect(r.tags).toContain('aerial');
      }
    });

    it('should be case-insensitive', () => {
      const lower = registry.searchByTag('locomotion');
      const upper = registry.searchByTag('LOCOMOTION');
      expect(lower).toEqual(upper);
    });

    it('should return empty array for unknown tag', () => {
      const results = registry.searchByTag('nonexistent-tag-xyz');
      expect(results).toEqual([]);
    });
  });

  describe('search()', () => {
    it('should match against preset name', () => {
      const results = registry.search('walk');
      expect(results.some((p) => p.name === 'walk')).toBe(true);
    });

    it('should match against description', () => {
      const results = registry.search('bipedal');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should match against Mixamo clip name', () => {
      const results = registry.search('Swimming');
      expect(results.some((p) => p.name === 'swim')).toBe(true);
    });

    it('should match against tags', () => {
      const results = registry.search('aquatic');
      expect(results.some((p) => p.name === 'swim')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const lower = registry.search('walking');
      const upper = registry.search('WALKING');
      expect(lower.length).toBe(upper.length);
    });
  });

  // -----------------------------------------------------------------------
  // Enumeration
  // -----------------------------------------------------------------------

  describe('getAll()', () => {
    it('should return all presets as array', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(15);
    });
  });

  describe('getNames()', () => {
    it('should return all preset names', () => {
      const names = registry.getNames();
      expect(names).toHaveLength(15);
      expect(names).toContain('walk');
      expect(names).toContain('idle');
    });
  });

  // -----------------------------------------------------------------------
  // Custom Registration
  // -----------------------------------------------------------------------

  describe('register()', () => {
    it('should add a new preset', () => {
      const custom: AnimationPreset = {
        ...walkPreset,
        name: 'sneak' as any,
        description: 'Custom sneaking behavior',
      };
      registry.register(custom);
      expect(registry.size).toBe(16);
      expect(registry.get('sneak')).toBeDefined();
    });

    it('should overwrite an existing preset', () => {
      const modified: AnimationPreset = {
        ...walkPreset,
        description: 'Modified walk description',
      };
      registry.register(modified);
      expect(registry.size).toBe(15); // No increase
      expect(registry.get('walk')!.description).toBe('Modified walk description');
    });
  });

  describe('unregister()', () => {
    it('should remove a preset by name', () => {
      const removed = registry.unregister('walk');
      expect(removed).toBe(true);
      expect(registry.size).toBe(14);
      expect(registry.has('walk')).toBe(false);
    });

    it('should return false for unknown name', () => {
      const removed = registry.unregister('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should remove all presets', () => {
      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
  });
});
