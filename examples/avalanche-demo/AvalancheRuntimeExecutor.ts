/**
 * AvalancheRuntimeExecutor.ts
 *
 * Runtime executor for avalanche simulations.
 * Bridges HoloScript compositions with avalanche physics and rendering.
 *
 * Integration: .holo file → Parser → RuntimeExecutor → AvalancheDemoScene → ThreeJSRenderer
 */

import { AvalancheDemoScene, type AvalancheDemoSceneConfig } from './AvalancheDemoScene';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import type {
  RuntimeRenderer,
  RenderableObject,
  RenderableLight,
  ParticleSystem,
} from '../../runtime/RuntimeRenderer';

export interface AvalancheRuntimeConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Target frame rate */
  targetFPS?: number;
  /** Runtime renderer (optional - for visual output) */
  renderer?: RuntimeRenderer;
  /** Enable renderer auto-sync */
  autoSyncRenderer?: boolean;
  /** Avalanche demo scene configuration */
  sceneConfig?: Partial<AvalancheDemoSceneConfig>;
}

export interface AvalancheRuntimeStatistics {
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
 * Runtime executor for HoloScript avalanche compositions
 *
 * Flow: .holo file → Parser → HoloComposition → RuntimeExecutor → AvalancheDemoScene
 */
export class AvalancheRuntimeExecutor {
  private readonly config: AvalancheRuntimeConfig;
  private scene: AvalancheDemoScene | null = null;
  private composition: HoloComposition | null = null;
  private running = false;
  private currentFrame = 0;
  private startTime = 0;
  private lastFrameTime = 0;
  private renderer: RuntimeRenderer | null = null;
  private rendererParticleSystemId: string | null = null;
  private rendererTerrainId: string | null = null;

  constructor(config: AvalancheRuntimeConfig = {}) {
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

    // Create avalanche demo scene
    this.scene = new AvalancheDemoScene(sceneConfig);

    // Initialize renderer if provided
    if (this.renderer) {
      this.initializeRenderer(composition);
    }

    if (this.config.debug) {
      console.log('[AvalancheRuntimeExecutor] Initialized');
    }
  }

  /**
   * Extract scene configuration from composition
   */
  private extractSceneConfig(composition: HoloComposition): Partial<AvalancheDemoSceneConfig> {
    const config: Partial<AvalancheDemoSceneConfig> = {
      ...this.config.sceneConfig,
    };

    // Extract configuration from composition traits
    for (const trait of composition.traits || []) {
      if (trait.name === 'avalanche' && trait.properties) {
        // Avalanche-specific configuration
        if (trait.properties.gravity !== undefined) {
          config.physics = config.physics || {};
          config.physics.gravity = trait.properties.gravity;
        }
        if (trait.properties.friction !== undefined) {
          config.physics = config.physics || {};
          config.physics.frictionCoefficient = trait.properties.friction;
        }
      }

      if (trait.name === 'terrain' && trait.properties) {
        // Terrain configuration
        config.terrain = config.terrain || {};
        if (trait.properties.width !== undefined) config.terrain.width = trait.properties.width;
        if (trait.properties.depth !== undefined) config.terrain.depth = trait.properties.depth;
        if (trait.properties.seed !== undefined) config.terrain.seed = trait.properties.seed;
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
    const terrainData = this.scene.getTerrainData();
    if (terrainData) {
      this.addTerrainToRenderer(terrainData);
    }

    // Setup particle system for snow/debris
    const maxParticles = 50000;
    const particlePositions = new Float32Array(maxParticles * 3);
    const particleColors = new Float32Array(maxParticles * 3);

    const particleSystem: ParticleSystem = {
      id: 'avalanche_particles',
      maxParticles,
      positions: particlePositions,
      colors: particleColors,
      material: {
        type: 'emissive',
        color: '#ffffff',
        size: 0.3,
        opacity: 0.9,
      },
    };

    this.renderer.addParticleSystem(particleSystem);
    this.rendererParticleSystemId = 'avalanche_particles';

    // Add default lighting
    const lights: RenderableLight[] = [
      {
        id: 'ambient',
        type: 'ambient',
        color: '#505050',
        intensity: 0.6,
      },
      {
        id: 'sun',
        type: 'directional',
        position: [100, 200, 100],
        color: '#ffffff',
        intensity: 1.2,
        castShadow: true,
      },
    ];

    for (const light of lights) {
      this.renderer.addLight(light);
    }

    if (this.config.debug) {
      console.log('[AvalancheRuntimeExecutor] Renderer initialized');
    }
  }

  /**
   * Add terrain to renderer
   */
  private addTerrainToRenderer(terrainData: any): void {
    if (!this.renderer) return;

    // Create a simplified terrain mesh for rendering
    // In a full implementation, this would create a proper terrain mesh
    const terrainObject: RenderableObject = {
      id: 'terrain',
      type: 'plane',
      position: [50, 0, 50],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [100, 100, 1],
      geometry: {
        type: 'plane',
        size: [100, 100],
      },
      material: {
        type: 'standard',
        color: '#d4d4d4',
        roughness: 0.9,
      },
      receiveShadow: true,
    };

    this.renderer.addObject(terrainObject);
    this.rendererTerrainId = 'terrain';

    if (this.config.debug) {
      console.log('[AvalancheRuntimeExecutor] Terrain added to renderer');
    }
  }

  /**
   * Start execution loop
   */
  public start(): void {
    if (!this.scene) {
      console.error('[AvalancheRuntimeExecutor] Cannot start: scene not initialized');
      return;
    }

    this.running = true;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.currentFrame = 0;

    this.runFrame();

    if (this.config.debug) {
      console.log('[AvalancheRuntimeExecutor] Started');
    }
  }

  /**
   * Stop execution loop
   */
  public stop(): void {
    this.running = false;

    if (this.config.debug) {
      console.log('[AvalancheRuntimeExecutor] Stopped');
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

    // Update particle system
    if (this.rendererParticleSystemId) {
      const particleData = this.scene.getParticleData();
      if (particleData) {
        this.renderer.updateParticleSystem(
          this.rendererParticleSystemId,
          particleData.positions,
          particleData.colors
        );

        if (this.config.debug && this.currentFrame % 60 === 0) {
          console.log(
            `[AvalancheRuntimeExecutor] Synced ${particleData.count} particles to renderer`
          );
        }
      }
    }

    // Update renderer
    this.renderer.update(deltaTime);
    this.renderer.render();
  }

  /**
   * Trigger avalanche at position
   */
  public triggerAvalanche(x: number, y: number, z: number, radius: number = 10): void {
    if (!this.scene) return;

    this.scene.triggerAvalanche({ x, y, z }, radius);

    if (this.config.debug) {
      console.log(
        `[AvalancheRuntimeExecutor] Triggered avalanche at (${x}, ${y}, ${z}) with radius ${radius}`
      );
    }
  }

  /**
   * Get runtime statistics
   */
  public getStatistics(): AvalancheRuntimeStatistics {
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
      console.log('[AvalancheRuntimeExecutor] Reset');
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
  public getScene(): AvalancheDemoScene | null {
    return this.scene;
  }
}
