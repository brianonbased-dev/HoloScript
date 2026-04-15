/**
 * DemolitionRuntimeExecutor.ts
 *
 * Runtime executor that consumes HoloScript compositions
 * and drives the demolition demo runtime.
 *
 * This bridges HoloScript language → Runtime execution
 */

import { DemolitionDemoScene } from './DemolitionDemoScene';
import { Fracturable, MATERIALS } from './Fracturable';
import type { Vector3 } from './Fragment';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import type {
  RuntimeRenderer,
  RenderableObject,
  RenderableLight,
  ParticleSystem,
} from '../../runtime/RuntimeRenderer';

export interface RuntimeExecutorConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Target frame rate */
  targetFPS?: number;
  /** Enable auto-play for timelines */
  autoPlay?: boolean;
  /** Runtime renderer (optional - for visual output) */
  renderer?: RuntimeRenderer;
  /** Enable renderer auto-sync */
  autoSyncRenderer?: boolean;
}

export interface RuntimeExecutorStatistics {
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
 * Runtime executor for HoloScript demolition compositions
 *
 * Flow: .holo file → Parser → HoloComposition → RuntimeExecutor → DemolitionDemoScene
 */
export class DemolitionRuntimeExecutor {
  private readonly config: RuntimeExecutorConfig;
  private scene: DemolitionDemoScene | null = null;
  private composition: HoloComposition | null = null;
  private running = false;
  private currentFrame = 0;
  private startTime = 0;
  private lastFrameTime = 0;
  private renderer: RuntimeRenderer | null = null;
  private rendererObjectMap = new Map<string, string>(); // scene object ID → renderer object ID
  private rendererFragmentMap = new Map<string, string>(); // fragment ID → renderer object ID
  private rendererParticleSystemId: string | null = null;
  private objectMaterials = new Map<string, { type: string; color: string }>(); // object ID → material
  private lastFracturedObjectMaterial: { type: string; color: string } = {
    type: 'concrete',
    color: '#808080',
  };
  private rendererStructuralMap = new Map<string, string>(); // structural element ID → renderer object ID
  private enableStructuralVisualization = false;

  constructor(config: RuntimeExecutorConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      targetFPS: config.targetFPS ?? 60,
      autoPlay: config.autoPlay ?? true,
      autoSyncRenderer: config.autoSyncRenderer ?? true,
      renderer: config.renderer,
    };
    this.renderer = config.renderer ?? null;
  }

  /**
   * Load and execute HoloScript composition
   */
  public loadComposition(composition: HoloComposition): void {
    this.composition = composition;

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Loading composition:', composition.name);
    }

    // Initialize scene from composition
    this.scene = this.initializeScene(composition);

    // Initialize renderer if provided
    if (this.renderer) {
      this.initializeRenderer(composition);
    }

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Scene initialized');
    }
  }

  /**
   * Initialize renderer from composition
   */
  private initializeRenderer(composition: HoloComposition): void {
    if (!this.renderer) return;

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Initializing renderer');
    }

    this.renderer.initialize(composition);

    // Sync initial scene state to renderer
    this.syncSceneToRenderer();

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Renderer initialized');
    }
  }

  /**
   * Map material density to visual material type
   */
  private getMaterialFromDensity(density: number): { type: string; color: string } {
    if (density >= 7000) return { type: 'metal', color: '#888888' }; // Steel/Metal
    if (density >= 2200) return { type: 'concrete', color: '#808080' }; // Concrete
    if (density >= 1500) return { type: 'brick', color: '#b85450' }; // Brick
    if (density >= 700) return { type: 'wood', color: '#8b6f47' }; // Wood
    return { type: 'stone', color: '#a0a0a0' }; // Default/Stone
  }

  /**
   * Sync scene objects to renderer
   */
  private syncSceneToRenderer(): void {
    if (!this.renderer || !this.scene) return;

    const objects = this.scene.getObjects();
    const stats = this.scene.getStatistics();

    if (this.config.debug) {
      console.log(`[HoloScript Runtime] Syncing ${objects.length} objects to renderer`);
    }

    // Add objects to renderer
    for (const object of objects) {
      // Get material from object density
      const material = this.getMaterialFromDensity(object.material.density);
      this.objectMaterials.set(object.id, material);

      const renderableObject: RenderableObject = {
        id: object.id,
        type: 'box', // Default to box geometry
        position: [object.position.x, object.position.y, object.position.z],
        rotation: object.rotation
          ? [object.rotation.x, object.rotation.y, object.rotation.z]
          : [0, 0, 0],
        scale: [1, 1, 1],
        geometry: {
          type: 'box',
          size: [
            object.geometry.max.x - object.geometry.min.x,
            object.geometry.max.y - object.geometry.min.y,
            object.geometry.max.z - object.geometry.min.z,
          ],
        },
        material,
      };

      this.renderer.addObject(renderableObject);
      this.rendererObjectMap.set(object.id, object.id);
    }

    // Setup particle system if debris particles exist
    if (stats.totalParticles > 0) {
      const maxParticles = 120000; // Match renderer capacity
      const particlePositions = new Float32Array(maxParticles * 3);
      const particleColors = new Float32Array(maxParticles * 3);

      const particleSystem: ParticleSystem = {
        id: 'debris_particles',
        maxParticles,
        positions: particlePositions,
        colors: particleColors,
        material: {
          type: 'emissive',
          color: '#ff6600',
          size: 0.1,
          opacity: 0.8,
        },
      };

      this.renderer.addParticleSystem(particleSystem);
      this.rendererParticleSystemId = 'debris_particles';

      if (this.config.debug) {
        console.log('[HoloScript Runtime] Particle system added to renderer');
      }
    }

    // Add default lighting
    const lights: RenderableLight[] = [
      {
        id: 'ambient',
        type: 'ambient',
        color: '#404040',
        intensity: 0.5,
      },
      {
        id: 'directional',
        type: 'directional',
        position: [50, 100, 50],
        color: '#ffffff',
        intensity: 1.0,
        castShadow: true,
      },
    ];

    for (const light of lights) {
      this.renderer.addLight(light);
    }

    // Update camera from composition
    const cameraTrait = this.composition?.traits?.find((t) => t.name === 'camera');
    if (cameraTrait?.properties) {
      const camProps = cameraTrait.properties;
      this.renderer.updateCamera({
        position: camProps.position || [0, 20, 50],
        target: camProps.target || [0, 10, 0],
        fov: camProps.fov || 60,
      });
    }
  }

  /**
   * Update renderer with current scene state
   */
  private updateRenderer(deltaTime: number): void {
    if (!this.renderer || !this.scene || !this.config.autoSyncRenderer) return;

    // Check for removed objects (fractured) and save their materials
    const currentObjects = this.scene.getObjects();
    const currentObjectIds = new Set(currentObjects.map((obj) => obj.id));

    for (const [objectId, rendererId] of this.rendererObjectMap) {
      if (!currentObjectIds.has(objectId)) {
        // Object was removed (fractured) - save its material for fragments
        const material = this.objectMaterials.get(objectId);
        if (material) {
          this.lastFracturedObjectMaterial = material;
        }
        // Remove from renderer and cleanup
        this.renderer.removeObject(rendererId);
        this.rendererObjectMap.delete(objectId);
        this.objectMaterials.delete(objectId);
      }
    }

    // Update remaining object transforms
    for (const object of currentObjects) {
      const rendererId = this.rendererObjectMap.get(object.id);
      if (rendererId) {
        this.renderer.updateObjectTransform(rendererId, {
          position: [object.position.x, object.position.y, object.position.z],
          rotation: object.rotation
            ? [object.rotation.x, object.rotation.y, object.rotation.z]
            : [0, 0, 0],
        });
      }
    }

    // Update particle system positions
    if (this.rendererParticleSystemId) {
      const particleData = this.scene.getParticleData();
      if (particleData) {
        this.renderer.updateParticleSystem(
          this.rendererParticleSystemId,
          particleData.positions,
          particleData.colors
        );

        if (this.config.debug && this.currentFrame % 60 === 0) {
          console.log(`[HoloScript Runtime] Synced ${particleData.count} particles to renderer`);
        }
      }
    }

    // Sync fragments (add new, update existing, remove inactive)
    this.syncFragmentsToRenderer();

    // Sync structural elements with color-coded load visualization
    this.syncStructuralElementsToRenderer();

    // Update renderer
    this.renderer.update(deltaTime);
    this.renderer.render();
  }

  /**
   * Sync fragments to renderer
   * Adds new fragments, updates transforms, removes deactivated ones
   */
  private syncFragmentsToRenderer(): void {
    if (!this.renderer || !this.scene) return;

    const fragments = this.scene.getFragments();

    // Track fragments to remove (no longer in scene)
    const activeFragmentIds = new Set<string>();

    for (const fragment of fragments) {
      activeFragmentIds.add(fragment.id);

      // Add new fragments to renderer
      if (!this.rendererFragmentMap.has(fragment.id)) {
        const renderableFragment: RenderableObject = {
          id: fragment.id,
          type: 'box',
          position: [
            fragment.physics.position.x,
            fragment.physics.position.y,
            fragment.physics.position.z,
          ],
          rotation: fragment.physics.rotation
            ? [
                fragment.physics.rotation.x,
                fragment.physics.rotation.y,
                fragment.physics.rotation.z,
              ]
            : [0, 0, 0],
          scale: [1, 1, 1],
          geometry: {
            type: 'box',
            size: [
              fragment.geometry.max.x - fragment.geometry.min.x,
              fragment.geometry.max.y - fragment.geometry.min.y,
              fragment.geometry.max.z - fragment.geometry.min.z,
            ],
          },
          material: this.lastFracturedObjectMaterial, // Inherit from parent object
          castShadow: true,
          receiveShadow: true,
        };

        this.renderer.addObject(renderableFragment);
        this.rendererFragmentMap.set(fragment.id, fragment.id);

        if (this.config.debug) {
          console.log(
            `[HoloScript Runtime] Added fragment ${fragment.id} with material ${this.lastFracturedObjectMaterial.type}`
          );
        }
      } else {
        // Update existing fragment transforms
        this.renderer.updateObjectTransform(fragment.id, {
          position: [
            fragment.physics.position.x,
            fragment.physics.position.y,
            fragment.physics.position.z,
          ],
          rotation: fragment.physics.rotation
            ? [
                fragment.physics.rotation.x,
                fragment.physics.rotation.y,
                fragment.physics.rotation.z,
              ]
            : [0, 0, 0],
        });
      }
    }

    // Remove deactivated fragments from renderer
    for (const [fragmentId, rendererId] of this.rendererFragmentMap) {
      if (!activeFragmentIds.has(fragmentId)) {
        this.renderer.removeObject(rendererId);
        this.rendererFragmentMap.delete(fragmentId);

        if (this.config.debug) {
          console.log(`[HoloScript Runtime] Removed fragment ${fragmentId} from renderer`);
        }
      }
    }

    // Debug logging
    if (this.config.debug && this.currentFrame % 60 === 0 && fragments.length > 0) {
      console.log(`[HoloScript Runtime] Syncing ${fragments.length} fragments to renderer`);
    }
  }

  /**
   * Get color based on structural load percentage (0-1)
   * Green (safe) → Yellow (warning) → Orange (danger) → Red (critical)
   */
  private getLoadColor(loadPercentage: number, hasFailed: boolean): string {
    if (hasFailed) return '#ff0000'; // Red - failed

    if (loadPercentage < 0.5) {
      // Green → Yellow (0% - 50%)
      const t = loadPercentage * 2; // 0-1
      const r = Math.floor(0 + 255 * t);
      const g = 255;
      const b = 0;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } else if (loadPercentage < 0.8) {
      // Yellow → Orange (50% - 80%)
      const t = (loadPercentage - 0.5) / 0.3; // 0-1
      const r = 255;
      const g = Math.floor(255 - 90 * t); // 255 → 165
      const b = 0;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } else {
      // Orange → Red (80% - 100%)
      const t = (loadPercentage - 0.8) / 0.2; // 0-1
      const r = 255;
      const g = Math.floor(165 - 165 * t); // 165 → 0
      const b = 0;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }

  /**
   * Sync structural elements to renderer with color-coded load visualization
   */
  private syncStructuralElementsToRenderer(): void {
    if (!this.renderer || !this.scene || !this.enableStructuralVisualization) return;

    const elements = this.scene.getStructuralElements();

    for (const element of elements) {
      const loadPercentage = element.getLoadPercentage();
      const loadColor = this.getLoadColor(loadPercentage, element.hasFailed());

      if (!this.rendererStructuralMap.has(element.id)) {
        // Add new structural element
        const renderableElement: RenderableObject = {
          id: element.id,
          type: 'box',
          position: [element.position.x, element.position.y, element.position.z],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          geometry: {
            type: 'box',
            size: [element.size.x, element.size.y, element.size.z],
          },
          material: {
            type: 'emissive', // Use emissive to show color clearly
            color: loadColor,
            opacity: 0.7, // Semi-transparent
          },
          castShadow: false,
          receiveShadow: false,
        };

        this.renderer.addObject(renderableElement);
        this.rendererStructuralMap.set(element.id, element.id);

        if (this.config.debug) {
          console.log(
            `[HoloScript Runtime] Added structural element ${element.id} with load ${(loadPercentage * 100).toFixed(0)}%`
          );
        }
      } else {
        // Update element color based on load
        // Note: This requires adding updateObjectMaterial() to RuntimeRenderer interface
        // For now, we can just update the whole object
        // Planned: add updateObjectMaterial() on RuntimeRenderer when API exists
        if (this.config.debug && this.currentFrame % 60 === 0) {
          console.log(
            `[HoloScript Runtime] Element ${element.id} load: ${(loadPercentage * 100).toFixed(0)}%`
          );
        }
      }
    }
  }

  /**
   * Enable/disable structural damage visualization
   */
  public enableStructuralDamageVisualization(enable: boolean): void {
    this.enableStructuralVisualization = enable;

    if (enable) {
      // Immediately sync all elements
      this.syncStructuralElementsToRenderer();
    } else {
      // Remove all structural elements from renderer
      for (const [_elementId, rendererId] of this.rendererStructuralMap) {
        this.renderer?.removeObject(rendererId);
      }
      this.rendererStructuralMap.clear();
    }

    if (this.config.debug) {
      console.log(
        `[HoloScript Runtime] Structural visualization: ${enable ? 'enabled' : 'disabled'}`
      );
    }
  }

  /**
   * Initialize demolition scene from composition
   */
  private initializeScene(composition: HoloComposition): DemolitionDemoScene {
    // Extract scene configuration from composition
    const sceneConfig = this.extractSceneConfig(composition);

    // Create demo scene
    const scene = new DemolitionDemoScene(sceneConfig);

    // Build entities from composition
    this.buildEntities(composition, scene);

    // Setup behaviors
    this.setupBehaviors(composition, scene);

    // Setup timelines
    this.setupTimelines(composition, scene);

    return scene;
  }

  /**
   * Extract scene configuration from composition
   */
  private extractSceneConfig(composition: HoloComposition): any {
    // Default configuration
    const config: any = {
      physics: {},
      structural: {},
      camera: {},
      scenario: 'sandbox',
    };

    // Extract from traits
    for (const trait of composition.traits) {
      if (trait.name === 'physics') {
        config.physics = this.extractPhysicsConfig(trait);
      } else if (trait.name === 'camera') {
        config.camera = this.extractCameraConfig(trait);
      } else if (trait.name === 'structural') {
        config.structural = trait.properties;
      }
    }

    return config;
  }

  /**
   * Extract physics configuration
   */
  private extractPhysicsConfig(trait: any): any {
    const config: any = {};

    if (trait.properties?.gravity) {
      const gravity = trait.properties.gravity;
      config.gravity = {
        x: gravity[0] ?? 0,
        y: gravity[1] ?? -9.8,
        z: gravity[2] ?? 0,
      };
    }

    if (trait.properties?.timeScale) {
      config.timeScale = trait.properties.timeScale;
    }

    if (trait.properties?.demolition) {
      const demolition = trait.properties.demolition;
      config.maxFragments = demolition.maxFragments;
      config.maxDebrisParticles = demolition.maxParticles;
      config.particlesPerUnitVolume = demolition.particlesPerVolume;
    }

    return config;
  }

  /**
   * Extract camera configuration
   */
  private extractCameraConfig(trait: any): any {
    const config: any = {};

    if (trait.properties?.position) {
      const pos = trait.properties.position;
      config.position = { x: pos[0], y: pos[1], z: pos[2] };
    }

    if (trait.properties?.target) {
      const target = trait.properties.target;
      config.target = { x: target[0], y: target[1], z: target[2] };
    }

    if (trait.properties?.fov) {
      config.fov = trait.properties.fov;
    }

    if (trait.properties?.effects) {
      const effects = trait.properties.effects;
      if (effects.shake) {
        config.shakeIntensity = effects.shake.intensity ?? 1.0;
        config.shakeDecay = effects.shake.decay ?? 0.9;
      }
      if (effects.autoFollow !== undefined) {
        config.autoFollow = effects.autoFollow;
      }
    }

    return config;
  }

  /**
   * Build entities from composition
   */
  private buildEntities(composition: HoloComposition, scene: DemolitionDemoScene): void {
    for (const entity of composition.entities) {
      if (entity.type === 'structure') {
        this.buildStructuralEntity(entity, scene);
      } else if (entity.type === 'fracturable') {
        this.buildFracturableEntity(entity, scene);
      }
    }
  }

  /**
   * Build structural entity (building)
   */
  private buildStructuralEntity(entity: any, scene: DemolitionDemoScene): void {
    const structural = entity.traits?.find((t: any) => t.name === 'structural');
    if (!structural) return;

    const props = structural.properties;
    const _floors = props.floors ?? 3;
    const columnsPerFloor = props.columnsPerFloor ?? 4;
    const columnSpacing = props.columnSpacing ?? 5.0;

    const position = this.parseVector3(entity.position ?? [0, 0, 0]);

    // Build similar to setupBuildingCollapse()
    // Foundation
    const _foundations: string[] = [];
    for (let i = 0; i < columnsPerFloor; i++) {
      const _x = position.x + (i - columnsPerFloor / 2) * columnSpacing;
      const _foundation = scene.getStructuralElements().find(() => true); // Placeholder
      // Would call scene.structural.addElement() but scene doesn't expose structural
      // This is a limitation - need to expose structural system
    }

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Built structural entity:', entity.name);
    }
  }

  /**
   * Build fracturable entity
   */
  private buildFracturableEntity(entity: any, scene: DemolitionDemoScene): void {
    const fracturable = entity.traits?.find((t: any) => t.name === 'fracturable');
    if (!fracturable) return;

    const props = fracturable.properties;
    const count = entity.count ?? 1;
    const distribution = entity.distribution ?? 'linear';
    const radius = entity.radius ?? 10;

    for (let i = 0; i < count; i++) {
      let position: Vector3;

      if (distribution === 'circular') {
        const angle = (i / count) * Math.PI * 2;
        position = {
          x: Math.cos(angle) * radius,
          y: 3,
          z: Math.sin(angle) * radius,
        };
      } else {
        position = { x: i * 5, y: 5, z: 0 };
      }

      const geometry = props.geometry || {};
      const size = geometry.size || [2, 2, 2];
      const halfSize = [size[0] / 2, size[1] / 2, size[2] / 2];

      const material = props.material || {};
      const materialType = material.type || 'concrete';
      const materialProps =
        MATERIALS[materialType.toUpperCase() as keyof typeof MATERIALS] || MATERIALS.CONCRETE;

      const _object = new Fracturable({
        id: `${entity.name}_${i}`,
        geometry: {
          min: { x: -halfSize[0], y: -halfSize[1], z: -halfSize[2] },
          max: { x: halfSize[0], y: halfSize[1], z: halfSize[2] },
        },
        material: {
          ...materialProps,
          fractureThreshold: material.fractureThreshold ?? materialProps.fractureThreshold,
        },
        position,
        fractureType: props.fracture?.pattern || 'voronoi',
        fragmentCount: props.fracture?.fragmentCount || 10,
      });

      scene.getObjects(); // Access physics system through scene
      // Would call scene.physics.addObject(object) but physics is private
      // This is a limitation - need to expose physics system
    }

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Built fracturable entities:', count);
    }
  }

  /**
   * Setup behaviors from composition
   */
  private setupBehaviors(composition: HoloComposition, _scene: DemolitionDemoScene): void {
    const behaviors = composition.entities.filter((e) => e.type === 'behavior');

    for (const behavior of behaviors) {
      if (behavior.name === 'ExplosionControl') {
        // Setup mouse click handler
        // In a real implementation, this would hook into input system
        if (this.config.debug) {
          console.log('[HoloScript Runtime] Setup behavior:', behavior.name);
        }
      }
    }
  }

  /**
   * Setup timelines from composition
   */
  private setupTimelines(composition: HoloComposition, _scene: DemolitionDemoScene): void {
    const timelines = composition.entities.filter((e) => e.type === 'timeline');

    for (const timeline of timelines) {
      if (this.config.debug) {
        console.log('[HoloScript Runtime] Setup timeline:', timeline.name);
      }
      // Timeline execution would be implemented here
    }
  }

  /**
   * Parse Vector3 from array
   */
  private parseVector3(arr: number[]): Vector3 {
    return {
      x: arr[0] ?? 0,
      y: arr[1] ?? 0,
      z: arr[2] ?? 0,
    };
  }

  /**
   * Start execution
   */
  public start(): void {
    if (!this.scene) {
      throw new Error('[HoloScript Runtime] No composition loaded');
    }

    this.running = true;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.currentFrame = 0;

    // Start renderer if available
    if (this.renderer) {
      this.renderer.start();
      if (this.config.debug) {
        console.log('[HoloScript Runtime] Renderer started');
      }
    }

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Execution started');
    }

    this.loop();
  }

  /**
   * Main execution loop
   */
  private loop(): void {
    if (!this.running || !this.scene) return;

    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = now;

    // Update scene (physics simulation)
    this.scene.update(dt);

    // Update renderer (visual output)
    this.updateRenderer(dt);

    this.currentFrame++;

    // Continue loop
    requestAnimationFrame(() => this.loop());
  }

  /**
   * Stop execution
   */
  public stop(): void {
    this.running = false;

    // Stop renderer if available
    if (this.renderer) {
      this.renderer.stop();
      if (this.config.debug) {
        console.log('[HoloScript Runtime] Renderer stopped');
      }
    }

    if (this.config.debug) {
      console.log('[HoloScript Runtime] Execution stopped');
    }
  }

  /**
   * Pause execution
   */
  public pause(): void {
    if (this.scene) {
      this.scene.pause();
    }
  }

  /**
   * Resume execution
   */
  public resume(): void {
    if (this.scene) {
      this.scene.resume();
    }
  }

  /**
   * Get statistics
   */
  public getStatistics(): RuntimeExecutorStatistics {
    return {
      scene: this.scene?.getStatistics() ?? {},
      executionTime: performance.now() - this.startTime,
      currentFrame: this.currentFrame,
      isRunning: this.running,
    };
  }

  /**
   * Get scene instance
   */
  public getScene(): DemolitionDemoScene | null {
    return this.scene;
  }

  /**
   * Get composition
   */
  public getComposition(): HoloComposition | null {
    return this.composition;
  }
}

/**
 * Create runtime executor from HoloScript composition
 *
 * Example usage:
 * ```typescript
 * import { parse } from '../../parser';
 * import { executeComposition } from './DemolitionRuntimeExecutor';
 *
 * const holoScript = fs.readFileSync('demolition-demo.holo', 'utf-8');
 * const composition = parse(holoScript);
 * const executor = executeComposition(composition);
 * executor.start();
 * ```
 */
export function executeComposition(
  composition: HoloComposition,
  config?: RuntimeExecutorConfig
): DemolitionRuntimeExecutor {
  const executor = new DemolitionRuntimeExecutor(config);
  executor.loadComposition(composition);
  return executor;
}
