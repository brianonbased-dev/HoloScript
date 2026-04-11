/**
 * WebGPU Compute Pipeline for Particle Physics
 *
 * Manages the compute pipeline, bind groups, and dispatch logic for GPU-accelerated
 * particle physics simulation.
 *
 * @module gpu/ComputePipeline
 */

import type { WebGPUContext } from './WebGPUContext.js';
import type { GPUBufferManager, UniformData } from './GPUBuffers.js';

export interface ComputePipelineOptions {
  /** WGSL shader code */
  shaderCode: string;

  /** Entry point function name (default: "main") */
  entryPoint?: string;

  /** Workgroup size (must match shader @workgroup_size) */
  workgroupSize?: number;
}

/**
 * WebGPU Compute Pipeline Manager
 *
 * Wraps WebGPU compute pipeline creation and execution for particle physics.
 *
 * @example
 * ```typescript
 * const pipeline = new ComputePipeline(context, bufferManager, {
 *   shaderCode: particlePhysicsShader,
 *   workgroupSize: 256,
 * });
 *
 * await pipeline.initialize();
 *
 * // Simulation loop
 * for (let frame = 0; frame < 1000; frame++) {
 *   pipeline.updateUniforms({ dt: 0.016, gravity: 9.8, ... });
 *   await pipeline.dispatch();
 *   bufferManager.swap();
 * }
 * ```
 */
export class ComputePipeline {
  private context: WebGPUContext;
  private bufferManager: GPUBufferManager;
  private device: GPUDevice;
  private options: Required<ComputePipelineOptions>;

  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private bindGroup: GPUBindGroup | null = null;

  private workgroupsX: number = 0;

  constructor(
    context: WebGPUContext,
    bufferManager: GPUBufferManager,
    options: ComputePipelineOptions
  ) {
    this.context = context;
    this.bufferManager = bufferManager;
    this.device = context.getDevice();

    this.options = {
      shaderCode: options.shaderCode,
      entryPoint: options.entryPoint ?? 'main',
      workgroupSize: options.workgroupSize ?? this.context.getOptimalWorkgroupSize(),
    };
  }

  /**
   * Initialize compute pipeline and bind groups
   */
  async initialize(): Promise<void> {
    // Create shader module from WGSL code
    const shaderModule = this.device.createShaderModule({
      label: 'particle-physics-shader',
      code: this.options.shaderCode,
    });

    // Log shader compilation errors/warnings
    const compilationInfo = await shaderModule.getCompilationInfo();
    for (const message of compilationInfo.messages) {
      if (message.type === 'error') {
        console.error('Shader error:', message.message, `at line ${message.lineNum}`);
      } else if (message.type === 'warning') {
        console.warn('Shader warning:', message.message, `at line ${message.lineNum}`);
      }
    }

    // Create bind group layout
    // Layout matches the @group(0) @binding(N) declarations in shader
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'particle-physics-bind-group-layout',
      entries: [
        // @binding(0): Uniforms (read-only)
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
        // @binding(1): positions_in (read-only)
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        // @binding(2): velocities_in (read-only)
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        // @binding(3): states_in (read-only)
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        // @binding(4): positions_out (read-write)
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        // @binding(5): velocities_out (read-write)
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        // @binding(6): states_out (read-write)
        {
          binding: 6,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
      ],
    });

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      label: 'particle-physics-pipeline-layout',
      bindGroupLayouts: [this.bindGroupLayout],
    });

    // Create compute pipeline
    this.pipeline = this.device.createComputePipeline({
      label: 'particle-physics-pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: this.options.entryPoint,
      },
    });

    // Create bind group
    this.createBindGroup();

    // Calculate workgroup dispatch size
    const particleCount = this.bufferManager.getParticleCount();
    this.workgroupsX = Math.ceil(particleCount / this.options.workgroupSize);
  }

  /**
   * Create bind group linking buffers to shader bindings
   */
  private createBindGroup(): void {
    if (!this.bindGroupLayout) {
      throw new Error('Bind group layout not created');
    }

    const buffers = this.bufferManager.getBuffers();

    this.bindGroup = this.device.createBindGroup({
      label: 'particle-physics-bind-group',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: buffers.uniforms } },
        { binding: 1, resource: { buffer: buffers.positionsRead } },
        { binding: 2, resource: { buffer: buffers.velocitiesRead } },
        { binding: 3, resource: { buffer: buffers.statesRead } },
        { binding: 4, resource: { buffer: buffers.positionsWrite } },
        { binding: 5, resource: { buffer: buffers.velocitiesWrite } },
        { binding: 6, resource: { buffer: buffers.statesWrite } },
      ],
    });
  }

  /**
   * Update uniform buffer with simulation parameters
   */
  updateUniforms(uniforms: UniformData): void {
    this.bufferManager.uploadUniformData(uniforms);
  }

  /**
   * Dispatch compute shader to update all particles
   *
   * @param commandEncoder Optional command encoder (creates new one if not provided)
   * @returns Command encoder (for chaining or submission)
   */
  dispatch(commandEncoder?: GPUCommandEncoder): GPUCommandEncoder {
    if (!this.pipeline || !this.bindGroup) {
      throw new Error('Pipeline not initialized. Call initialize() first.');
    }

    // Create command encoder if not provided
    const encoder =
      commandEncoder ??
      this.device.createCommandEncoder({
        label: 'particle-physics-compute-encoder',
      });

    // Create compute pass
    const computePass = encoder.beginComputePass({
      label: 'particle-physics-compute-pass',
    });

    // Set pipeline and bind group
    computePass.setPipeline(this.pipeline);
    computePass.setBindGroup(0, this.bindGroup);

    // Dispatch workgroups
    computePass.dispatchWorkgroups(this.workgroupsX, 1, 1);

    // End compute pass
    computePass.end();

    return encoder;
  }

  /**
   * Execute a single simulation step
   *
   * Convenience method that dispatches compute shader and submits to queue.
   *
   * @param uniforms Simulation parameters for this step
   */
  async step(uniforms: UniformData): Promise<void> {
    // Update uniforms
    this.updateUniforms(uniforms);

    // Dispatch compute shader
    const encoder = this.dispatch();

    // Submit to GPU queue
    this.device.queue.submit([encoder.finish()]);

    // Swap buffers for next frame
    this.bufferManager.swap();

    // Recreate bind group with swapped buffers
    this.createBindGroup();
  }

  /**
   * Execute multiple simulation steps (batch processing)
   *
   * @param steps Number of steps to execute
   * @param uniforms Simulation parameters (same for all steps)
   * @param onProgress Optional progress callback
   */
  async run(
    steps: number,
    uniforms: UniformData,
    onProgress?: (step: number, total: number) => void
  ): Promise<void> {
    const _startTime = performance.now();

    for (let i = 0; i < steps; i++) {
      await this.step(uniforms);

      if (onProgress && i % 10 === 0) {
        onProgress(i + 1, steps);
      }
    }
  }

  /**
   * Get pipeline statistics
   */
  getStats(): {
    particleCount: number;
    workgroupSize: number;
    workgroups: number;
    threadsTotal: number;
  } {
    return {
      particleCount: this.bufferManager.getParticleCount(),
      workgroupSize: this.options.workgroupSize,
      workgroups: this.workgroupsX,
      threadsTotal: this.workgroupsX * this.options.workgroupSize,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.pipeline = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;
  }
}

/**
 * Helper: Create and initialize a complete GPU physics simulation
 *
 * @example
 * ```typescript
 * const sim = await createGPUPhysicsSimulation({
 *   particleCount: 100000,
 *   shaderCode: particlePhysicsWGSL,
 * });
 *
 * // Upload initial particle data
 * sim.bufferManager.uploadParticleData(initialData);
 *
 * // Run simulation
 * await sim.pipeline.run(1000, {
 *   dt: 0.016,
 *   gravity: 9.8,
 *   groundY: 0,
 *   restitution: 0.3,
 *   friction: 0.9,
 *   particleCount: 100000,
 * });
 *
 * // Get results
 * const results = await sim.bufferManager.downloadParticleData();
 * ```
 */
export async function createGPUPhysicsSimulation(options: {
  particleCount: number;
  shaderCode: string;
  contextOptions?: any;
  workgroupSize?: number;
}): Promise<{
  context: WebGPUContext;
  bufferManager: GPUBufferManager;
  pipeline: ComputePipeline;
}> {
  const { WebGPUContext } = await import('./WebGPUContext.js');
  const { GPUBufferManager } = await import('./GPUBuffers.js');

  // Initialize WebGPU context
  const context = new WebGPUContext(options.contextOptions);
  await context.initialize();

  if (!context.isSupported()) {
    throw new Error('WebGPU not supported on this device');
  }

  // Create buffer manager
  const bufferManager = new GPUBufferManager(context, options.particleCount);
  await bufferManager.initialize();

  // Create compute pipeline
  const pipeline = new ComputePipeline(context, bufferManager, {
    shaderCode: options.shaderCode,
    workgroupSize: options.workgroupSize,
  });

  await pipeline.initialize();

  return { context, bufferManager, pipeline };
}
