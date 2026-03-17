/**
 * RuntimeRenderer.ts
 *
 * Abstract runtime renderer interface.
 * Bridges HoloScript runtime physics → visual rendering backends.
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';

/**
 * Renderable object in 3D space
 */
export interface RenderableObject {
  id: string;
  type: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  geometry?: {
    type: string;
    size?: number | [number, number, number];
    radius?: number;
    height?: number;
    segments?: number;
  };
  material?: {
    type?: string; // Material preset name
    color?: string;
    roughness?: number;
    metalness?: number;
    opacity?: number;
    transparent?: boolean;
    [key: string]: unknown;
  };
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Particle system configuration
 */
export interface ParticleSystem {
  id: string;
  maxParticles: number;
  positions: Float32Array;
  velocities?: Float32Array;
  colors?: Float32Array;
  sizes?: Float32Array;
  lifetimes?: Float32Array;
  material?: {
    type?: string;
    color?: string;
    size?: number;
    opacity?: number;
    blending?: string;
  };
}

/**
 * Light configuration
 */
export interface RenderableLight {
  id: string;
  type: 'directional' | 'point' | 'spot' | 'hemisphere' | 'ambient' | 'area';
  position?: [number, number, number];
  color?: string;
  intensity?: number;
  castShadow?: boolean;
  target?: [number, number, number];
}

/**
 * Camera configuration
 */
export interface RenderableCamera {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
  aspect?: number;
  near?: number;
  far?: number;
}

/**
 * Post-processing effects
 */
export interface PostProcessingEffect {
  type: string;
  enabled: boolean;
  params?: Record<string, unknown>;
}

/**
 * Abstract Runtime Renderer
 */
export interface RuntimeRenderer {
  /**
   * Initialize renderer with composition
   */
  initialize(composition: HoloComposition, config?: RendererConfig): void;

  /**
   * Start rendering loop
   */
  start(): void;

  /**
   * Stop rendering loop
   */
  stop(): void;

  /**
   * Update scene (called per frame)
   */
  update(deltaTime: number): void;

  /**
   * Render single frame
   */
  render(): void;

  /**
   * Add object to scene
   */
  addObject(object: RenderableObject): void;

  /**
   * Remove object from scene
   */
  removeObject(objectId: string): void;

  /**
   * Update object transform
   */
  updateObjectTransform(
    objectId: string,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    }
  ): void;

  /**
   * Add particle system
   */
  addParticleSystem(system: ParticleSystem): void;

  /**
   * Update particle system
   */
  updateParticleSystem(systemId: string, positions: Float32Array, colors?: Float32Array): void;

  /**
   * Remove particle system
   */
  removeParticleSystem(systemId: string): void;

  /**
   * Add light to scene
   */
  addLight(light: RenderableLight): void;

  /**
   * Update camera
   */
  updateCamera(camera: RenderableCamera): void;

  /**
   * Enable post-processing effect
   */
  enablePostProcessing(effect: PostProcessingEffect): void;

  /**
   * Get renderer statistics
   */
  getStatistics(): RendererStatistics;

  /**
   * Resize renderer
   */
  resize(width: number, height: number): void;

  /**
   * Dispose renderer and free resources
   */
  dispose(): void;
}

/**
 * Renderer configuration
 */
export interface RendererConfig {
  canvas?: HTMLCanvasElement;
  width?: number;
  height?: number;
  backgroundColor?: string;
  antialias?: boolean;
  shadows?: boolean;
  physicallyCorrectLights?: boolean;
  toneMapping?: string;
  toneMappingExposure?: number;
  outputEncoding?: string;
  maxLights?: number;
  debug?: boolean;
}

/**
 * Renderer statistics
 */
export interface RendererStatistics {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  objects: number;
  lights: number;
  textures: number;
  programs: number;
  memoryUsage?: {
    geometries: number;
    textures: number;
  };
}

/**
 * Base renderer implementation with common logic
 */
export abstract class BaseRuntimeRenderer implements RuntimeRenderer {
  protected composition?: HoloComposition;
  protected config: RendererConfig;
  protected isRunning = false;
  protected objects = new Map<string, RenderableObject>();
  protected particleSystems = new Map<string, ParticleSystem>();
  protected lights = new Map<string, RenderableLight>();
  protected camera?: RenderableCamera;

  constructor(config: RendererConfig = {}) {
    this.config = {
      width: 1920,
      height: 1080,
      backgroundColor: '#000000',
      antialias: true,
      shadows: true,
      physicallyCorrectLights: true,
      toneMapping: 'ACESFilmic',
      toneMappingExposure: 1.0,
      outputEncoding: 'sRGB',
      debug: false,
      ...config,
    };
  }

  abstract initialize(composition: HoloComposition, config?: RendererConfig): void;
  abstract start(): void;
  abstract stop(): void;
  abstract update(deltaTime: number): void;
  abstract render(): void;
  abstract addObject(object: RenderableObject): void;
  abstract removeObject(objectId: string): void;
  abstract updateObjectTransform(
    objectId: string,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    }
  ): void;
  abstract addParticleSystem(system: ParticleSystem): void;
  abstract updateParticleSystem(
    systemId: string,
    positions: Float32Array,
    colors?: Float32Array
  ): void;
  abstract removeParticleSystem(systemId: string): void;
  abstract addLight(light: RenderableLight): void;
  abstract updateCamera(camera: RenderableCamera): void;
  abstract enablePostProcessing(effect: PostProcessingEffect): void;
  abstract getStatistics(): RendererStatistics;
  abstract resize(width: number, height: number): void;
  abstract dispose(): void;
}
