/**
 * GPU Physics System Tests
 *
 * Tests for WebGPU-accelerated particle physics.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WebGPUContext } from '../WebGPUContext.js';
import { GPUBufferManager, createInitialParticleData } from '../GPUBuffers.js';
import { ComputePipeline } from '../ComputePipeline.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load shader code
const shaderPath = join(__dirname, '../shaders/particle-physics.wgsl');
let shaderCode: string;

try {
  shaderCode = readFileSync(shaderPath, 'utf-8');
} catch (error) {
  console.warn('Could not load shader file, using placeholder');
  shaderCode = ''; // Will skip GPU tests if shader not available
}

describe('WebGPU Context', () => {
  let context: WebGPUContext;

  beforeAll(async () => {
    context = new WebGPUContext({ fallbackToCPU: true });
    await context.initialize();
  });

  it('should initialize WebGPU context', () => {
    expect(context).toBeDefined();
  });

  it('should detect WebGPU support or fallback', () => {
    const supported = context.isSupported();
    expect(typeof supported).toBe('boolean');

    if (supported) {
      console.log('✅ WebGPU supported!');
    } else {
      console.log('⚠️  WebGPU not supported, using CPU fallback');
    }
  });

  it('should get optimal workgroup size', () => {
    const workgroupSize = context.getOptimalWorkgroupSize();
    expect(workgroupSize).toBeGreaterThan(0);
    expect([32, 64, 128, 256]).toContain(workgroupSize);
  });

  it('should provide capabilities info', () => {
    const caps = context.getCapabilities();
    expect(caps).toHaveProperty('supported');
    expect(caps).toHaveProperty('adapter');
    expect(caps).toHaveProperty('device');
    expect(caps).toHaveProperty('limits');
    expect(caps).toHaveProperty('features');
  });
});

describe('GPU Buffer Manager', () => {
  let context: WebGPUContext;
  let bufferManager: GPUBufferManager;
  const particleCount = 1000;

  beforeAll(async () => {
    context = new WebGPUContext({ fallbackToCPU: true });
    await context.initialize();

    if (context.isSupported()) {
      bufferManager = new GPUBufferManager(context, particleCount);
      await bufferManager.initialize();
    }
  });

  it('should create buffer manager', () => {
    if (!context.isSupported()) {
      console.log('⏭️  Skipping GPU tests (WebGPU not available)');
      return;
    }

    expect(bufferManager).toBeDefined();
    expect(bufferManager.getParticleCount()).toBe(particleCount);
  });

  it('should upload particle data', () => {
    if (!context.isSupported()) return;

    const data = createInitialParticleData(particleCount, {
      positionRange: { min: -5, max: 5 },
      radius: 0.1,
      mass: 1.0,
    });

    expect(() => {
      bufferManager.uploadParticleData(data);
    }).not.toThrow();
  });

  it('should upload uniform data', () => {
    if (!context.isSupported()) return;

    expect(() => {
      bufferManager.uploadUniformData({
        dt: 0.016,
        gravity: 9.8,
        groundY: 0,
        restitution: 0.3,
        friction: 0.9,
        particleCount,
        _pad1: 0,
        _pad2: 0,
      });
    }).not.toThrow();
  });

  it('should swap buffers', () => {
    if (!context.isSupported()) return;

    expect(() => {
      bufferManager.swap();
    }).not.toThrow();
  });

  it('should download particle data', async () => {
    if (!context.isSupported()) return;

    const data = await bufferManager.downloadParticleData();

    expect(data).toHaveProperty('positions');
    expect(data).toHaveProperty('velocities');
    expect(data).toHaveProperty('states');

    expect(data.positions.length).toBe(particleCount * 4);
    expect(data.velocities.length).toBe(particleCount * 4);
    expect(data.states.length).toBe(particleCount * 4);
  });
});

describe('Compute Pipeline', () => {
  let context: WebGPUContext;
  let bufferManager: GPUBufferManager;
  let pipeline: ComputePipeline;
  const particleCount = 100;

  beforeAll(async () => {
    if (!shaderCode) {
      console.log('⏭️  Skipping pipeline tests (shader not available)');
      return;
    }

    context = new WebGPUContext({ fallbackToCPU: true });
    await context.initialize();

    if (context.isSupported()) {
      bufferManager = new GPUBufferManager(context, particleCount);
      await bufferManager.initialize();

      pipeline = new ComputePipeline(context, bufferManager, {
        shaderCode,
        workgroupSize: 64,
      });

      await pipeline.initialize();
    }
  });

  it('should create compute pipeline', () => {
    if (!context.isSupported() || !shaderCode) return;

    expect(pipeline).toBeDefined();
  });

  it('should get pipeline stats', () => {
    if (!context.isSupported() || !shaderCode) return;

    const stats = pipeline.getStats();
    expect(stats.particleCount).toBe(particleCount);
    expect(stats.workgroupSize).toBe(64);
    expect(stats.workgroups).toBeGreaterThan(0);
    expect(stats.threadsTotal).toBeGreaterThanOrEqual(particleCount);
  });

  it('should execute single simulation step', async () => {
    if (!context.isSupported() || !shaderCode) return;

    // Upload initial particle data
    const initialData = createInitialParticleData(particleCount, {
      positionRange: { min: -2, max: 2 },
      radius: 0.05,
    });

    // Set particles above ground with downward velocity
    for (let i = 0; i < particleCount; i++) {
      initialData.positions[i * 4 + 1] = 5.0; // Y position
      initialData.velocities[i * 4 + 1] = 0.0; // Y velocity (will be affected by gravity)
    }

    bufferManager.uploadParticleData(initialData);

    // Run one step
    await pipeline.step({
      dt: 0.016,
      gravity: 9.8,
      groundY: 0,
      restitution: 0.5,
      friction: 0.9,
      particleCount,
      _pad1: 0,
      _pad2: 0,
    });

    // Download results
    const results = await bufferManager.downloadParticleData();

    // Check that gravity affected particles
    let anyMoved = false;
    for (let i = 0; i < particleCount; i++) {
      const yPos = results.positions[i * 4 + 1];
      const yVel = results.velocities[i * 4 + 1];

      if (yVel < 0) {
        anyMoved = true; // Particle gained downward velocity from gravity
      }
    }

    expect(anyMoved).toBe(true);
  });

  it('should simulate particles falling and bouncing', async () => {
    if (!context.isSupported() || !shaderCode) return;

    // Upload particles high above ground
    const initialData = createInitialParticleData(particleCount, {
      positionRange: { min: -1, max: 1 },
      radius: 0.05,
    });

    for (let i = 0; i < particleCount; i++) {
      initialData.positions[i * 4 + 1] = 10.0; // 10m above ground
    }

    bufferManager.uploadParticleData(initialData);

    // Run 100 steps (falling and bouncing)
    const steps = 100;
    const uniforms = {
      dt: 0.016,
      gravity: 9.8,
      groundY: 0,
      restitution: 0.5,
      friction: 0.9,
      particleCount,
      _pad1: 0,
      _pad2: 0,
    };

    for (let step = 0; step < steps; step++) {
      await pipeline.step(uniforms);
    }

    // Download final state
    const results = await bufferManager.downloadParticleData();

    // Check that particles settled on ground
    let onGround = 0;
    let slowMoving = 0;

    for (let i = 0; i < particleCount; i++) {
      const yPos = results.positions[i * 4 + 1];
      const radius = results.positions[i * 4 + 3];
      const yVel = results.velocities[i * 4 + 1];

      // Check if on ground (within radius + small epsilon)
      if (yPos <= radius + 0.1) {
        onGround++;
      }

      // Check if slow (settled or bouncing gently)
      if (Math.abs(yVel) < 1.0) {
        slowMoving++;
      }
    }

    // Most particles should be on ground and slow after 100 steps
    expect(onGround).toBeGreaterThan(particleCount * 0.8); // 80%+
    expect(slowMoving).toBeGreaterThan(particleCount * 0.8); // 80%+
  });
});

describe('Performance Benchmarks', () => {
  it('should benchmark 1K particles', async () => {
    if (!shaderCode) return;

    const context = new WebGPUContext({ fallbackToCPU: true });
    await context.initialize();

    if (!context.isSupported()) {
      console.log('⏭️  Skipping benchmark (WebGPU not available)');
      return;
    }

    const particleCount = 1000;
    const bufferManager = new GPUBufferManager(context, particleCount);
    await bufferManager.initialize();

    const pipeline = new ComputePipeline(context, bufferManager, {
      shaderCode,
    });
    await pipeline.initialize();

    // Upload initial data
    const data = createInitialParticleData(particleCount);
    bufferManager.uploadParticleData(data);

    // Benchmark 100 steps
    const steps = 100;
    const startTime = performance.now();

    await pipeline.run(steps, {
      dt: 0.016,
      gravity: 9.8,
      groundY: 0,
      restitution: 0.5,
      friction: 0.9,
      particleCount,
      _pad1: 0,
      _pad2: 0,
    });

    const elapsed = performance.now() - startTime;
    const avgStepTime = elapsed / steps;
    const fps = 1000 / avgStepTime;

    console.log(`📊 1K Particles Benchmark:`, {
      steps,
      elapsed: `${elapsed.toFixed(2)}ms`,
      avgStepTime: `${avgStepTime.toFixed(2)}ms`,
      fps: `${fps.toFixed(1)} FPS`,
    });

    // Should achieve at least 60 FPS with 1K particles
    expect(fps).toBeGreaterThan(60);
  });
});

describe('Initial Particle Data Helper', () => {
  it('should create initial particle data', () => {
    const count = 100;
    const data = createInitialParticleData(count, {
      positionRange: { min: -10, max: 10 },
      radius: 0.1,
      mass: 2.0,
    });

    expect(data.positions.length).toBe(count * 4);
    expect(data.velocities.length).toBe(count * 4);
    expect(data.states.length).toBe(count * 4);

    // Check first particle (use toBeCloseTo for floating-point)
    expect(data.positions[3]).toBeCloseTo(0.1); // radius
    expect(data.velocities[3]).toBeCloseTo(2.0); // mass
    expect(data.states[0]).toBeCloseTo(1); // active
  });
});
