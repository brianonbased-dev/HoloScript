/**
 * MLSMPMFluid — GPU-accelerated MLS-MPM fluid simulation.
 *
 * Uses WebGPU compute shaders for Moving Least Squares Material Point Method:
 *   Frame pipeline:
 *     [1] Grid Clear
 *     [2] Particle-to-Grid (P2G) — scatter mass/momentum via atomicAdd
 *     [3] Grid Update — gravity, boundaries, momentum → velocity
 *     [4] Grid-to-Particle (G2P) — gather velocity, update APIC C matrix + J
 *
 *   Rendering pipeline (SSFR):
 *     [1] Depth pass — particle → depth buffer
 *     [2] Thickness pass — additive particle thickness
 *     [3] Bilateral filter — smooth depth, compute normals
 *     [4] Final shade — Fresnel + Beer-Lambert + refraction
 *
 * Performance targets:
 *   - 100K particles @ 60 FPS on iGPU
 *   - 300K particles @ 30 FPS on discrete GPU
 *
 * @module physics
 */

// =============================================================================
// Types
// =============================================================================

import p2gShader from '../gpu/shaders/mls-mpm-p2g.wgsl?raw';
import gridShader from '../gpu/shaders/mls-mpm-grid.wgsl?raw';
import g2pShader from '../gpu/shaders/mls-mpm-g2p.wgsl?raw';

export interface MLSMPMConfig {
  /** Fluid behavior: liquid (incompressible) or gas (compressible) */
  type: 'liquid' | 'gas';

  /** Number of simulation particles */
  particleCount: number;

  /** Dynamic viscosity (default: 0.01 for water) */
  viscosity: number;

  /** Grid cells per axis (default: 128) */
  gridResolution: number;

  /** Domain size in world units (default: 10) */
  domainSize: number;

  /** SSFR render resolution scale (0.5 = half-res, default) */
  resolutionScale: number;

  /** Target rest density (default: 1000 for water) */
  restDensity: number;

  /** Compressibility stiffness (default: 50) */
  bulkModulus: number;

  /** Particle visual radius (default: 0.02) */
  particleRadius: number;

  /** Gravity Y component (default: -9.81) */
  gravity: number;

  /** SSFR absorption color RGB (default: [0.4, 0.04, 0.0] blue water) */
  absorptionColor: [number, number, number];

  /** SSFR absorption strength (default: 2.0) */
  absorptionStrength: number;
}

export interface MLSMPMStats {
  particleCount: number;
  gridResolution: number;
  lastStepMs: number;
  lastRenderMs: number;
  gpuBufferSizeMB: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: MLSMPMConfig = {
  type: 'liquid',
  particleCount: 50000,
  viscosity: 0.01,
  gridResolution: 128,
  domainSize: 10,
  resolutionScale: 0.5,
  restDensity: 1000,
  bulkModulus: 50,
  particleRadius: 0.02,
  gravity: -9.81,
  absorptionColor: [0.4, 0.04, 0.0],
  absorptionStrength: 2.0,
};

// =============================================================================
// MLS-MPM Fluid Simulation
// =============================================================================

export class MLSMPMFluid {
  private config: MLSMPMConfig;
  private device: GPUDevice | null = null;
  private disposed = false;

  // GPU Buffers
  private particlePositions: GPUBuffer | null = null; // vec4(x, y, z, volume)
  private particleVelocities: GPUBuffer | null = null; // vec4(vx, vy, vz, mass)
  private particleC: GPUBuffer | null = null; // mat4x4 affine momentum
  private particleJ: GPUBuffer | null = null; // f32 deformation gradient det

  private gridMass: GPUBuffer | null = null; // atomic<i32>
  private gridMomentumX: GPUBuffer | null = null; // atomic<i32>
  private gridMomentumY: GPUBuffer | null = null; // atomic<i32>
  private gridMomentumZ: GPUBuffer | null = null; // atomic<i32>
  private gridVelocity: GPUBuffer | null = null; // vec4<f32>

  private simParamsBuffer: GPUBuffer | null = null;

  /** External force (wind) applied during grid update [x, y, z] in m/s² */
  private externalForce: [number, number, number] = [0, 0, 0];

  // Pipelines
  private gridClearPipeline: GPUComputePipeline | null = null;
  private p2gPipeline: GPUComputePipeline | null = null;
  private gridUpdatePipeline: GPUComputePipeline | null = null;
  private g2pPipeline: GPUComputePipeline | null = null;

  // Bind groups
  private p2gBindGroup: GPUBindGroup | null = null;
  private gridClearBindGroup: GPUBindGroup | null = null;
  private gridUpdateBindGroup: GPUBindGroup | null = null;
  private g2pBindGroup: GPUBindGroup | null = null;

  // Stats
  private lastStepMs = 0;
  private lastRenderMs = 0;

  constructor(config?: Partial<MLSMPMConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize GPU resources and compile shaders.
   * Must be called before step().
   */
  async init(device: GPUDevice): Promise<void> {
    this.device = device;
    const { particleCount, gridResolution } = this.config;
    const gridCells = gridResolution ** 3;

    // Create particle buffers
    this.particlePositions = device.createBuffer({
      size: particleCount * 16, // vec4<f32>
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    this.particleVelocities = device.createBuffer({
      size: particleCount * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    this.particleC = device.createBuffer({
      size: particleCount * 64, // mat4x4<f32>
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.particleJ = device.createBuffer({
      size: particleCount * 4, // f32
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Create grid buffers
    this.gridMass = device.createBuffer({
      size: gridCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gridMomentumX = device.createBuffer({
      size: gridCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gridMomentumY = device.createBuffer({
      size: gridCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gridMomentumZ = device.createBuffer({
      size: gridCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gridVelocity = device.createBuffer({
      size: gridCells * 16, // vec4<f32>
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Create uniform buffer
    this.simParamsBuffer = device.createBuffer({
      size: 48, // SimParams struct (12 floats)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Write initial uniforms
    this.updateUniforms(1 / 60);

    // Compile shaders and create pipelines
    await this.createPipelines();

    // Initialize particle positions (J = 1.0 for undeformed)
    const jData = new Float32Array(particleCount).fill(1.0);
    device.queue.writeBuffer(this.particleJ!, 0, jData);
  }

  /**
   * Set initial particle positions. Call after init().
   *
   * @param positions - Float32Array of [x, y, z, volume, ...] per particle
   */
  setInitialPositions(positions: Float32Array): void {
    if (!this.device || !this.particlePositions) {
      throw new Error('MLSMPMFluid not initialized. Call init() first.');
    }
    this.device.queue.writeBuffer(
      this.particlePositions,
      0,
      positions.buffer,
      positions.byteOffset,
      positions.byteLength
    );
  }

  /**
   * Generate a block of particles in a cubic region.
   */
  generateParticleBlock(
    min: [number, number, number],
    max: [number, number, number]
  ): Float32Array {
    const { particleCount, domainSize, restDensity } = this.config;
    const volume = domainSize ** 3 / particleCount;
    const mass = volume * restDensity;

    const data = new Float32Array(particleCount * 4);
    const velData = new Float32Array(particleCount * 4);

    // Distribute particles uniformly in the block
    const range = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const side = Math.ceil(Math.cbrt(particleCount));

    for (let i = 0; i < particleCount; i++) {
      const ix = i % side;
      const iy = Math.floor(i / side) % side;
      const iz = Math.floor(i / (side * side));

      data[i * 4 + 0] = min[0] + (ix / side) * range[0];
      data[i * 4 + 1] = min[1] + (iy / side) * range[1];
      data[i * 4 + 2] = min[2] + (iz / side) * range[2];
      data[i * 4 + 3] = volume;

      velData[i * 4 + 0] = 0;
      velData[i * 4 + 1] = 0;
      velData[i * 4 + 2] = 0;
      velData[i * 4 + 3] = mass;
    }

    // Upload to GPU
    if (this.device && this.particlePositions && this.particleVelocities) {
      this.device.queue.writeBuffer(this.particlePositions, 0, data);
      this.device.queue.writeBuffer(this.particleVelocities, 0, velData);
    }

    return data;
  }

  /**
   * Step the simulation forward by dt seconds.
   */
  step(dt: number = 1 / 60): void {
    if (!this.device || this.disposed) return;

    const start = performance.now();

    this.updateUniforms(dt);

    const encoder = this.device.createCommandEncoder();
    const { particleCount, gridResolution } = this.config;
    const gridCells = gridResolution ** 3;

    // [1] Grid Clear
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.gridClearPipeline!);
      pass.setBindGroup(0, this.gridClearBindGroup!);
      pass.dispatchWorkgroups(Math.ceil(gridCells / 256));
      pass.end();
    }

    // [2] P2G — scatter particle data to grid
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.p2gPipeline!);
      pass.setBindGroup(0, this.p2gBindGroup!);
      pass.dispatchWorkgroups(Math.ceil(particleCount / 256));
      pass.end();
    }

    // [3] Grid Update — gravity + boundaries
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.gridUpdatePipeline!);
      pass.setBindGroup(0, this.gridUpdateBindGroup!);
      pass.dispatchWorkgroups(Math.ceil(gridCells / 64));
      pass.end();
    }

    // [4] G2P — gather grid velocity back to particles
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.g2pPipeline!);
      pass.setBindGroup(0, this.g2pBindGroup!);
      pass.dispatchWorkgroups(Math.ceil(particleCount / 256));
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);

    this.lastStepMs = performance.now() - start;
  }

  /**
   * Dispose all GPU resources.
   */
  dispose(): void {
    this.disposed = true;
    this.particlePositions?.destroy();
    this.particleVelocities?.destroy();
    this.particleC?.destroy();
    this.particleJ?.destroy();
    this.gridMass?.destroy();
    this.gridMomentumX?.destroy();
    this.gridMomentumY?.destroy();
    this.gridMomentumZ?.destroy();
    this.gridVelocity?.destroy();
    this.simParamsBuffer?.destroy();
  }

  // ---------------------------------------------------------------------------
  // External Forces
  // ---------------------------------------------------------------------------

  /**
   * Set an external force (e.g. wind) applied to the fluid during grid update.
   * Force is in world-space acceleration (m/s²). Applied additively with gravity.
   */
  setExternalForce(x: number, y: number, z: number): void {
    this.externalForce = [x, y, z];
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Get the particle position buffer for rendering or unified PBD integration */
  getParticlePositionBuffer(): GPUBuffer | null {
    return this.particlePositions;
  }

  /** Get the particle velocity buffer */
  getParticleVelocityBuffer(): GPUBuffer | null {
    return this.particleVelocities;
  }

  getParticleCount(): number {
    return this.config.particleCount;
  }

  getConfig(): Readonly<MLSMPMConfig> {
    return this.config;
  }

  getStats(): MLSMPMStats {
    const { particleCount, gridResolution } = this.config;
    const gridCells = gridResolution ** 3;
    const particleMB = (particleCount * (16 + 16 + 64 + 4)) / (1024 * 1024);
    const gridMB = (gridCells * (4 * 4 + 16)) / (1024 * 1024);

    return {
      particleCount,
      gridResolution,
      lastStepMs: this.lastStepMs,
      lastRenderMs: this.lastRenderMs,
      gpuBufferSizeMB: particleMB + gridMB,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: Pipeline Creation
  // ---------------------------------------------------------------------------

  private async createPipelines(): Promise<void> {
    const device = this.device!;

    const p2gModule = device.createShaderModule({
      label: 'MLS-MPM P2G',
      code: p2gShader,
    });

    const gridModule = device.createShaderModule({
      label: 'MLS-MPM Grid',
      code: gridShader,
    });

    const g2pModule = device.createShaderModule({
      label: 'MLS-MPM G2P',
      code: g2pShader,
    });

    // --- Grid Clear Pipeline ---
    this.gridClearPipeline = device.createComputePipeline({
      label: 'Grid Clear',
      layout: 'auto',
      compute: { module: gridModule, entryPoint: 'cs_grid_clear' },
    });

    // --- P2G Pipeline ---
    this.p2gPipeline = device.createComputePipeline({
      label: 'MLS-MPM P2G',
      layout: 'auto',
      compute: { module: p2gModule, entryPoint: 'cs_p2g' },
    });

    // --- Grid Update Pipeline ---
    this.gridUpdatePipeline = device.createComputePipeline({
      label: 'Grid Update',
      layout: 'auto',
      compute: { module: gridModule, entryPoint: 'cs_grid_update' },
    });

    // --- G2P Pipeline ---
    this.g2pPipeline = device.createComputePipeline({
      label: 'MLS-MPM G2P',
      layout: 'auto',
      compute: { module: g2pModule, entryPoint: 'cs_g2p' },
    });

    // Create bind groups
    this.createBindGroups();
  }

  private createBindGroups(): void {
    const device = this.device!;

    // Grid Clear bind group (shares grid update layout)
    this.gridClearBindGroup = device.createBindGroup({
      label: 'Grid Clear BG',
      layout: this.gridClearPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simParamsBuffer! } },
        { binding: 1, resource: { buffer: this.gridMass! } },
        { binding: 2, resource: { buffer: this.gridMomentumX! } },
        { binding: 3, resource: { buffer: this.gridMomentumY! } },
        { binding: 4, resource: { buffer: this.gridMomentumZ! } },
        { binding: 5, resource: { buffer: this.gridVelocity! } },
      ],
    });

    // P2G bind group
    this.p2gBindGroup = device.createBindGroup({
      label: 'P2G BG',
      layout: this.p2gPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simParamsBuffer! } },
        { binding: 1, resource: { buffer: this.particlePositions! } },
        { binding: 2, resource: { buffer: this.particleVelocities! } },
        { binding: 3, resource: { buffer: this.particleC! } },
        { binding: 4, resource: { buffer: this.particleJ! } },
        { binding: 5, resource: { buffer: this.gridMass! } },
        { binding: 6, resource: { buffer: this.gridMomentumX! } },
        { binding: 7, resource: { buffer: this.gridMomentumY! } },
        { binding: 8, resource: { buffer: this.gridMomentumZ! } },
      ],
    });

    // Grid Update bind group
    this.gridUpdateBindGroup = device.createBindGroup({
      label: 'Grid Update BG',
      layout: this.gridUpdatePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simParamsBuffer! } },
        { binding: 1, resource: { buffer: this.gridMass! } },
        { binding: 2, resource: { buffer: this.gridMomentumX! } },
        { binding: 3, resource: { buffer: this.gridMomentumY! } },
        { binding: 4, resource: { buffer: this.gridMomentumZ! } },
        { binding: 5, resource: { buffer: this.gridVelocity! } },
      ],
    });

    // G2P bind group
    this.g2pBindGroup = device.createBindGroup({
      label: 'G2P BG',
      layout: this.g2pPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simParamsBuffer! } },
        { binding: 1, resource: { buffer: this.gridVelocity! } },
        { binding: 2, resource: { buffer: this.particlePositions! } },
        { binding: 3, resource: { buffer: this.particleVelocities! } },
        { binding: 4, resource: { buffer: this.particleC! } },
        { binding: 5, resource: { buffer: this.particleJ! } },
      ],
    });
  }

  private updateUniforms(dt: number): void {
    if (!this.device || !this.simParamsBuffer) return;

    const {
      gridResolution,
      particleCount,
      domainSize,
      gravity,
      restDensity,
      bulkModulus,
      viscosity,
    } = this.config;
    const dx = domainSize / gridResolution;

    const data = new Float32Array([
      gridResolution, // grid_res (reinterpreted as u32)
      particleCount, // num_particles (reinterpreted as u32)
      dt,
      dx,
      1.0 / dx, // inv_dx
      gravity,
      restDensity,
      bulkModulus,
      viscosity,
      this.externalForce[0],
      this.externalForce[1],
      this.externalForce[2], // wind xyz
    ]);

    // Write grid_res and num_particles as u32
    const u32View = new Uint32Array(data.buffer);
    u32View[0] = gridResolution;
    u32View[1] = particleCount;

    this.device.queue.writeBuffer(this.simParamsBuffer, 0, data);
  }

  // Shaders are imported natively using Vite/esbuild ?raw plugin mechanism.
}
