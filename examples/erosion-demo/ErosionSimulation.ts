/**
 * ErosionSimulation.ts
 *
 * Complete erosion simulation orchestrator.
 * Integrates terrain, water, sediment, and modifiers into a unified simulation.
 *
 * Week 7: Water Erosion - Day 4
 */

import { HeightmapTerrain, type HeightmapConfig, type TerrainStatistics } from './HeightmapTerrain';
import { WaterFlowSolver, type WaterConfig, type WaterStatistics } from './WaterFlowSolver';
import { SedimentTransport, type SedimentConfig, type SedimentStatistics } from './SedimentTransport';
import { TerrainModifier, type BrushConfig, type NoiseConfig } from './TerrainModifier';

export interface ErosionConfig {
  /** Terrain configuration */
  terrain: HeightmapConfig;
  /** Water simulation configuration */
  water?: Partial<WaterConfig>;
  /** Sediment simulation configuration */
  sediment?: Partial<SedimentConfig>;
}

export interface SimulationState {
  /** Current simulation time */
  time: number;
  /** Number of simulation steps executed */
  steps: number;
  /** Is simulation running */
  running: boolean;
  /** Is simulation paused */
  paused: boolean;
}

export interface CombinedStatistics {
  /** Terrain statistics */
  terrain: TerrainStatistics;
  /** Water statistics */
  water: WaterStatistics;
  /** Sediment statistics */
  sediment: SedimentStatistics;
  /** Simulation state */
  state: SimulationState;
}

export type SimulationPreset =
  | 'canyon'
  | 'mountain'
  | 'valley'
  | 'plateau'
  | 'hills'
  | 'flat'
  | 'island'
  | 'ridge';

/**
 * Complete erosion simulation system
 */
export class ErosionSimulation {
  public readonly terrain: HeightmapTerrain;
  public readonly water: WaterFlowSolver;
  public readonly sediment: SedimentTransport;
  public readonly modifier: TerrainModifier;

  private state: SimulationState = {
    time: 0,
    steps: 0,
    running: false,
    paused: false,
  };

  private animationFrameId: number | null = null;
  private lastFrameTime = 0;

  constructor(config: ErosionConfig) {
    this.terrain = new HeightmapTerrain(config.terrain);
    this.water = new WaterFlowSolver(this.terrain, config.water);
    this.sediment = new SedimentTransport(this.terrain, this.water, config.sediment);
    this.modifier = new TerrainModifier(this.terrain);
  }

  /**
   * Initialize terrain with preset
   */
  public loadPreset(preset: SimulationPreset): void {
    const { width, depth } = this.terrain.config;
    const maxDim = Math.max(width, depth);

    switch (preset) {
      case 'canyon':
        this.modifier.createValley(maxDim * 0.3, maxDim * 0.4);
        this.modifier.applyNoise({
          octaves: 4,
          frequency: 0.02,
          amplitude: maxDim * 0.1,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: Date.now(),
        });
        break;

      case 'mountain':
        this.modifier.createMountains({
          octaves: 8,
          frequency: 0.008,
          amplitude: maxDim * 0.6,
          persistence: 0.5,
          lacunarity: 2.2,
        });
        break;

      case 'valley':
        this.modifier.createValley(maxDim * 0.4, maxDim * 0.6);
        break;

      case 'plateau':
        this.terrain.fill(maxDim * 0.5);
        this.modifier.applyNoise({
          octaves: 3,
          frequency: 0.03,
          amplitude: maxDim * 0.05,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: Date.now(),
        });
        break;

      case 'hills':
        this.modifier.applyNoise({
          octaves: 5,
          frequency: 0.02,
          amplitude: maxDim * 0.3,
          persistence: 0.6,
          lacunarity: 2.0,
          seed: Date.now(),
        });
        break;

      case 'flat':
        this.terrain.fill(0);
        break;

      case 'island':
        this.modifier.createCone(maxDim * 0.5);
        this.modifier.applyNoise({
          octaves: 4,
          frequency: 0.015,
          amplitude: maxDim * 0.15,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: Date.now(),
        });
        break;

      case 'ridge':
        this.modifier.createRidge(maxDim * 0.4, maxDim * 0.3);
        this.modifier.applyNoise({
          octaves: 3,
          frequency: 0.025,
          amplitude: maxDim * 0.08,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: Date.now(),
        });
        break;
    }

    this.reset();
  }

  /**
   * Start simulation
   */
  public start(): void {
    if (this.state.running) return;

    this.state.running = true;
    this.state.paused = false;
    this.lastFrameTime = performance.now();

    this.runSimulationLoop();
  }

  /**
   * Stop simulation
   */
  public stop(): void {
    this.state.running = false;
    this.state.paused = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Pause simulation
   */
  public pause(): void {
    if (!this.state.running) return;
    this.state.paused = true;
  }

  /**
   * Resume simulation
   */
  public resume(): void {
    if (!this.state.running || !this.state.paused) return;

    this.state.paused = false;
    this.lastFrameTime = performance.now();
  }

  /**
   * Step simulation by one frame
   */
  public step(dt: number = 0.016): void {
    this.water.update(dt);
    this.sediment.update(dt);

    this.state.time += dt;
    this.state.steps++;
  }

  /**
   * Run simulation for specified duration
   */
  public simulate(duration: number, dt: number = 0.016): void {
    const steps = Math.ceil(duration / dt);

    for (let i = 0; i < steps; i++) {
      this.step(dt);
    }
  }

  /**
   * Reset simulation
   */
  public reset(): void {
    this.water.reset();
    this.sediment.reset();

    this.state.time = 0;
    this.state.steps = 0;
  }

  /**
   * Clear all water
   */
  public clearWater(): void {
    this.water.reset();
  }

  /**
   * Clear all sediment
   */
  public clearSediment(): void {
    this.sediment.reset();
  }

  /**
   * Add rain uniformly
   */
  public addRain(amount: number): void {
    this.water.addRain(amount);
  }

  /**
   * Add rain to region
   */
  public addRainToRegion(centerX: number, centerZ: number, radius: number, amount: number): void {
    this.water.addRainToRegion(centerX, centerZ, radius, amount);
  }

  /**
   * Add water at specific location
   */
  public addWater(gridX: number, gridZ: number, amount: number): void {
    this.water.addWaterAt(gridX, gridZ, amount);
  }

  /**
   * Raise terrain with brush
   */
  public raiseTerrain(centerX: number, centerZ: number, config: BrushConfig): void {
    this.modifier.raise(centerX, centerZ, config);
  }

  /**
   * Lower terrain with brush
   */
  public lowerTerrain(centerX: number, centerZ: number, config: BrushConfig): void {
    this.modifier.lower(centerX, centerZ, config);
  }

  /**
   * Flatten terrain with brush
   */
  public flattenTerrain(centerX: number, centerZ: number, targetHeight: number, config: BrushConfig): void {
    this.modifier.flatten(centerX, centerZ, targetHeight, config);
  }

  /**
   * Smooth terrain with brush
   */
  public smoothTerrain(centerX: number, centerZ: number, config: BrushConfig): void {
    this.modifier.smoothBrush(centerX, centerZ, config);
  }

  /**
   * Apply noise to terrain
   */
  public applyNoise(config: NoiseConfig): void {
    this.modifier.applyNoise(config);
  }

  /**
   * Get combined statistics
   */
  public getStatistics(): CombinedStatistics {
    return {
      terrain: this.terrain.getStatistics(),
      water: this.water.getStatistics(),
      sediment: this.sediment.getStatistics(),
      state: { ...this.state },
    };
  }

  /**
   * Get simulation state
   */
  public getState(): SimulationState {
    return { ...this.state };
  }

  /**
   * Save terrain snapshot
   */
  public saveSnapshot(description: string = ''): string {
    return this.terrain.saveSnapshot(description);
  }

  /**
   * Restore terrain snapshot
   */
  public restoreSnapshot(id: string): boolean {
    const success = this.terrain.restoreSnapshot(id);
    if (success) {
      this.reset();
    }
    return success;
  }

  /**
   * Export simulation state
   */
  public exportState(): {
    terrain: Float32Array;
    water: Array<{ height: number; velocity: [number, number] }>;
    time: number;
    steps: number;
  } {
    const { resolution } = this.terrain.config;
    const waterData: Array<{ height: number; velocity: [number, number] }> = [];

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const waterCell = this.water.getWaterAt(x, z);
        waterData.push({
          height: waterCell?.height || 0,
          velocity: waterCell?.velocity || [0, 0],
        });
      }
    }

    return {
      terrain: new Float32Array(this.terrain.heightmap),
      water: waterData,
      time: this.state.time,
      steps: this.state.steps,
    };
  }

  /**
   * Import simulation state
   */
  public importState(state: {
    terrain: Float32Array;
    water: Array<{ height: number; velocity: [number, number] }>;
    time?: number;
    steps?: number;
  }): void {
    const { resolution } = this.terrain.config;

    // Import terrain
    this.terrain.heightmap.set(state.terrain);
    this.terrain.regenerateMesh();

    // Import water
    this.water.reset();
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = z * resolution + x;
        const waterData = state.water[idx];

        if (waterData && waterData.height > 0) {
          this.water.setWaterAt(x, z, waterData.height);
          const cell = this.water.getWaterAt(x, z);
          if (cell) {
            cell.velocity = [...waterData.velocity];
          }
        }
      }
    }

    // Import state
    this.state.time = state.time || 0;
    this.state.steps = state.steps || 0;
  }

  /**
   * Simulation loop (for real-time simulation)
   */
  private runSimulationLoop = (): void => {
    if (!this.state.running) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = currentTime;

    if (!this.state.paused && deltaTime > 0) {
      // Cap delta time to prevent huge jumps
      const cappedDt = Math.min(deltaTime, 0.1);
      this.step(cappedDt);
    }

    this.animationFrameId = requestAnimationFrame(this.runSimulationLoop);
  };
}
