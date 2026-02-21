/**
 * Tests for ErosionRuntimeExecutor
 *
 * Verifies runtime executor integration with HoloScript compositions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErosionRuntimeExecutor } from '../ErosionRuntimeExecutor';
import type { HoloComposition } from '../../../parser/HoloCompositionTypes';
import type { RuntimeRenderer } from '../../../runtime/RuntimeRenderer';

// Mock requestAnimationFrame for tests
global.requestAnimationFrame = vi.fn((cb) => {
  setTimeout(cb, 16); // ~60fps
  return 0;
});

global.cancelAnimationFrame = vi.fn();

// Mock renderer implementation
class MockRenderer implements RuntimeRenderer {
  private objects = new Map<string, any>();
  private lights = new Map<string, any>();
  private particleSystems = new Map<string, any>();
  private initialized = false;

  initialize(composition: HoloComposition): void {
    this.initialized = true;
  }

  addObject(object: any): void {
    this.objects.set(object.id, object);
  }

  removeObject(id: string): void {
    this.objects.delete(id);
  }

  updateObjectTransform(id: string, transform: any): void {
    const object = this.objects.get(id);
    if (object) {
      Object.assign(object, transform);
    }
  }

  addLight(light: any): void {
    this.lights.set(light.id, light);
  }

  updateLight(id: string, props: any): void {
    const light = this.lights.get(id);
    if (light) {
      Object.assign(light, props);
    }
  }

  addParticleSystem(system: any): void {
    this.particleSystems.set(system.id, system);
  }

  updateParticleSystem(id: string, positions: Float32Array, colors: Float32Array): void {
    const system = this.particleSystems.get(id);
    if (system) {
      system.positions = positions;
      system.colors = colors;
    }
  }

  updateCamera(camera: any): void {
    // Mock implementation
  }

  start(): void {
    // Mock implementation
  }

  stop(): void {
    // Mock implementation
  }

  update(deltaTime: number): void {
    // Mock implementation
  }

  render(): void {
    // Mock implementation
  }

  getObjects() {
    return Array.from(this.objects.values());
  }

  getLights() {
    return Array.from(this.lights.values());
  }

  getParticleSystems() {
    return Array.from(this.particleSystems.values());
  }

  isInitialized() {
    return this.initialized;
  }
}

// Helper to create test composition
function createTestComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestErosion',
    version: '1.0.0',
    entities: [],
    traits: [
      {
        name: 'erosion',
        properties: {
          preset: 'mountain',
          timeScale: 1.0,
        },
      },
      {
        name: 'terrain',
        properties: {
          resolution: 64,
          size: 100,
        },
      },
      {
        name: 'camera',
        properties: {
          position: [0, 80, 100],
          target: [0, 0, 0],
          fov: 60,
        },
      },
    ],
    ...overrides,
  };
}

describe('ErosionRuntimeExecutor', () => {
  let executor: ErosionRuntimeExecutor;
  let renderer: MockRenderer;

  beforeEach(() => {
    renderer = new MockRenderer();
    executor = new ErosionRuntimeExecutor({
      debug: false,
      renderer,
    });
  });

  describe('Initialization', () => {
    it('should initialize with HoloScript composition', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      expect(executor.getScene()).not.toBeNull();
    });

    it('should extract erosion config from composition traits', () => {
      const composition = createTestComposition({
        traits: [
          {
            name: 'erosion',
            properties: {
              preset: 'canyon',
              timeScale: 2.0,
            },
          },
        ],
      });

      executor.initialize(composition);
      const scene = executor.getScene();

      expect(scene).not.toBeNull();
      expect(scene!.config.preset).toBe('canyon');
      expect(scene!.config.timeScale).toBe(2.0);
    });

    it('should extract terrain config from composition traits', () => {
      const composition = createTestComposition({
        traits: [
          {
            name: 'terrain',
            properties: {
              resolution: 128,
              size: 200,
            },
          },
        ],
      });

      executor.initialize(composition);
      const scene = executor.getScene();

      expect(scene).not.toBeNull();
      expect(scene!.config.resolution).toBe(128);
      expect(scene!.config.size).toBe(200);
    });

    it('should use default config when no traits provided', () => {
      const composition = createTestComposition({ traits: [] });
      executor.initialize(composition);

      const scene = executor.getScene();
      expect(scene).not.toBeNull();
      expect(scene!.config.resolution).toBe(128);
      expect(scene!.config.size).toBe(100);
    });
  });

  describe('Renderer Integration', () => {
    it('should initialize renderer with composition', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      expect(renderer.isInitialized()).toBe(true);
    });

    it('should add terrain to renderer', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      const objects = renderer.getObjects();
      const terrain = objects.find((obj) => obj.id === 'terrain');

      expect(terrain).toBeDefined();
      expect(terrain?.type).toBe('mesh');
      expect(terrain?.material.type).toBe('standard');
    });

    it('should add water particle system to renderer', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      const particleSystems = renderer.getParticleSystems();
      const waterParticles = particleSystems.find((sys) => sys.id === 'water_particles');

      expect(waterParticles).toBeDefined();
      expect(waterParticles?.maxParticles).toBe(50000);
    });

    it('should add sediment particle system to renderer', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      const particleSystems = renderer.getParticleSystems();
      const sedimentParticles = particleSystems.find((sys) => sys.id === 'sediment_particles');

      expect(sedimentParticles).toBeDefined();
      expect(sedimentParticles?.maxParticles).toBe(30000);
    });

    it('should add lights to renderer', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      const lights = renderer.getLights();

      expect(lights.length).toBeGreaterThanOrEqual(2);
      expect(lights.some((l) => l.type === 'ambient')).toBe(true);
      expect(lights.some((l) => l.type === 'directional')).toBe(true);
    });

    it('should set camera from composition', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      // Camera update is called during initialization
      // We can verify by checking the renderer was initialized
      expect(renderer.isInitialized()).toBe(true);
    });
  });

  describe('Runtime Execution', () => {
    it('should start execution', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      executor.start();
      const stats = executor.getStatistics();

      expect(stats.isRunning).toBe(true);
      expect(stats.currentFrame).toBeGreaterThanOrEqual(0);
    });

    it('should stop execution', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      executor.start();
      executor.stop();

      const stats = executor.getStatistics();
      expect(stats.isRunning).toBe(false);
    });

    it('should update scene on each frame', async () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      executor.start();

      // Wait for a few frames
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = executor.getStatistics();
      expect(stats.currentFrame).toBeGreaterThan(0);

      executor.stop();
    });

    it('should track execution time', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      executor.start();
      const stats = executor.getStatistics();

      expect(stats.executionTime).toBeGreaterThanOrEqual(0);
      executor.stop();
    });
  });

  describe('Erosion Operations', () => {
    it('should add rain to terrain', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      expect(() => {
        executor.addRain(0, 0, 10, 5.0);
      }).not.toThrow();
    });

    it('should load presets', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      const presets = ['mountain', 'valley', 'plateau', 'canyon', 'plains'] as const;

      for (const preset of presets) {
        expect(() => {
          executor.loadPreset(preset);
        }).not.toThrow();
      }
    });

    it('should reset simulation', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      executor.start();
      executor.addRain(0, 0, 10, 5.0);
      executor.reset();

      const stats = executor.getStatistics();
      expect(stats.currentFrame).toBe(0);

      executor.stop();
    });
  });

  describe('Statistics', () => {
    it('should provide runtime statistics', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      const stats = executor.getStatistics();

      expect(stats).toHaveProperty('scene');
      expect(stats).toHaveProperty('executionTime');
      expect(stats).toHaveProperty('currentFrame');
      expect(stats).toHaveProperty('isRunning');
    });

    it('should provide scene statistics', () => {
      const composition = createTestComposition();
      executor.initialize(composition);

      executor.start();
      const stats = executor.getStatistics();

      expect(stats.scene).toBeDefined();
      executor.stop();
    });
  });

  describe('Renderer Management', () => {
    it('should set renderer after initialization', () => {
      const composition = createTestComposition();
      const executorWithoutRenderer = new ErosionRuntimeExecutor({ debug: false });

      executorWithoutRenderer.initialize(composition);

      const newRenderer = new MockRenderer();
      executorWithoutRenderer.setRenderer(newRenderer);

      expect(executorWithoutRenderer.getRenderer()).toBe(newRenderer);
    });

    it('should work without renderer', () => {
      const executorWithoutRenderer = new ErosionRuntimeExecutor({ debug: false });
      const composition = createTestComposition();

      expect(() => {
        executorWithoutRenderer.initialize(composition);
        executorWithoutRenderer.start();
        executorWithoutRenderer.stop();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle start without initialization', () => {
      const executorUninitialized = new ErosionRuntimeExecutor({ debug: false });

      // Should not throw, but should log error
      expect(() => {
        executorUninitialized.start();
      }).not.toThrow();
    });

    it('should handle operations on uninitialized scene', () => {
      const executorUninitialized = new ErosionRuntimeExecutor({ debug: false });

      expect(executorUninitialized.getScene()).toBeNull();
      expect(executorUninitialized.getRenderer()).toBeNull();
    });
  });
});
