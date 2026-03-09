/**
 * PostProcessingManager.test.ts
 *
 * Unit tests for post-processing effects system
 * Note: Full integration tests with WebGL would require a browser environment
 */

import { describe, it, expect } from 'vitest';
import {
  PostProcessingManager,
  type PostProcessingConfig,
  type PostProcessingQuality,
} from '../PostProcessingManager';

describe('PostProcessingManager', () => {
  describe('Construction', () => {
    it('should create manager with default configuration', () => {
      const manager = new PostProcessingManager();
      expect(manager).toBeDefined();

      const stats = manager.getStats();
      expect(stats.quality).toBe('medium');
      expect(stats.enabled).toBe(true);
      expect(stats.activeEffects).toBe(0); // No effects until initialized
    });

    it('should create manager with custom quality preset', () => {
      const manager = new PostProcessingManager({ quality: 'ultra' });

      const stats = manager.getStats();
      expect(stats.quality).toBe('ultra');
      expect(stats.enabled).toBe(true);
    });

    it('should create manager with low quality preset', () => {
      const manager = new PostProcessingManager({ quality: 'low' });

      const stats = manager.getStats();
      expect(stats.quality).toBe('low');
    });

    it('should create manager with high quality preset', () => {
      const manager = new PostProcessingManager({ quality: 'high' });

      const stats = manager.getStats();
      expect(stats.quality).toBe('high');
    });

    it('should create manager with custom configuration', () => {
      const config: PostProcessingConfig = {
        ssao: {
          enabled: true,
          radius: 16,
          intensity: 2.0,
        },
        bloom: {
          enabled: true,
          strength: 1.5,
        },
      };

      const manager = new PostProcessingManager(config);
      expect(manager).toBeDefined();
    });

    it('should create manager with all effects enabled', () => {
      const config: PostProcessingConfig = {
        ssao: { enabled: true },
        bloom: { enabled: true },
        taa: { enabled: true },
        fxaa: { enabled: true },
        vignette: { enabled: true },
        filmGrain: { enabled: true },
        chromaticAberration: { enabled: true },
      };

      const manager = new PostProcessingManager(config);
      expect(manager).toBeDefined();
    });

    it('should create manager with all effects disabled', () => {
      const config: PostProcessingConfig = {
        ssao: { enabled: false },
        bloom: { enabled: false },
        taa: { enabled: false },
        fxaa: { enabled: false },
      };

      const manager = new PostProcessingManager(config);
      expect(manager).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should enable and disable post-processing', () => {
      const manager = new PostProcessingManager();

      manager.setEnabled(false);
      let stats = manager.getStats();
      expect(stats.enabled).toBe(false);

      manager.setEnabled(true);
      stats = manager.getStats();
      expect(stats.enabled).toBe(true);
    });

    it('should update quality preset', () => {
      const manager = new PostProcessingManager({ quality: 'low' });

      manager.setQuality('ultra');

      const stats = manager.getStats();
      expect(stats.quality).toBe('ultra');
    });

    it('should change quality from low to high', () => {
      const manager = new PostProcessingManager({ quality: 'low' });

      manager.setQuality('high');
      expect(manager.getStats().quality).toBe('high');

      manager.setQuality('medium');
      expect(manager.getStats().quality).toBe('medium');
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics structure', () => {
      const manager = new PostProcessingManager();

      const stats = manager.getStats();

      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('activeEffects');
      expect(stats).toHaveProperty('renderTime');
      expect(stats).toHaveProperty('quality');

      expect(typeof stats.enabled).toBe('boolean');
      expect(typeof stats.activeEffects).toBe('number');
      expect(typeof stats.renderTime).toBe('number');
      expect(typeof stats.quality).toBe('string');
    });

    it('should report zero active effects before initialization', () => {
      const manager = new PostProcessingManager({ quality: 'ultra' });

      const stats = manager.getStats();
      expect(stats.activeEffects).toBe(0);
    });

    it('should report enabled state correctly', () => {
      const manager = new PostProcessingManager();

      expect(manager.getStats().enabled).toBe(true);

      manager.setEnabled(false);
      expect(manager.getStats().enabled).toBe(false);
    });

    it('should report quality setting correctly', () => {
      const qualities: PostProcessingQuality[] = ['low', 'medium', 'high', 'ultra'];

      qualities.forEach((quality) => {
        const manager = new PostProcessingManager({ quality });
        expect(manager.getStats().quality).toBe(quality);
      });
    });

    it('should track render time', () => {
      const manager = new PostProcessingManager();

      const stats = manager.getStats();
      expect(stats.renderTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rendering', () => {
    it('should handle render call before initialization', () => {
      const manager = new PostProcessingManager();

      // Should not throw
      expect(() => manager.render()).not.toThrow();
    });

    it('should handle render call with deltaTime before initialization', () => {
      const manager = new PostProcessingManager();

      // Should not throw
      expect(() => manager.render(0.016)).not.toThrow();
    });

    it('should handle render call when disabled', () => {
      const manager = new PostProcessingManager();
      manager.setEnabled(false);

      // Should not throw
      expect(() => manager.render()).not.toThrow();
    });

    it('should handle multiple render calls', () => {
      const manager = new PostProcessingManager();

      expect(() => {
        manager.render();
        manager.render(0.016);
        manager.render(0.033);
      }).not.toThrow();
    });
  });

  describe('Resource Management', () => {
    it('should dispose resources', () => {
      const manager = new PostProcessingManager({ quality: 'ultra' });

      expect(() => manager.dispose()).not.toThrow();
    });

    it('should handle multiple dispose calls', () => {
      const manager = new PostProcessingManager();

      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should handle dispose without initialization', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('Effect Control', () => {
    it('should handle setEffectEnabled for unknown effect', () => {
      const manager = new PostProcessingManager();

      // Should not throw
      expect(() => manager.setEffectEnabled('nonexistent', false)).not.toThrow();
    });

    it('should handle setEffectEnabled before initialization', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.setEffectEnabled('bloom', false)).not.toThrow();
    });
  });

  describe('Resize Handling', () => {
    it('should handle setSize before initialization', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.setSize(1920, 1080)).not.toThrow();
    });

    it('should handle setSize with various dimensions', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.setSize(800, 600)).not.toThrow();
      expect(() => manager.setSize(1920, 1080)).not.toThrow();
      expect(() => manager.setSize(3840, 2160)).not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should accept empty configuration', () => {
      const manager = new PostProcessingManager({});
      expect(manager).toBeDefined();
      expect(manager.getStats().quality).toBe('medium'); // Default
    });

    it('should accept partial configuration', () => {
      const manager = new PostProcessingManager({
        bloom: { enabled: true },
      });
      expect(manager).toBeDefined();
    });

    it('should accept configuration with custom parameters', () => {
      const config: PostProcessingConfig = {
        ssao: {
          enabled: true,
          radius: 32,
          minDistance: 0.001,
          maxDistance: 0.5,
          intensity: 3.0,
        },
        bloom: {
          enabled: true,
          strength: 2.5,
          radius: 1.5,
          threshold: 0.5,
        },
        taa: {
          enabled: true,
          sampleLevel: 5,
        },
      };

      const manager = new PostProcessingManager(config);
      expect(manager).toBeDefined();
    });

    it('should override quality preset with custom config', () => {
      const manager = new PostProcessingManager({
        quality: 'low',
        bloom: { enabled: true, strength: 5.0 },
      });

      expect(manager.getStats().quality).toBe('low');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null deltaTime in render', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.render(undefined as any)).not.toThrow();
    });

    it('should handle negative deltaTime in render', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.render(-0.016)).not.toThrow();
    });

    it('should handle very large deltaTime in render', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.render(1000)).not.toThrow();
    });

    it('should handle setSize with zero dimensions', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.setSize(0, 0)).not.toThrow();
    });

    it('should handle setSize with negative dimensions', () => {
      const manager = new PostProcessingManager();

      expect(() => manager.setSize(-100, -100)).not.toThrow();
    });
  });

  describe('Quality Preset Merging', () => {
    it('should merge low preset with custom config', () => {
      const manager = new PostProcessingManager({
        quality: 'low',
        ssao: { enabled: true }, // Override low preset
      });

      expect(manager.getStats().quality).toBe('low');
    });

    it('should merge medium preset with custom config', () => {
      const manager = new PostProcessingManager({
        quality: 'medium',
        taa: { enabled: true }, // Add TAA to medium
      });

      expect(manager.getStats().quality).toBe('medium');
    });

    it('should merge high preset with custom config', () => {
      const manager = new PostProcessingManager({
        quality: 'high',
        bloom: { enabled: false }, // Disable bloom in high
      });

      expect(manager.getStats().quality).toBe('high');
    });

    it('should merge ultra preset with custom config', () => {
      const manager = new PostProcessingManager({
        quality: 'ultra',
        ssao: { enabled: false }, // Disable SSAO in ultra
      });

      expect(manager.getStats().quality).toBe('ultra');
    });
  });
});
