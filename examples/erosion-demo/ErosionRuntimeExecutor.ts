/**
 * ErosionRuntimeExecutor.ts
 *
 * Runtime executor for water erosion simulations.
 * Bridges HoloScript compositions with erosion physics and rendering.
 *
 * Integration: .holo file → Parser → RuntimeExecutor → ErosionDemoScene → ThreeJSRenderer
 */

import { ErosionDemoScene, type DemoSceneConfig } from './ErosionDemoScene';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import type {
  RuntimeRenderer,
  RenderableObject,
  RenderableLight,
  ParticleSystem,
} from '../../runtime/RuntimeRenderer';

export interface ErosionRuntimeConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Target frame rate */
  targetFPS?: number;
  /** Runtime renderer (optional - for visual output) */
  renderer?: RuntimeRenderer;
  /** Enable renderer auto-sync */
  autoSyncRenderer?: boolean;
  /** Erosion demo scene configuration */
  sceneConfig?: Partial<DemoSceneConfig>;
}

export interface ErosionRuntimeStatistics {
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
 * Runtime executor for HoloScript erosion compositions
 *
 * Flow: .holo file → Parser → HoloComposition → RuntimeExecutor → ErosionDemoScene
 */
export class ErosionRuntimeExecutor {
  private readonly config: ErosionRuntimeConfig;
  private scene: ErosionDemoScene | null = null;
  private composition: HoloComposition | null = null;
  private running = false;
  private currentFrame = 0;
  private startTime = 0;
  private lastFrameTime = 0;
  private renderer: RuntimeRenderer | null = null;
  private rendererTerrainId: string | null = null;
  private rendererWaterParticlesId: string | null = null;
  private rendererSedimentParticlesId: string | null = null;

  constructor(config: ErosionRuntimeConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      targetFPS: config.targetFPS ?? 60,
      autoSyncRenderer: config.autoSyncRenderer ?? true,
      renderer: config.renderer,
      sceneConfig: config.sceneConfig || {},
    };
    this.renderer = config.renderer ?? null;
  }

  /**
   * Initialize executor with HoloScript composition
   */
  public initialize(composition: HoloComposition): void {
    this.composition = composition;

    // Extract scene configuration from composition
    const sceneConfig = this.extractSceneConfig(composition);

    // Create erosion demo scene
    this.scene = new ErosionDemoScene(sceneConfig);

    // Initialize renderer if provided
    if (this.renderer) {
      this.initializeRenderer(composition);
    }

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Initialized');
    }
  }

  /**
   * Extract scene configuration from composition
   */
  private extractSceneConfig(composition: HoloComposition): DemoSceneConfig {
    const config: DemoSceneConfig = {
      resolution: 128,
      size: 100,
      preset: 'mountain',
      autoStart: false,
      timeScale: 1.0,
      ...this.config.sceneConfig,
    };

    // Extract configuration from composition traits
    for (const trait of composition.traits || []) {
      if (trait.name === 'erosion' && trait.properties) {
        // Erosion-specific configuration
        if (trait.properties.preset !== undefined) {
          config.preset = trait.properties.preset;
        }
        if (trait.properties.timeScale !== undefined) {
          config.timeScale = trait.properties.timeScale;
        }
      }

      if (trait.name === 'terrain' && trait.properties) {
        // Terrain configuration
        if (trait.properties.resolution !== undefined)
          config.resolution = trait.properties.resolution;
        if (trait.properties.size !== undefined) config.size = trait.properties.size;
      }
    }

    return config;
  }

  /**
   * Initialize renderer with composition
   */
  private initializeRenderer(composition: HoloComposition): void {
    if (!this.renderer || !this.scene) return;

    this.renderer.initialize(composition);

    // Add terrain mesh
    this.addTerrainToRenderer();

    // Setup water particle system
    this.setupWaterParticles();

    // Setup sediment particle system
    this.setupSedimentParticles();

    // Add default lighting
    const lights: RenderableLight[] = [
      {
        id: 'ambient',
        type: 'ambient',
        color: '#4488aa',
        intensity: 0.5,
      },
      {
        id: 'sun',
        type: 'directional',
        position: [100, 200, 100],
        color: '#ffffdd',
        intensity: 1.3,
        castShadow: true,
      },
      {
        id: 'fill',
        type: 'directional',
        position: [-80, 100, -60],
        color: '#6688aa',
        intensity: 0.4,
      },
    ];

    for (const light of lights) {
      this.renderer.addLight(light);
    }

    // Set camera from composition or use default
    const cameraTrait = composition.traits?.find((t) => t.name === 'camera');
    if (cameraTrait?.properties) {
      this.renderer.updateCamera({
        position: cameraTrait.properties.position || [0, 80, 100],
        target: cameraTrait.properties.target || [0, 0, 0],
        fov: cameraTrait.properties.fov || 60,
      });
    } else {
      this.renderer.updateCamera({
        position: [0, 80, 100],
        target: [0, 0, 0],
        fov: 60,
      });
    }

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Renderer initialized');
    }
  }

  /**
   * Add terrain to renderer
   */
  private addTerrainToRenderer(): void {
    if (!this.renderer || !this.scene) return;

    const terrainMesh = this.scene.getTerrainMesh();

    // Create terrain object with heightmap geometry
    const terrainObject: RenderableObject = {
      id: 'terrain',
      type: 'mesh',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      geometry: {
        type: 'mesh',
        vertices: terrainMesh.vertices,
        indices: terrainMesh.indices,
        normals: terrainMesh.normals,
      },
      material: {
        type: 'standard',
        color: '#8b7355',
        roughness: 0.95,
        metalness: 0.0,
      },
      receiveShadow: true,
      castShadow: true,
    };

    this.renderer.addObject(terrainObject);
    this.rendererTerrainId = 'terrain';

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Terrain added to renderer');
    }
  }

  /**
   * Setup water particle system
   */
  private setupWaterParticles(): void {
    if (!this.renderer) return;

    const maxParticles = 50000;
    const particlePositions = new Float32Array(maxParticles * 3);
    const particleColors = new Float32Array(maxParticles * 3);

    // Initialize with blue water color
    for (let i = 0; i < maxParticles; i++) {
      particleColors[i * 3 + 0] = 0.2; // R
      particleColors[i * 3 + 1] = 0.4; // G
      particleColors[i * 3 + 2] = 0.8; // B
    }

    const particleSystem: ParticleSystem = {
      id: 'water_particles',
      maxParticles,
      positions: particlePositions,
      colors: particleColors,
      material: {
        type: 'emissive',
        color: '#3366cc',
        size: 0.4,
        opacity: 0.7,
      },
    };

    this.renderer.addParticleSystem(particleSystem);
    this.rendererWaterParticlesId = 'water_particles';

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Water particle system added');
    }
  }

  /**
   * Setup sediment particle system
   */
  private setupSedimentParticles(): void {
    if (!this.renderer) return;

    const maxParticles = 30000;
    const particlePositions = new Float32Array(maxParticles * 3);
    const particleColors = new Float32Array(maxParticles * 3);

    // Initialize with brown sediment color
    for (let i = 0; i < maxParticles; i++) {
      particleColors[i * 3 + 0] = 0.6; // R
      particleColors[i * 3 + 1] = 0.4; // G
      particleColors[i * 3 + 2] = 0.2; // B
    }

    const particleSystem: ParticleSystem = {
      id: 'sediment_particles',
      maxParticles,
      positions: particlePositions,
      colors: particleColors,
      material: {
        type: 'emissive',
        color: '#996633',
        size: 0.2,
        opacity: 0.8,
      },
    };

    this.renderer.addParticleSystem(particleSystem);
    this.rendererSedimentParticlesId = 'sediment_particles';

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Sediment particle system added');
    }
  }

  /**
   * Start execution loop
   */
  public start(): void {
    if (!this.scene) {
      console.error('[ErosionRuntimeExecutor] Cannot start: scene not initialized');
      return;
    }

    this.running = true;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.currentFrame = 0;

    this.scene.start();
    this.runFrame();

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Started');
    }
  }

  /**
   * Stop execution loop
   */
  public stop(): void {
    this.running = false;

    if (this.scene) {
      this.scene.stop();
    }

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Stopped');
    }
  }

  /**
   * Run single frame
   */
  private runFrame(): void {
    if (!this.running || !this.scene) return;

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1); // Max 100ms
    this.lastFrameTime = currentTime;

    // Update scene physics
    this.scene.update(deltaTime);

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
    if (!this.renderer || !this.scene) return;

    // Update terrain mesh
    if (this.rendererTerrainId) {
      const _terrainMesh = this.scene.getTerrainMesh();
      // TODO: Update mesh geometry in renderer
      // this.renderer.updateMeshGeometry(this.rendererTerrainId, terrainMesh);
    }

    // Update water particles
    if (this.rendererWaterParticlesId) {
      const waterHeightmap = this.scene.getWaterHeightmap();
      const velocityField = this.scene.getWaterVelocityField();
      const particleData = this.generateWaterParticles(waterHeightmap, velocityField);

      if (particleData) {
        this.renderer.updateParticleSystem(
          this.rendererWaterParticlesId,
          particleData.positions,
          particleData.colors
        );

        if (this.config.debug && this.currentFrame % 60 === 0) {
          console.log(`[ErosionRuntimeExecutor] Updated ${particleData.count} water particles`);
        }
      }
    }

    // Update sediment particles
    if (this.rendererSedimentParticlesId) {
      const sedimentHeightmap = this.scene.getSedimentHeightmap('both');
      const particleData = this.generateSedimentParticles(sedimentHeightmap);

      if (particleData) {
        this.renderer.updateParticleSystem(
          this.rendererSedimentParticlesId,
          particleData.positions,
          particleData.colors
        );

        if (this.config.debug && this.currentFrame % 60 === 0) {
          console.log(`[ErosionRuntimeExecutor] Updated ${particleData.count} sediment particles`);
        }
      }
    }

    // Update renderer
    this.renderer.update(deltaTime);
    this.renderer.render();
  }

  /**
   * Generate water particles from heightmap and velocity field
   */
  private generateWaterParticles(
    heightmap: Float32Array,
    _velocityField: Float32Array
  ): { positions: Float32Array; colors: Float32Array; count: number } | null {
    if (!this.scene) return null;

    const resolution = this.scene.config.resolution;
    const size = this.scene.config.size;
    const cellSize = size / resolution;

    const positions: number[] = [];
    const colors: number[] = [];

    // Sample water heightmap and create particles
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = z * resolution + x;
        const waterHeight = heightmap[idx];

        // Only create particles where water exists
        if (waterHeight > 0.01) {
          const worldX = (x - resolution / 2) * cellSize;
          const worldZ = (z - resolution / 2) * cellSize;
          const terrainHeight = this.scene.simulation.terrain.getHeightAtGrid(x, z);
          const worldY = terrainHeight + waterHeight * 0.5; // Middle of water column

          positions.push(worldX, worldY, worldZ);

          // Color based on water depth (deeper = darker blue)
          const depthFactor = Math.min(waterHeight / 5.0, 1.0);
          colors.push(
            0.1 + depthFactor * 0.2, // R
            0.3 + depthFactor * 0.3, // G
            0.7 + depthFactor * 0.2 // B
          );
        }
      }
    }

    const count = positions.length / 3;
    const maxParticles = 50000;
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
   * Generate sediment particles from heightmap
   */
  private generateSedimentParticles(
    heightmap: Float32Array
  ): { positions: Float32Array; colors: Float32Array; count: number } | null {
    if (!this.scene) return null;

    const resolution = this.scene.config.resolution;
    const size = this.scene.config.size;
    const cellSize = size / resolution;

    const positions: number[] = [];
    const colors: number[] = [];

    // Sample sediment heightmap and create particles
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = z * resolution + x;
        const sedimentAmount = heightmap[idx];

        // Only create particles where sediment exists
        if (sedimentAmount > 0.001) {
          const worldX = (x - resolution / 2) * cellSize;
          const worldZ = (z - resolution / 2) * cellSize;
          const terrainHeight = this.scene.simulation.terrain.getHeightAtGrid(x, z);
          const worldY = terrainHeight + 0.1; // Slightly above terrain

          positions.push(worldX, worldY, worldZ);

          // Color based on sediment amount (more = darker brown)
          const amountFactor = Math.min(sedimentAmount / 2.0, 1.0);
          colors.push(
            0.6 - amountFactor * 0.2, // R
            0.4 - amountFactor * 0.2, // G
            0.2 - amountFactor * 0.1 // B
          );
        }
      }
    }

    const count = positions.length / 3;
    const maxParticles = 30000;
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
   * Add rain to terrain
   */
  public addRain(x: number, z: number, radius: number, amount: number): void {
    if (!this.scene) return;

    // Convert world coordinates to grid coordinates
    const resolution = this.scene.config.resolution;
    const size = this.scene.config.size;
    const cellSize = size / resolution;
    const gridX = Math.floor((x + size / 2) / cellSize);
    const gridZ = Math.floor((z + size / 2) / cellSize);

    this.scene.simulation.addRainToRegion(gridX, gridZ, radius, amount);

    if (this.config.debug) {
      console.log(
        `[ErosionRuntimeExecutor] Added rain at (${x}, ${z}) with radius ${radius}, amount ${amount}`
      );
    }
  }

  /**
   * Load preset
   */
  public loadPreset(preset: 'mountain' | 'valley' | 'plateau' | 'canyon' | 'plains'): void {
    if (!this.scene) return;

    this.scene.loadPreset(preset);

    if (this.config.debug) {
      console.log(`[ErosionRuntimeExecutor] Loaded preset: ${preset}`);
    }
  }

  /**
   * Get runtime statistics
   */
  public getStatistics(): ErosionRuntimeStatistics {
    const sceneStats = this.scene?.getStatistics() || {};
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
    if (this.scene) {
      this.scene.reset();
      this.currentFrame = 0;
      this.startTime = performance.now();
      this.lastFrameTime = this.startTime;
    }

    if (this.config.debug) {
      console.log('[ErosionRuntimeExecutor] Reset');
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
   * Get scene
   */
  public getScene(): ErosionDemoScene | null {
    return this.scene;
  }
}
