/**
 * GPU Buffer Management for Particle Physics
 *
 * Manages WebGPU buffers for particle positions, velocities, and states.
 * Implements double-buffering (ping-pong) for efficient compute shader execution.
 *
 * @module gpu/GPUBuffers
 */

import type { WebGPUContext } from './WebGPUContext.js';

export interface ParticleBufferData {
  /** Particle positions (vec4: x, y, z, radius) */
  positions: Float32Array;

  /** Particle velocities (vec4: vx, vy, vz, mass) */
  velocities: Float32Array;

  /** Particle states (vec4: active, sleeping, health, userData) */
  states: Float32Array;
}

export interface GPUBufferSet {
  /** Position buffer (read) */
  positionsRead: GPUBuffer;

  /** Position buffer (write) */
  positionsWrite: GPUBuffer;

  /** Velocity buffer (read) */
  velocitiesRead: GPUBuffer;

  /** Velocity buffer (write) */
  velocitiesWrite: GPUBuffer;

  /** State buffer (read) */
  statesRead: GPUBuffer;

  /** State buffer (write) */
  statesWrite: GPUBuffer;

  /** Uniform buffer (simulation params) */
  uniforms: GPUBuffer;
}

export interface UniformData {
  /** Simulation timestep (seconds) */
  dt: number;

  /** Gravity acceleration (m/s²) */
  gravity: number;

  /** Ground plane Y position */
  groundY: number;

  /** Restitution coefficient (bounciness) */
  restitution: number;

  /** Friction coefficient */
  friction: number;

  /** Particle count */
  particleCount: number;

  /** Padding for alignment (vec4) */
  _pad1: number;
  _pad2: number;
}

/**
 * GPU Buffer Manager
 *
 * Manages WebGPU buffers for particle physics simulation using double-buffering.
 * Each frame, read and write buffers are swapped (ping-pong pattern).
 *
 * @example
 * ```typescript
 * const bufferManager = new GPUBufferManager(context, 100000);
 * await bufferManager.initialize();
 *
 * // Upload initial particle data
 * bufferManager.uploadParticleData({
 *   positions: initialPositions,
 *   velocities: initialVelocities,
 *   states: initialStates,
 * });
 *
 * // Run simulation
 * for (let frame = 0; frame < 1000; frame++) {
 *   // Compute shader reads from Read buffers, writes to Write buffers
 *   await computePass.dispatch();
 *
 *   // Swap buffers for next frame
 *   bufferManager.swap();
 * }
 *
 * // Download results
 * const results = await bufferManager.downloadParticleData();
 * ```
 */
export class GPUBufferManager {
  private context: WebGPUContext;
  private device: GPUDevice;
  private particleCount: number;
  private buffers: GPUBufferSet | null = null;

  // Buffer sizes (in bytes)
  private positionBufferSize: number;
  private velocityBufferSize: number;
  private stateBufferSize: number;
  private uniformBufferSize: number;

  constructor(context: WebGPUContext, particleCount: number) {
    this.context = context;
    this.device = context.getDevice();
    this.particleCount = particleCount;

    // Calculate buffer sizes (vec4 = 4 floats = 16 bytes)
    this.positionBufferSize = particleCount * 4 * Float32Array.BYTES_PER_ELEMENT; // vec4
    this.velocityBufferSize = particleCount * 4 * Float32Array.BYTES_PER_ELEMENT; // vec4
    this.stateBufferSize = particleCount * 4 * Float32Array.BYTES_PER_ELEMENT; // vec4

    // Uniform buffer (8 floats = 32 bytes, aligned to 16)
    this.uniformBufferSize = 32; // 8 * Float32Array.BYTES_PER_ELEMENT
  }

  /**
   * Initialize GPU buffers
   */
  async initialize(): Promise<void> {
    // Create double-buffered storage buffers (ping-pong pattern)
    const positionsRead = this.createStorageBuffer(this.positionBufferSize, 'positions-read');
    const positionsWrite = this.createStorageBuffer(this.positionBufferSize, 'positions-write');

    const velocitiesRead = this.createStorageBuffer(this.velocityBufferSize, 'velocities-read');
    const velocitiesWrite = this.createStorageBuffer(this.velocityBufferSize, 'velocities-write');

    const statesRead = this.createStorageBuffer(this.stateBufferSize, 'states-read');
    const statesWrite = this.createStorageBuffer(this.stateBufferSize, 'states-write');

    // Create uniform buffer
    const uniforms = this.device.createBuffer({
      label: 'uniforms',
      size: this.uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.buffers = {
      positionsRead,
      positionsWrite,
      velocitiesRead,
      velocitiesWrite,
      statesRead,
      statesWrite,
      uniforms,
    };

  }

  /**
   * Create a storage buffer
   */
  private createStorageBuffer(size: number, label: string): GPUBuffer {
    return this.device.createBuffer({
      label,
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  }

  /**
   * Upload particle data to GPU
   */
  uploadParticleData(data: ParticleBufferData): void {
    if (!this.buffers) {
      throw new Error('Buffers not initialized. Call initialize() first.');
    }

    // Write to the "read" buffers (initial state)
    this.device.queue.writeBuffer(this.buffers.positionsRead, 0, data.positions.buffer);
    this.device.queue.writeBuffer(this.buffers.velocitiesRead, 0, data.velocities.buffer);
    this.device.queue.writeBuffer(this.buffers.statesRead, 0, data.states.buffer);

  }

  /**
   * Upload uniform data (simulation parameters)
   */
  uploadUniformData(uniforms: UniformData): void {
    if (!this.buffers) {
      throw new Error('Buffers not initialized');
    }

    // Pack uniform data into Float32Array
    const data = new Float32Array([
      uniforms.dt,
      uniforms.gravity,
      uniforms.groundY,
      uniforms.restitution,
      uniforms.friction,
      uniforms.particleCount,
      uniforms._pad1 ?? 0,
      uniforms._pad2 ?? 0,
    ]);

    this.device.queue.writeBuffer(this.buffers.uniforms, 0, data.buffer);
  }

  /**
   * Download particle data from GPU (for rendering or analysis)
   *
   * Note: This is an async operation that stalls the pipeline.
   * Use sparingly (e.g., once per frame for rendering).
   */
  async downloadParticleData(): Promise<ParticleBufferData> {
    if (!this.buffers) {
      throw new Error('Buffers not initialized');
    }

    // Create staging buffers for readback
    const positionsStaging = this.createStagingBuffer(this.positionBufferSize);
    const velocitiesStaging = this.createStagingBuffer(this.velocityBufferSize);
    const statesStaging = this.createStagingBuffer(this.stateBufferSize);

    // Copy from storage buffers to staging buffers
    const commandEncoder = this.device.createCommandEncoder({ label: 'readback-encoder' });

    commandEncoder.copyBufferToBuffer(
      this.buffers.positionsRead,
      0,
      positionsStaging,
      0,
      this.positionBufferSize
    );

    commandEncoder.copyBufferToBuffer(
      this.buffers.velocitiesRead,
      0,
      velocitiesStaging,
      0,
      this.velocityBufferSize
    );

    commandEncoder.copyBufferToBuffer(
      this.buffers.statesRead,
      0,
      statesStaging,
      0,
      this.stateBufferSize
    );

    this.device.queue.submit([commandEncoder.finish()]);

    // Map staging buffers and read data
    await Promise.all([
      positionsStaging.mapAsync(GPUMapMode.READ),
      velocitiesStaging.mapAsync(GPUMapMode.READ),
      statesStaging.mapAsync(GPUMapMode.READ),
    ]);

    const positions = new Float32Array(positionsStaging.getMappedRange()).slice();
    const velocities = new Float32Array(velocitiesStaging.getMappedRange()).slice();
    const states = new Float32Array(statesStaging.getMappedRange()).slice();

    // Unmap and destroy staging buffers
    positionsStaging.unmap();
    velocitiesStaging.unmap();
    statesStaging.unmap();

    positionsStaging.destroy();
    velocitiesStaging.destroy();
    statesStaging.destroy();

    return { positions, velocities, states };
  }

  /**
   * Create a staging buffer for GPU→CPU readback
   */
  private createStagingBuffer(size: number): GPUBuffer {
    return this.device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Swap read/write buffers (ping-pong)
   *
   * After a compute pass, the "write" buffers contain the new state.
   * This function swaps read ↔ write so the next pass can read the latest data.
   */
  swap(): void {
    if (!this.buffers) {
      throw new Error('Buffers not initialized');
    }

    // Swap positions
    const tempPos = this.buffers.positionsRead;
    this.buffers.positionsRead = this.buffers.positionsWrite;
    this.buffers.positionsWrite = tempPos;

    // Swap velocities
    const tempVel = this.buffers.velocitiesRead;
    this.buffers.velocitiesRead = this.buffers.velocitiesWrite;
    this.buffers.velocitiesWrite = tempVel;

    // Swap states
    const tempState = this.buffers.statesRead;
    this.buffers.statesRead = this.buffers.statesWrite;
    this.buffers.statesWrite = tempState;
  }

  /**
   * Get buffer set for binding to compute pipeline
   */
  getBuffers(): GPUBufferSet {
    if (!this.buffers) {
      throw new Error('Buffers not initialized');
    }
    return this.buffers;
  }

  /**
   * Get particle count
   */
  getParticleCount(): number {
    return this.particleCount;
  }

  /**
   * Destroy buffers and free GPU memory
   */
  destroy(): void {
    if (!this.buffers) return;

    this.buffers.positionsRead.destroy();
    this.buffers.positionsWrite.destroy();
    this.buffers.velocitiesRead.destroy();
    this.buffers.velocitiesWrite.destroy();
    this.buffers.statesRead.destroy();
    this.buffers.statesWrite.destroy();
    this.buffers.uniforms.destroy();

    this.buffers = null;

  }
}

/**
 * Helper: Create initial particle data arrays
 *
 * @example
 * ```typescript
 * const data = createInitialParticleData(10000, {
 *   positionRange: { min: -10, max: 10 },
 *   radius: 0.1,
 * });
 *
 * bufferManager.uploadParticleData(data);
 * ```
 */
export function createInitialParticleData(
  count: number,
  options: {
    positionRange?: { min: number; max: number };
    radius?: number;
    mass?: number;
  } = {}
): ParticleBufferData {
  const { positionRange = { min: -5, max: 5 }, radius = 0.05, mass = 1.0 } = options;

  const positions = new Float32Array(count * 4);
  const velocities = new Float32Array(count * 4);
  const states = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const idx = i * 4;

    // Random position (x, y, z, radius)
    positions[idx + 0] =
      Math.random() * (positionRange.max - positionRange.min) + positionRange.min;
    positions[idx + 1] =
      Math.random() * (positionRange.max - positionRange.min) + positionRange.min;
    positions[idx + 2] =
      Math.random() * (positionRange.max - positionRange.min) + positionRange.min;
    positions[idx + 3] = radius;

    // Zero velocity (vx, vy, vz, mass)
    velocities[idx + 0] = 0;
    velocities[idx + 1] = 0;
    velocities[idx + 2] = 0;
    velocities[idx + 3] = mass;

    // Active state (active=1, sleeping=0, health=1, userData=0)
    states[idx + 0] = 1; // active
    states[idx + 1] = 0; // not sleeping
    states[idx + 2] = 1; // full health
    states[idx + 3] = 0; // user data
  }

  return { positions, velocities, states };
}
