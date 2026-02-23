/**
 * Tests for InstancedRenderer
 *
 * Tests WebGPU instanced rendering for large particle counts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WebGPUContext } from '../WebGPUContext.js';
import { InstancedRenderer } from '../InstancedRenderer.js';

describe('InstancedRenderer', () => {
  let context: WebGPUContext;
  let canvas: HTMLCanvasElement;

  beforeAll(async () => {
    // Create WebGPU context
    context = new WebGPUContext({ fallbackToCPU: true });
    await context.initialize();

    // Create canvas
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
    }
  });

  describe('Initialization', () => {
    it('should create renderer instance', () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 1000,
        sphereSegments: 16,
      });

      expect(renderer).toBeDefined();
    });

    it('should initialize with sphere geometry', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 1000,
        sphereSegments: 8,
      });

      await renderer.initialize();

      expect(renderer).toBeDefined();
    });

    it('should support different sphere segment counts', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const lowDetail = new InstancedRenderer(context, canvas, {
        maxParticles: 100000,
        sphereSegments: 8, // Low detail for 100K particles
      });

      const highDetail = new InstancedRenderer(context, canvas, {
        maxParticles: 1000,
        sphereSegments: 32, // High detail for 1K particles
      });

      await lowDetail.initialize();
      await highDetail.initialize();

      expect(lowDetail).toBeDefined();
      expect(highDetail).toBeDefined();

      lowDetail.destroy();
      highDetail.destroy();
    });
  });

  describe('Rendering', () => {
    it('should render particles to canvas', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 100,
        sphereSegments: 16,
      });

      await renderer.initialize();

      // Create particle data (positions + radius)
      const particleCount = 100;
      const positions = new Float32Array(particleCount * 4);

      for (let i = 0; i < particleCount; i++) {
        positions[i * 4 + 0] = (Math.random() - 0.5) * 20; // x
        positions[i * 4 + 1] = Math.random() * 10; // y
        positions[i * 4 + 2] = (Math.random() - 0.5) * 20; // z
        positions[i * 4 + 3] = 0.1; // radius
      }

      // Camera params
      const camera = {
        position: [15, 10, 15] as [number, number, number],
        target: [0, 5, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 100,
      };

      // Render (should not throw)
      expect(() => {
        renderer.render(positions, particleCount, camera);
      }).not.toThrow();

      renderer.destroy();
    });

    it('should render 1K particles', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 1000,
        sphereSegments: 16,
      });

      await renderer.initialize();

      const particleCount = 1000;
      const positions = new Float32Array(particleCount * 4);

      // Grid of particles
      const gridSize = 10;
      let idx = 0;
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          for (let z = 0; z < gridSize; z++) {
            positions[idx * 4 + 0] = x - gridSize / 2;
            positions[idx * 4 + 1] = y;
            positions[idx * 4 + 2] = z - gridSize / 2;
            positions[idx * 4 + 3] = 0.1;
            idx++;
          }
        }
      }

      const camera = {
        position: [15, 10, 15] as [number, number, number],
        target: [0, 5, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 100,
      };

      expect(() => {
        renderer.render(positions, particleCount, camera);
      }).not.toThrow();

      renderer.destroy();
    });

    it('should render 10K particles', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 10000,
        sphereSegments: 12, // Lower detail for performance
      });

      await renderer.initialize();

      const particleCount = 10000;
      const positions = new Float32Array(particleCount * 4);

      // Random particles
      for (let i = 0; i < particleCount; i++) {
        positions[i * 4 + 0] = (Math.random() - 0.5) * 40;
        positions[i * 4 + 1] = Math.random() * 20;
        positions[i * 4 + 2] = (Math.random() - 0.5) * 40;
        positions[i * 4 + 3] = 0.1;
      }

      const camera = {
        position: [30, 20, 30] as [number, number, number],
        target: [0, 10, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 200,
      };

      expect(() => {
        renderer.render(positions, particleCount, camera);
      }).not.toThrow();

      renderer.destroy();
    });
  });

  describe('Camera', () => {
    it('should update camera matrices', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 100,
        sphereSegments: 16,
      });

      await renderer.initialize();

      const positions = new Float32Array(100 * 4);
      for (let i = 0; i < 100; i++) {
        positions[i * 4 + 0] = (i % 10) - 5;
        positions[i * 4 + 1] = Math.floor(i / 10);
        positions[i * 4 + 2] = 0;
        positions[i * 4 + 3] = 0.1;
      }

      // Different camera angles
      const cameras = [
        {
          position: [10, 5, 10] as [number, number, number],
          target: [0, 0, 0] as [number, number, number],
        },
        {
          position: [-10, 5, 10] as [number, number, number],
          target: [0, 0, 0] as [number, number, number],
        },
        {
          position: [0, 20, 0] as [number, number, number],
          target: [0, 0, 0] as [number, number, number],
        },
      ];

      for (const cameraPos of cameras) {
        const camera = {
          ...cameraPos,
          fov: Math.PI / 4,
          aspect: canvas.width / canvas.height,
          near: 0.1,
          far: 100,
        };

        expect(() => {
          renderer.render(positions, 100, camera);
        }).not.toThrow();
      }

      renderer.destroy();
    });
  });

  describe('Options', () => {
    it('should support LOD options', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 1000,
        sphereSegments: 16,
        enableLOD: true,
        lodDistances: [10, 30, 60],
      });

      await renderer.initialize();
      expect(renderer).toBeDefined();

      renderer.destroy();
    });

    it('should support frustum culling options', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 1000,
        sphereSegments: 16,
        enableFrustumCulling: true,
      });

      await renderer.initialize();
      expect(renderer).toBeDefined();

      renderer.destroy();
    });
  });

  describe('Performance', () => {
    it('should render 100K particles (target performance)', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 100000,
        sphereSegments: 8, // Low detail for 100K
        enableLOD: true,
        enableFrustumCulling: true,
      });

      await renderer.initialize();

      const particleCount = 100000;
      const positions = new Float32Array(particleCount * 4);

      // Random distribution
      for (let i = 0; i < particleCount; i++) {
        positions[i * 4 + 0] = (Math.random() - 0.5) * 100;
        positions[i * 4 + 1] = Math.random() * 50;
        positions[i * 4 + 2] = (Math.random() - 0.5) * 100;
        positions[i * 4 + 3] = 0.08;
      }

      const camera = {
        position: [50, 30, 50] as [number, number, number],
        target: [0, 25, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 300,
      };

      // Measure render time
      const start = performance.now();
      renderer.render(positions, particleCount, camera);
      const end = performance.now();

      const renderTime = end - start;
      console.log(`✅ Rendered 100K particles in ${renderTime.toFixed(2)}ms`);

      // Should render in under 16.67ms for 60 FPS
      // Note: This is an aspirational target; actual performance depends on GPU
      expect(renderTime).toBeLessThan(50); // Allow 50ms for test environments

      renderer.destroy();
    });
  });

  describe('Cleanup', () => {
    it('should destroy renderer and free resources', async () => {
      if (!context.isSupported() || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU not available or no DOM)');
        return;
      }

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: 1000,
        sphereSegments: 16,
      });

      await renderer.initialize();

      expect(() => {
        renderer.destroy();
      }).not.toThrow();
    });
  });
});
