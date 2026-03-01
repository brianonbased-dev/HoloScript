/**
 * ErosionDemoScene.ts
 *
 * Interactive demo scene for water erosion simulation.
 * Provides a complete example with visualization, controls, and presets.
 *
 * Week 7: Water Erosion - Day 5
 */

import { ErosionSimulation, type SimulationPreset } from './ErosionSimulation';
import type { BrushConfig } from './TerrainModifier';
import type { TerrainMesh } from './HeightmapTerrain';

export interface DemoSceneConfig {
  /** Terrain resolution */
  resolution: number;
  /** Terrain size (width = depth) */
  size: number;
  /** Initial preset */
  preset?: SimulationPreset;
  /** Auto-start simulation */
  autoStart?: boolean;
  /** Simulation speed (time scale) */
  timeScale?: number;
}

export interface CameraConfig {
  /** Camera position [x, y, z] */
  position: [number, number, number];
  /** Look-at target [x, y, z] */
  target: [number, number, number];
  /** Field of view (degrees) */
  fov: number;
}

export interface VisualizationMode {
  /** Terrain visualization */
  terrain: 'height' | 'slope' | 'normal';
  /** Water visualization */
  water: 'depth' | 'velocity' | 'none';
  /** Sediment visualization */
  sediment: 'suspended' | 'deposited' | 'both' | 'none';
  /** Show wireframe */
  wireframe: boolean;
}

export interface InteractionMode {
  /** Current tool */
  tool: 'raise' | 'lower' | 'flatten' | 'smooth' | 'rain' | 'inspect';
  /** Brush configuration */
  brush: BrushConfig;
  /** Rain amount */
  rainAmount: number;
}

export interface SceneStatistics {
  /** Frames per second */
  fps: number;
  /** Frame time (ms) */
  frameTime: number;
  /** Triangle count */
  triangles: number;
  /** Simulation time */
  simTime: number;
  /** Simulation steps */
  simSteps: number;
}

/**
 * Interactive erosion demo scene
 */
export class ErosionDemoScene {
  public readonly simulation: ErosionSimulation;
  public readonly config: Required<DemoSceneConfig>;

  private camera: CameraConfig;
  private visualization: VisualizationMode;
  private interaction: InteractionMode;
  private statistics: SceneStatistics;

  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsUpdateTime = 0;

  private isRunning = false;
  private animationFrameId: number | null = null;

  constructor(config: DemoSceneConfig) {
    this.config = {
      resolution: config.resolution,
      size: config.size,
      preset: config.preset || 'mountain',
      autoStart: config.autoStart ?? false,
      timeScale: config.timeScale ?? 1.0,
    };

    // Initialize simulation
    this.simulation = new ErosionSimulation({
      terrain: {
        width: this.config.size,
        depth: this.config.size,
        resolution: this.config.resolution,
      },
      water: {
        gravity: 9.81,
        frictionCoefficient: 0.1,
        evaporationRate: 0.01,
      },
      sediment: {
        sedimentCapacity: 0.5,
        erosionRate: 0.3,
        depositionRate: 0.1,
        minWaterHeight: 0.01,
        thermalErosionRate: 0.1,
        angleOfRepose: Math.PI / 6,
        solubility: 1.0,
        evaporationDeposit: true,
      },
    });

    // Load initial preset
    this.simulation.loadPreset(this.config.preset);

    // Initialize camera
    this.camera = {
      position: [0, this.config.size * 1.5, this.config.size * 1.2],
      target: [0, 0, 0],
      fov: 60,
    };

    // Initialize visualization
    this.visualization = {
      terrain: 'height',
      water: 'depth',
      sediment: 'suspended',
      wireframe: false,
    };

    // Initialize interaction
    this.interaction = {
      tool: 'inspect',
      brush: {
        radius: 5,
        strength: 2.0,
        falloff: 'smooth',
      },
      rainAmount: 10.0,
    };

    // Initialize statistics
    this.statistics = {
      fps: 0,
      frameTime: 0,
      triangles: 0,
      simTime: 0,
      simSteps: 0,
    };

    // Auto-start if configured
    if (this.config.autoStart) {
      this.start();
    }
  }

  /**
   * Start demo scene
   */
  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.fpsUpdateTime = this.lastFrameTime;

    this.runLoop();
  }

  /**
   * Stop demo scene
   */
  public stop(): void {
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.simulation.stop();
  }

  /**
   * Update scene (call from external render loop)
   */
  public update(deltaTime: number): void {
    const scaledDt = deltaTime * this.config.timeScale;

    // Update simulation
    if (scaledDt > 0) {
      this.simulation.step(scaledDt);
    }

    // Update statistics
    const simState = this.simulation.getState();
    this.statistics.simTime = simState.time;
    this.statistics.simSteps = simState.steps;

    // Update FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsUpdateTime >= 1000) {
      this.statistics.fps = Math.round((this.frameCount * 1000) / (now - this.fpsUpdateTime));
      this.frameCount = 0;
      this.fpsUpdateTime = now;
    }

    this.statistics.frameTime = deltaTime * 1000;
  }

  /**
   * Apply tool at grid coordinates
   */
  public applyTool(gridX: number, gridZ: number): void {
    const { tool, brush, rainAmount } = this.interaction;

    switch (tool) {
      case 'raise':
        this.simulation.raiseTerrain(gridX, gridZ, brush);
        break;

      case 'lower':
        this.simulation.lowerTerrain(gridX, gridZ, brush);
        break;

      case 'flatten': {
        const currentHeight = this.simulation.terrain.getHeightAtGrid(gridX, gridZ);
        this.simulation.flattenTerrain(gridX, gridZ, currentHeight, brush);
        break;
      }

      case 'smooth':
        this.simulation.smoothTerrain(gridX, gridZ, brush);
        break;

      case 'rain':
        this.simulation.addRainToRegion(gridX, gridZ, brush.radius, rainAmount);
        break;

      case 'inspect':
        // No action, just inspect
        break;
    }
  }

  /**
   * Get terrain mesh for rendering
   */
  public getTerrainMesh(): TerrainMesh {
    return this.simulation.terrain.generateMesh();
  }

  /**
   * Get water heightmap for visualization
   */
  public getWaterHeightmap(): Float32Array {
    const { resolution } = this.simulation.terrain.config;
    const heightmap = new Float32Array(resolution * resolution);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const waterCell = this.simulation.water.getWaterAt(x, z);
        heightmap[z * resolution + x] = waterCell?.height || 0;
      }
    }

    return heightmap;
  }

  /**
   * Get water velocity field for visualization
   */
  public getWaterVelocityField(): Float32Array {
    const { resolution } = this.simulation.terrain.config;
    const velocities = new Float32Array(resolution * resolution * 2);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = z * resolution + x;
        const waterCell = this.simulation.water.getWaterAt(x, z);

        if (waterCell) {
          velocities[idx * 2 + 0] = waterCell.velocity[0];
          velocities[idx * 2 + 1] = waterCell.velocity[1];
        }
      }
    }

    return velocities;
  }

  /**
   * Get sediment heightmap for visualization
   */
  public getSedimentHeightmap(type: 'suspended' | 'deposited' | 'both'): Float32Array {
    const { resolution } = this.simulation.terrain.config;
    const heightmap = new Float32Array(resolution * resolution);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const sedimentCell = this.simulation.sediment.getSedimentAt(x, z);
        const idx = z * resolution + x;

        if (!sedimentCell) {
          heightmap[idx] = 0;
          continue;
        }

        switch (type) {
          case 'suspended':
            heightmap[idx] = sedimentCell.suspended;
            break;
          case 'deposited':
            heightmap[idx] = sedimentCell.deposited;
            break;
          case 'both':
            heightmap[idx] = sedimentCell.suspended + sedimentCell.deposited;
            break;
        }
      }
    }

    return heightmap;
  }

  /**
   * Load preset
   */
  public loadPreset(preset: SimulationPreset): void {
    this.simulation.loadPreset(preset);
  }

  /**
   * Set visualization mode
   */
  public setVisualizationMode(mode: Partial<VisualizationMode>): void {
    this.visualization = { ...this.visualization, ...mode };
  }

  /**
   * Get visualization mode
   */
  public getVisualizationMode(): VisualizationMode {
    return { ...this.visualization };
  }

  /**
   * Set interaction mode
   */
  public setInteractionMode(mode: Partial<InteractionMode>): void {
    this.interaction = { ...this.interaction, ...mode };
  }

  /**
   * Get interaction mode
   */
  public getInteractionMode(): InteractionMode {
    return { ...this.interaction };
  }

  /**
   * Set camera configuration
   */
  public setCamera(camera: Partial<CameraConfig>): void {
    this.camera = { ...this.camera, ...camera };
  }

  /**
   * Get camera configuration
   */
  public getCamera(): CameraConfig {
    return { ...this.camera };
  }

  /**
   * Get scene statistics
   */
  public getStatistics(): SceneStatistics {
    // Update triangle count
    const mesh = this.getTerrainMesh();
    this.statistics.triangles = mesh.indices.length / 3;

    return { ...this.statistics };
  }

  /**
   * Get detailed statistics
   */
  public getDetailedStatistics(): {
    scene: SceneStatistics;
    terrain: ReturnType<typeof this.simulation.terrain.getStatistics>;
    water: ReturnType<typeof this.simulation.water.getStatistics>;
    sediment: ReturnType<typeof this.simulation.sediment.getStatistics>;
  } {
    return {
      scene: this.getStatistics(),
      terrain: this.simulation.terrain.getStatistics(),
      water: this.simulation.water.getStatistics(),
      sediment: this.simulation.sediment.getStatistics(),
    };
  }

  /**
   * Get information at grid coordinates
   */
  public getInfoAt(gridX: number, gridZ: number): {
    terrain: { height: number; slope: number; normal: [number, number, number] };
    water: { height: number; velocity: [number, number] } | null;
    sediment: { suspended: number; deposited: number } | null;
  } {
    const terrainHeight = this.simulation.terrain.getHeightAtGrid(gridX, gridZ);
    const slope = this.simulation.terrain.getSlopeAtGrid(gridX, gridZ);
    const normal = this.simulation.terrain.getNormalAtGrid(gridX, gridZ);

    const waterCell = this.simulation.water.getWaterAt(gridX, gridZ);
    const waterInfo =
      waterCell && waterCell.height > 0
        ? {
            height: waterCell.height,
            velocity: waterCell.velocity as [number, number],
          }
        : null;

    const sedimentCell = this.simulation.sediment.getSedimentAt(gridX, gridZ);
    const sedimentInfo =
      sedimentCell && (sedimentCell.suspended > 0 || sedimentCell.deposited > 0)
        ? {
            suspended: sedimentCell.suspended,
            deposited: sedimentCell.deposited,
          }
        : null;

    return {
      terrain: { height: terrainHeight, slope, normal },
      water: waterInfo,
      sediment: sedimentInfo,
    };
  }

  /**
   * Reset scene
   */
  public reset(): void {
    this.simulation.reset();
    this.statistics.simTime = 0;
    this.statistics.simSteps = 0;
  }

  /**
   * Set time scale
   */
  public setTimeScale(scale: number): void {
    this.config.timeScale = Math.max(0, scale);
  }

  /**
   * Get time scale
   */
  public getTimeScale(): number {
    return this.config.timeScale;
  }

  /**
   * Take snapshot
   */
  public saveSnapshot(description: string = ''): string {
    return this.simulation.saveSnapshot(description);
  }

  /**
   * Restore snapshot
   */
  public restoreSnapshot(id: string): boolean {
    return this.simulation.restoreSnapshot(id);
  }

  /**
   * Export scene state
   */
  public exportState(): {
    config: Required<DemoSceneConfig>;
    camera: CameraConfig;
    visualization: VisualizationMode;
    interaction: InteractionMode;
    simulation: ReturnType<typeof this.simulation.exportState>;
  } {
    return {
      config: { ...this.config },
      camera: { ...this.camera },
      visualization: { ...this.visualization },
      interaction: { ...this.interaction },
      simulation: this.simulation.exportState(),
    };
  }

  /**
   * Import scene state
   */
  public importState(state: ReturnType<typeof this.exportState>): void {
    this.camera = { ...state.camera };
    this.visualization = { ...state.visualization };
    this.interaction = { ...state.interaction };
    this.simulation.importState(state.simulation);
  }

  /**
   * Internal render loop
   */
  private runLoop = (): void => {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    // Cap delta time
    const cappedDt = Math.min(deltaTime, 0.1);

    // Update scene
    this.update(cappedDt);

    this.animationFrameId = requestAnimationFrame(this.runLoop);
  };
}
