/**
 * Earthquake Simulation - GPU Integration
 *
 * Integrates procedural building, fracture physics, and GPU-accelerated
 * particle simulation for spectacular earthquake demonstrations.
 *
 * @module demos/earthquake/EarthquakeSimulation
 */

import type { WebGPUContext } from '../../gpu/WebGPUContext.js';
import type { GPUBufferManager } from '../../gpu/GPUBuffers.js';
import type { ComputePipeline } from '../../gpu/ComputePipeline.js';
import type { SpatialGrid } from '../../gpu/SpatialGrid.js';
import type { InstancedRenderer, CameraParams } from '../../gpu/InstancedRenderer.js';
import { ProceduralBuilding, type BuildingConfig, type BuildingStructure } from './ProceduralBuilding.js';
import { FracturePhysics, type EarthquakeConfig, type DebrisParticle } from './FracturePhysics.js';

export interface EarthquakeSimulationConfig {
  /** Building configuration */
  building: BuildingConfig;

  /** Maximum debris particles */
  maxDebrisParticles: number;

  /** GPU physics shader code */
  physicsShaderCode: string;

  /** Spatial grid shader code */
  spatialGridShaderCode: string;

  /** Canvas for rendering */
  canvas: HTMLCanvasElement;
}

export interface SimulationState {
  /** Is earthquake active */
  earthquakeActive: boolean;

  /** Has building started collapsing */
  collapseStarted: boolean;

  /** Building structural integrity (0-100%) */
  structuralIntegrity: number;

  /** Active debris particle count */
  activeDebrisCount: number;

  /** Total debris spawned */
  totalDebrisCount: number;

  /** Collapse events */
  collapseEventCount: number;

  /** Current FPS */
  fps: number;

  /** Current simulation time */
  time: number;
}

/**
 * Earthquake Simulation
 *
 * Complete earthquake demonstration system integrating:
 * - Procedural building generation
 * - Fracture physics and structural collapse
 * - GPU-accelerated debris simulation
 * - Real-time rendering
 */
export class EarthquakeSimulation {
  private context: WebGPUContext;
  private bufferManager: GPUBufferManager;
  private physicsPipeline: ComputePipeline;
  private spatialGrid: SpatialGrid;
  private renderer: InstancedRenderer;

  private proceduralBuilding: ProceduralBuilding;
  private buildingStructure: BuildingStructure;
  private fracturePhysics: FracturePhysics;

  private config: EarthquakeSimulationConfig;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  private currentFPS: number = 0;

  // Particle mapping: structural elements + debris
  private structuralParticleCount: number = 0;
  private debrisParticleOffset: number = 0;

  constructor(
    context: WebGPUContext,
    config: EarthquakeSimulationConfig
  ) {
    this.context = context;
    this.config = config;

    // Create building
    this.proceduralBuilding = new ProceduralBuilding();
    this.buildingStructure = this.proceduralBuilding.generateStructure(config.building);

    // Create fracture physics
    this.fracturePhysics = new FracturePhysics(this.buildingStructure);

    // Count structural elements for GPU allocation
    this.structuralParticleCount = this.buildingStructure.elements.length;
    this.debrisParticleOffset = this.structuralParticleCount;

    const totalParticles = this.structuralParticleCount + config.maxDebrisParticles;

    // Create GPU systems (will be initialized in initialize())
    this.bufferManager = new GPUBufferManager(context, totalParticles);
    this.physicsPipeline = new ComputePipeline(context, this.bufferManager, {
      shaderCode: config.physicsShaderCode,
      workgroupSize: 256,
    });
    this.spatialGrid = new SpatialGrid(context, totalParticles, {
      cellSize: 0.5,
      gridDimensions: { x: 50, y: 50, z: 50 },
      maxParticlesPerCell: 64,
      shaderCode: config.spatialGridShaderCode,
    });
    this.renderer = new InstancedRenderer(context, config.canvas, {
      maxParticles: totalParticles,
      sphereSegments: 12,
      enableLOD: true,
    });

    console.log(`🏗️ Earthquake simulation created:`);
    console.log(`   Building: ${config.building.floors} floors, ${this.structuralParticleCount} elements`);
    console.log(`   Max debris: ${config.maxDebrisParticles} particles`);
    console.log(`   Total capacity: ${totalParticles} particles`);
  }

  /**
   * Initialize GPU systems
   */
  async initialize(): Promise<void> {
    console.log('Initializing earthquake simulation...');

    // Initialize GPU components
    await this.bufferManager.initialize();
    await this.physicsPipeline.initialize();
    await this.spatialGrid.initialize();
    await this.renderer.initialize();

    // Upload initial structural elements as static particles
    this.uploadStructuralElements();

    console.log('✅ Earthquake simulation initialized');
  }

  /**
   * Upload structural elements as static particles (for visualization)
   */
  private uploadStructuralElements(): void {
    const particleData = {
      positions: new Float32Array(this.structuralParticleCount * 4),
      velocities: new Float32Array(this.structuralParticleCount * 4),
      states: new Float32Array(this.structuralParticleCount * 4),
    };

    // Upload each structural element as a particle
    for (let i = 0; i < this.buildingStructure.elements.length; i++) {
      const element = this.buildingStructure.elements[i];
      const idx = i * 4;

      // Position + size (use average dimension as radius)
      particleData.positions[idx + 0] = element.position[0];
      particleData.positions[idx + 1] = element.position[1];
      particleData.positions[idx + 2] = element.position[2];
      particleData.positions[idx + 3] = (element.dimensions[0] + element.dimensions[1] + element.dimensions[2]) / 6;

      // Velocity (static initially) + mass
      particleData.velocities[idx + 0] = 0;
      particleData.velocities[idx + 1] = 0;
      particleData.velocities[idx + 2] = 0;
      particleData.velocities[idx + 3] = element.mass;

      // State: active, not sleeping, health, userData (element ID)
      particleData.states[idx + 0] = 1.0; // active
      particleData.states[idx + 1] = 1.0; // no sleep (structural)
      particleData.states[idx + 2] = element.health / 100; // health 0-1
      particleData.states[idx + 3] = element.id; // store element ID
    }

    this.bufferManager.uploadParticleData(particleData);
  }

  /**
   * Trigger an earthquake
   */
  triggerEarthquake(config: EarthquakeConfig): void {
    console.log(`🌊 Triggering earthquake: intensity ${config.intensity}`);
    this.fracturePhysics.triggerEarthquake(config);
  }

  /**
   * Update simulation
   */
  async update(dt: number): Promise<void> {
    // Update fracture physics
    this.fracturePhysics.update(dt);

    // Sync debris particles to GPU
    this.syncDebrisToGPU();

    // Run GPU physics
    await this.physicsPipeline.step({
      dt,
      gravity: 9.8,
      groundY: 0,
      restitution: 0.3,
      friction: 0.9,
      particleCount: this.getActiveParticleCount(),
    });

    // Run collision detection
    const posBuffer = this.bufferManager.getBuffers().positionsRead;
    const velBuffer = this.bufferManager.getBuffers().velocitiesRead;
    await this.spatialGrid.execute(posBuffer, velBuffer);

    // Update FPS tracking
    this.updateFPS(dt);
  }

  /**
   * Sync debris particles from CPU to GPU
   */
  private syncDebrisToGPU(): void {
    const debris = this.fracturePhysics.getAllDebris();
    if (debris.length === 0) return;

    // Create particle data for debris
    const debrisCount = Math.min(debris.length, this.config.maxDebrisParticles);
    const particleData = {
      positions: new Float32Array(debrisCount * 4),
      velocities: new Float32Array(debrisCount * 4),
      states: new Float32Array(debrisCount * 4),
    };

    for (let i = 0; i < debrisCount; i++) {
      const particle = debris[i];
      const idx = i * 4;

      // Position + radius
      particleData.positions[idx + 0] = particle.position[0];
      particleData.positions[idx + 1] = particle.position[1];
      particleData.positions[idx + 2] = particle.position[2];
      particleData.positions[idx + 3] = particle.radius;

      // Velocity + mass
      particleData.velocities[idx + 0] = particle.velocity[0];
      particleData.velocities[idx + 1] = particle.velocity[1];
      particleData.velocities[idx + 2] = particle.velocity[2];
      particleData.velocities[idx + 3] = particle.mass;

      // State: active, not sleeping, health, age
      particleData.states[idx + 0] = particle.active ? 1.0 : 0.0;
      particleData.states[idx + 1] = 0.0; // not sleeping
      particleData.states[idx + 2] = 1.0; // full health
      particleData.states[idx + 3] = particle.age;
    }

    // Upload to GPU (offset after structural particles)
    // Note: This is a simplified version. In production, would use
    // partial buffer updates for better performance.
    this.bufferManager.uploadParticleData(particleData, this.debrisParticleOffset);
  }

  /**
   * Render simulation
   */
  render(camera: CameraParams): void {
    // Download particle positions from GPU
    // Note: In production, would use async readback to avoid stalls
    const particleData = this.bufferManager.downloadParticleDataSync();

    // Get active particle count
    const activeCount = this.getActiveParticleCount();

    // Render with instanced renderer
    this.renderer.render(particleData.positions, activeCount, camera);

    this.frameCount++;
  }

  /**
   * Get active particle count (structural + active debris)
   */
  private getActiveParticleCount(): number {
    const activeDebris = this.fracturePhysics.getActiveDebris().length;
    return this.structuralParticleCount + activeDebris;
  }

  /**
   * Update FPS tracking
   */
  private updateFPS(dt: number): void {
    const now = performance.now();

    if (now - this.fpsUpdateTime >= 1000) {
      this.currentFPS = Math.round(this.frameCount / ((now - this.fpsUpdateTime) / 1000));
      this.frameCount = 0;
      this.fpsUpdateTime = now;
    }
  }

  /**
   * Get simulation state
   */
  getState(): SimulationState {
    const stats = this.fracturePhysics.getStatistics();

    return {
      earthquakeActive: this.fracturePhysics.isEarthquakeActive(),
      collapseStarted: this.fracturePhysics.hasFailures(),
      structuralIntegrity: ((stats.totalElements - stats.failedElements) / stats.totalElements) * 100,
      activeDebrisCount: stats.activeDebris,
      totalDebrisCount: stats.totalDebris,
      collapseEventCount: stats.collapseEvents,
      fps: this.currentFPS,
      time: performance.now() - this.lastFrameTime,
    };
  }

  /**
   * Reset simulation
   */
  reset(): void {
    console.log('🔄 Resetting earthquake simulation');

    // Reset fracture physics
    this.fracturePhysics.reset();

    // Re-upload structural elements
    this.uploadStructuralElements();

    // Reset FPS tracking
    this.frameCount = 0;
    this.fpsUpdateTime = performance.now();
  }

  /**
   * Get building structure (for visualization)
   */
  getBuildingStructure(): BuildingStructure {
    return this.buildingStructure;
  }

  /**
   * Get fracture physics (for inspection)
   */
  getFracturePhysics(): FracturePhysics {
    return this.fracturePhysics;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.physicsPipeline.destroy();
    this.spatialGrid.destroy();
    this.renderer.destroy();
    this.bufferManager.destroy();

    console.log('Earthquake simulation destroyed');
  }
}

/**
 * Helper function to create complete earthquake simulation
 */
export async function createEarthquakeSimulation(
  context: WebGPUContext,
  config: EarthquakeSimulationConfig
): Promise<EarthquakeSimulation> {
  const simulation = new EarthquakeSimulation(context, config);
  await simulation.initialize();
  return simulation;
}
