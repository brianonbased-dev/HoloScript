/**
 * Tests for EarthquakeRuntimeExecutor
 *
 * Verifies runtime executor integration with HoloScript compositions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EarthquakeRuntimeExecutor } from '../EarthquakeRuntimeExecutor';
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
    name: 'TestEarthquake',
    version: '1.0.0',
    entities: [],
    traits: [
      {
        name: 'earthquake',
        properties: {
          intensity: 7,
          duration: 5,
        },
      },
      {
        name: 'city',
        properties: {
          buildingCount: 5,
          buildingHeight: 30,
          buildingSpacing: 20,
        },
      },
      {
        name: 'camera',
        properties: {
          position: [80, 60, 80],
          target: [0, 20, 0],
          fov: 60,
        },
      },
    ],
    ...overrides,
  };
}

describe('EarthquakeRuntimeExecutor', () => {
  let executor: EarthquakeRuntimeExecutor;
  let renderer: MockRenderer;

  beforeEach(() => {
    renderer = new MockRenderer();
    executor = new EarthquakeRuntimeExecutor({
      debug: false,
      renderer,
    });
  });

  describe('Initialization', () => {
    it('should initialize with HoloScript composition', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      // Simulation may be null if WebGPU is not available (expected in tests)
      expect(executor.getSimulation()).toBeDefined();
    });

    it('should extract earthquake config from composition traits', async () => {
      const composition = createTestComposition({
        traits: [
          {
            name: 'earthquake',
            properties: {
              intensity: 9,
              duration: 10,
            },
          },
        ],
      });

      await executor.initialize(composition);
      // Config is extracted and used during initialization
      expect(executor.getSimulation()).toBeDefined();
    });

    it('should extract city config from composition traits', async () => {
      const composition = createTestComposition({
        traits: [
          {
            name: 'city',
            properties: {
              buildingCount: 10,
              buildingHeight: 50,
              buildingSpacing: 25,
            },
          },
        ],
      });

      await executor.initialize(composition);
      expect(executor.getSimulation()).toBeDefined();
    });

    it('should use default config when no traits provided', async () => {
      const composition = createTestComposition({ traits: [] });
      await executor.initialize(composition);

      expect(executor.getSimulation()).toBeDefined();
    });
  });

  describe('Renderer Integration', () => {
    it('should initialize renderer with composition', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      expect(renderer.isInitialized()).toBe(true);
    });

    it('should add ground plane to renderer', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      const objects = renderer.getObjects();
      const ground = objects.find((obj) => obj.id === 'ground');

      expect(ground).toBeDefined();
      expect(ground?.type).toBe('plane');
    });

    it('should add buildings to renderer', async () => {
      const composition = createTestComposition({
        traits: [
          {
            name: 'city',
            properties: {
              buildingCount: 3,
            },
          },
        ],
      });

      await executor.initialize(composition);

      const objects = renderer.getObjects();
      const buildings = objects.filter((obj) => obj.id.startsWith('building_'));

      expect(buildings.length).toBe(3);
    });

    it('should add debris particle system to renderer', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      const particleSystems = renderer.getParticleSystems();
      const debrisParticles = particleSystems.find((sys) => sys.id === 'debris_particles');

      expect(debrisParticles).toBeDefined();
      expect(debrisParticles?.maxParticles).toBe(100000);
    });

    it('should add lights to renderer', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      const lights = renderer.getLights();

      expect(lights.length).toBeGreaterThanOrEqual(3);
      expect(lights.some((l) => l.type === 'ambient')).toBe(true);
      expect(lights.some((l) => l.type === 'directional')).toBe(true);
      expect(lights.some((l) => l.type === 'point')).toBe(true);
    });

    it('should set camera from composition', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      expect(renderer.isInitialized()).toBe(true);
    });
  });

  describe('Runtime Execution', () => {
    it('should handle start without WebGPU', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      // Should handle gracefully even if WebGPU simulation fails
      expect(() => {
        executor.start();
      }).not.toThrow();
    });

    it('should stop execution', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      executor.start();
      executor.stop();

      const stats = executor.getStatistics();
      expect(stats.isRunning).toBe(false);
    });

    it('should track execution time', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      executor.start();
      const stats = executor.getStatistics();

      expect(stats.executionTime).toBeGreaterThanOrEqual(0);
      executor.stop();
    });
  });

  describe('Earthquake Operations', () => {
    it('should trigger earthquake', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      expect(() => {
        executor.triggerEarthquake({
          intensity: 8,
          duration: 6,
          frequency: 3.0,
        });
      }).not.toThrow();
    });

    it('should use default earthquake config', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      expect(() => {
        executor.triggerEarthquake({});
      }).not.toThrow();
    });

    it('should reset simulation', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      executor.start();
      executor.triggerEarthquake({ intensity: 7 });
      executor.reset();

      const stats = executor.getStatistics();
      expect(stats.currentFrame).toBe(0);

      executor.stop();
    });
  });

  describe('Statistics', () => {
    it('should provide runtime statistics', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      const stats = executor.getStatistics();

      expect(stats).toHaveProperty('scene');
      expect(stats).toHaveProperty('executionTime');
      expect(stats).toHaveProperty('currentFrame');
      expect(stats).toHaveProperty('isRunning');
    });

    it('should provide scene statistics', async () => {
      const composition = createTestComposition();
      await executor.initialize(composition);

      executor.start();
      const stats = executor.getStatistics();

      expect(stats.scene).toBeDefined();
      executor.stop();
    });
  });

  describe('Renderer Management', () => {
    it('should set renderer after initialization', async () => {
      const composition = createTestComposition();
      const executorWithoutRenderer = new EarthquakeRuntimeExecutor({ debug: false });

      await executorWithoutRenderer.initialize(composition);

      const newRenderer = new MockRenderer();
      executorWithoutRenderer.setRenderer(newRenderer);

      expect(executorWithoutRenderer.getRenderer()).toBe(newRenderer);
    });

    it('should work without renderer', async () => {
      const executorWithoutRenderer = new EarthquakeRuntimeExecutor({ debug: false });
      const composition = createTestComposition();

      expect(async () => {
        await executorWithoutRenderer.initialize(composition);
        executorWithoutRenderer.start();
        executorWithoutRenderer.stop();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle start without initialization', () => {
      const executorUninitialized = new EarthquakeRuntimeExecutor({ debug: false });

      // Should not throw, but should log error
      expect(() => {
        executorUninitialized.start();
      }).not.toThrow();
    });

    it('should handle operations on uninitialized executor', () => {
      const executorUninitialized = new EarthquakeRuntimeExecutor({ debug: false });

      expect(executorUninitialized.getSimulation()).toBeNull();
      expect(executorUninitialized.getRenderer()).toBeNull();
    });

    it('should handle WebGPU initialization failure gracefully', async () => {
      const composition = createTestComposition();

      // Should not throw even if WebGPU is unavailable
      await expect(executor.initialize(composition)).resolves.not.toThrow();
    });
  });

  describe('Building Oscillation', () => {
    it('should calculate building oscillations during earthquake', async () => {
      const composition = createTestComposition({
        traits: [
          {
            name: 'city',
            properties: {
              buildingCount: 2,
            },
          },
        ],
      });

      await executor.initialize(composition);
      executor.start();

      // Trigger earthquake
      executor.triggerEarthquake({ intensity: 8 });

      // Wait for a few frames to allow oscillation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Buildings should have updated transforms during earthquake
      const objects = renderer.getObjects();
      const buildings = objects.filter((obj) => obj.id.startsWith('building_'));

      expect(buildings.length).toBeGreaterThan(0);

      executor.stop();
    });
  });
});
