/**
 * Spatial Hash Grid for GPU Particle Collision Detection
 *
 * Implements a 3D spatial hash grid to enable O(N) particle-particle collision detection.
 * Uses a multi-pass approach:
 * 1. Clear grid counters
 * 2. Build grid by hashing particles into cells
 * 3. Detect collisions using neighbor cells
 *
 * @module gpu/SpatialGrid
 */

import type { WebGPUContext } from './WebGPUContext.js';

export interface SpatialGridOptions {
  /** Grid cell size (should be ~2× max particle radius) */
  cellSize: number;

  /** Grid dimensions (cells in X/Y/Z) */
  gridDimensions: { x: number; y: number; z: number };

  /** Max particles per cell (for array sizing) */
  maxParticlesPerCell?: number;

  /** WGSL shader code */
  shaderCode: string;
}

/**
 * Spatial Hash Grid Manager
 *
 * Manages GPU buffers and compute passes for spatial grid collision detection.
 *
 * @example
 * ```typescript
 * const grid = new SpatialGrid(context, particleCount, {
 *   cellSize: 0.2,  // 2× max particle radius
 *   gridDimensions: { x: 50, y: 50, z: 50 },
 *   shaderCode: spatialGridWGSL,
 * });
 *
 * await grid.initialize();
 *
 * // Each frame:
 * grid.clearGrid();
 * grid.buildGrid(positionBuffer, velocityBuffer);
 * const forces = await grid.detectCollisions();
 * ```
 */
export class SpatialGrid {
  private context: WebGPUContext;
  private device: GPUDevice;
  private particleCount: number;
  private options: Required<SpatialGridOptions>;

  // Grid dimensions
  private totalCells: number;

  // Pipelines
  private clearPipeline: GPUComputePipeline | null = null;
  private buildPipeline: GPUComputePipeline | null = null;
  private collisionPipeline: GPUComputePipeline | null = null;

  // Buffers
  private uniformBuffer: GPUBuffer | null = null;
  private gridCellStartBuffer: GPUBuffer | null = null;
  private gridCellEndBuffer: GPUBuffer | null = null;
  private gridParticleIndicesBuffer: GPUBuffer | null = null;
  private collisionForcesBuffer: GPUBuffer | null = null;

  // Bind groups
  private clearBindGroup: GPUBindGroup | null = null;
  private buildBindGroup: GPUBindGroup | null = null;
  private collisionBindGroup: GPUBindGroup | null = null;

  constructor(context: WebGPUContext, particleCount: number, options: SpatialGridOptions) {
    this.context = context;
    this.device = context.getDevice();
    this.particleCount = particleCount;

    this.options = {
      cellSize: options.cellSize,
      gridDimensions: options.gridDimensions,
      maxParticlesPerCell: options.maxParticlesPerCell ?? 64,
      shaderCode: options.shaderCode,
    };

    this.totalCells =
      this.options.gridDimensions.x * this.options.gridDimensions.y * this.options.gridDimensions.z;
  }

  /**
   * Initialize spatial grid buffers and pipelines
   */
  async initialize(): Promise<void> {
    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: 'spatial-grid-shader',
      code: this.options.shaderCode,
    });

    // Check shader compilation
    const compilationInfo = await shaderModule.getCompilationInfo();
    for (const message of compilationInfo.messages) {
      if (message.type === 'error') {
        console.error('Spatial grid shader error:', message.message);
      }
    }

    // Create buffers
    this.createBuffers();

    // Create pipelines
    this.createPipelines(shaderModule);
  }

  /**
   * Create GPU buffers for spatial grid
   */
  private createBuffers(): void {
    // Uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      label: 'spatial-grid-uniforms',
      size: 32, // 8 × f32/u32 = 32 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Grid cell counters (atomic u32)
    const cellCounterSize = this.totalCells * Uint32Array.BYTES_PER_ELEMENT;

    this.gridCellStartBuffer = this.device.createBuffer({
      label: 'grid-cell-start',
      size: cellCounterSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gridCellEndBuffer = this.device.createBuffer({
      label: 'grid-cell-end',
      size: cellCounterSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Grid particle indices
    const indicesSize =
      this.totalCells * this.options.maxParticlesPerCell * Uint32Array.BYTES_PER_ELEMENT;

    this.gridParticleIndicesBuffer = this.device.createBuffer({
      label: 'grid-particle-indices',
      size: indicesSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Collision forces output
    const forcesSize = this.particleCount * 4 * Float32Array.BYTES_PER_ELEMENT; // vec4

    this.collisionForcesBuffer = this.device.createBuffer({
      label: 'collision-forces',
      size: forcesSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Upload initial uniforms
    this.uploadUniforms();
  }

  /**
   * Upload uniform data to GPU
   */
  private uploadUniforms(): void {
    if (!this.uniformBuffer) return;

    const data = new ArrayBuffer(32);
    const floatView = new Float32Array(data);
    const uintView = new Uint32Array(data);

    floatView[0] = this.options.cellSize;
    uintView[1] = this.options.gridDimensions.x;
    uintView[2] = this.options.gridDimensions.y;
    uintView[3] = this.options.gridDimensions.z;
    uintView[4] = this.particleCount;
    uintView[5] = this.options.maxParticlesPerCell;
    uintView[6] = 0; // padding
    uintView[7] = 0; // padding

    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  /**
   * Create compute pipelines
   */
  private createPipelines(shaderModule: GPUShaderModule): void {
    // Create bind group layouts
    const clearLayout = this.createClearBindGroupLayout();
    const buildLayout = this.createBuildBindGroupLayout();
    const collisionLayout = this.createCollisionBindGroupLayout();

    // Clear pipeline
    this.clearPipeline = this.device.createComputePipeline({
      label: 'grid-clear-pipeline',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [clearLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'gridClear',
      },
    });

    // Build pipeline
    this.buildPipeline = this.device.createComputePipeline({
      label: 'grid-build-pipeline',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [buildLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'gridBuild',
      },
    });

    // Collision pipeline
    this.collisionPipeline = this.device.createComputePipeline({
      label: 'grid-collision-pipeline',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [collisionLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'gridCollision',
      },
    });
  }

  /**
   * Create bind group layout for clear pass
   */
  private createClearBindGroupLayout(): GPUBindGroupLayout {
    return this.device.createBindGroupLayout({
      label: 'grid-clear-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
  }

  /**
   * Create bind group layout for build pass
   */
  private createBuildBindGroupLayout(): GPUBindGroupLayout {
    return this.device.createBindGroupLayout({
      label: 'grid-build-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
  }

  /**
   * Create bind group layout for collision pass
   */
  private createCollisionBindGroupLayout(): GPUBindGroupLayout {
    return this.device.createBindGroupLayout({
      label: 'grid-collision-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
  }

  /**
   * Clear grid counters (run before buildGrid each frame)
   */
  clearGrid(commandEncoder?: GPUCommandEncoder): GPUCommandEncoder {
    if (
      !this.clearPipeline ||
      !this.uniformBuffer ||
      !this.gridCellStartBuffer ||
      !this.gridCellEndBuffer
    ) {
      throw new Error('Spatial grid not initialized');
    }

    // Create bind group if needed
    if (!this.clearBindGroup) {
      this.clearBindGroup = this.device.createBindGroup({
        layout: this.clearPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 3, resource: { buffer: this.gridCellStartBuffer } },
          { binding: 4, resource: { buffer: this.gridCellEndBuffer } },
        ],
      });
    }

    const encoder =
      commandEncoder ?? this.device.createCommandEncoder({ label: 'grid-clear-encoder' });

    const pass = encoder.beginComputePass({ label: 'grid-clear-pass' });
    pass.setPipeline(this.clearPipeline);
    pass.setBindGroup(0, this.clearBindGroup);

    const workgroups = Math.ceil(this.totalCells / 256);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();

    return encoder;
  }

  /**
   * Build spatial grid from particle positions
   */
  buildGrid(positionBuffer: GPUBuffer, commandEncoder?: GPUCommandEncoder): GPUCommandEncoder {
    if (
      !this.buildPipeline ||
      !this.uniformBuffer ||
      !this.gridCellEndBuffer ||
      !this.gridParticleIndicesBuffer
    ) {
      throw new Error('Spatial grid not initialized');
    }

    // Create bind group if needed
    if (!this.buildBindGroup) {
      this.buildBindGroup = this.device.createBindGroup({
        layout: this.buildPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: positionBuffer } },
          { binding: 4, resource: { buffer: this.gridCellEndBuffer } },
          { binding: 5, resource: { buffer: this.gridParticleIndicesBuffer } },
        ],
      });
    }

    const encoder =
      commandEncoder ?? this.device.createCommandEncoder({ label: 'grid-build-encoder' });

    const pass = encoder.beginComputePass({ label: 'grid-build-pass' });
    pass.setPipeline(this.buildPipeline);
    pass.setBindGroup(0, this.buildBindGroup);

    const workgroups = Math.ceil(this.particleCount / 256);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();

    return encoder;
  }

  /**
   * Detect collisions using spatial grid
   */
  detectCollisions(
    positionBuffer: GPUBuffer,
    velocityBuffer: GPUBuffer,
    commandEncoder?: GPUCommandEncoder
  ): GPUCommandEncoder {
    if (!this.collisionPipeline || !this.uniformBuffer || !this.collisionForcesBuffer) {
      throw new Error('Spatial grid not initialized');
    }

    // Create bind group if needed
    if (!this.collisionBindGroup) {
      this.collisionBindGroup = this.device.createBindGroup({
        layout: this.collisionPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: positionBuffer } },
          { binding: 2, resource: { buffer: velocityBuffer } },
          { binding: 3, resource: { buffer: this.gridCellStartBuffer! } },
          { binding: 4, resource: { buffer: this.gridCellEndBuffer! } },
          { binding: 5, resource: { buffer: this.gridParticleIndicesBuffer! } },
          { binding: 6, resource: { buffer: this.collisionForcesBuffer } },
        ],
      });
    }

    const encoder =
      commandEncoder ?? this.device.createCommandEncoder({ label: 'grid-collision-encoder' });

    const pass = encoder.beginComputePass({ label: 'grid-collision-pass' });
    pass.setPipeline(this.collisionPipeline);
    pass.setBindGroup(0, this.collisionBindGroup);

    const workgroups = Math.ceil(this.particleCount / 256);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();

    return encoder;
  }

  /**
   * Execute full collision detection pipeline
   *
   * Convenience method that runs all three passes: clear → build → detect
   */
  async execute(positionBuffer: GPUBuffer, velocityBuffer: GPUBuffer): Promise<Float32Array> {
    const encoder = this.device.createCommandEncoder({ label: 'spatial-grid-full-encoder' });

    // Pass 1: Clear grid
    this.clearGrid(encoder);

    // Pass 2: Build grid
    this.buildGrid(positionBuffer, encoder);

    // Pass 3: Detect collisions
    this.detectCollisions(positionBuffer, velocityBuffer, encoder);

    // Submit all passes
    this.device.queue.submit([encoder.finish()]);

    // Download collision forces
    return await this.downloadCollisionForces();
  }

  /**
   * Download collision forces from GPU
   */
  async downloadCollisionForces(): Promise<Float32Array> {
    if (!this.collisionForcesBuffer) {
      throw new Error('Collision forces buffer not initialized');
    }

    const stagingBuffer = this.device.createBuffer({
      size: this.collisionForcesBuffer.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder({ label: 'collision-forces-readback' });
    encoder.copyBufferToBuffer(
      this.collisionForcesBuffer,
      0,
      stagingBuffer,
      0,
      this.collisionForcesBuffer.size
    );
    this.device.queue.submit([encoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(stagingBuffer.getMappedRange()).slice();
    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return data;
  }

  /**
   * Get collision forces buffer (for use in other compute passes)
   */
  getCollisionForcesBuffer(): GPUBuffer {
    if (!this.collisionForcesBuffer) {
      throw new Error('Collision forces buffer not initialized');
    }
    return this.collisionForcesBuffer;
  }

  /**
   * Calculate memory usage
   */
  private calculateMemoryUsage(): string {
    const cellCounters = this.totalCells * 4 * 2; // start + end, u32
    const indices = this.totalCells * this.options.maxParticlesPerCell * 4; // u32
    const forces = this.particleCount * 4 * 4; // vec4<f32>
    const total = (cellCounters + indices + forces) / 1024 / 1024;
    return `${total.toFixed(2)} MB`;
  }

  /**
   * Get grid statistics
   */
  getStats(): {
    cellSize: number;
    gridDimensions: { x: number; y: number; z: number };
    totalCells: number;
    maxParticlesPerCell: number;
    memoryUsage: string;
  } {
    return {
      cellSize: this.options.cellSize,
      gridDimensions: this.options.gridDimensions,
      totalCells: this.totalCells,
      maxParticlesPerCell: this.options.maxParticlesPerCell,
      memoryUsage: this.calculateMemoryUsage(),
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.uniformBuffer?.destroy();
    this.gridCellStartBuffer?.destroy();
    this.gridCellEndBuffer?.destroy();
    this.gridParticleIndicesBuffer?.destroy();
    this.collisionForcesBuffer?.destroy();

    this.clearPipeline = null;
    this.buildPipeline = null;
    this.collisionPipeline = null;
    this.clearBindGroup = null;
    this.buildBindGroup = null;
    this.collisionBindGroup = null;
  }
}
