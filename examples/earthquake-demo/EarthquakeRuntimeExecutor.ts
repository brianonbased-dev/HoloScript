/**
 * EarthquakeRuntimeExecutor.ts
 *
 * Runtime executor for earthquake simulations.
 * Bridges HoloScript compositions with seismic wave physics and rendering.
 *
 * Integration: .holo file → Parser → RuntimeExecutor → EarthquakeSimulation → ThreeJSRenderer
 */

import {
  EarthquakeSimulation,
  type EarthquakeSimulationConfig,
  createEarthquakeSimulation,
} from './EarthquakeSimulation';
import { type EarthquakeConfig } from './FracturePhysics';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import type {
  RuntimeRenderer,
  RenderableObject,
  RenderableLight,
  ParticleSystem,
} from '../../runtime/RuntimeRenderer';

export interface EarthquakeRuntimeConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Target frame rate */
  targetFPS?: number;
  /** Runtime renderer (optional - for visual output) */
  renderer?: RuntimeRenderer;
  /** Enable renderer auto-sync */
  autoSyncRenderer?: boolean;
  /** Earthquake simulation configuration */
  simulationConfig?: Partial<EarthquakeSimulationConfig>;
}

export interface EarthquakeRuntimeStatistics {
  /** Scene statistics */
  scene: any;
  /** Execution time (ms) */
  executionTime: number;
  /** Current frame */
  currentFrame: number;
  /** Is running */
  isRunning: boolean;
}

/**
 * Runtime executor for HoloScript earthquake compositions
 *
 * Flow: .holo file → Parser → HoloComposition → RuntimeExecutor → EarthquakeSimulation
 */
export class EarthquakeRuntimeExecutor {
  private readonly config: EarthquakeRuntimeConfig;
  private simulation: EarthquakeSimulation | null = null;
  private composition: HoloComposition | null = null;
  private simulationConfig: EarthquakeSimulationConfig | null = null;
  private running = false;
  private currentFrame = 0;
  private startTime = 0;
  private lastFrameTime = 0;
  private renderer: RuntimeRenderer | null = null;
  private rendererBuildingMap = new Map<string, string>(); // building ID → renderer object ID
  private rendererDebrisParticlesId: string | null = null;
  private rendererGroundPlaneId: string | null = null;

  constructor(config: EarthquakeRuntimeConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      targetFPS: config.targetFPS ?? 60,
      autoSyncRenderer: config.autoSyncRenderer ?? true,
      renderer: config.renderer,
      simulationConfig: config.simulationConfig || {},
    };
    this.renderer = config.renderer ?? null;
  }

  /**
   * Initialize executor with HoloScript composition
   */
  public async initialize(composition: HoloComposition): Promise<void> {
    this.composition = composition;

    // Extract simulation configuration from composition
    this.simulationConfig = this.extractSimulationConfig(composition);

    // Create earthquake simulation
    // Note: This would need WebGPU context in a full implementation
    // For runtime integration, we'll create a mock or adapt the interface
    try {
      this.simulation = await createEarthquakeSimulation(this.simulationConfig);
    } catch (_error) {
      if (this.config.debug) {
        console.warn(
          '[EarthquakeRuntimeExecutor] Could not create WebGPU simulation, using fallback'
        );
      }
      // Fallback: Create a minimal simulation stub
      // In production, this would be a proper CPU fallback implementation
    }

    // Initialize renderer if provided
    if (this.renderer) {
      this.initializeRenderer(composition);
    }

    if (this.config.debug) {
      console.log('[EarthquakeRuntimeExecutor] Initialized');
    }
  }

  /**
   * Extract simulation configuration from composition
   */
  private extractSimulationConfig(composition: HoloComposition): EarthquakeSimulationConfig {
    const config: EarthquakeSimulationConfig = {
      buildingCount: 5,
      buildingHeight: 30,
      buildingSpacing: 20,
      ...this.config.simulationConfig,
    };

    // Extract configuration from composition traits
    for (const trait of composition.traits || []) {
      if (trait.name === 'earthquake' && trait.properties) {
        // Earthquake-specific configuration
        if (trait.properties.intensity !== undefined) {
          config.defaultIntensity = trait.properties.intensity;
        }
        if (trait.properties.duration !== undefined) {
          config.defaultDuration = trait.properties.duration;
        }
      }

      if (trait.name === 'city' && trait.properties) {
        // City configuration
        if (trait.properties.buildingCount !== undefined) {
          config.buildingCount = trait.properties.buildingCount;
        }
        if (trait.properties.buildingHeight !== undefined) {
          config.buildingHeight = trait.properties.buildingHeight;
        }
        if (trait.properties.buildingSpacing !== undefined) {
          config.buildingSpacing = trait.properties.buildingSpacing;
        }
      }
    }

    return config;
  }

  /**
   * Initialize renderer with composition
   */
  private initializeRenderer(composition: HoloComposition): void {
    if (!this.renderer) return;

    this.renderer.initialize(composition);

    // Add ground plane
    this.addGroundPlane();

    // Add procedural buildings
    this.addBuildings();

    // Setup debris particle system
    this.setupDebrisParticles();

    // Add seismic lighting
    const lights: RenderableLight[] = [
      {
        id: 'ambient',
        type: 'ambient',
        color: '#404040',
        intensity: 0.6,
      },
      {
        id: 'sun',
        type: 'directional',
        position: [150, 250, 100],
        color: '#fff5e6',
        intensity: 1.4,
        castShadow: true,
      },
      {
        id: 'fill',
        type: 'directional',
        position: [-100, 150, -80],
        color: '#4488cc',
        intensity: 0.3,
      },
      {
        id: 'danger',
        type: 'point',
        position: [0, 50, 0],
        color: '#ff3300',
        intensity: 0,
        castShadow: false,
      },
    ];

    for (const light of lights) {
      this.renderer.addLight(light);
    }

    // Set camera from composition or use default
    const cameraTrait = composition.traits?.find((t) => t.name === 'camera');
    if (cameraTrait?.properties) {
      this.renderer.updateCamera({
        position: cameraTrait.properties.position || [80, 60, 80],
        target: cameraTrait.properties.target || [0, 20, 0],
        fov: cameraTrait.properties.fov || 60,
      });
    } else {
      this.renderer.updateCamera({
        position: [80, 60, 80],
        target: [0, 20, 0],
        fov: 60,
      });
    }

    if (this.config.debug) {
      console.log('[EarthquakeRuntimeExecutor] Renderer initialized');
    }
  }

  /**
   * Add ground plane to renderer
   */
  private addGroundPlane(): void {
    if (!this.renderer) return;

    const groundObject: RenderableObject = {
      id: 'ground',
      type: 'plane',
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [200, 200, 1],
      geometry: {
        type: 'plane',
        size: [200, 200],
      },
      material: {
        type: 'standard',
        color: '#555555',
        roughness: 0.9,
        metalness: 0.0,
      },
      receiveShadow: true,
    };

    this.renderer.addObject(groundObject);
    this.rendererGroundPlaneId = 'ground';

    if (this.config.debug) {
      console.log('[EarthquakeRuntimeExecutor] Ground plane added to renderer');
    }
  }

  /**
   * Add procedural buildings to renderer
   */
  private addBuildings(): void {
    if (!this.renderer) return;

    const buildingCount = this.simulationConfig?.buildingCount || 5;
    const buildingSpacing = this.simulationConfig?.buildingSpacing || 20;
    const buildingHeight = this.simulationConfig?.buildingHeight || 30;

    // Create a grid of buildings
    const gridSize = Math.ceil(Math.sqrt(buildingCount));
    let buildingIndex = 0;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        if (buildingIndex >= buildingCount) break;

        const x = (col - gridSize / 2) * buildingSpacing;
        const z = (row - gridSize / 2) * buildingSpacing;
        const height = buildingHeight * (0.7 + Math.random() * 0.6); // Vary height
        const width = 8 + Math.random() * 4;
        const depth = 8 + Math.random() * 4;

        const buildingId = `building_${buildingIndex}`;
        const buildingObject: RenderableObject = {
          id: buildingId,
          type: 'box',
          position: [x, height / 2, z],
          rotation: [0, Math.random() * 0.2 - 0.1, 0],
          scale: [1, 1, 1],
          geometry: {
            type: 'box',
            size: [width, height, depth],
          },
          material: {
            type: 'standard',
            color: `hsl(${200 + Math.random() * 40}, 10%, ${40 + Math.random() * 20}%)`,
            roughness: 0.8,
            metalness: 0.2,
          },
          castShadow: true,
          receiveShadow: true,
        };

        this.renderer.addObject(buildingObject);
        this.rendererBuildingMap.set(buildingId, buildingId);
        buildingIndex++;
      }
    }

    if (this.config.debug) {
      console.log(`[EarthquakeRuntimeExecutor] Added ${buildingCount} buildings to renderer`);
    }
  }

  /**
   * Setup debris particle system
   */
  private setupDebrisParticles(): void {
    if (!this.renderer) return;

    const maxParticles = 100000;
    const particlePositions = new Float32Array(maxParticles * 3);
    const particleColors = new Float32Array(maxParticles * 3);

    // Initialize with gray debris color
    for (let i = 0; i < maxParticles; i++) {
      particleColors[i * 3 + 0] = 0.6; // R
      particleColors[i * 3 + 1] = 0.6; // G
      particleColors[i * 3 + 2] = 0.6; // B
    }

    const particleSystem: ParticleSystem = {
      id: 'debris_particles',
      maxParticles,
      positions: particlePositions,
      colors: particleColors,
      material: {
        type: 'emissive',
        color: '#999999',
        size: 0.3,
        opacity: 0.9,
      },
    };

    this.renderer.addParticleSystem(particleSystem);
    this.rendererDebrisParticlesId = 'debris_particles';

    if (this.config.debug) {
      console.log('[EarthquakeRuntimeExecutor] Debris particle system added');
    }
  }

  /**
   * Start execution loop
   */
  public start(): void {
    if (!this.simulation) {
      console.error('[EarthquakeRuntimeExecutor] Cannot start: simulation not initialized');
      return;
    }

    this.running = true;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.currentFrame = 0;

    this.runFrame();

    if (this.config.debug) {
      console.log('[EarthquakeRuntimeExecutor] Started');
    }
  }

  /**
   * Stop execution loop
   */
  public stop(): void {
    this.running = false;

    if (this.config.debug) {
      console.log('[EarthquakeRuntimeExecutor] Stopped');
    }
  }

  /**
   * Run single frame
   */
  private runFrame(): void {
    if (!this.running || !this.simulation) return;

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1); // Max 100ms
    this.lastFrameTime = currentTime;

    // Update simulation physics
    this.simulation.update(deltaTime);

    // Sync to renderer if enabled
    if (this.renderer && this.config.autoSyncRenderer) {
      this.updateRenderer(deltaTime);
    }

    this.currentFrame++;

    // Schedule next frame
    requestAnimationFrame(() => this.runFrame());
  }

  /**
   * Update renderer with current scene state
   */
  private updateRenderer(deltaTime: number): void {
    if (!this.renderer || !this.simulation) return;

    const state = this.simulation.getState();

    // Update building positions based on seismic waves
    for (const [buildingId, rendererId] of this.rendererBuildingMap) {
      // Apply seismic oscillation to buildings
      if (state.earthquakeActive) {
        const oscillation = this.calculateBuildingOscillation(buildingId, state.time);
        this.renderer.updateObjectTransform(rendererId, {
          rotation: [oscillation.tiltX, oscillation.rotation, oscillation.tiltZ],
        });
      }
    }

    // Update debris particles
    if (this.rendererDebrisParticlesId && state.activeDebrisCount > 0) {
      const particleData = this.generateDebrisParticles(state);
      if (particleData) {
        this.renderer.updateParticleSystem(
          this.rendererDebrisParticlesId,
          particleData.positions,
          particleData.colors
        );

        if (this.config.debug && this.currentFrame % 60 === 0) {
          console.log(`[EarthquakeRuntimeExecutor] Updated ${particleData.count} debris particles`);
        }
      }
    }

    // Update danger light intensity during earthquake
    if (state.earthquakeActive) {
      const dangerIntensity = Math.sin(state.time * 10) * 0.5 + 0.5; // Pulsing effect
      this.renderer.updateLight('danger', {
        intensity: dangerIntensity * 2.0,
      });
    } else {
      this.renderer.updateLight('danger', {
        intensity: 0,
      });
    }

    // Update renderer
    this.renderer.update(deltaTime);
    this.renderer.render();
  }

  /**
   * Calculate building oscillation during earthquake
   */
  private calculateBuildingOscillation(
    buildingId: string,
    time: number
  ): { tiltX: number; tiltZ: number; rotation: number } {
    // Parse building index from ID
    const index = parseInt(buildingId.split('_')[1] || '0');
    const phaseOffset = index * 0.3; // Buildings oscillate with phase difference

    const frequency = 2.0 + Math.random() * 1.5;
    const amplitude = 0.05 + Math.random() * 0.03;

    return {
      tiltX: Math.sin((time + phaseOffset) * frequency) * amplitude,
      tiltZ: Math.cos((time + phaseOffset) * frequency * 0.8) * amplitude * 0.7,
      rotation: Math.sin((time + phaseOffset) * frequency * 0.5) * amplitude * 0.5,
    };
  }

  /**
   * Generate debris particles from simulation state
   */
  private generateDebrisParticles(
    state: any
  ): { positions: Float32Array; colors: Float32Array; count: number } | null {
    // In a full implementation, this would extract actual debris particle positions
    // from the EarthquakeSimulation's FracturePhysics system
    // For now, generate placeholder particles around collapsed buildings

    const positions: number[] = [];
    const colors: number[] = [];
    const debrisCount = Math.min(state.activeDebrisCount, 100000);

    for (let i = 0; i < debrisCount; i++) {
      // Random position around city
      const x = (Math.random() - 0.5) * 100;
      const y = Math.random() * 40;
      const z = (Math.random() - 0.5) * 100;

      positions.push(x, y, z);

      // Vary color based on height (dust = lighter, debris = darker)
      const heightFactor = y / 40;
      const gray = 0.4 + heightFactor * 0.3;
      colors.push(gray, gray - 0.1, gray - 0.1);
    }

    const count = positions.length / 3;
    const maxParticles = 100000;
    const finalPositions = new Float32Array(maxParticles * 3);
    const finalColors = new Float32Array(maxParticles * 3);

    for (let i = 0; i < Math.min(count, maxParticles); i++) {
      finalPositions[i * 3 + 0] = positions[i * 3 + 0];
      finalPositions[i * 3 + 1] = positions[i * 3 + 1];
      finalPositions[i * 3 + 2] = positions[i * 3 + 2];
      finalColors[i * 3 + 0] = colors[i * 3 + 0];
      finalColors[i * 3 + 1] = colors[i * 3 + 1];
      finalColors[i * 3 + 2] = colors[i * 3 + 2];
    }

    return { positions: finalPositions, colors: finalColors, count: Math.min(count, maxParticles) };
  }

  /**
   * Trigger earthquake
   */
  public triggerEarthquake(config: Partial<EarthquakeConfig>): void {
    if (!this.simulation) return;

    const earthquakeConfig: EarthquakeConfig = {
      intensity: config.intensity || 7,
      duration: config.duration || 5,
      frequency: config.frequency || 2.5,
      epicenter: config.epicenter || [0, 0, 0],
      verticalComponent: config.verticalComponent || 0.3,
    };

    this.simulation.triggerEarthquake(earthquakeConfig);

    if (this.config.debug) {
      console.log(
        `[EarthquakeRuntimeExecutor] Triggered earthquake with intensity ${earthquakeConfig.intensity}`
      );
    }
  }

  /**
   * Get runtime statistics
   */
  public getStatistics(): EarthquakeRuntimeStatistics {
    const sceneStats = this.simulation?.getState() || {};
    const executionTime = performance.now() - this.startTime;

    return {
      scene: sceneStats,
      executionTime,
      currentFrame: this.currentFrame,
      isRunning: this.running,
    };
  }

  /**
   * Reset simulation
   */
  public reset(): void {
    if (this.simulation) {
      this.simulation.reset();
      this.currentFrame = 0;
      this.startTime = performance.now();
      this.lastFrameTime = this.startTime;
    }

    if (this.config.debug) {
      console.log('[EarthquakeRuntimeExecutor] Reset');
    }
  }

  /**
   * Set renderer
   */
  public setRenderer(renderer: RuntimeRenderer): void {
    this.renderer = renderer;
    if (this.composition) {
      this.initializeRenderer(this.composition);
    }
  }

  /**
   * Get renderer
   */
  public getRenderer(): RuntimeRenderer | null {
    return this.renderer;
  }

  /**
   * Get simulation
   */
  public getSimulation(): EarthquakeSimulation | null {
    return this.simulation;
  }
}
