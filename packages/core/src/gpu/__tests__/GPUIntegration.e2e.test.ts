/**
 * End-to-End GPU Physics Integration Tests
 *
 * Tests the complete GPU pipeline:
 * 1. WebGPU context initialization
 * 2. Particle physics simulation (compute shader)
 * 3. Spatial grid collision detection
 * 4. Instanced rendering
 *
 * This validates the entire GPU acceleration stack working together.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WebGPUContext } from '../WebGPUContext.js';
import { GPUBufferManager } from '../GPUBuffers.js';
import { ComputePipeline } from '../ComputePipeline.js';
import { SpatialGrid } from '../SpatialGrid.js';
import { InstancedRenderer } from '../InstancedRenderer.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('GPU Physics Integration (End-to-End)', () => {
  let context: WebGPUContext;
  let particlePhysicsShader: string;
  let spatialGridShader: string;
  let canvas: HTMLCanvasElement;

  beforeAll(async () => {
    // Initialize WebGPU context
    context = new WebGPUContext({ fallbackToCPU: false });
    await context.initialize();

    // Load shaders
    try {
      particlePhysicsShader = await readFile(
        join(__dirname, '../shaders/particle-physics.wgsl'),
        'utf-8'
      );
      spatialGridShader = await readFile(
        join(__dirname, '../shaders/spatial-grid.wgsl'),
        'utf-8'
      );
    } catch (error) {
      console.log('⏭️  Shaders not found, skipping shader-dependent tests');
    }

    // Create canvas
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
    }
  });

  describe('Phase 1 + Phase 2: Compute Physics + Spatial Grid', () => {
    it('should run physics simulation with collision detection', async () => {
      if (!context.isSupported() || !particlePhysicsShader || !spatialGridShader) {
        console.log('⏭️  Skipping test (WebGPU or shaders not available)');
        return;
      }

      const particleCount = 1000;

      // Create buffer manager
      const bufferManager = new GPUBufferManager(context, particleCount);
      await bufferManager.initialize();

      // Create physics pipeline
      const physicsPipeline = new ComputePipeline(context, bufferManager, {
        shaderCode: particlePhysicsShader,
        workgroupSize: 256,
      });
      await physicsPipeline.initialize();

      // Create spatial grid
      const spatialGrid = new SpatialGrid(context, particleCount, {
        cellSize: 0.2,
        gridDimensions: { x: 25, y: 25, z: 25 },
        maxParticlesPerCell: 64,
        shaderCode: spatialGridShader,
      });
      await spatialGrid.initialize();

      // Initialize particles (dropping from height)
      const initialData = {
        positions: new Float32Array(particleCount * 4),
        velocities: new Float32Array(particleCount * 4),
        states: new Float32Array(particleCount * 4),
      };

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 4;
        // Position
        initialData.positions[idx + 0] = (Math.random() - 0.5) * 5; // x
        initialData.positions[idx + 1] = 10 + Math.random() * 5; // y (height)
        initialData.positions[idx + 2] = (Math.random() - 0.5) * 5; // z
        initialData.positions[idx + 3] = 0.1; // radius

        // Velocity (zero initially)
        initialData.velocities[idx + 0] = 0;
        initialData.velocities[idx + 1] = 0;
        initialData.velocities[idx + 2] = 0;
        initialData.velocities[idx + 3] = 1.0; // mass

        // State (active)
        initialData.states[idx + 0] = 1.0; // active
        initialData.states[idx + 1] = 0.0; // not sleeping
        initialData.states[idx + 2] = 1.0; // health
        initialData.states[idx + 3] = 0.0; // user data
      }

      bufferManager.uploadParticleData(initialData);

      // Simulation params
      const uniforms = {
        dt: 0.016,
        gravity: 9.8,
        groundY: 0,
        restitution: 0.5,
        friction: 0.9,
        particleCount,
      };

      // Run simulation with collision detection
      const steps = 60; // 1 second at 60 FPS
      for (let step = 0; step < steps; step++) {
        // Step 1: Physics simulation
        await physicsPipeline.step(uniforms);

        // Step 2: Collision detection
        const posBuffer = bufferManager.getBuffers().positionsRead;
        const velBuffer = bufferManager.getBuffers().velocitiesRead;
        await spatialGrid.execute(posBuffer, velBuffer);

        // Note: In a real implementation, collision forces would be applied
        // to the velocity buffer before the next physics step
      }

      // Download results
      const results = await bufferManager.downloadParticleData();

      // Validate: most particles should be on ground
      let onGround = 0;
      for (let i = 0; i < particleCount; i++) {
        const y = results.positions[i * 4 + 1];
        if (y < 0.2) onGround++;
      }

      expect(onGround).toBeGreaterThan(particleCount * 0.8);

      // Cleanup
      physicsPipeline.destroy();
      spatialGrid.destroy();
      bufferManager.destroy();
    });
  });

  describe('Phase 1 + Phase 3: Compute Physics + Rendering', () => {
    it('should simulate and render particles', async () => {
      if (!context.isSupported() || !particlePhysicsShader || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU, shaders, or DOM not available)');
        return;
      }

      const particleCount = 1000;

      // Create buffer manager
      const bufferManager = new GPUBufferManager(context, particleCount);
      await bufferManager.initialize();

      // Create physics pipeline
      const physicsPipeline = new ComputePipeline(context, bufferManager, {
        shaderCode: particlePhysicsShader,
        workgroupSize: 256,
      });
      await physicsPipeline.initialize();

      // Create renderer
      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: particleCount,
        sphereSegments: 16,
      });
      await renderer.initialize();

      // Initialize particles
      const initialData = {
        positions: new Float32Array(particleCount * 4),
        velocities: new Float32Array(particleCount * 4),
        states: new Float32Array(particleCount * 4),
      };

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 4;
        initialData.positions[idx + 0] = (Math.random() - 0.5) * 10;
        initialData.positions[idx + 1] = 10 + Math.random() * 5;
        initialData.positions[idx + 2] = (Math.random() - 0.5) * 10;
        initialData.positions[idx + 3] = 0.1;

        initialData.velocities[idx + 3] = 1.0; // mass
        initialData.states[idx + 0] = 1.0; // active
      }

      bufferManager.uploadParticleData(initialData);

      // Camera setup
      const camera = {
        position: [15, 10, 15] as [number, number, number],
        target: [0, 5, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 100,
      };

      const uniforms = {
        dt: 0.016,
        gravity: 9.8,
        groundY: 0,
        restitution: 0.5,
        friction: 0.9,
        particleCount,
      };

      // Simulate and render 10 frames
      for (let frame = 0; frame < 10; frame++) {
        // Physics step
        await physicsPipeline.step(uniforms);

        // Download particle data for rendering
        const particleData = await bufferManager.downloadParticleData();

        // Render
        renderer.render(particleData.positions, particleCount, camera);
      }

      // Cleanup
      physicsPipeline.destroy();
      renderer.destroy();
      bufferManager.destroy();
    });
  });

  describe('Full Pipeline: Physics + Collisions + Rendering', () => {
    it('should run complete GPU pipeline at 1K particles', async () => {
      if (!context.isSupported() || !particlePhysicsShader || !spatialGridShader || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU, shaders, or DOM not available)');
        return;
      }

      const particleCount = 1000;

      // Initialize all systems
      const bufferManager = new GPUBufferManager(context, particleCount);
      await bufferManager.initialize();

      const physicsPipeline = new ComputePipeline(context, bufferManager, {
        shaderCode: particlePhysicsShader,
        workgroupSize: 256,
      });
      await physicsPipeline.initialize();

      const spatialGrid = new SpatialGrid(context, particleCount, {
        cellSize: 0.2,
        gridDimensions: { x: 25, y: 25, z: 25 },
        maxParticlesPerCell: 64,
        shaderCode: spatialGridShader,
      });
      await spatialGrid.initialize();

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: particleCount,
        sphereSegments: 16,
      });
      await renderer.initialize();

      // Initialize particles
      const initialData = {
        positions: new Float32Array(particleCount * 4),
        velocities: new Float32Array(particleCount * 4),
        states: new Float32Array(particleCount * 4),
      };

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 4;
        initialData.positions[idx + 0] = (Math.random() - 0.5) * 5;
        initialData.positions[idx + 1] = 10 + Math.random() * 5;
        initialData.positions[idx + 2] = (Math.random() - 0.5) * 5;
        initialData.positions[idx + 3] = 0.1;
        initialData.velocities[idx + 3] = 1.0;
        initialData.states[idx + 0] = 1.0;
      }

      bufferManager.uploadParticleData(initialData);

      const camera = {
        position: [15, 10, 15] as [number, number, number],
        target: [0, 5, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 100,
      };

      const uniforms = {
        dt: 0.016,
        gravity: 9.8,
        groundY: 0,
        restitution: 0.5,
        friction: 0.9,
        particleCount,
      };

      // Run complete pipeline for 60 frames (1 second)
      const frameTimings: number[] = [];

      for (let frame = 0; frame < 60; frame++) {
        const frameStart = performance.now();

        // Physics step
        await physicsPipeline.step(uniforms);

        // Collision detection
        const posBuffer = bufferManager.getBuffers().positionsRead;
        const velBuffer = bufferManager.getBuffers().velocitiesRead;
        await spatialGrid.execute(posBuffer, velBuffer);

        // Download for rendering
        const particleData = await bufferManager.downloadParticleData();

        // Render
        renderer.render(particleData.positions, particleCount, camera);

        const frameEnd = performance.now();
        frameTimings.push(frameEnd - frameStart);
      }

      // Calculate average FPS
      const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length;
      const fps = 1000 / avgFrameTime;

      console.log(`✅ Full GPU pipeline @ 1K particles:`);
      console.log(`   Average frame time: ${avgFrameTime.toFixed(2)}ms`);
      console.log(`   FPS: ${fps.toFixed(1)}`);

      // Should achieve at least 30 FPS (allowing for test overhead)
      expect(fps).toBeGreaterThan(30);

      // Cleanup
      physicsPipeline.destroy();
      spatialGrid.destroy();
      renderer.destroy();
      bufferManager.destroy();
    });

    it('should run complete GPU pipeline at 10K particles', async () => {
      if (!context.isSupported() || !particlePhysicsShader || !spatialGridShader || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU, shaders, or DOM not available)');
        return;
      }

      const particleCount = 10000;

      // Initialize all systems
      const bufferManager = new GPUBufferManager(context, particleCount);
      await bufferManager.initialize();

      const physicsPipeline = new ComputePipeline(context, bufferManager, {
        shaderCode: particlePhysicsShader,
        workgroupSize: 256,
      });
      await physicsPipeline.initialize();

      const spatialGrid = new SpatialGrid(context, particleCount, {
        cellSize: 0.2,
        gridDimensions: { x: 50, y: 50, z: 50 },
        maxParticlesPerCell: 64,
        shaderCode: spatialGridShader,
      });
      await spatialGrid.initialize();

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: particleCount,
        sphereSegments: 12, // Lower detail for 10K
        enableLOD: true,
      });
      await renderer.initialize();

      // Initialize particles
      const initialData = {
        positions: new Float32Array(particleCount * 4),
        velocities: new Float32Array(particleCount * 4),
        states: new Float32Array(particleCount * 4),
      };

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 4;
        initialData.positions[idx + 0] = (Math.random() - 0.5) * 10;
        initialData.positions[idx + 1] = 10 + Math.random() * 10;
        initialData.positions[idx + 2] = (Math.random() - 0.5) * 10;
        initialData.positions[idx + 3] = 0.08;
        initialData.velocities[idx + 3] = 1.0;
        initialData.states[idx + 0] = 1.0;
      }

      bufferManager.uploadParticleData(initialData);

      const camera = {
        position: [20, 15, 20] as [number, number, number],
        target: [0, 10, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 150,
      };

      const uniforms = {
        dt: 0.016,
        gravity: 9.8,
        groundY: 0,
        restitution: 0.5,
        friction: 0.9,
        particleCount,
      };

      // Run 30 frames
      const frameTimings: number[] = [];

      for (let frame = 0; frame < 30; frame++) {
        const frameStart = performance.now();

        await physicsPipeline.step(uniforms);

        const posBuffer = bufferManager.getBuffers().positionsRead;
        const velBuffer = bufferManager.getBuffers().velocitiesRead;
        await spatialGrid.execute(posBuffer, velBuffer);

        const particleData = await bufferManager.downloadParticleData();
        renderer.render(particleData.positions, particleCount, camera);

        const frameEnd = performance.now();
        frameTimings.push(frameEnd - frameStart);
      }

      const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length;
      const fps = 1000 / avgFrameTime;

      console.log(`✅ Full GPU pipeline @ 10K particles:`);
      console.log(`   Average frame time: ${avgFrameTime.toFixed(2)}ms`);
      console.log(`   FPS: ${fps.toFixed(1)}`);

      // Should achieve at least 20 FPS with 10K particles
      expect(fps).toBeGreaterThan(20);

      // Cleanup
      physicsPipeline.destroy();
      spatialGrid.destroy();
      renderer.destroy();
      bufferManager.destroy();
    });

    it('should handle 100K particles (stretch goal)', async () => {
      if (!context.isSupported() || !particlePhysicsShader || !spatialGridShader || typeof document === 'undefined') {
        console.log('⏭️  Skipping test (WebGPU, shaders, or DOM not available)');
        return;
      }

      const particleCount = 100000;

      console.log(`🚀 Testing 100K particle limit...`);

      // Initialize all systems
      const bufferManager = new GPUBufferManager(context, particleCount);
      await bufferManager.initialize();

      const physicsPipeline = new ComputePipeline(context, bufferManager, {
        shaderCode: particlePhysicsShader,
        workgroupSize: 256,
      });
      await physicsPipeline.initialize();

      const spatialGrid = new SpatialGrid(context, particleCount, {
        cellSize: 0.2,
        gridDimensions: { x: 100, y: 50, z: 100 },
        maxParticlesPerCell: 64,
        shaderCode: spatialGridShader,
      });
      await spatialGrid.initialize();

      const renderer = new InstancedRenderer(context, canvas, {
        maxParticles: particleCount,
        sphereSegments: 8, // Low detail for 100K
        enableLOD: true,
        enableFrustumCulling: true,
      });
      await renderer.initialize();

      // Initialize particles
      const initialData = {
        positions: new Float32Array(particleCount * 4),
        velocities: new Float32Array(particleCount * 4),
        states: new Float32Array(particleCount * 4),
      };

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 4;
        initialData.positions[idx + 0] = (Math.random() - 0.5) * 20;
        initialData.positions[idx + 1] = 10 + Math.random() * 20;
        initialData.positions[idx + 2] = (Math.random() - 0.5) * 20;
        initialData.positions[idx + 3] = 0.05;
        initialData.velocities[idx + 3] = 1.0;
        initialData.states[idx + 0] = 1.0;
      }

      bufferManager.uploadParticleData(initialData);

      const camera = {
        position: [40, 25, 40] as [number, number, number],
        target: [0, 15, 0] as [number, number, number],
        fov: Math.PI / 4,
        aspect: canvas.width / canvas.height,
        near: 0.1,
        far: 200,
      };

      const uniforms = {
        dt: 0.016,
        gravity: 9.8,
        groundY: 0,
        restitution: 0.5,
        friction: 0.9,
        particleCount,
      };

      // Run 10 frames (reduced for performance)
      const frameTimings: number[] = [];

      for (let frame = 0; frame < 10; frame++) {
        const frameStart = performance.now();

        await physicsPipeline.step(uniforms);

        const posBuffer = bufferManager.getBuffers().positionsRead;
        const velBuffer = bufferManager.getBuffers().velocitiesRead;
        await spatialGrid.execute(posBuffer, velBuffer);

        const particleData = await bufferManager.downloadParticleData();
        renderer.render(particleData.positions, particleCount, camera);

        const frameEnd = performance.now();
        frameTimings.push(frameEnd - frameStart);
      }

      const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length;
      const fps = 1000 / avgFrameTime;

      console.log(`✅ Full GPU pipeline @ 100K particles:`);
      console.log(`   Average frame time: ${avgFrameTime.toFixed(2)}ms`);
      console.log(`   FPS: ${fps.toFixed(1)}`);
      console.log(`   🎯 Target: 60 FPS (16.67ms/frame)`);

      if (fps >= 60) {
        console.log(`   🎉 TARGET ACHIEVED!`);
      } else if (fps >= 30) {
        console.log(`   ✅ Good performance (30+ FPS)`);
      } else {
        console.log(`   ⚠️  Below target (needs optimization)`);
      }

      // Should achieve at least 15 FPS with 100K particles
      // (Note: Target is 60 FPS, but test environments may be slower)
      expect(fps).toBeGreaterThan(15);

      // Cleanup
      physicsPipeline.destroy();
      spatialGrid.destroy();
      renderer.destroy();
      bufferManager.destroy();
    });
  });
});
