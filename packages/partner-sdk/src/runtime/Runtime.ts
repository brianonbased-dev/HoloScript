/**
 * HoloScript Embedded Runtime
 *
 * Allows partners to embed HoloScript execution in their platforms.
 */

import type { SceneGraph, ParsedAST } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface RuntimeConfig {
  /** Enable sandbox mode for security */
  sandbox?: boolean;
  /** Permissions to grant the runtime */
  permissions?: RuntimePermission[];
  /** Maximum execution time in ms (0 = unlimited) */
  timeout?: number;
  /** Memory limit in MB */
  memoryLimit?: number;
  /** Custom renderer adapter */
  renderer?: RendererAdapter;
  /** Physics engine adapter */
  physics?: PhysicsAdapter;
  /** Audio engine adapter */
  audio?: AudioAdapter;
}

export type RuntimePermission =
  | 'audio'
  | 'physics'
  | 'networking'
  | 'filesystem'
  | 'clipboard'
  | 'fullscreen'
  | 'vr'
  | 'ar';

export interface RendererAdapter {
  createScene(): unknown;
  addObject(sceneGraph: SceneGraph, object: SceneObject): void;
  updateObject(id: string, properties: Partial<SceneObject>): void;
  removeObject(id: string): void;
  render(): void;
}

export interface PhysicsAdapter {
  createWorld(config: PhysicsWorldConfig): void;
  addBody(object: SceneObject): void;
  step(deltaTime: number): void;
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): RaycastResult | null;
}

export interface AudioAdapter {
  loadSound(url: string): Promise<AudioHandle>;
  playSound(handle: AudioHandle, config: AudioPlayConfig): void;
  stopSound(handle: AudioHandle): void;
  setListenerPosition(position: Vector3, orientation: Quaternion): void;
}

export interface SceneObject {
  id: string;
  name: string;
  type: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  properties: Record<string, unknown>;
  children: SceneObject[];
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PhysicsWorldConfig {
  gravity: Vector3;
}

export interface RaycastResult {
  point: Vector3;
  normal: Vector3;
  distance: number;
  objectId: string;
}

export interface AudioHandle {
  id: string;
}

export interface AudioPlayConfig {
  volume?: number;
  loop?: boolean;
  spatial?: boolean;
  position?: Vector3;
}

export type RuntimeEvent =
  | 'sceneReady'
  | 'sceneLoaded'
  | 'error'
  | 'objectCreated'
  | 'objectUpdated'
  | 'objectDestroyed'
  | 'interactionStart'
  | 'interactionEnd';

export interface RuntimeEventData {
  sceneReady: { scene: SceneGraph };
  sceneLoaded: { name: string; objectCount: number };
  error: { message: string; code: string };
  objectCreated: { object: SceneObject };
  objectUpdated: { id: string; properties: Record<string, unknown> };
  objectDestroyed: { id: string };
  interactionStart: { objectId: string; type: string };
  interactionEnd: { objectId: string; type: string };
}

// ============================================================================
// Runtime Implementation
// ============================================================================

export class HoloScriptRuntime {
  private config: RuntimeConfig;
  private scene: SceneGraph | null = null;
  private objects: Map<string, SceneObject> = new Map();
  private listeners: Map<RuntimeEvent, Set<(data: unknown) => void>> = new Map();
  private isRunning = false;
  private lastFrameTime = 0;

  constructor(config: RuntimeConfig = {}) {
    this.config = {
      sandbox: true,
      permissions: ['audio', 'physics'],
      timeout: 30000,
      memoryLimit: 256,
      ...config,
    };
  }

  // --------------------------------
  // Scene Loading
  // --------------------------------

  /**
   * Load HoloScript source code
   */
  async load(source: string): Promise<void> {
    try {
      // Parse the source
      const ast = this.parse(source);

      // Validate permissions
      this.validatePermissions(ast);

      // Build scene graph
      this.scene = this.buildSceneGraph(ast);

      // Initialize adapters
      await this.initializeAdapters();

      // Emit ready event
      this.emit('sceneReady', { scene: this.scene });
    } catch (error) {
      this.emit('error', {
        message: (error as Error).message,
        code: 'LOAD_ERROR',
      });
      throw error;
    }
  }

  /**
   * Load from a .holo file URL
   */
  async loadFromUrl(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load: ${response.statusText}`);
    }
    const source = await response.text();
    return this.load(source);
  }

  /**
   * Load from pre-parsed AST
   */
  async loadFromAST(ast: ParsedAST): Promise<void> {
    this.validatePermissions(ast);
    this.scene = this.buildSceneGraph(ast);
    await this.initializeAdapters();
    this.emit('sceneReady', { scene: this.scene });
  }

  // --------------------------------
  // Runtime Control
  // --------------------------------

  /**
   * Start the runtime loop
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.runLoop();
  }

  /**
   * Pause the runtime
   */
  pause(): void {
    this.isRunning = false;
  }

  /**
   * Step one frame
   */
  step(deltaTime: number = 1 / 60): void {
    this.update(deltaTime);
    this.render();
  }

  /**
   * Stop and cleanup
   */
  destroy(): void {
    this.isRunning = false;
    this.scene = null;
    this.objects.clear();
    this.listeners.clear();
  }

  // --------------------------------
  // Scene Access
  // --------------------------------

  /**
   * Get the current scene graph
   */
  getScene(): SceneGraph | null {
    return this.scene;
  }

  /**
   * Get an object by ID
   */
  getObject(id: string): SceneObject | undefined {
    return this.objects.get(id);
  }

  /**
   * Get all objects
   */
  getAllObjects(): SceneObject[] {
    return [...this.objects.values()];
  }

  /**
   * Find objects by query
   */
  findObjects(query: Partial<SceneObject>): SceneObject[] {
    return [...this.objects.values()].filter((obj) => {
      for (const [key, value] of Object.entries(query)) {
        if ((obj as unknown as Record<string, unknown>)[key] !== value) return false;
      }
      return true;
    });
  }

  // --------------------------------
  // Object Manipulation
  // --------------------------------

  /**
   * Update object properties
   */
  updateObject(id: string, properties: Partial<SceneObject>): void {
    const object = this.objects.get(id);
    if (!object) return;

    Object.assign(object, properties);

    if (this.config.renderer) {
      this.config.renderer.updateObject(id, properties);
    }

    this.emit('objectUpdated', { id, properties });
  }

  /**
   * Create a new object at runtime
   */
  createObject(object: SceneObject): void {
    this.objects.set(object.id, object);

    if (this.config.renderer && this.scene) {
      this.config.renderer.addObject(this.scene, object);
    }

    this.emit('objectCreated', { object });
  }

  /**
   * Destroy an object
   */
  destroyObject(id: string): void {
    if (!this.objects.has(id)) return;

    this.objects.delete(id);

    if (this.config.renderer) {
      this.config.renderer.removeObject(id);
    }

    this.emit('objectDestroyed', { id });
  }

  // --------------------------------
  // Events
  // --------------------------------

  /**
   * Listen for runtime events
   */
  on<E extends RuntimeEvent>(event: E, callback: (data: RuntimeEventData[E]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback as (data: unknown) => void);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as (data: unknown) => void);
    };
  }

  /**
   * Emit an event
   */
  private emit<E extends RuntimeEvent>(event: E, data: RuntimeEventData[E]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(data);
      }
    }
  }

  // --------------------------------
  // Internal Methods
  // --------------------------------

  private parse(source: string): ParsedAST {
    // Use HoloScript parser from @holoscript/core
    // Simplified for SDK - in real implementation, import from core
    return {
      type: 'Program',
      body: [],
      source,
    };
  }

  private validatePermissions(ast: ParsedAST): void {
    if (!this.config.sandbox) return;

    const requiredPermissions = this.detectRequiredPermissions(ast);

    for (const perm of requiredPermissions) {
      if (!this.config.permissions?.includes(perm)) {
        throw new Error(`Permission denied: ${perm}`);
      }
    }
  }

  private detectRequiredPermissions(ast: ParsedAST): RuntimePermission[] {
    const permissions: RuntimePermission[] = [];

    // Detect based on AST contents
    const source = ast.source || '';
    if (source.includes('@physics') || source.includes('@collidable')) {
      permissions.push('physics');
    }
    if (source.includes('@spatial_audio') || source.includes('audio.play')) {
      permissions.push('audio');
    }
    if (source.includes('@networked')) {
      permissions.push('networking');
    }

    return permissions;
  }

  private buildSceneGraph(ast: ParsedAST): SceneGraph {
    const objects: import('./types.js').SceneNode[] = [];
    const environment: import('./types.js').EnvironmentConfig = {
      skybox: 'default',
      ambientLight: 0.5,
      gravity: { x: 0, y: -9.81, z: 0 },
    };

    // Extract composition name
    let sceneName = 'Scene';

    // Process AST body
    for (const node of ast.body || []) {
      const nodeAny = node as Record<string, unknown>;

      // Handle composition node (root)
      if (nodeAny.type === 'Composition' || nodeAny.type === 'composition') {
        sceneName = (nodeAny.name as string) || 'Scene';

        // Extract environment
        if (nodeAny.environment) {
          const env = nodeAny.environment as Record<string, unknown>;
          const props = (env.properties as Array<{ key: string; value: unknown }>) || [];

          for (const prop of props) {
            if (prop.key === 'skybox') environment.skybox = prop.value as string;
            if (prop.key === 'ambient_light' || prop.key === 'ambientLight') {
              environment.ambientLight = prop.value as number;
            }
            if (prop.key === 'gravity') {
              const g = prop.value as number[];
              if (Array.isArray(g)) {
                environment.gravity = { x: g[0] || 0, y: g[1] || -9.81, z: g[2] || 0 };
              }
            }
          }
        }

        // Extract objects
        const compositionObjects = (nodeAny.objects as Array<Record<string, unknown>>) || [];
        for (const obj of compositionObjects) {
          objects.push(this.convertObject(obj));
        }

        // Extract spatial groups
        const spatialGroups = (nodeAny.spatialGroups as Array<Record<string, unknown>>) || [];
        for (const group of spatialGroups) {
          const groupObjects = (group.objects as Array<Record<string, unknown>>) || [];
          for (const obj of groupObjects) {
            objects.push(this.convertObject(obj));
          }
        }

        continue;
      }

      // Handle standalone object nodes
      if (nodeAny.type === 'object' || nodeAny.type === 'orb' || nodeAny.type === 'Object') {
        objects.push(this.convertObject(nodeAny));
      }
    }

    return {
      name: sceneName,
      objects,
      environment,
    };
  }

  private convertObject(obj: Record<string, unknown>): import('./types.js').SceneNode {
    const props = (obj.properties as Array<{ key: string; value: unknown }>) || [];
    const propsMap: Record<string, unknown> = {};

    for (const prop of props) {
      propsMap[prop.key] = prop.value;
    }

    // Extract position
    const posValue = propsMap.position;
    let position: [number, number, number] = [0, 0, 0];
    if (Array.isArray(posValue)) {
      position = [posValue[0] || 0, posValue[1] || 0, posValue[2] || 0];
    } else if (typeof posValue === 'object' && posValue) {
      const p = posValue as { x?: number; y?: number; z?: number };
      position = [p.x || 0, p.y || 0, p.z || 0];
    }

    // Extract rotation
    const rotValue = propsMap.rotation;
    let rotation: [number, number, number] = [0, 0, 0];
    if (Array.isArray(rotValue)) {
      rotation = [rotValue[0] || 0, rotValue[1] || 0, rotValue[2] || 0];
    } else if (typeof rotValue === 'object' && rotValue) {
      const r = rotValue as { x?: number; y?: number; z?: number };
      rotation = [r.x || 0, r.y || 0, r.z || 0];
    }

    // Extract scale
    const scaleValue = propsMap.scale;
    let scale: [number, number, number] | number = 1;
    if (typeof scaleValue === 'number') {
      scale = scaleValue;
    } else if (Array.isArray(scaleValue)) {
      scale = [scaleValue[0] || 1, scaleValue[1] || 1, scaleValue[2] || 1];
    } else if (typeof scaleValue === 'object' && scaleValue) {
      const s = scaleValue as { x?: number; y?: number; z?: number };
      scale = [s.x || 1, s.y || 1, s.z || 1];
    }

    // Extract geometry type
    const geometry = (propsMap.geometry || propsMap.type || 'box') as string;

    // Extract traits
    const traits: string[] = [];
    if (Array.isArray(obj.traits)) {
      for (const trait of obj.traits) {
        if (typeof trait === 'string') {
          traits.push(trait);
        } else if (typeof trait === 'object' && trait && (trait as { name?: string }).name) {
          traits.push((trait as { name: string }).name);
        }
      }
    }

    // Remove position, rotation, scale from properties
    delete propsMap.position;
    delete propsMap.rotation;
    delete propsMap.scale;
    delete propsMap.geometry;

    return {
      id: (obj.name as string) || `object_${Math.random().toString(36).substring(7)}`,
      name: (obj.name as string) || 'Object',
      type: geometry,
      position,
      rotation,
      scale,
      properties: propsMap,
      traits,
      children: [],
    };
  }

  private async initializeAdapters(): Promise<void> {
    if (this.config.physics && this.scene) {
      this.config.physics.createWorld({
        gravity: this.scene.environment.gravity ?? { x: 0, y: -9.81, z: 0 },
      });
    }
  }

  private runLoop(): void {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    this.update(deltaTime);
    this.render();

    requestAnimationFrame(() => this.runLoop());
  }

  private update(deltaTime: number): void {
    // Update physics
    if (this.config.physics) {
      this.config.physics.step(deltaTime);
    }

    // Update object logic
    // In real implementation, run HoloScript update handlers
  }

  private render(): void {
    if (this.config.renderer) {
      this.config.renderer.render();
    }
  }
}

/**
 * Create a new HoloScript runtime instance
 */
export function createRuntime(config?: RuntimeConfig): HoloScriptRuntime {
  return new HoloScriptRuntime(config);
}
