/**
 * AvalancheSimulation.ts
 *
 * CPU-GPU integration layer for avalanche simulation.
 * Bridges AvalanchePhysics (CPU) with GPU particle system.
 *
 * Week 6: Avalanche Simulation - GPU Integration
 */

import type { TerrainData } from './TerrainGenerator';
import type { SnowParticle } from './SnowAccumulation';
import type { AvalanchePhysics, _AvalancheConfig, AvalancheStats } from './AvalanchePhysics';

export interface SimulationConfig {
  /** Use GPU acceleration for particle physics */
  useGPU: boolean;
  /** Maximum particles to simulate */
  maxParticles: number;
  /** Enable performance monitoring */
  enableProfiling: boolean;
}

export interface PerformanceMetrics {
  /** CPU physics time (ms) */
  cpuPhysicsTime: number;
  /** GPU upload time (ms) */
  gpuUploadTime: number;
  /** GPU compute time (ms) */
  gpuComputeTime: number;
  /** Total frame time (ms) */
  totalFrameTime: number;
  /** Frames per second */
  fps: number;
  /** Active particle count */
  activeParticles: number;
  /** Memory usage estimate (MB) */
  memoryUsage: number;
}

export interface GPUTerrainData {
  /** Heightmap buffer */
  heightmapBuffer: Float32Array;
  /** Terrain metadata [width, depth, resolution, maxHeight] */
  metadataBuffer: Float32Array;
}

/**
 * Avalanche simulation with CPU-GPU hybrid architecture
 */
export class AvalancheSimulation {
  private terrain: TerrainData;
  private physics: AvalanchePhysics;
  private config: SimulationConfig;
  private terrainUploaded = false;
  private gpuTerrainData: GPUTerrainData | null = null;
  private performanceMetrics: PerformanceMetrics;
  private frameHistory: number[] = [];
  private lastFrameTime = 0;

  constructor(terrain: TerrainData, physics: AvalanchePhysics, config: SimulationConfig) {
    this.terrain = terrain;
    this.physics = physics;
    this.config = config;

    this.performanceMetrics = {
      cpuPhysicsTime: 0,
      gpuUploadTime: 0,
      gpuComputeTime: 0,
      totalFrameTime: 0,
      fps: 0,
      activeParticles: 0,
      memoryUsage: 0,
    };

    // Prepare terrain data for GPU
    this.prepareTerrainForGPU();
  }

  /**
   * Prepare terrain data for GPU upload
   */
  private prepareTerrainForGPU(): void {
    const { width, depth, resolution, maxHeight } = this.terrain.config;

    this.gpuTerrainData = {
      heightmapBuffer: new Float32Array(this.terrain.heightmap),
      metadataBuffer: new Float32Array([width, depth, resolution, maxHeight]),
    };
  }

  /**
   * Upload terrain to GPU (one-time operation)
   */
  private async uploadTerrainToGPU(): Promise<void> {
    if (this.terrainUploaded || !this.config.useGPU || !this.gpuTerrainData) {
      return;
    }

    const startTime = performance.now();

    // In a real implementation, this would upload to WebGPU buffers
    // For now, we simulate the upload
    await new Promise((resolve) => setTimeout(resolve, 1));

    this.terrainUploaded = true;

    if (this.config.enableProfiling) {
      const uploadTime = performance.now() - startTime;
      console.log(`[AvalancheSimulation] Terrain uploaded to GPU in ${uploadTime.toFixed(2)}ms`);
    }
  }

  /**
   * Sync particles to GPU buffers
   */
  private async uploadParticlesToGPU(particles: SnowParticle[]): Promise<void> {
    if (!this.config.useGPU) return;

    const startTime = performance.now();

    // Create particle data arrays for GPU
    const particleCount = Math.min(particles.length, this.config.maxParticles);
    const positions = new Float32Array(particleCount * 4); // vec4 alignment
    const velocities = new Float32Array(particleCount * 4);
    const properties = new Float32Array(particleCount * 4); // [mass, state, age, id]

    for (let i = 0; i < particleCount; i++) {
      const particle = particles[i];

      // Position
      positions[i * 4 + 0] = particle.position[0];
      positions[i * 4 + 1] = particle.position[1];
      positions[i * 4 + 2] = particle.position[2];
      positions[i * 4 + 3] = 1.0; // w component

      // Velocity
      velocities[i * 4 + 0] = particle.velocity[0];
      velocities[i * 4 + 1] = particle.velocity[1];
      velocities[i * 4 + 2] = particle.velocity[2];
      velocities[i * 4 + 3] = 0.0; // w component

      // Properties
      properties[i * 4 + 0] = particle.mass;
      properties[i * 4 + 1] = this.stateToNumber(particle.state);
      properties[i * 4 + 2] = particle.age;
      properties[i * 4 + 3] = particle.id;
    }

    // In a real implementation, this would upload to WebGPU buffers
    // For now, we simulate the upload
    await new Promise((resolve) => setTimeout(resolve, 0));

    const uploadTime = performance.now() - startTime;
    this.performanceMetrics.gpuUploadTime = uploadTime;
  }

  /**
   * Convert particle state to number for GPU
   */
  private stateToNumber(state: 'resting' | 'sliding' | 'airborne'): number {
    switch (state) {
      case 'resting':
        return 0;
      case 'sliding':
        return 1;
      case 'airborne':
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Read particle data back from GPU
   */
  private async readParticlesFromGPU(_particles: SnowParticle[]): Promise<void> {
    if (!this.config.useGPU) return;

    // In a real implementation, this would read from WebGPU buffers
    // For now, particles are already updated on CPU
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Trigger avalanche at epicenter
   */
  public triggerAvalanche(epicenter: [number, number], radius: number): void {
    this.physics.triggerAvalanche(epicenter, radius);
  }

  /**
   * Update simulation
   */
  public async update(dt: number): Promise<void> {
    const frameStartTime = performance.now();

    // Upload terrain on first frame
    if (!this.terrainUploaded) {
      await this.uploadTerrainToGPU();
    }

    // CPU physics update
    const cpuStartTime = performance.now();
    this.physics.update(dt);
    const cpuEndTime = performance.now();
    this.performanceMetrics.cpuPhysicsTime = cpuEndTime - cpuStartTime;

    // Get active particles
    const particles = this.physics.getParticles();
    const activeParticles = particles.filter(
      (p) => p.state === 'sliding' || p.state === 'airborne'
    );

    this.performanceMetrics.activeParticles = activeParticles.length;

    // GPU physics update (if enabled)
    if (this.config.useGPU && activeParticles.length > 0) {
      // Upload particles to GPU
      await this.uploadParticlesToGPU(particles);

      // Run GPU compute (simulated)
      const gpuStartTime = performance.now();
      await this.runGPUCompute(dt, activeParticles.length);
      const gpuEndTime = performance.now();
      this.performanceMetrics.gpuComputeTime = gpuEndTime - gpuStartTime;

      // Read results back
      await this.readParticlesFromGPU(particles);
    }

    // Update performance metrics
    const frameEndTime = performance.now();
    this.performanceMetrics.totalFrameTime = frameEndTime - frameStartTime;

    // Calculate FPS
    this.updateFPS(frameEndTime);

    // Estimate memory usage
    this.updateMemoryEstimate(particles.length);

    this.lastFrameTime = frameEndTime;
  }

  /**
   * Run GPU compute shader (simulated)
   */
  private async runGPUCompute(dt: number, particleCount: number): Promise<void> {
    // In a real implementation, this would dispatch compute shader
    // For now, we simulate the compute time
    const computeTime = particleCount * 0.001; // Simulate 0.001ms per particle
    await new Promise((resolve) => setTimeout(resolve, Math.min(computeTime, 5)));
  }

  /**
   * Update FPS calculation
   */
  private updateFPS(currentTime: number): void {
    if (this.lastFrameTime > 0) {
      const frameDelta = currentTime - this.lastFrameTime;
      this.frameHistory.push(frameDelta);

      // Keep last 60 frames
      if (this.frameHistory.length > 60) {
        this.frameHistory.shift();
      }

      // Calculate average FPS
      const avgFrameTime =
        this.frameHistory.reduce((sum, t) => sum + t, 0) / this.frameHistory.length;
      this.performanceMetrics.fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
    }
  }

  /**
   * Estimate memory usage
   */
  private updateMemoryEstimate(particleCount: number): void {
    // Estimate memory usage in MB
    const particleDataSize = particleCount * (4 * 4 * 3); // 3 vec4s per particle
    const terrainDataSize = this.terrain.heightmap.length * 4; // Float32
    const totalBytes = particleDataSize + terrainDataSize;
    this.performanceMetrics.memoryUsage = totalBytes / (1024 * 1024);
  }

  /**
   * Get physics statistics
   */
  public getStatistics(): AvalancheStats {
    return this.physics.getStatistics();
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get all particles
   */
  public getParticles(): SnowParticle[] {
    return this.physics.getParticles();
  }

  /**
   * Get GPU terrain data (for debugging)
   */
  public getGPUTerrainData(): GPUTerrainData | null {
    return this.gpuTerrainData;
  }

  /**
   * Reset simulation
   */
  public reset(): void {
    this.physics.reset();
    this.frameHistory = [];
    this.performanceMetrics = {
      cpuPhysicsTime: 0,
      gpuUploadTime: 0,
      gpuComputeTime: 0,
      totalFrameTime: 0,
      fps: 0,
      activeParticles: 0,
      memoryUsage: 0,
    };
  }

  /**
   * Enable/disable GPU acceleration
   */
  public setGPUEnabled(enabled: boolean): void {
    this.config.useGPU = enabled;

    if (!enabled) {
      this.terrainUploaded = false;
    }
  }

  /**
   * Enable/disable profiling
   */
  public setProfilingEnabled(enabled: boolean): void {
    this.config.enableProfiling = enabled;
  }

  /**
   * Get detailed profiling information
   */
  public getProfilingInfo(): string {
    const metrics = this.performanceMetrics;
    const stats = this.physics.getStatistics();

    return `
Avalanche Simulation Profiling:
================================
Frame Time: ${metrics.totalFrameTime.toFixed(2)}ms
  CPU Physics: ${metrics.cpuPhysicsTime.toFixed(2)}ms
  GPU Upload:  ${metrics.gpuUploadTime.toFixed(2)}ms
  GPU Compute: ${metrics.gpuComputeTime.toFixed(2)}ms

FPS: ${metrics.fps.toFixed(1)}
Active Particles: ${metrics.activeParticles} / ${stats.restingCount + stats.slidingCount + stats.airborneCount}
Memory: ${metrics.memoryUsage.toFixed(2)}MB

Particle States:
  Resting:  ${stats.restingCount}
  Sliding:  ${stats.slidingCount}
  Airborne: ${stats.airborneCount}

Simulation:
  Elapsed: ${stats.elapsedTime.toFixed(2)}s
  Events:  ${stats.collapseEvents}
  Avg Velocity: ${stats.avgVelocity.toFixed(2)} m/s
  Max Velocity: ${stats.maxVelocity.toFixed(2)} m/s
`.trim();
  }
}
